// 產品領料單前端：匿名登入（不需帳號密碼）、新增／修改領料單、主管審核、倉管發料
(function () {
  "use strict";

  // ---------- PWA：註冊 Service Worker 與離線提示 ----------
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", function () {
      navigator.serviceWorker.register("sw.js", { updateViaCache: "none" }).catch(function () {
        /* 註冊失敗不影響一般使用 */
      });
    });
    // 網站更新後，新版 Service Worker 接手時自動重新整理一次，換成新畫面
    if (navigator.serviceWorker.controller) {
      let reloaded = false;
      navigator.serviceWorker.addEventListener("controllerchange", function () {
        if (reloaded) return;
        reloaded = true;
        window.location.reload();
      });
    }
  }

  const $ = (id) => document.getElementById(id);
  const offlineBanner = $("offline-banner");
  function updateOnline() {
    offlineBanner.hidden = navigator.onLine;
  }
  window.addEventListener("online", updateOnline);
  window.addEventListener("offline", updateOnline);
  updateOnline();

  // ---------- 畫面元素 ----------
  const loginView = $("login-view");
  const loginForm = $("login-form");
  const loginBtn = $("login-btn");
  const loginMsg = $("login-message");
  const logoutBtn = $("logout-btn");
  const userInfo = $("user-info");
  const appMsg = $("app-message");
  const formCard = $("form-card");
  const slipForm = $("slip-form");
  const formTitle = $("form-title");
  const deptInput = $("department");
  const dateInput = $("pick-date");
  const pickerInput = $("picker-name");
  const itemsEl = $("items");
  const addItemBtn = $("add-item-btn");
  const submitBtn = $("submit-btn");
  const cancelEditBtn = $("cancel-edit-btn");
  const formMsg = $("form-message");
  const listCard = $("list-card");
  const viewCard = $("view-card");
  const viewSelect = $("view-select");
  const viewNote = $("view-note");
  const listEl = $("slip-list");
  const listMsg = $("list-message");
  const refreshBtn = $("refresh-btn");
  const filtersEl = $("filters");

  const MAX_ITEMS = 50;
  const LIST_LIMIT = 50;
  const ROLE_LABEL = { 請領: "領料部門", 主管: "倉管課主管", 倉管: "倉管人員" };

  function showMessage(el, text, kind) {
    el.textContent = text;
    el.className = "message " + kind;
    el.hidden = false;
  }
  function hideMessage(el) {
    el.hidden = true;
    el.textContent = "";
  }
  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text; // 一律用 textContent，避免輸入內容被當成 HTML 執行
    return node;
  }

  // 把錯誤轉成看得懂的中文訊息（資料庫函式的錯誤本身就是中文）
  function errText(error) {
    if (!error) return "發生未知錯誤。";
    const msg = error.message || String(error);
    if (/fetch|network|load failed/i.test(msg)) return "無法連線到伺服器，請檢查網路後再試。";
    if (/anonymous sign-ins are disabled/i.test(msg)) return "系統尚未開放免密碼登入，請聯絡管理員。";
    if (/rate limit/i.test(msg)) return "操作太頻繁，請稍後再試。";
    if (/JWT|session/i.test(msg)) return "登入已過期，請重新登入。";
    return msg;
  }

  // 台灣時間的今天（YYYY-MM-DD）
  function todayTaipei() {
    return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Taipei" }).format(new Date());
  }

  function slipStatus(s) {
    if (s.issued) return "已發料";
    if (s.approved) return "待發料";
    return "待審核";
  }

  const ROLES = ["請領", "主管", "倉管"];
  // 各角色可選的部門（資料庫函式 register_picking_profile 也會檢查）
  const PICK_DEPTS = ["生管課", "製造課", "品管課"];
  const WAREHOUSE_DEPT = "倉管課";
  const ROLE_DEPTS = { 請領: PICK_DEPTS, 主管: [WAREHOUSE_DEPT], 倉管: [WAREHOUSE_DEPT] };

  // 進入畫面「選擇人員」下拉選單的名單：選了就自動帶入部門與角色
  // 要新增人員，在這裡加一行即可（role 只能是 請領／主管／倉管）
  const PRESET_USERS = [
    { name: "陳慧真", department: "倉管課", role: "主管" },
  ];

  // 檢查名稱、部門、角色（資料庫函式也會再檢查一次）
  function validateProfile(name, department, role) {
    if (!name) return "請填寫名稱。";
    if (name.length > 50) return "名稱最多 50 字。";
    if (ROLES.indexOf(role) < 0) return "請選擇角色。";
    if (ROLE_DEPTS[role].indexOf(department) < 0) {
      return role === "請領" ? "領料部門只能是 生管課、製造課 或 品管課。" : "倉管課主管與倉管人員的部門必須是倉管課。";
    }
    return "";
  }

  // ---------- Supabase ----------
  const cfg = window.SUPABASE_CONFIG || {};
  if (!window.supabase || !cfg.url || !cfg.publishableKey) {
    loginView.hidden = false;
    showMessage(loginMsg, "系統載入失敗，請連上網路後重新整理頁面。", "err");
    loginBtn.disabled = true;
    return;
  }
  const client = window.supabase.createClient(cfg.url, cfg.publishableKey);

  let profile = null;
  let slips = [];
  let filter = "all";
  let editingNo = null;

  // ---------- 登入／登出 ----------
  function showLogin() {
    profile = null;
    slips = [];
    loginView.hidden = false;
    logoutBtn.hidden = true;
    userInfo.hidden = true;
    viewCard.hidden = true;
    formCard.hidden = true;
    listCard.hidden = true;
    hideMessage(appMsg);
    listEl.replaceChildren();
  }

  async function enter() {
    const { data: sessionData } = await client.auth.getSession();
    const session = sessionData && sessionData.session;
    if (!session) {
      showLogin();
      return;
    }
    const { data, error } = await client
      .from("picking_profiles")
      .select("display_name, department, role")
      .eq("user_id", session.user.id)
      .maybeSingle();

    loginView.hidden = true;
    logoutBtn.hidden = false;
    hideMessage(appMsg);

    if (error) {
      userInfo.hidden = true;
      showMessage(appMsg, "讀取帳號資料失敗：" + errText(error), "err");
      return;
    }
    if (!data) {
      userInfo.hidden = true;
      viewCard.hidden = true;
      formCard.hidden = true;
      listCard.hidden = true;
      // 已登入但資料庫還沒有名稱、部門與角色（例如上次寫入失敗）：回到進入畫面補填，沿用同一個登入身分
      loginView.hidden = false;
      return;
    }

    profile = data;
    userInfo.replaceChildren(
      document.createTextNode("目前登入："),
      el("strong", "", profile.display_name),
      document.createTextNode("（" + profile.department + "・" + (ROLE_LABEL[profile.role] || profile.role) + "）")
    );
    userInfo.hidden = false;
    viewCard.hidden = false;
    listCard.hidden = false;
    resetForm();
    viewSelect.value = DEFAULT_VIEW[profile.role] || "領料";
    applyView();
    loadSlips();
  }

  // ---------- 功能切換：領料／審核／發料 ----------
  // 領料＝新增領料單＋全部清單；審核＝待審核清單；發料＝待發料清單
  // 實際能按的按鈕仍依登入者的角色決定（資料庫函式也會再檢查）
  const DEFAULT_VIEW = { 請領: "領料", 主管: "審核", 倉管: "發料" };
  const VIEW_FILTER = { 領料: "all", 審核: "待審核", 發料: "待發料" };
  const VIEW_NOTE = {
    領料: "只有領料部門（生管課、製造課、品管課）可以新增領料單；你可以在下方查看所有領料單。",
    審核: "只有倉管課主管可以簽核；你可以在下方查看待審核的單。",
    發料: "只有倉管人員可以勾選發料；你可以在下方查看待發料的單。",
  };
  const VIEW_ROLE = { 領料: "請領", 審核: "主管", 發料: "倉管" };

  function applyView() {
    if (!profile) return;
    const view = viewSelect.value;
    formCard.hidden = !(view === "領料" && profile.role === "請領");
    if (profile.role !== VIEW_ROLE[view]) {
      viewNote.textContent = VIEW_NOTE[view];
      viewNote.hidden = false;
    } else {
      viewNote.hidden = true;
    }
    setFilter(VIEW_FILTER[view]);
  }
  viewSelect.addEventListener("change", applyView);

  // ---------- 選擇人員下拉選單 ----------
  const presetSelect = $("login-preset");
  const loginName = $("login-name");
  const loginDept = $("login-department");
  const loginRole = $("login-role");
  // 依角色列出可選的部門；倉管課主管與倉管人員只有倉管課
  function fillDepts(role, value) {
    const depts = ROLE_DEPTS[role] || [];
    loginDept.replaceChildren();
    if (depts.length !== 1) {
      const ph = el("option", "", role ? "請選擇" : "請先選擇角色");
      ph.value = "";
      loginDept.append(ph);
    }
    depts.forEach(function (d) {
      const opt = el("option", "", d);
      opt.value = d;
      loginDept.append(opt);
    });
    loginDept.value = depts.indexOf(value) >= 0 ? value : depts.length === 1 ? depts[0] : "";
  }
  loginRole.addEventListener("change", function () {
    fillDepts(loginRole.value, loginDept.value);
  });

  PRESET_USERS.forEach(function (u, i) {
    const opt = el("option", "", u.name + "（" + u.department + "・" + (ROLE_LABEL[u.role] || u.role) + "）");
    opt.value = String(i);
    presetSelect.append(opt);
  });
  function applyPreset() {
    const u = PRESET_USERS[Number(presetSelect.value)];
    const fixed = presetSelect.value !== "" && !!u;
    loginName.value = fixed ? u.name : "";
    loginRole.value = fixed ? u.role : "";
    fillDepts(loginRole.value, fixed ? u.department : "");
    loginName.readOnly = fixed;
    loginDept.disabled = fixed;
    loginRole.disabled = fixed;
  }
  presetSelect.addEventListener("change", function () {
    hideMessage(loginMsg);
    applyPreset();
  });

  // 進入系統：沒有登入狀態就先匿名登入，再寫入名稱、部門與角色（只能設定一次）
  loginForm.addEventListener("submit", async function (event) {
    event.preventDefault();
    hideMessage(loginMsg);
    const name = loginName.value.trim();
    const dept = loginDept.value.trim();
    const role = loginRole.value;
    const problem = validateProfile(name, dept, role);
    if (problem) {
      showMessage(loginMsg, problem, "err");
      return;
    }
    loginBtn.disabled = true;
    loginBtn.textContent = "進入中…";
    try {
      const { data: sessionData } = await client.auth.getSession();
      if (!sessionData || !sessionData.session) {
        const { error } = await client.auth.signInAnonymously();
        if (error) {
          showMessage(loginMsg, errText(error), "err");
          return;
        }
      }
      const { error } = await client.rpc("register_picking_profile", {
        p_display_name: name,
        p_department: dept,
        p_role: role,
      });
      if (error) {
        showMessage(loginMsg, errText(error), "err");
        return;
      }
      loginForm.reset();
      applyPreset();
      await enter();
    } catch (err) {
      showMessage(loginMsg, errText(err), "err");
    } finally {
      loginBtn.disabled = false;
      loginBtn.textContent = "進入";
    }
  });

  logoutBtn.addEventListener("click", async function () {
    const ok = window.confirm(
      "登出後無法再回到目前這個身分（沒有帳號密碼可以重新登入），下次進入會變成新的使用者。\n已送出的領料單會保留。確定要登出？"
    );
    if (!ok) return;
    logoutBtn.disabled = true;
    try {
      await client.auth.signOut();
    } finally {
      logoutBtn.disabled = false;
      showLogin();
    }
  });

  client.auth.onAuthStateChange(function (event) {
    if (event === "SIGNED_OUT") showLogin();
  });

  // ---------- 新增／修改表單 ----------
  function addItemRow(spec, qty) {
    if (itemsEl.children.length >= MAX_ITEMS) {
      showMessage(formMsg, "一張領料單最多 " + MAX_ITEMS + " 項產品。", "err");
      return;
    }
    const n = itemsEl.children.length + 1;
    const row = el("div", "item-row");
    const specInput = el("input", "spec");
    specInput.type = "text";
    specInput.maxLength = 100;
    specInput.placeholder = "產品名稱規格";
    specInput.setAttribute("aria-label", "第 " + n + " 項產品名稱規格");
    specInput.value = spec || "";
    const qtyInput = el("input", "qty-input");
    qtyInput.type = "number";
    qtyInput.inputMode = "numeric";
    qtyInput.min = "1";
    qtyInput.max = "999999";
    qtyInput.step = "1";
    qtyInput.placeholder = "pcs";
    qtyInput.setAttribute("aria-label", "第 " + n + " 項數量（pcs）");
    qtyInput.value = qty === undefined || qty === null ? "" : String(qty);
    const delBtn = el("button", "secondary del-btn", "刪除");
    delBtn.type = "button";
    delBtn.setAttribute("aria-label", "刪除第 " + n + " 項");
    delBtn.addEventListener("click", function () {
      row.remove();
      if (!itemsEl.children.length) addItemRow();
    });
    row.append(specInput, qtyInput, delBtn);
    itemsEl.append(row);
    return specInput;
  }

  addItemBtn.addEventListener("click", function () {
    const input = addItemRow();
    if (input) input.focus();
  });

  function resetForm() {
    editingNo = null;
    slipForm.reset();
    hideMessage(formMsg);
    if (profile) {
      deptInput.value = profile.department;
      pickerInput.value = profile.display_name;
    }
    dateInput.value = todayTaipei();
    itemsEl.replaceChildren();
    addItemRow();
    formTitle.textContent = "新增領料單";
    submitBtn.textContent = "送出領料單";
    cancelEditBtn.hidden = true;
  }

  function startEdit(s) {
    if (viewSelect.value !== "領料") {
      viewSelect.value = "領料";
      applyView();
    }
    editingNo = s.slip_no;
    hideMessage(formMsg);
    deptInput.value = s.department;
    dateInput.value = s.pick_date;
    pickerInput.value = s.picker_name;
    itemsEl.replaceChildren();
    (s.picking_items || []).forEach((it) => addItemRow(it.product_spec, it.quantity));
    if (!itemsEl.children.length) addItemRow();
    formTitle.textContent = "修改領料單 " + s.slip_no;
    submitBtn.textContent = "儲存修改";
    cancelEditBtn.hidden = false;
    formCard.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  cancelEditBtn.addEventListener("click", resetForm);

  function readAndValidate() {
    const pickDate = dateInput.value;
    const picker = pickerInput.value.trim();
    if (!pickDate) return { error: "請填寫領料日期。" };
    if (!picker) return { error: "請填寫領料人。" };
    if (picker.length > 50) return { error: "領料人最多 50 字。" };

    const items = [];
    const rows = Array.from(itemsEl.querySelectorAll(".item-row"));
    for (let i = 0; i < rows.length; i++) {
      const spec = rows[i].querySelector(".spec").value.trim();
      const qtyRaw = rows[i].querySelector(".qty-input").value.trim();
      if (!spec && !qtyRaw) continue; // 整列空白就略過
      if (!spec) return { error: "第 " + (i + 1) + " 項請填寫產品名稱規格。" };
      if (spec.length > 100) return { error: "第 " + (i + 1) + " 項產品名稱規格最多 100 字。" };
      if (!/^[1-9][0-9]{0,5}$/.test(qtyRaw)) {
        return { error: "第 " + (i + 1) + " 項數量必須是 1～999999 的整數（pcs）。" };
      }
      items.push({ product_spec: spec, quantity: Number(qtyRaw) });
    }
    if (!items.length) return { error: "至少要有一項產品。" };
    return { pickDate, picker, items };
  }

  slipForm.addEventListener("submit", async function (event) {
    event.preventDefault();
    hideMessage(formMsg);
    const v = readAndValidate();
    if (v.error) {
      showMessage(formMsg, v.error, "err");
      return;
    }

    const wasEditing = editingNo;
    submitBtn.disabled = true;
    submitBtn.textContent = "送出中…";
    try {
      const payload = { p_pick_date: v.pickDate, p_picker_name: v.picker, p_items: v.items };
      const res = wasEditing
        ? await client.rpc("update_picking_slip", Object.assign({ p_slip_no: wasEditing }, payload))
        : await client.rpc("create_picking_slip", payload);
      if (res.error) {
        showMessage(formMsg, errText(res.error), "err");
        return;
      }
      resetForm();
      // 送出後切到「待審核」頁面，等倉管課主管簽核
      viewSelect.value = "審核";
      applyView();
      showMessage(
        listMsg,
        (wasEditing ? "已更新領料單 " + wasEditing : "已送出領料單 " + res.data) + "，等待倉管課主管簽核。",
        "ok"
      );
      loadSlips(true);
      listCard.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (err) {
      showMessage(formMsg, errText(err), "err");
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = editingNo ? "儲存修改" : "送出領料單";
    }
  });

  // ---------- 清單 ----------
  function setFilter(value) {
    filter = value;
    if (listMsg.classList.contains("ok")) hideMessage(listMsg);
    filtersEl.querySelectorAll(".chip").forEach((b) => {
      b.setAttribute("aria-pressed", String(b.dataset.filter === value));
    });
    renderList();
  }
  filtersEl.addEventListener("click", function (event) {
    const btn = event.target.closest(".chip");
    if (btn) setFilter(btn.dataset.filter);
  });

  function updateFilterCounts() {
    const counts = { all: slips.length, 待審核: 0, 待發料: 0, 已發料: 0 };
    slips.forEach((s) => counts[slipStatus(s)]++);
    filtersEl.querySelectorAll(".chip").forEach((b) => {
      const label = b.dataset.filter === "all" ? "全部" : b.dataset.filter;
      b.textContent = label + " " + counts[b.dataset.filter];
    });
  }

  async function act(fn, slipNo, confirmText, okText, button) {
    if (!window.confirm(confirmText)) return;
    button.disabled = true;
    hideMessage(listMsg);
    try {
      const { error } = await client.rpc(fn, { p_slip_no: slipNo });
      if (error) {
        showMessage(listMsg, errText(error), "err");
        button.disabled = false;
        return;
      }
      showMessage(listMsg, okText, "ok");
      loadSlips(true);
    } catch (err) {
      showMessage(listMsg, errText(err), "err");
      button.disabled = false;
    }
  }

  function actionButtons(s) {
    const buttons = [];
    if (!profile) return buttons;
    const sameDept = s.department === profile.department;
    if (profile.role === "請領" && sameDept && !s.approved) {
      const b = el("button", "secondary", "修改");
      b.type = "button";
      b.addEventListener("click", () => startEdit(s));
      buttons.push(b);
    }
    // 倉管課主管簽核所有部門的領料單
    if (profile.role === "主管" && !s.approved) {
      const b = el("button", "primary", "簽核送出");
      b.type = "button";
      b.addEventListener("click", () =>
        act("approve_picking_slip", s.slip_no,
          "確定簽核送出領料單 " + s.slip_no + "（" + s.department + "）？\n簽核後就不能再修改，並移到待發料。",
          "領料單 " + s.slip_no + " 已簽核送出，移到待發料。", b)
      );
      buttons.push(b);
    }
    if (profile.role === "倉管" && s.approved && !s.issued) {
      const b = el("button", "primary", "勾選發料");
      b.type = "button";
      b.addEventListener("click", () =>
        act("issue_picking_slip", s.slip_no,
          "確定領料單 " + s.slip_no + " 已發料？",
          "領料單 " + s.slip_no + " 已標示發料。", b)
      );
      buttons.push(b);
    }
    return buttons;
  }

  function renderList() {
    listEl.replaceChildren();
    const shown = filter === "all" ? slips : slips.filter((s) => slipStatus(s) === filter);
    if (!shown.length) {
      if (listMsg.hidden || listMsg.classList.contains("info")) {
        showMessage(listMsg, slips.length ? "這個狀態目前沒有領料單。" : "目前還沒有領料單。", "info");
      }
      return;
    }
    if (listMsg.classList.contains("info")) hideMessage(listMsg);

    for (const s of shown) {
      const status = slipStatus(s);
      const li = el("li", "slip");
      const top = el("div", "slip-top");
      top.append(el("span", "slip-no", s.slip_no), el("span", "badge " + status, status));
      const meta = el("div", "slip-meta",
        "領料日期 " + s.pick_date + "｜" + s.department + "｜領料人 " + s.picker_name);
      const ul = el("ul", "slip-items");
      (s.picking_items || []).forEach((it) => {
        const item = el("li", "", it.product_spec + "　");
        item.append(el("span", "qty", "× " + it.quantity + " pcs"));
        ul.append(item);
      });
      li.append(top, meta, ul);
      const buttons = actionButtons(s);
      if (buttons.length) {
        const actions = el("div", "slip-actions");
        actions.append(...buttons);
        li.append(actions);
      }
      listEl.append(li);
    }
  }

  async function loadSlips(keepMessage) {
    if (!profile) return;
    refreshBtn.disabled = true;
    if (!keepMessage) hideMessage(listMsg);
    if (!slips.length && !keepMessage) showMessage(listMsg, "載入中…", "info");
    try {
      const { data, error } = await client
        .from("picking_slips")
        .select("slip_no, pick_date, department, picker_name, approved, issued, picking_items(id, product_spec, quantity)")
        .order("slip_no", { ascending: false })
        .limit(LIST_LIMIT);
      if (error) {
        showMessage(listMsg, "清單載入失敗：" + errText(error), "err");
        return;
      }
      slips = (data || []).map((s) => {
        s.picking_items = (s.picking_items || []).slice().sort((a, b) => a.id - b.id);
        return s;
      });
      if (listMsg.classList.contains("info")) hideMessage(listMsg);
      updateFilterCounts();
      renderList();
    } catch (err) {
      showMessage(listMsg, "清單載入失敗：" + errText(err), "err");
    } finally {
      refreshBtn.disabled = false;
    }
  }

  refreshBtn.addEventListener("click", () => loadSlips());
  window.addEventListener("online", () => loadSlips());

  enter().catch(function (err) {
    showLogin();
    showMessage(loginMsg, errText(err), "err");
  });
})();
