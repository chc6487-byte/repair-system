-- =============================================================
-- 產品領料單系統：Supabase 建表 SQL
-- 依據：產品領料單/需求筆記.txt
-- 使用方式：在 Supabase SQL Editor 貼上後整段執行；整段包在交易中，
--           任何一步失敗都會整批還原，可重複執行。
--
-- 安全設計（四層）：
--   1. 未登入（anon）完全不能讀寫。
--   2. 已登入（authenticated）只能「讀取」資料表，不能直接新增、修改、刪除。
--   3. 新增、修改、審核、發料一律透過下方的資料庫函式，函式內檢查角色與部門。
--   4. RLS：必須有設定部門與角色的帳號才看得到領料單。
--   前端只能使用 publishable key；secret key 不可寫進任何檔案。
-- =============================================================

begin;

-- -------------------------------------------------------------
-- 一、資料表與 CHECK 限制
-- -------------------------------------------------------------

-- 使用者的部門與角色（由管理員在 Supabase 後台建立帳號後手動新增）
create table if not exists public.picking_profiles (
  user_id      uuid primary key references auth.users (id) on delete cascade,
  -- 顯示名稱：1～50 字
  display_name text not null
    constraint picking_profiles_name_len
      check (char_length(btrim(display_name)) between 1 and 50 and char_length(display_name) <= 50),
  -- 所屬部門：1～50 字
  department   text not null
    constraint picking_profiles_department_len
      check (char_length(btrim(department)) between 1 and 50 and char_length(department) <= 50),
  -- 角色：只能是 請領／主管／倉管
  role         text not null
    constraint picking_profiles_role_valid
      check (role in ('請領', '主管', '倉管'))
);

-- 領料單（單頭）
create table if not exists public.picking_slips (
  -- 領料單號：YYYYMMDD＋2 位流水號，由函式自動產生
  slip_no     text primary key
    constraint picking_slips_no_format check (slip_no ~ '^[0-9]{10}$'),
  -- 建立時間與建立者（系統自動記錄）
  created_at  timestamptz not null default now(),
  created_by  uuid references auth.users (id) on delete set null,
  -- 領料日期
  pick_date   date not null,
  -- 請領部門：取自建立者的帳號設定，前端無法指定
  department  text not null
    constraint picking_slips_department_len
      check (char_length(btrim(department)) between 1 and 50),
  -- 領料人：1～50 字
  picker_name text not null
    constraint picking_slips_picker_len
      check (char_length(btrim(picker_name)) between 1 and 50 and char_length(picker_name) <= 50),
  -- 審核通過、發料（勾選）
  approved    boolean not null default false,
  issued      boolean not null default false,
  -- 未審核通過不能發料
  constraint picking_slips_issue_after_approve check (not issued or approved)
);

-- 領料明細（一張單可以有多筆）
create table if not exists public.picking_items (
  id           bigint generated always as identity primary key,
  slip_no      text not null references public.picking_slips (slip_no) on delete restrict,
  -- 產品名稱規格：1～100 字
  product_spec text not null
    constraint picking_items_spec_len
      check (char_length(btrim(product_spec)) between 1 and 100 and char_length(product_spec) <= 100),
  -- 數量（pcs）：1～999999 的整數
  quantity     integer not null
    constraint picking_items_quantity_range check (quantity between 1 and 999999)
);

create index if not exists picking_items_slip_no_idx on public.picking_items (slip_no);

comment on table public.picking_profiles is '領料系統使用者的部門與角色';
comment on table public.picking_slips    is '領料單單頭（示範用，僅放虛構資料）';
comment on table public.picking_items    is '領料單明細';

-- -------------------------------------------------------------
-- 二、GRANT 權限
--   * anon：完全沒有權限。
--   * authenticated：三張表都只能 SELECT；寫入一律走下方函式。
-- -------------------------------------------------------------
revoke all on table public.picking_profiles, public.picking_slips, public.picking_items
  from public, anon, authenticated;

grant usage on schema public to authenticated;
grant select on table public.picking_profiles, public.picking_slips, public.picking_items
  to authenticated;

-- -------------------------------------------------------------
-- 三、RLS 資料列安全
--   * 帳號資料：只能讀自己的那一筆。
--   * 領料單與明細：有設定部門與角色的帳號，可以讀取所有部門的單。
--   * 沒有任何新增、修改、刪除政策，所以無法直接寫入或刪除。
-- -------------------------------------------------------------
alter table public.picking_profiles enable row level security;
alter table public.picking_slips    enable row level security;
alter table public.picking_items    enable row level security;

drop policy if exists "讀取自己的帳號資料" on public.picking_profiles;
create policy "讀取自己的帳號資料"
  on public.picking_profiles for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "已設定帳號可讀取領料單" on public.picking_slips;
create policy "已設定帳號可讀取領料單"
  on public.picking_slips for select to authenticated
  using (exists (select 1 from public.picking_profiles p where p.user_id = (select auth.uid())));

drop policy if exists "已設定帳號可讀取領料明細" on public.picking_items;
create policy "已設定帳號可讀取領料明細"
  on public.picking_items for select to authenticated
  using (exists (select 1 from public.picking_profiles p where p.user_id = (select auth.uid())));

-- -------------------------------------------------------------
-- 四、資料庫函式（所有寫入都經過這裡）
--   security definer：以資料表擁有者身分執行，因此能寫入；
--   但每個函式開頭都會檢查登入者的角色與部門。
--   search_path 設為空字串，所有名稱都寫完整，避免被惡意物件劫持。
-- -------------------------------------------------------------

-- 內部用：檢查明細格式（不開放給前端呼叫）
create or replace function public.picking_check_items(p_items jsonb)
returns void
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception '至少要有一項產品' using errcode = '22023';
  end if;
  if jsonb_array_length(p_items) > 50 then
    raise exception '一張領料單最多 50 項產品' using errcode = '22023';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(p_items) as e(val)
    where jsonb_typeof(e.val) <> 'object'
       or coalesce(btrim(e.val ->> 'product_spec'), '') = ''
       or char_length(btrim(e.val ->> 'product_spec')) > 100
       or coalesce(e.val ->> 'quantity', '') !~ '^[1-9][0-9]{0,5}$'
  ) then
    raise exception '產品名稱規格不可空白（最多 100 字），數量必須是 1～999999 的整數' using errcode = '22023';
  end if;
end;
$$;

-- 內部用：檢查領料日期與領料人
create or replace function public.picking_check_header(p_pick_date date, p_picker_name text)
returns void
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_pick_date is null then
    raise exception '請填寫領料日期' using errcode = '22023';
  end if;
  if coalesce(btrim(p_picker_name), '') = '' or char_length(btrim(p_picker_name)) > 50 then
    raise exception '請填寫領料人（最多 50 字）' using errcode = '22023';
  end if;
end;
$$;

-- 新增領料單：只有「請領」角色可以；部門取自帳號設定；單號自動產生
create or replace function public.create_picking_slip(
  p_pick_date   date,
  p_picker_name text,
  p_items       jsonb
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  prof     public.picking_profiles;
  v_prefix text;
  v_seq    integer;
  v_no     text;
begin
  select * into prof from public.picking_profiles where user_id = auth.uid();
  if not found then
    raise exception '這個帳號尚未設定部門與角色' using errcode = '42501';
  end if;
  if prof.role <> '請領' then
    raise exception '只有請領部門可以新增領料單' using errcode = '42501';
  end if;

  perform public.picking_check_header(p_pick_date, p_picker_name);
  perform public.picking_check_items(p_items);

  -- 單號：依「新增當天」（台灣時間）＋當天流水號；同一天的單號依序產生，避免重複
  v_prefix := to_char(now() at time zone 'Asia/Taipei', 'YYYYMMDD');
  perform pg_advisory_xact_lock(hashtext('picking_slip_no'), hashtext(v_prefix));
  select coalesce(max(right(slip_no, 2)::integer), 0) + 1
    into v_seq
    from public.picking_slips
    where slip_no like v_prefix || '%';
  if v_seq > 99 then
    raise exception '今天的領料單已達 99 張上限' using errcode = '22023';
  end if;
  v_no := v_prefix || lpad(v_seq::text, 2, '0');

  insert into public.picking_slips (slip_no, created_by, pick_date, department, picker_name)
  values (v_no, auth.uid(), p_pick_date, prof.department, btrim(p_picker_name));

  insert into public.picking_items (slip_no, product_spec, quantity)
  select v_no, btrim(e.val ->> 'product_spec'), (e.val ->> 'quantity')::integer
  from jsonb_array_elements(p_items) with ordinality as e(val, ord)
  order by e.ord;

  return v_no;
end;
$$;

-- 修改領料單：只有「請領」角色、自己部門、尚未審核通過的單
create or replace function public.update_picking_slip(
  p_slip_no     text,
  p_pick_date   date,
  p_picker_name text,
  p_items       jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  prof public.picking_profiles;
  s    public.picking_slips;
begin
  select * into prof from public.picking_profiles where user_id = auth.uid();
  if not found then
    raise exception '這個帳號尚未設定部門與角色' using errcode = '42501';
  end if;
  if prof.role <> '請領' then
    raise exception '只有請領部門可以修改領料單' using errcode = '42501';
  end if;

  select * into s from public.picking_slips where slip_no = p_slip_no for update;
  if not found then
    raise exception '找不到領料單 %', p_slip_no using errcode = 'P0002';
  end if;
  if s.department <> prof.department then
    raise exception '只能修改自己部門的領料單' using errcode = '42501';
  end if;
  if s.approved then
    raise exception '已審核通過的領料單不可修改' using errcode = '42501';
  end if;

  perform public.picking_check_header(p_pick_date, p_picker_name);
  perform public.picking_check_items(p_items);

  update public.picking_slips
     set pick_date = p_pick_date,
         picker_name = btrim(p_picker_name)
   where slip_no = p_slip_no;

  -- 明細整批換成新的內容（審核前才允許，領料單本身保留不刪）
  delete from public.picking_items where slip_no = p_slip_no;
  insert into public.picking_items (slip_no, product_spec, quantity)
  select p_slip_no, btrim(e.val ->> 'product_spec'), (e.val ->> 'quantity')::integer
  from jsonb_array_elements(p_items) with ordinality as e(val, ord)
  order by e.ord;
end;
$$;

-- 審核通過：只有「主管」角色、自己部門、尚未審核的單（不記錄審核人與時間）
create or replace function public.approve_picking_slip(p_slip_no text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  prof public.picking_profiles;
  s    public.picking_slips;
begin
  select * into prof from public.picking_profiles where user_id = auth.uid();
  if not found then
    raise exception '這個帳號尚未設定部門與角色' using errcode = '42501';
  end if;
  if prof.role <> '主管' then
    raise exception '只有主管可以審核' using errcode = '42501';
  end if;

  select * into s from public.picking_slips where slip_no = p_slip_no for update;
  if not found then
    raise exception '找不到領料單 %', p_slip_no using errcode = 'P0002';
  end if;
  if s.department <> prof.department then
    raise exception '只能審核自己部門的領料單' using errcode = '42501';
  end if;
  if s.approved then
    raise exception '這張領料單已經審核通過' using errcode = '22023';
  end if;

  update public.picking_slips set approved = true where slip_no = p_slip_no;
end;
$$;

-- 勾選發料：只有「倉管」角色、已審核通過且尚未發料的單（不記錄發料人與時間）
create or replace function public.issue_picking_slip(p_slip_no text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  prof public.picking_profiles;
  s    public.picking_slips;
begin
  select * into prof from public.picking_profiles where user_id = auth.uid();
  if not found then
    raise exception '這個帳號尚未設定部門與角色' using errcode = '42501';
  end if;
  if prof.role <> '倉管' then
    raise exception '只有倉管人員可以發料' using errcode = '42501';
  end if;

  select * into s from public.picking_slips where slip_no = p_slip_no for update;
  if not found then
    raise exception '找不到領料單 %', p_slip_no using errcode = 'P0002';
  end if;
  if not s.approved then
    raise exception '尚未審核通過，不能發料' using errcode = '42501';
  end if;
  if s.issued then
    raise exception '這張領料單已經發料' using errcode = '22023';
  end if;

  update public.picking_slips set issued = true where slip_no = p_slip_no;
end;
$$;

-- 函式執行權限：只開放四個操作函式給已登入使用者；內部檢查函式不開放
revoke all on function public.picking_check_items(jsonb) from public, anon, authenticated;
revoke all on function public.picking_check_header(date, text) from public, anon, authenticated;
revoke all on function public.create_picking_slip(date, text, jsonb) from public, anon;
revoke all on function public.update_picking_slip(text, date, text, jsonb) from public, anon;
revoke all on function public.approve_picking_slip(text) from public, anon;
revoke all on function public.issue_picking_slip(text) from public, anon;
grant execute on function public.create_picking_slip(date, text, jsonb) to authenticated;
grant execute on function public.update_picking_slip(text, date, text, jsonb) to authenticated;
grant execute on function public.approve_picking_slip(text) to authenticated;
grant execute on function public.issue_picking_slip(text) to authenticated;

commit;

-- =============================================================
-- 建立帳號（執行完上面的 SQL 後，由管理員操作）
--   1. Supabase 後台 → Authentication → Sign In / Providers：
--      關閉「Allow new users to sign up」，只讓管理員建立帳號。
--   2. Authentication → Users → Add user：輸入電子郵件與密碼，勾選 Auto Confirm User。
--   3. 在 SQL Editor 指定這個帳號的名稱、部門與角色（以下為虛構範例，請改成實際帳號的電子郵件）：
--
--   insert into public.picking_profiles (user_id, display_name, department, role)
--   select id, '林小美', '生產部', '請領' from auth.users where email = 'requester@example.com';
--
--   insert into public.picking_profiles (user_id, display_name, department, role)
--   select id, '陳大文', '生產部', '主管' from auth.users where email = 'manager@example.com';
--
--   insert into public.picking_profiles (user_id, display_name, department, role)
--   select id, '黃志明', '倉庫', '倉管' from auth.users where email = 'warehouse@example.com';
-- =============================================================
