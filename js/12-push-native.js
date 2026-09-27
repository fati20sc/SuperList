// =======================================================================
// 12-push-native.js
//
// Notificaciones push NATIVAS de Android, vía Firebase Cloud Messaging.
//
// POR QUÉ ESTE ARCHIVO APARTE: la Push API de los navegadores no existe dentro
// de un WebView de Android, que es lo que usa el APK. Por eso el botón de
// "Mi cuenta" dice que no hay soporte. Con el plugin nativo
// @capacitor/push-notifications sí funciona, y esto lo conecta.
//
// CÓMO SABER SI CORRE DENTRO DEL APK: hay un plugin de Capacitor cargado
// (Capacitor.isNativePlatform). En el navegador esto no hace nada y la
// notificación web de js/11-push.js es la que se usa.
//
// REQUISITOS (los tiene que hacer una persona, no el código):
//   1) Crear el proyecto en Firebase y bajar google-services.json.
//   2) Subir el "upload key" (certificado SHA-1) a Firebase.
//   3) Dejar google-services.json en la raíz del repo.
// =======================================================================

const PushNotifications = window.Capacitor?.Plugins?.PushNotifications;
const LocalNotifications = window.Capacitor?.Plugins?.LocalNotifications;
const DEVICE_TOKENS_TABLE = "device_tokens";

// ¿Estamos corriendo dentro del APK nativo de Capacitor?
function isNativeApp() {
  return Boolean(window.Capacitor?.isNativePlatform?.());
}

// El plugin nativo está disponible solo si se instaló y compiló con él.
function nativePushAvailable() {
  return isNativeApp() && Boolean(PushNotifications);
}

// Pide permiso de notificaciones. En Android 13+ (API 33) esto es obligatorio:
// sin el permiso, FCM recibe los mensajes pero Android no los muestra.
async function requestAndroidPermission() {
  if (!nativePushAvailable()) return false;
  try {
    const status = await PushNotifications.checkPermissions();
    if (status.display === "granted") return true;
    const asked = await PushNotifications.requestPermissions();
    return asked.display === "granted";
  } catch (error) {
    console.warn("No se pudo pedir permiso de notificaciones:", error);
    return false;
  }
}

// Crea el canal de notificaciones. En Android 8+ las notificaciones sin canal
// no se ven, y el usuario puede silenciar cada canal por separado.
async function createAndroidNotificationChannel() {
  if (!LocalNotifications) return;
  try {
    const existing = await LocalNotifications.listChannels();
    const channels = existing?.channels || [];
    if (channels.some((c) => c.id === "avisos")) return;

    await LocalNotifications.createChannel({
      id: "avisos",
      name: "Avisos de las listas",
      description: "Avisos cuando alguien modifica una lista compartida.",
      importance: 4, // HIGH: vibrar y aparecer arriba
      visibility: 1, // PUBLIC: se ve en la pantalla de bloqueo
      lights: true,
      lightColor: "#789b72",
    });
  } catch (error) {
    console.warn("No se pudo crear el canal de notificaciones:", error);
  }
}

// ¿Este usuario ya tiene algún teléfono registrado para notificaciones?
async function hasDeviceToken() {
  const user = currentUser();
  if (!user) return false;
  const { data, error } = await supabaseClient
    .from(DEVICE_TOKENS_TABLE)
    .select("token")
    .eq("user_id", user.id)
    .limit(1);
  return !error && Boolean(data?.length);
}

// Registra el dispositivo con FCM y guarda el token en Supabase.
// Devuelve { ok: true, token } o { ok: false, motivo }.
async function registerNativePush() {
  if (!nativePushAvailable()) {
    return { ok: false, motivo: "Las notificaciones nativas solo funcionan en la app instalada." };
  }

  const granted = await requestAndroidPermission();
  if (!granted) {
    return { ok: false, motivo: "Android no dio permiso para mostrar notificaciones." };
  }

  // El canal decide cómo se ven las notificaciones en Android 8+.
  await createAndroidNotificationChannel();

  try {
    await PushNotifications.register();
  } catch (error) {
    console.error("Fallo al registrar con FCM:", error);
    return {
      ok: false,
      motivo: "No se pudo registrar con Firebase. Revisá que google-services.json esté en el proyecto.",
    };
  }

  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      PushNotifications.removeListener("registration", onToken);
      resolve({ ok: false, motivo: "Firebase no devolvió un token a tiempo." });
    }, 12000);

    const onToken = async (token) => {
      clearTimeout(timeout);
      PushNotifications.removeListener("registration", onToken);
      const saved = await saveDeviceToken(token.value);
      if (!saved) {
        resolve({ ok: false, motivo: "Se registró el teléfono, pero no se pudo guardar el token." });
        return;
      }
      resolve({ ok: true, token: token.value });
    };

    PushNotifications.addListener("registration", onToken);
  });
}

// Guarda el token FCM del teléfono. Una fila por usuario+token, así una
// persona puede tener el APK y la PWA y recibir por los dos canales.
async function saveDeviceToken(token) {
  const user = currentUser();
  if (!user || !token) return false;

  const row = {
    user_id: user.id,
    token,
    platform: "android",
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabaseClient
    .from(DEVICE_TOKENS_TABLE)
    .upsert(row, { onConflict: "user_id,token" });
  if (error) {
    console.error("No se pudo guardar el token del dispositivo:", error);
    showNotification("No se pudo guardar el token del dispositivo.", "error");
    return false;
  }
  return true;
}

// Escucha las notificaciones que llegan con la app abierta. Se llama una sola
// vez, al iniciar.
function listenToNativeNotifications() {
  if (!nativePushAvailable()) return;
  if (listenToNativeNotifications.done) return;
  listenToNativeNotifications.done = true;

  // El token puede rotar (reinstalación, cambio de cuenta). Se re-guarda.
  PushNotifications.addListener("registration", async (token) => {
    if (currentUser()) await saveDeviceToken(token.value);
  });

  PushNotifications.addListener("pushNotificationReceived", (notification) => {
    console.info("Notificación recibida con la app abierta:", notification.title);
  });

  // El usuario tocó la notificación con la app en segundo plano.
  PushNotifications.addListener("pushNotificationActionPerformed", (notification) => {
    const groupId = notification?.data?.groupId;
    if (groupId) {
      session.groupId = String(groupId);
      currentView = "home";
      persist();
    }
    render();
  });
}
