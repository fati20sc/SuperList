// Edge Function: envía una notificación push a las personas de un grupo.
//
// DOS CANALES, SEGUN DONDE ESTA QUIEN LA RECIBE:
//   - Navegador / PWA: Web Push con VAPID, contra la tabla push_subscriptions.
//   - APK de Android: FCM de Firebase, contra la tabla device_tokens.
//   Se puede tener el APK y la PWA a la vez: cada quien recibe por donde le
//   corresponde.
//
// CÓMO INSTALARLO:
//   1) Supabase > Edge Functions > New Function > ponele nombre "send-push"
//   2) Pegá este código (cambiale la extensión a .ts si tu editor lo pide).
//   3) Secrets > New Secret, dos veces:
//        SUPABASE_VAPID_PRIVATE_KEY  = la clave privada VAPID
//        SUPABASE_VAPID_SUBJECT      = "mailto:tu@email.com"
//   4) (Opcional, solo si querés que el APK también notifique)
//        FIREBASE_PROJECT_ID  = el id del proyecto de Firebase
//        FIREBASE_CLIENT_EMAIL = el service account de Firebase
//        FIREBASE_PRIVATE_KEY  = la clave privada del service account
//   5) Deploy.
//
// CÓMO SE USA: desde otra Edge Function, un trigger de base de datos o un
// curl con el service_rolekey:
//
//   fetch("https://<proyecto>.supabase.co/functions/v1/send-push", {
//     method: "POST",
//     headers: {
//       "Content-Type": "application/json",
//       Authorization: "Bearer <SUPABASE_SERVICE_ROLE_KEY>",
//     },
//     body: JSON.stringify({
//       groupId: "lista-123",
//       title: "Lista compartida",
//       body: "Ana agregó leche",
//       url: "./",
//     }),
//   });
//
// IMPORTANTE: las suscripciones que ya no valen (el usuario desinstalo la app o
// cambio de dispositivo) se borran solas: el push falla con 404/410 y la fila se
// elimina, para no seguir mandandoles a dead ends.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import webpush from "https://esm.sh/web-push@3.6.7";

const VAPID_SUBJECT = Deno.env.get("SUPABASE_VAPID_SUBJECT") || "mailto:admin@example.com";
const VAPID_PRIVATE_KEY = Deno.env.get("SUPABASE_VAPID_PRIVATE_KEY");
// La clave pública va en el cliente (js/11-push.js). Se replica acá porque
// web-push la necesita para armar la cabecera de autenticación del push.
// Tiene que ser el mismo par de claves que la del cliente.
const VAPID_PUBLIC_KEY_HINT =
  "BPtAA8KmSpnIp7V6YSPp5w9Y7JOgju8S1XOewPY73_kjlZNFIxnh44ZhioDPUitDN6QMh_JOvsH19hww1rSc6uE";

// Firebase es opcional: si no estan los secretos, la funcion sigue mandando
// por Web Push y solo se saltea el APK.
const FIREBASE_PROJECT_ID = Deno.env.get("FIREBASE_PROJECT_ID");
const FIREBASE_CLIENT_EMAIL = Deno.env.get("FIREBASE_CLIENT_EMAIL");
const FIREBASE_PRIVATE_KEY = Deno.env.get("FIREBASE_PRIVATE_KEY");

function firebaseConfigured() {
  return Boolean(FIREBASE_PROJECT_ID && FIREBASE_CLIENT_EMAIL && FIREBASE_PRIVATE_KEY);
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Convierte la clave privada de Firebase (que viene con \n literales) en algo
// que la libreria de firmas pueda usar.
function normalizePrivateKey(key) {
  return key.replace(/\\n/g, "\n");
}

// Firma un JWT con la clave de la cuenta de servicio. FCM no acepta la API key
// de la app: necesita este token, que vale una hora.
async function getFirebaseAccessToken() {
  const now = Math.floor(Date.now() / 1000);
  const header = btoa(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = btoa(
    JSON.stringify({
      iss: FIREBASE_CLIENT_EMAIL,
      scope: "https://www.googleapis.com/auth/firebase.messaging",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    })
  );

  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToArrayBuffer(normalizePrivateKey(FIREBASE_PRIVATE_KEY)),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(`${header}.${claims}`)
  );

  const toBase64Url = (bytes) =>
    btoa(String.fromCharCode(...new Uint8Array(bytes)))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");

  const assertion = `${header}.${claims}.${toBase64Url(signature)}`;

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });

  const data = await response.json();
  if (!response.ok || !data.access_token) {
    throw new Error(data?.error_description || "No se pudo autenticar con Firebase");
  }
  return data.access_token;
}

// La clave privada de Firebase viene como PEM envuelto.
function pemToArrayBuffer(pem) {
  const base64 = pem
    .replace(/-----BEGIN PRIVATE KEY-----/g, "")
    .replace(/-----END PRIVATE KEY-----/g, "")
    .replace(/\s/g, "");
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

// Manda un push por FCM a una lista de tokens de Android.
async function sendFcm(tokens, title, body, url, groupId) {
  const accessToken = await getFirebaseAccessToken();
  const endpoint = `https://fcm.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/messages:send`;
  const dead = [];
  let sent = 0;

  for (const token of tokens) {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        message: {
          token,
          notification: { title, body: body || "" },
          // Android 8+ no muestra la notificacion si no define un canal, y el
          // canal tiene que existir (lo crea el plugin al activar).
          android: {
            priority: "HIGH",
            notification: {
              channel_id: "avisos",
              click_action: "OPEN_APP",
              sound: "default",
            },
          },
          data: { url: url || "./", groupId: groupId || "" },
        },
      }),
    });

    if (response.ok) {
      sent += 1;
    } else {
      const error = await response.json().catch(() => ({}));
      const status = error?.error?.details?.[0]?.errorCode;
      // UNREGISTERED / INVALID_ARGUMENT = el telefono desinstalo la app o
      // cambio de token. Se limpia para no seguir mandando a dead ends.
      if (status === "UNREGISTERED" || status === "INVALID_ARGUMENT") {
        dead.push(token);
      }
    }
  }

  return { sent, dead };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // Esta funcion no debe quedar abierta: sin este chequeo, cualquiera que
  // conozca la URL podria mandar notificaciones a cualquier grupo. Se exige el
  // service_role, que solo lo tienen los triggers de la base y el backend.
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const authHeader = req.headers.get("Authorization") || "";
  if (serviceRole && authHeader !== `Bearer ${serviceRole}`) {
    return json({ error: "No autorizado" }, 401);
  }

  // VAPID y Firebase son independientes: se puede activar solo uno de los dos.
  // Si no hay ninguno de los dos, no hay por donde enviar nada.
  if (!VAPID_PRIVATE_KEY && !firebaseConfigured()) {
    return json({
      error: "Faltan los secretos de envio (VAPID y/o Firebase) en Supabase",
    }, 500);
  }

  if (VAPID_PRIVATE_KEY) {
    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY_HINT, VAPID_PRIVATE_KEY);
  }

  let payload;
  try {
    payload = await req.json();
  } catch {
    return json({ error: "Cuerpo JSON inválido" }, 400);
  }

  const { groupId, title, body, url, excludeUserId } = payload;
  if (!groupId || !title) {
    return json({ error: "Faltan groupId o title" }, 400);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );

  // 1) A los miembros del grupo, menos quien hizo la acción.
  const { data: members, error: membersError } = await supabase
    .from("shopping_group_members")
    .select("user_id")
    .eq("group_id", groupId);
  if (membersError) return json({ error: membersError.message }, 500);

  const targetIds = (members || [])
    .map((m) => m.user_id)
    .filter((id) => id !== excludeUserId);
  if (!targetIds.length) return json({ sent: 0, reason: "sin destinatarios" });

  // 2) Sus suscripciones activas de esos usuarios.
  let subs = [];
  if (VAPID_PRIVATE_KEY) {
    const { data, error: subsError } = await supabase
      .from("push_subscriptions")
      .select("user_id, endpoint, p256dh, auth")
      .in("user_id", targetIds);
    if (subsError) return json({ error: subsError.message }, 500);
    subs = data || [];
  }

  const message = JSON.stringify({ title, body: body || "", url: url || "./", groupId });

  let sent = 0;
  let removed = 0;
  const dead = [];

  for (const sub of subs || []) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        message
      );
      sent += 1;
    } catch (error) {
      const status = error?.statusCode;
      // 404/410 = la suscripcion ya no existe: se limpia de la base.
      if (status === 404 || status === 410) {
        dead.push(sub.user_id);
      }
    }
  }

  if (dead.length) {
    await supabase.from("push_subscriptions").delete().in("user_id", dead);
    removed = dead.length;
  }

  // 3) Telefonos con el APK: FCM en vez de Web Push.
  let sentAndroid = 0;
  let removedAndroid = 0;

  if (firebaseConfigured()) {
    const { data: tokens, error: tokensError } = await supabase
      .from("device_tokens")
      .select("token")
      .in("user_id", targetIds);

    if (tokensError) {
      return json({ error: tokensError.message }, 500);
    }

    const tokenList = (tokens || []).map((t) => t.token);
    if (tokenList.length) {
      try {
        const result = await sendFcm(tokenList, title, body, url, groupId);
        sentAndroid = result.sent;
        if (result.dead.length) {
          await supabase.from("device_tokens").delete().in("token", result.dead);
          removedAndroid = result.dead.length;
        }
      } catch (error) {
        // Que falle FCM no puede tumbar el push web, que ya se mando bien.
        console.error("Fallo el envio por FCM:", error);
      }
    }
  }

  return json({
    sent,
    removed,
    sentAndroid,
    removedAndroid,
    targeted: (subs || []).length,
    // Si no hay secretos de Firebase, el APK no recibe nada. Conviene avisarlo
    // para que se note en los logs y no pensar que el boton esta roto.
    androidConfigured: firebaseConfigured(),
  });
});

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
