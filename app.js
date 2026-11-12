// 產品領料單前端：登入、新增／修改領料單、主管審核、倉管發料
(function () {
  "use strict";

  // ---------- PWA：註冊 Service Worker 與離線提示 ----------
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", function () {
      navigator.serviceWorker.register("sw.js").catch(function () {
        /* 註冊失敗不影響一般使用 */
      });
    });
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
  const listEl = $("slip-list");
  const listMsg = $("list-message");
  const refreshBtn = $("refresh-btn");
  const filtersEl = $("filters");

  const MAX_ITEMS = 50;
  const LIST_LIMIT = 50;
  const ROLE_LABEL = { 請領: "請領部門", 主管: "主管", 倉管: "倉管人員" };

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
    if (msg === "Invalid login credentials") return "電子郵件或密碼錯誤。";
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
      formCard.hidden = true;
      listCard.hidden = true;
      showMessage(appMsg, "這個帳號尚未設定部門與角色，請聯絡管理員。", "err");
      return;
    }

    profile = data;
    userInfo.replaceChildren(
      document.createTextNode("目前登入："),
      el("strong", "", profile.display_name),
      document.createTextNode("（" + profile.department + "・" + (ROLE_LABEL[profile.role] || profile.role) + "）")
    );
    userInfo.hidden = false;
    formCard.hidden = profile.role !== "請領";
    listCard.hidden = false;
    resetForm();
    loadSlips();
  }

  loginForm.addEventListener("submit", async function (event) {
    event.preventDefault();
    hideMessage(loginMsg);
    const email = $("login-email").value.trim();
    const password = $("login-password").value;
    if (!email || !password) {
      showMessage(loginMsg, "請輸入電子郵件與密碼。", "err");
      return;
    }
    loginBtn.disabled = true;
    loginBtn.textContent = "登入中…";
    try {
      const { error } = await client.auth.signInWithPassword({ email, password });
      if (error) {
        showMessage(loginMsg, errText(error), "err");
        return;
      }
      loginForm.reset();
      await enter();
    } catch (err) {
      showMessage(loginMsg, errText(err), "err");
    } finally {
      loginBtn.disabled = false;
      loginBtn.textContent = "登入";
    }
  });

  logoutBtn.addEventListener("click", async function () {
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
      showMessage(
        formMsg,
        wasEditing ? "已更新領料單 " + wasEditing + "。" : "已送出領料單 " + res.data + "，等待主管審核。",
        "ok"
      );
      loadSlips();
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
    if (profile.role === "主管" && sameDept && !s.approved) {
      const b = el("button", "primary", "審核通過");
      b.type = "button";
      b.addEventListener("click", () =>
        act("approve_picking_slip", s.slip_no,
          "確定審核通過領料單 " + s.slip_no + "？\n審核通過後就不能再修改。",
          "領料單 " + s.slip_no + " 已審核通過。", b)
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
