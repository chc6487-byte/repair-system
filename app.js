// 報修登記前端：新增報修、顯示最近 20 筆
(function () {
  "use strict";

  const TABLE = "repair_requests";
  const LIST_LIMIT = 20;
  const LIMITS = { reporter_name: 50, location: 100, description: 1000 };

  const form = document.getElementById("repair-form");
  const submitBtn = document.getElementById("submit-btn");
  const formMsg = document.getElementById("form-message");
  const listEl = document.getElementById("repair-list");
  const listMsg = document.getElementById("list-message");
  const refreshBtn = document.getElementById("refresh-btn");
  const descInput = document.getElementById("description");
  const descCount = document.getElementById("desc-count");

  function showMessage(el, text, kind) {
    el.textContent = text;
    el.className = "message " + kind;
    el.hidden = false;
  }
  function hideMessage(el) {
    el.hidden = true;
    el.textContent = "";
  }

  // 把資料庫錯誤轉成看得懂的中文訊息
  function describeError(error) {
    if (!error) return "發生未知錯誤。";
    const code = error.code || "";
    if (code === "23514") return "資料不符合規則（選項不正確或文字太長），請檢查後再送出。";
    if (code === "42501") return "沒有權限執行這個動作。";
    if (/fetch|network/i.test(error.message || "")) return "無法連線到伺服器，請檢查網路後再試。";
    return "送出失敗：" + (error.message || code);
  }

  const cfg = window.SUPABASE_CONFIG || {};
  if (!window.supabase || !cfg.url || !cfg.publishableKey) {
    showMessage(formMsg, "系統載入失敗，請重新整理頁面。", "err");
    showMessage(listMsg, "系統載入失敗，請重新整理頁面。", "err");
    submitBtn.disabled = true;
    refreshBtn.disabled = true;
    return;
  }
  const client = window.supabase.createClient(cfg.url, cfg.publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // ---------- 表單 ----------
  descInput.addEventListener("input", function () {
    descCount.textContent = String(descInput.value.length);
  });

  function readForm() {
    const data = new FormData(form);
    return {
      reporter_name: String(data.get("reporter_name") || "").trim(),
      location: String(data.get("location") || "").trim(),
      category: String(data.get("category") || ""),
      description: String(data.get("description") || "").trim(),
      urgency: String(data.get("urgency") || ""),
    };
  }

  function validate(r) {
    const missing = [];
    if (!r.reporter_name) missing.push("報修人");
    if (!r.location) missing.push("地點或部門");
    if (!["設備", "網路", "環境", "其他"].includes(r.category)) missing.push("類別");
    if (!r.description) missing.push("問題說明");
    if (!["低", "中", "高"].includes(r.urgency)) missing.push("緊急程度");
    if (missing.length) return "請填寫：" + missing.join("、");
    if (r.reporter_name.length > LIMITS.reporter_name) return "報修人最多 50 字。";
    if (r.location.length > LIMITS.location) return "地點或部門最多 100 字。";
    if (r.description.length > LIMITS.description) return "問題說明最多 1000 字。";
    return "";
  }

  form.addEventListener("submit", async function (event) {
    event.preventDefault();
    hideMessage(formMsg);

    const record = readForm();
    const problem = validate(record);
    if (problem) {
      showMessage(formMsg, problem, "err");
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = "送出中…";
    try {
      // 不送 status、id、created_at，由資料庫使用預設值
      const { error } = await client.from(TABLE).insert(record);
      if (error) {
        showMessage(formMsg, describeError(error), "err");
        return;
      }
      showMessage(formMsg, "已送出報修，謝謝！", "ok");
      form.reset();
      descCount.textContent = "0";
      loadList();
    } catch (err) {
      showMessage(formMsg, describeError(err), "err");
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "送出報修";
    }
  });

  // ---------- 清單 ----------
  const timeFormat = new Intl.DateTimeFormat("zh-TW", {
    timeZone: "Asia/Taipei",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  });

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text; // 一律用 textContent，避免使用者輸入的 HTML 被執行
    return node;
  }

  function renderList(rows) {
    listEl.replaceChildren();
    if (!rows.length) {
      showMessage(listMsg, "目前還沒有報修資料。", "info");
      return;
    }
    hideMessage(listMsg);
    for (const r of rows) {
      const li = el("li", "repair-item");
      const top = el("div", "item-top");
      top.append(
        el("span", "tag", r.category),
        el("span", "tag urgency-" + r.urgency, "緊急：" + r.urgency),
        el("span", "tag", r.status)
      );
      const when = r.created_at ? timeFormat.format(new Date(r.created_at)) : "";
      li.append(
        top,
        el("p", "item-desc", r.description),
        el("div", "item-meta", r.reporter_name + "｜" + r.location + "｜" + when)
      );
      listEl.append(li);
    }
  }

  async function loadList() {
    refreshBtn.disabled = true;
    if (!listEl.children.length) showMessage(listMsg, "載入中…", "info");
    try {
      const { data, error } = await client
        .from(TABLE)
        .select("id, created_at, reporter_name, location, category, description, urgency, status")
        .order("created_at", { ascending: false })
        .limit(LIST_LIMIT);
      if (error) {
        showMessage(listMsg, "清單載入失敗：" + describeError(error).replace(/^送出失敗：/, ""), "err");
        return;
      }
      renderList(data || []);
    } catch (err) {
      showMessage(listMsg, "清單載入失敗：" + describeError(err).replace(/^送出失敗：/, ""), "err");
    } finally {
      refreshBtn.disabled = false;
    }
  }

  refreshBtn.addEventListener("click", loadList);
  loadList();
})();
