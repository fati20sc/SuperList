// =======================================================================
// 10-boot.js
//
// Arranque: registro del service worker e inicializacion de la app.
// Va ultimo porque se ejecuta cuando todo lo demas ya esta definido.
// =======================================================================
// ==============================================================================
// NOTIFICACIONES PUSH
// El service worker es el único que puede mostrar notificaciones aunque la
// pestaña esté cerrada. Acá llegan los pushes que envía la Edge Function.
// ==============================================================================
self.addEventListener("push", (event) => {
  let payload = { title: "SuperList", body: "Tenés novedades en tus listas." };
  if (event.data) {
    try {
      payload = event.data.json();
    } catch {
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

// ==============================================================================
// Registro de Service Worker para PWA (Instalable en móviles y desktop)
// ==============================================================================
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("./sw.js")
      .then((reg) => {
        reg.onupdatefound = () => {
          const installingWorker = reg.installing;
          if (installingWorker) {
            installingWorker.onstatechange = () => {
              if (installingWorker.state === "installed" && navigator.serviceWorker.controller) {
                console.info("Nueva versión de SuperList disponible en caché.");
              }
            };
          }
        };
      })
      .catch((err) => {
        console.warn("No se pudo registrar el ServiceWorker:", err);
      });
  });
}

