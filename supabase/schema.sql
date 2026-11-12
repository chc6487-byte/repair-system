-- =============================================================
-- 報修登記系統：Supabase 建表 SQL
-- 用途：建立 repair_requests 資料表，並設定三層安全防護
--       （CHECK 限制、GRANT 權限、RLS 資料列安全）。
-- 使用方式：在 Supabase SQL Editor 貼上後執行；整段包在交易中，
--           任何一步失敗都會整批還原。
-- =============================================================

begin;

-- -------------------------------------------------------------
-- 一、建立資料表與 CHECK 限制（第三層：限制欄位值與文字長度）
--   * id、created_at 由資料庫自動產生。
--   * 文字欄位不能是空白，且有長度上限，避免塞入過長內容。
--   * category、urgency、status 只能是需求筆記定義的選項。
-- -------------------------------------------------------------
create table if not exists public.repair_requests (
  -- 主鍵：自動產生的 UUID
  id            uuid        primary key default gen_random_uuid(),

  -- 建立時間：由資料庫自動填入，前端不能指定
  created_at    timestamptz not null default now(),

  -- 報修人姓名：1～50 字，不可只有空白
  reporter_name text        not null
    constraint repair_requests_reporter_name_len
      check (char_length(btrim(reporter_name)) between 1 and 50
             and char_length(reporter_name) <= 50),

  -- 地點或部門：1～100 字，不可只有空白
  location      text        not null
    constraint repair_requests_location_len
      check (char_length(btrim(location)) between 1 and 100
             and char_length(location) <= 100),

  -- 類別：只能是 設備／網路／環境／其他
  category      text        not null
    constraint repair_requests_category_valid
      check (category in ('設備', '網路', '環境', '其他')),

  -- 問題說明：1～1000 字，不可只有空白
  description   text        not null
    constraint repair_requests_description_len
      check (char_length(btrim(description)) between 1 and 1000
             and char_length(description) <= 1000),

  -- 緊急程度：只能是 低／中／高，預設 中
  urgency       text        not null default '中'
    constraint repair_requests_urgency_valid
      check (urgency in ('低', '中', '高')),

  -- 處理狀態：只能是 待處理／處理中／已完成，預設 待處理
  status        text        not null default '待處理'
    constraint repair_requests_status_valid
      check (status in ('待處理', '處理中', '已完成'))
);

comment on table public.repair_requests is '報修登記資料（示範用，僅放虛構資料）';

-- 清單依建立時間由新到舊顯示，建立索引加快排序
create index if not exists repair_requests_created_at_idx
  on public.repair_requests (created_at desc);

-- -------------------------------------------------------------
-- 二、GRANT 權限（第一層：決定角色能碰哪些資料表與欄位）
--   * 先收回所有角色的權限，再只開放需要的部分。
--   * anon（未登入的前端公開金鑰）：
--       - 可以讀取整張表（SELECT）。
--       - 只能新增 reporter_name、location、category、description、urgency
--         這五個欄位；id、created_at、status 一律使用預設值，前端無法指定。
--       - 不給 UPDATE、DELETE、TRUNCATE。
--   * authenticated（登入使用者）：目前不開放任何權限；
--     日後若加入登入功能，再另外設計。
-- -------------------------------------------------------------
revoke all on table public.repair_requests from public, anon, authenticated;

grant usage on schema public to anon;

grant select on table public.repair_requests to anon;

grant insert (reporter_name, location, category, description, urgency)
  on table public.repair_requests to anon;

-- -------------------------------------------------------------
-- 三、RLS 資料列安全（第二層：決定每一筆資料能否被讀取或寫入）
--   * 啟用 RLS 後，沒有政策允許的操作一律拒絕。
--   * 讀取政策：任何人（anon）都可以讀取全部清單。
--   * 新增政策：任何人（anon）都可以新增，但 status 必須是「待處理」。
--     （GRANT 已禁止前端指定 status，這裡再加一道保險。）
--   * 不建立 UPDATE、DELETE 政策，所以無法修改或刪除。
--   * 注意：service_role 金鑰會略過 RLS，只能放在後端，絕不可放進前端或提交到 Git。
-- -------------------------------------------------------------
alter table public.repair_requests enable row level security;

-- 先刪除同名政策，讓這份腳本可以重複執行
drop policy if exists "任何人可讀取報修清單" on public.repair_requests;
drop policy if exists "任何人可新增待處理報修" on public.repair_requests;

create policy "任何人可讀取報修清單"
  on public.repair_requests
  for select
  to anon
  using (true);

create policy "任何人可新增待處理報修"
  on public.repair_requests
  for insert
  to anon
  with check (status = '待處理');

commit;
