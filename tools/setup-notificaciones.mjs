// =======================================================================
// tools/setup-notificaciones.mjs
//
// Deja las notificaciones push andando de punta a punta, con un solo comando.
//
// HACE TODO LO QUE HABIA QUE HACER A MANO:
//   1) Corre la migracion (tabla device_tokens, trigger, extensiones).
//   2) Saca la clave service_role del proyecto y la guarda en el vault, que
//      es lo que necesita el trigger para llamar a la Edge Function.
//   3) Sube la Edge Function send-push.
//   4) Guarda los secretos VAPID y (si esta) los de Firebase.
//
// USO:
//   $env:SUPABASE_ACCESS_TOKEN = "sbp_..."   (tu token personal de Supabase)
//   node tools/setup-notificaciones.mjs
//
// PARA QUE SIRVE EL TOKEN: la Management API de Supabase pide un Personal
// Access Token porque estas operaciones cambian la configuracion del proyecto.
// No se puede con la clave anon: esa respeta RLS y no puede crear tablas.
// El token NO se guarda en ningun lado, solo se usa en memoria.
//
// La clave service_role nunca se imprime ni se escribe en un archivo: va
// directo del servidor de Supabase al vault, sin pasar por disco.
// =======================================================================

import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const PROJECT_REF = "ismweucgziipplsnkwuh";
const API = "https://api.supabase.com/v1";

// Par de claves VAPID. La publica va en js/11-push.js; la privada, al secreto
// SUPABASE_VAPID_PRIVATE_KEY. Es el mismo par que tenian que generar a mano.
const VAPID_PUBLIC_KEY =
  "BPtAA8KmSpnIp7V6YSPp5w9Y7JOgju8S1XOewPY73_kjlZNFIxnh44ZhioDPUitDN6QMh_JOvsH19hww1rSc6uE";
const VAPID_PRIVATE_KEY = "V03YQ4mL2MzqSuFG4V2gZfslHzRBg1Y7L4ejlrsTvgs";

const token = process.env.SUPABASE_ACCESS_TOKEN;
if (!token) {
  console.error("Falta SUPABASE_ACCESS_TOKEN.");
  console.error("Crealo en Supabase > Account Preferences > Personal Access Tokens.");
  process.exit(1);
}

const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

async function api(method, endpoint, body) {
  const response = await fetch(`${API}${endpoint}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${response.status} en ${endpoint}: ${text.slice(0, 300)}`);
  }
  return text ? JSON.parse(text) : null;
}

function step(message) {
  console.log(`\n>> ${message}`);
}

function ok(message) {
  console.log(`   OK: ${message}`);
}

// ---------------------------------------------------------------------------
// 1) La clave service_role, directo del servidor de Supabase.
//    Se pide acá para poder guardarla en el vault en el mismo paso que crea
//    el trigger, y para no tener que pegarla a mano en ningun lado.
// ---------------------------------------------------------------------------
async function getServiceRoleKey() {
  const keys = await api("GET", `/projects/${PROJECT_REF}/api-keys`);
  const service = keys.find((k) => k.name === "service_role");
  if (!service?.api_key) throw new Error("No se encontro la clave service_role del proyecto.");
  return service.api_key;
}

// ---------------------------------------------------------------------------
// 2) Migracion + vault, en una sola llamada.
// ---------------------------------------------------------------------------
async function runMigration(serviceRoleKey) {
  const migration = readFileSync(join(root, "supabase_migration_pendiente.sql"), "utf8");

  // El archivo trae la linea del vault comentada, porque la clave no puede
  // quedar escrita en un archivo. Acá se corre de verdad, con la clave real.
  const vaultStatement = `SELECT vault.create_secret(
  '${serviceRoleKey}',
  'SUPABASE_SERVICE_ROLE_KEY',
  'SuperList: clave de servicio para mandar notificaciones'
);`;

  const sql = `${migration}\n\n${vaultStatement}\n`;
  const result = await api("POST", `/projects/${PROJECT_REF}/database/query`, { query: sql });
  return Array.isArray(result) ? result.length : 0;
}

// ---------------------------------------------------------------------------
// 3) Verificacion: que exista todo lo que hace falta.
// ---------------------------------------------------------------------------
async function verify() {
  const rows = await api(
    "POST",
    `/projects/${PROJECT_REF}/database/query`,
    {
      query: `SELECT
        (SELECT count(*) FROM pg_trigger WHERE tgname = 'trg_list_activity_push') AS trigger_ok,
        (SELECT count(*) FROM vault.decrypted_secrets WHERE name = 'SUPABASE_SERVICE_ROLE_KEY') AS vault_ok,
        (SELECT count(*) FROM pg_tables WHERE tablename = 'device_tokens') AS tabla_ok,
        (SELECT count(*) FROM pg_tables WHERE tablename = 'push_subscriptions') AS tabla_web_ok;`,
    }
  );
  return rows[0];
}

// ---------------------------------------------------------------------------
// 4) La Edge Function.
// ---------------------------------------------------------------------------
async function deployFunction() {
  const source = readFileSync(join(root, "supabase/functions/send-push/index.ts"), "utf8");

  // La API de despliegue espera multipart/form-data.
  const form = new FormData();
  form.append("metadata", JSON.stringify({ import_map_path: null, entrypoint_path: null }));
  form.append("body", new Blob([source]), "index.ts");

  const response = await fetch(`${API}/projects/${PROJECT_REF}/functions/send-push/body`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`${response.status} al desplegar: ${text.slice(0, 300)}`);
  return text;
}

// ---------------------------------------------------------------------------
// 5) Secretos. VAPID siempre; Firebase solo si esta el archivo.
// ---------------------------------------------------------------------------
async function setSecrets() {
  const secrets = [
    { name: "SUPABASE_VAPID_PRIVATE_KEY", value: VAPID_PRIVATE_KEY },
    { name: "SUPABASE_VAPID_SUBJECT", value: "mailto:admin@superlist.app" },
  ];

  // Firebase es opcional: sin esto el navegador anda y el APK no.
  const firebaseFile = join(root, "firebase-service-account.json");
  if (existsSync(firebaseFile)) {
    const account = JSON.parse(readFileSync(firebaseFile, "utf8"));
    secrets.push(
      { name: "FIREBASE_PROJECT_ID", value: account.project_id },
      { name: "FIREBASE_CLIENT_EMAIL", value: account.client_email },
      { name: "FIREBASE_PRIVATE_KEY", value: account.private_key }
    );
    ok("Firebase encontrado: tambien se configura el canal del APK.");
  } else {
    console.log("   (sin firebase-service-account.json: el canal del APK queda sin configurar)");
  }

  for (const secret of secrets) {
    await api("POST", `/projects/${PROJECT_REF}/secrets`, [secret]);
  }
  return secrets.map((s) => s.name);
}

// ---------------------------------------------------------------------------

async function main() {
  console.log(`Configurando las notificaciones de SuperList (${PROJECT_REF})...`);

  step("1/5 Sacando la clave service_role del proyecto");
  const serviceRoleKey = await getServiceRoleKey();
  ok("Clave service_role obtenida (no se imprime ni se guarda en disco).");

  step("2/5 Corriendo la migracion y guardando la clave en el vault");
  await runMigration(serviceRoleKey);
  ok("Migracion aplicada y clave guardada en el vault.");

  step("3/5 Verificando");
  const state = await verify();
  console.log(`   trigger: ${state.trigger_ok} | vault: ${state.vault_ok} | ` +
              `device_tokens: ${state.tabla_ok} | push_subscriptions: ${state.tabla_web_ok}`);
  if (!state.trigger_ok || !state.vault_ok || !state.tabla_ok) {
    throw new Error("Algo no quedo creado. Revisa el log de arriba.");
  }

  step("4/5 Desplegando la Edge Function send-push");
  await deployFunction();
  ok("Edge Function desplegada.");

  step("5/5 Guardando los secretos");
  const names = await setSecrets();
  ok(`Secretos guardados: ${names.join(", ")}`);

  console.log(`\nListo. La clave publica VAPID del cliente es:\n  ${VAPID_PUBLIC_KEY}`);
  console.log("Y ya esta escrita en js/11-push.js.");
}

main().catch((error) => {
  console.error(`\nFALLO: ${error.message}`);
  process.exit(1);
});

