// Edge Function: envía una notificación push a las suscripciones de un grupo.
//
// CÓMO INSTALARLO:
//   1) Supabase > Edge Functions > New Function > ponele nombre "send-push"
//   2) Pegá este código (cambiale la extensión a .ts si tu editor lo pide).
//   3) Secrets > New Secret, dos veces:
//        SUPABASE_VAPID_PRIVATE_KEY  = la clave privada VAPID
//        SUPABASE_VAPID_SUBJECT      = "mailto:tu@email.com"
//   4) Deploy.
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
  "BMWbyf8ih805R5wI_NtowQSO0Xuxc8YvGWl2eI1wX4nHapw35n8RvjEVFTK_MOwiAnGnM4r6rKJdZP624qMarEU";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (!VAPID_PRIVATE_KEY) {
    return json({ error: "Falta el secreto SUPABASE_VAPID_PRIVATE_KEY" }, 500);
  }

  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY_HINT, VAPID_PRIVATE_KEY);

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
  const { data: subs, error: subsError } = await supabase
    .from("push_subscriptions")
    .select("user_id, endpoint, p256dh, auth")
    .in("user_id", targetIds);
  if (subsError) return json({ error: subsError.message }, 500);

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

  return json({ sent, removed, targeted: (subs || []).length });
});

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
