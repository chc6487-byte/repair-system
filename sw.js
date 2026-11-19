// 舊「產品領料單」PWA 的 Service Worker 已停用。
// 這個檔案保留在原路徑，讓曾安裝過的瀏覽器更新到此版本後：
// 清除所有快取、解除註冊，並重新載入頁面，改看新的網站內容。
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
      await self.registration.unregister();
      const clients = await self.clients.matchAll({ type: "window" });
      clients.forEach((c) => c.navigate(c.url));
    })()
  );
});
