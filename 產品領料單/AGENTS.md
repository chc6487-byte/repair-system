# 產品領料單｜專案規則

這份規則適用於 `產品領料單/` 資料夾內的所有工作。開工前請先讀 `需求筆記.txt`。

## 一、開工前：先更新到 GitHub 上最新的 main

每次開始工作前，一定要先把工作區更新成 GitHub 上最新的 `main`，再開始修改：

```bash
git fetch origin main
git merge --ff-only origin/main
```

如果無法快轉（例如本地有未合併的改動），先停下來告訴使用者，不要強制覆蓋。

## 二、金鑰規則

- 只能使用 publishable key（開頭為 `sb_publishable_`），它本來就是公開的，可以放在前端與設定檔。
- secret key（開頭為 `sb_secret_`，以及舊版的 `service_role` 金鑰）**不可以寫進任何檔案**：包含程式碼、設定檔、文件、範例、測試、Excel、提交訊息與 Pull Request 說明。
- 使用者若在對話中提供 secret key，不要寫入檔案，並提醒使用者改用 publishable key。
- 若發現任何檔案或 Git 紀錄中出現 secret key，立即停止並通知使用者到 Supabase 撤換金鑰。
- 使用 publishable key 的資料表必須啟用資料列安全（RLS），並只開放需要的權限。

## 三、完成後：建立 Pull Request 並合併進 main

1. 用簡短、說明做了什麼的繁體中文訊息提交（例如「新增領料單欄位表」）。
2. 推送到工作分支。
3. 用 GitHub 外掛建立 Pull Request，說明變更內容與驗證結果。
4. 用 GitHub 外掛把 Pull Request 合併進 `main`。
5. 不可強制推送，不可改寫 `main` 的歷史。

## 四、資料與內容

- 只使用虛構的公司、部門、人員、產品；不可使用真實姓名與客戶資料。
- 需求筆記沒寫的地方標「待確認」，不要自行假設；需要決定時先問使用者。
- 檔案一律使用 UTF-8 編碼，欄位名稱與選項使用繁體中文，並與 `需求筆記.txt` 一致。

## 五、目前範圍

- Excel（欄位表與範例資料）：本資料夾的 `領料單欄位表.xlsx`。
- 網頁：儲存庫根目錄的 `index.html`、`style.css`、`app.js`、`config.js`、`sw.js`、`manifest.webmanifest`、`icons/`，由 GitHub Pages 發佈。
- 資料庫：`supabase/picking_schema.sql`。所有寫入都透過資料庫函式，函式內檢查角色與部門；不要直接開放資料表的新增、修改、刪除權限。
- 新增或改名網站檔案時，同步更新 `sw.js` 的檔案清單，並把 `CACHE_VERSION` 加 1。
- 「還沒決定的事」裡標示「網頁暫定」的做法，修改前先和使用者確認。
- 簡報、操作說明本階段不做；要做之前先和使用者確認需求。
