// Supabase 連線設定
// 這裡只能放 publishable（公開）金鑰；secret 金鑰絕不可放進前端或寫進任何檔案。
// 資料安全由資料庫的權限、RLS 與函式檢查負責（見 supabase/picking_schema.sql）。
window.SUPABASE_CONFIG = {
  url: "https://rldqdgnmyzryxgyunmvj.supabase.co",
  publishableKey: "sb_publishable_X8J214t2lNllrTDUbgnjCA_kjTwXaDb",
};
