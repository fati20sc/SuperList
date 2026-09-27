// =======================================================================
// 11-push.js
//
// Notificaciones push: Web Push (VAPID) en el navegador, FCM nativo en el APK.
//
// QUE RESUELVE: hasta ahora los avisos solo se veían con la app abierta, como
// un cartelito dentro de la página. Con esto, un usuario que cerró la app
// recibe la notificación igual que cualquier app del teléfono.
//
// DOS CAMINOS, SEGUN DONDE CORRA:
//   - Navegador / PWA: Web Push con VAPID (este archivo).
//   - APK de Android: notificaciones nativas de Firebase, en
//     js/12-push-native.js. La Push API de los navegadores no existe dentro de
//     un WebView de Android, así que en el APK esto delega en el plugin nativo.
//
// En ambos casos el token se guarda en Supabase y la Edge Function send-push
// manda el aviso. En el navegador la clave privada VAPID es un secreto de
// Supabase; en Android el envío lo hace la cuenta de Firebase (service account).
// =======================================================================

// Clave pública VAPID. La privada NUNCA va en el cliente: va como secreto de la
// Edge Function de Supabase (SUPABASE_VAPID_PRIVATE_KEY).
const VAPID_PUBLIC_KEY =
  "BMWbyf8ih805R5wI_NtowQSO0Xuxc8YvGWl2eI1wX4nHapw35n8RvjEVFTK_MOwiAnGnM4r6rKJdZP624qMarEU";
const PUSH_TABLE = "push_subscriptions";

// Convierte la clave VAPID (base64url) al formato que espera la API.
function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);
  return output;
}

// Pide permiso y guarda la suscripción del dispositivo para este usuario.
// Devuelve { ok: true } o { ok: false, motivo }.
async function enablePushNotifications() {
  // Dentro del APK no hay Push API, pero sí notificaciones nativas con FCM.
  if (isNativeApp()) return registerNativePush();

  const unsupported = pushUnsupportedReason();
  if (unsupported) return { ok: false, motivo: unsupported };

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    return { ok: false, motivo: "No diste permiso para mostrar notificaciones." };
  }

  let registration;
  try {
    registration = await getServiceWorkerRegistration();
  } catch (error) {
    return { ok: false, motivo: "El service worker todavía no está listo. Recargá la app e intentá de nuevo." };
  }
  if (!registration) return { ok: false, motivo: "No se pudo registrar el service worker." };

  let subscription;
  try {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });
  } catch (error) {
    console.error("No se pudo crear la suscripción push:", error);
    return { ok: false, motivo: "El navegador rechazó la suscripción push." };
  }

  const saved = await savePushSubscription(subscription);
  if (!saved) {
    return { ok: false, motivo: "Se activaron las notificaciones, pero no se pudieron guardar en el servidor." };
  }
  return { ok: true, subscription };
}

// Da de baja la suscripción de este dispositivo.
async function disablePushNotifications() {
  const user = currentUser();
  if (!user) return { ok: true };

  // En el APK se borra el token FCM de la base.
  if (isNativeApp()) {
    const { error } = await supabaseClient
      .from(DEVICE_TOKENS_TABLE)
      .delete()
      .eq("user_id", user.id);
    if (error) console.warn("No se pudo borrar el token del dispositivo:", error);
    return { ok: true };
  }

  try {
    const registration = await getServiceWorkerRegistration();
    const subscription = await registration?.pushManager.getSubscription();
    if (subscription) await subscription.unsubscribe();
  } catch (error) {
    console.warn("No se pudo cancelar la suscripción local:", error);
  }
  await supabaseClient
    .from(PUSH_TABLE)
    .delete()
    .eq("user_id", user.id)
    .then(() => {})
    .catch((error) => console.warn(error));
  return { ok: true };
}

// Guarda (o refresca) la suscripción en Supabase, una fila por usuario.
async function savePushSubscription(subscription) {
  const user = currentUser();
  if (!user) return false;
  const endpoint = subscription.endpoint;
  if (!endpoint) return false;

  const row = {
    user_id: user.id,
    endpoint,
    p256dh: subscription.keys?.p256dh || "",
    auth: subscription.keys?.auth || "",
    user_agent: navigator.userAgent || "",
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabaseClient.from(PUSH_TABLE).upsert(row, { onConflict: "user_id" });
  if (error) {
    console.error("No se pudo guardar la suscripción push:", error);
    showNotification("No se pudo guardar la suscripción en el servidor.", "error");
    return false;
  }
  return true;
}

// Estado para pintar el botón de la interfaz.
async function getPushStatus() {
  // En el APK el estado real es si hay un token FCM guardado para este usuario.
  if (isNativeApp()) {
    const granted = nativePushAvailable()
      ? (await PushNotifications.checkPermissions().catch(() => ({ display: "prompt" }))).display
      : "prompt";
    if (granted === "granted") {
      const hasToken = await hasDeviceToken();
      return { state: hasToken ? "enabled" : "default", reason: "" };
    }
    if (granted === "denied") {
      return { state: "denied", reason: "Android tiene las notificaciones bloqueadas para SuperList." };
    }
    if (!nativePushAvailable()) {
      return {
        state: "unsupported",
        reason: "Esta versión del APK se compiló sin Firebase, así que no hay notificaciones.",
      };
    }
    return { state: "default", reason: "" };
  }

  const unsupported = pushUnsupportedReason();
  if (unsupported) return { state: "unsupported", reason: unsupported };

  const permission = pushPermissionState();
  if (permission === "denied") {
    return { state: "denied", reason: "Tenés las notificaciones bloqueadas en el navegador." };
  }
  if (permission !== "granted") return { state: "default", reason: "" };

  try {
    const registration = await getServiceWorkerRegistration();
    const subscription = await registration?.pushManager.getSubscription();
    return { state: subscription ? "enabled" : "default", reason: "" };
  } catch {
    return { state: "default", reason: "" };
  }
}

// Muestra una notificación del sistema aunque la app esté en segundo plano.
// Se usa para los avisos que llegan por Realtime: si la pestaña está visible se
// ve el cartelito de siempre, y si está oculta, uno del sistema.
async function showSystemNotification(title, body, options = {}) {
  if (pushPermissionState() !== "granted") return;
  if (document.visibilityState === "visible") return;
  try {
    const registration = await getServiceWorkerRegistration();
    if (!registration || typeof registration.showNotification !== "function") return;
    await registration.showNotification(title, {
      body,
      icon: "./app-icon-192.webp",
      badge: "./app-icon-192.webp",
      tag: options.tag || "superlist",
      data: { url: options.url || "./" },
    });
  } catch (error) {
    console.warn("No se pudo mostrar la notificación del sistema:", error);
  }
}

// Motivo por el que push no va a funcionar, o null si va.
// Sirve para explicarle al usuario la situación en vez de fallar en silencio.
function pushUnsupportedReason() {
  if (!("serviceWorker" in navigator)) return "Este navegador no soporta service workers.";
  if (!("PushManager" in window)) {
    return "Las notificaciones push no funcionan dentro de la app instalada (APK). " +
      "Necesitás abrir SuperList en el navegador, o usar la versión instalada como PWA.";
  }
  if (!("Notification" in window)) return "Este navegador no muestra notificaciones del sistema.";
  return null;
}

function pushPermissionState() {
  if (!("Notification" in window)) return "unsupported";
  return Notification.permission;
}

async function getServiceWorkerRegistration() {
  if (!("serviceWorker" in navigator)) return null;
  return navigator.serviceWorker.ready;
}
