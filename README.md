# Invoice 26155 出貨文件

網站首頁顯示 Invoice 26155（大連 → 台中）的出口發票、四個貨櫃的裝箱單，以及發票與裝箱單的自動核對結果。整個網站只有一個靜態檔 `index.html`，不需資料庫或登入。

- 網站：https://chc6487-byte.github.io/repair-system/
- 發佈方式：Settings → Pages 選擇 `main` 分支、根目錄。

## 更新內容

直接以新的 HTML 檔取代 `index.html`，合併到 `main` 後 GitHub Pages 會自動重新發佈。

## 舊系統

先前的「產品領料單」系統已不再發佈網站。`sw.js` 只負責清除曾安裝該 PWA 的瀏覽器快取並解除註冊，請保留。
相關文件保留供參考：`產品領料單/`、`supabase/picking_schema.sql`，以及更早的報修示範 `報修需求筆記.txt`、`文件/報修欄位表.xlsx`、`supabase/schema.sql`。
