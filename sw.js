// 產品領料單 PWA 的 Service Worker
// 策略：
// - 網站本身的檔案（HTML/CSS/JS/圖示）：先抓網路最新版，失敗（離線）時改用快取。
// - supabase-js（CDN、固定版本號）：先用快取，沒有才抓網路。
// - Supabase 登入與資料 API：一律走網路，不快取，避免看到過期清單或重複送出。
// 修改網站檔案後，請把 CACHE_VERSION 加 1，讓舊快取被清掉。

const CACHE_VERSION = "v1";
const CACHE_NAME = "picking-pwa-" + CACHE_VERSION;

const APP_SHELL = [
  "./",
  "./index.html",
  "./style.css",
  "./app.js",
  "./config.js",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-512.png",
  "./icons/apple-touch-icon.png",
];
const CDN_ASSETS = [
  "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.4/dist/umd/supabase.js",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      await cache.addAll(APP_SHELL);
      // CDN 檔案盡量預先快取；失敗不影響安裝，第一次使用時會再補上
      await Promise.all(
        CDN_ASSETS.map((url) => cache.add(url).catch(() => undefined))
      );
      await self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          // 一併清掉舊報修網站（repair-pwa-*）留下的快取
          .filter((k) => (k.startsWith("repair-pwa-") || k.startsWith("picking-pwa-")) && k !== CACHE_NAME)
          .map((k) => caches.delete(k))
      );
      await self.clients.claim();
    })()
  );
});

async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch (err) {
    const cached =
      (await cache.match(request, { ignoreSearch: true })) ||
      (request.mode === "navigate" ? await cache.match("./index.html") : undefined);
    if (cached) return cached;
    throw err;
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok || response.type === "opaque") cache.put(request, response.clone());
  return response;
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return; // 送出、審核、發料（POST）不經過快取

  const url = new URL(request.url);
  if (url.origin === self.location.origin) {
    event.respondWith(networkFirst(request));
  } else if (CDN_ASSETS.includes(url.href)) {
    event.respondWith(cacheFirst(request));
  }
  // 其他（包含 Supabase API）不處理，直接走網路
});
