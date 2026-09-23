const CACHE_NAME = "superlist-v1";
const STATIC_ASSETS = [
  "./",
  "./index.html",
  "./styles.css?v=4",
  "./app.js?v=6",
  "./logo.png",
  "./superlist.png",
  "./pensando.jpg",
  "./manifest.json",
  "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"
];

// Instalar Service Worker y pre-cachear recursos estáticos
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch((err) => {
        console.warn("Algunos recursos no se pudieron pre-cachear:", err);
      });
    })
  );
  self.skipWaiting();
});

// Activar y limpiar cachés antiguas
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

// Interceptar peticiones de red
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Nunca cachear llamadas a la API de Supabase ni peticiones no GET
  if (event.request.method !== "GET" || url.origin.includes("supabase.co")) {
    return;
  }

  // Estrategia Network-First con fallback a Caché para contenido estático
  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        // Guardar copia fresca en caché si la respuesta es válida
        if (networkResponse && networkResponse.status === 200) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      })
      .catch(async () => {
        // Fallback a la caché si no hay conexión a internet
        const cachedResponse = await caches.match(event.request);
        if (cachedResponse) {
          return cachedResponse;
        }

        // Si es una navegación HTML y estamos offline, devolver index.html de la caché
        if (event.request.mode === "navigate") {
          return caches.match("./index.html") || caches.match("./");
        }

        return new Response("Sin conexión a internet", {
          status: 503,
          statusText: "Service Unavailable",
          headers: { "Content-Type": "text/plain; charset=utf-8" }
        });
      })
  );
});

