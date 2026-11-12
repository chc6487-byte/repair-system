// Supabase 連線設定
// 這裡只能放 publishable（公開）金鑰；secret / service_role 金鑰絕不可放進前端或提交到 Git。
// 資料安全由資料庫的 GRANT 與 RLS 規則負責（見 supabase/schema.sql）。
window.SUPABASE_CONFIG = {
  url: "https://rldqdgnmyzryxgyunmvj.supabase.co",
  publishableKey: "sb_publishable_X8J214t2lNllrTDUbgnjCA_kjTwXaDb",
};
