const CACHE_NAME = "superlist-v15";
const STATIC_ASSETS = [
  "./",
  "./index.html",
  "./styles.css?v=16",
  "./app.js?v=16",
  "./app-icon.webp",
  "./app-icon-192.webp",
  "./logo.webp",
  "./logo-512.webp",
  "./SUPERMERCADO.webp",
  "./superlist.webp",
  "./pensando.jpg",
  "./manifest.json",
  "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"
];

// ==============================================================================
// NOTIFICACIONES PUSH
// Estos handlers viven acá y no en app.js a propósito: los eventos "push" y
// "notificationclick" solo existen dentro del service worker, que es lo único
// que sigue corriendo cuando el usuario cerró la app.
// ==============================================================================
self.addEventListener("push", (event) => {
  let payload = { title: "SuperList", body: "Tenés novedades en tus listas." };
  if (event.data) {
    try {
      payload = event.data.json();
    } catch {
      // Si no viene JSON, se usa el texto plano.
      payload.body = event.data.text();
    }
  }

  event.waitUntil(
    self.registration.showNotification(payload.title || "SuperList", {
      body: payload.body || "",
      icon: "./app-icon-192.webp",
      badge: "./app-icon-192.webp",
      // El tag evita que se apilen notificaciones iguales del mismo remitente.
      tag: payload.tag || "superlist",
      renotify: false,
      data: { url: payload.url || "./", groupId: payload.groupId || null },
    })
  );
});

// Al tocar la notificación, se abre la app en la lista relacionada.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || "./";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ("focus" in client) {
          client.postMessage({ type: "open", url: target });
          return client.focus();
        }
      }
      return self.clients.openWindow(target);
    })
  );
});

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

