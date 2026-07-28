const CACHE_NAME = 'bible-study-cache-v2';
// 앱 셸에 필요한 가장 중요한 URL을 캐시합니다.
const urlsToCache = [
  '/',
  '/index.html'
];

self.addEventListener('install', event => {
  // 설치 단계를 수행합니다.
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Cache opened');
        return cache.addAll(urlsToCache);
      })
  );
});

self.addEventListener('fetch', event => {
  // GET 요청이 아닌 경우 브라우저가 처리하도록 둡니다.
  if (event.request.method !== 'GET') {
    return;
  }

  const requestUrl = new URL(event.request.url);
  const isSameOrigin = requestUrl.origin === self.location.origin;
  const isStaticAsset = ['document', 'script', 'style', 'image', 'font'].includes(event.request.destination);
  if (!isSameOrigin || !isStaticAsset) {
    return;
  }
  
  event.respondWith(
    caches.open(CACHE_NAME).then(cache => {
      return cache.match(event.request).then(response => {
        // 캐시에서 응답을 찾으면 반환합니다.
        if (response) {
          return response;
        }

        // 그렇지 않으면 네트워크에서 가져옵니다.
        return fetch(event.request).then(networkResponse => {
          // 응답이 유효하면 캐시합니다.
          if (networkResponse && networkResponse.ok) {
            // CDN에서 오는 불투명한 응답은 캐시하지 않습니다.
            cache.put(event.request, networkResponse.clone());
          }
          return networkResponse;
        });
      });
    })
  );
});

self.addEventListener('activate', event => {
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});
