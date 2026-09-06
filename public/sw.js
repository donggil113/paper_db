// 설치형 PWA 와 최소한의 오프라인 셸을 위한 서비스 워커
const CACHE_VERSION = "v1";
const APP_CACHE = `paper-db-${CACHE_VERSION}`;
const ASSETS = ["/", "/index.html", "/manifest.webmanifest", "/pwa-icon.svg", "/favicon.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(APP_CACHE).then((cache) => cache.addAll(ASSETS).catch(() => {})));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== APP_CACHE).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);

  // Supabase API·인증은 항상 네트워크로 (캐시하면 남의 데이터가 남을 수 있다)
  if (url.host.endsWith("supabase.co") || url.host.endsWith("supabase.in")) return;

  // 페이지 이동은 네트워크 우선, 실패하면 캐시된 셸
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(APP_CACHE).then((c) => c.put(request, copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match("/index.html"))
    );
    return;
  }

  // 정적 자산은 캐시 우선
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(request).then((cached) =>
        cached ||
        fetch(request)
          .then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(APP_CACHE).then((c) => c.put(request, copy)).catch(() => {});
            }
            return res;
          })
          .catch(() => cached)
      )
    );
  }
});
