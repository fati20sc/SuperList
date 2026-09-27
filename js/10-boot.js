// =======================================================================
// 10-boot.js
//
// Arranque: registro del service worker e inicializacion de la app.
// Va ultimo porque se ejecuta cuando todo lo demas ya esta definido.
// =======================================================================
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

