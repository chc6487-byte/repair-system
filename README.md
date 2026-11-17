# 產品領料單系統

示範用的產品領料單網頁：請領部門申請 → 主管審核 → 倉管發料。所有資料皆為虛構。

- 網站：https://chc6487-byte.github.io/repair-system/
- 需求筆記：[產品領料單/需求筆記.txt](產品領料單/需求筆記.txt)
- 欄位規格與範例資料：[產品領料單/領料單欄位表.xlsx](產品領料單/領料單欄位表.xlsx)
- 資料庫建表 SQL：[supabase/picking_schema.sql](supabase/picking_schema.sql)
- 網頁可安裝成 App（PWA）：用手機瀏覽器開啟網站後，選「加入主畫面」或「安裝應用程式」。

## 上線步驟

1. 在 Supabase SQL Editor 執行 `supabase/picking_schema.sql`。
2. Supabase 後台 → Authentication → Sign In / Providers：開啟「Allow new users to sign up」。
   「Confirm email」可依需要開關：開啟時要先到信箱點確認連結才能登入；關閉時建立帳號後直接登入。
3. Authentication → URL Configuration：Site URL 與 Redirect URLs 加入網站網址，確認信的連結才會回到網站。
4. 儲存庫設為公開，並在 Settings → Pages 選擇 `main` 分支、根目錄發佈。

## 建立帳號

登入頁按「還沒有帳號？建立帳號」，填寫電子郵件、密碼（至少 6 個字元）、名稱、部門與角色（請領／主管／倉管）。
名稱、部門與角色只能設定一次，之後要修改請管理員依 `supabase/picking_schema.sql` 檔案最後的範例用 SQL 修改。

> 注意：角色由使用者自行選擇，任何人都能註冊成主管或倉管，只適合示範使用。

## 角色與權限

| 角色 | 可以做的事 |
|---|---|
| 請領 | 新增領料單；修改自己部門、尚未審核通過的單 |
| 主管 | 審核通過自己部門的單 |
| 倉管 | 對已審核通過的單勾選發料 |
| 所有已設定的帳號 | 查看所有部門的領料單 |

前端只使用 publishable key；secret key 不可寫進任何檔案。

## 封存資料

先前的報修登記示範已不再發佈網站，相關文件保留供參考：`報修需求筆記.txt`、`文件/報修欄位表.xlsx`、`supabase/schema.sql`。
