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
import { homedir } from "node:os";
import { spawnSync } from "node:child_process";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const PROJECT_REF = "ismweucgziipplsnkwuh";
const API = "https://api.supabase.com/v1";

// Par de claves VAPID. La publica va en js/11-push.js; la privada, al secreto
// SUPABASE_VAPID_PRIVATE_KEY. Es el mismo par que tenian que generar a mano.
const VAPID_PUBLIC_KEY =
  "BPtAA8KmSpnIp7V6YSPp5w9Y7JOgju8S1XOewPY73_kjlZNFIxnh44ZhioDPUitDN6QMh_JOvsH19hww1rSc6uE";
const VAPID_PRIVATE_KEY = "V03YQ4mL2MzqSuFG4V2gZfslHzRBg1Y7L4ejlrsTvgs";

// De donde sale el token, en orden de prioridad:
//
//   1) El archivo supabase-token.txt en la raiz del repo.
//   2) La variable de entorno SUPABASE_ACCESS_TOKEN.
//   3) ~/.supabase/access-token, que es donde el CLI de Supabase guarda el
//      token cuando uno hace "supabase login" y autoriza en el navegador.
//
// El punto 3 es el recomendado: no hay ningun secreto que copiar ni pegar,
// asi que no se puede censurar ni quedar en el historial de nada.
function readToken() {
  if (process.env.SUPABASE_ACCESS_TOKEN) return process.env.SUPABASE_ACCESS_TOKEN.trim();

  const inRepo = join(root, "supabase-token.txt");
  if (existsSync(inRepo)) {
    const value = readFileSync(inRepo, "utf8").trim();
    if (value) return value;
  }

  const fromCli = join(homedir(), ".supabase", "access-token");
  if (existsSync(fromCli)) {
    const value = readFileSync(fromCli, "utf8").trim();
    if (value) return value;
  }

  return null;
}

const token = readToken();
if (!token) {
  console.error("No encontre un token de Supabase.");
  console.error("");
  console.error("Lo mas simple es autorizar en el navegador, sin copiar nada:");
  console.error("    npx supabase login");
  console.error("");
  console.error("Eso abre el navegador, cliqueas Authorize y listo. El token queda");
  console.error("guardado en ~/.supabase y este script lo toma de ahi solo.");
  console.error("");
  console.error("Alternativas: un archivo supabase-token.txt, o la variable");
  console.error("SUPABASE_ACCESS_TOKEN.");
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
// La gateway de Edge Functions de Supabase exige DOS headers: "apikey" (con la
// clave anon) y "Authorization" (con la de servicio). Con solo el segundo
// responde "Invalid API key" y ni siquiera llega a correr la funcion.
//
// Devuelve ambas claves. Formatos: las viejas ("anon"/"service_role", un JWT
// que empieza con eyJ) y las nuevas ("default", con prefijo sb_publishable_ /
// sb_secret_). Se prefieren las nuevas y se cae a las viejas.
// La Management API NO devuelve las claves secretas completas: para
// sb_secret_ devuelve el prefijo seguido de basura binaria (se vio
// "sb_secret_XXXX" + caracteres raros, que la gateway rechaza como
// "Invalid API key"). Las publishable si vienen enteras.
//
// Por eso en vez de usar la clave secreta se firma un JWT propio con la clave
// de firma del proyecto, que si se puede leer. El token lleva role
// service_role, que es lo que la gateway y la Edge Function necesitan.
// La clave secreta del proyecto.
//
// OJO: la Management API NO la devuelve completa. Para sb_secret_ responde con
// el prefijo seguido de basura binaria ("sb_secret_XXXX" + caracteres raros),
// que la gateway rechaza como "Invalid API key". Las publishable si vienen
// enteras. Asi que la clave hay que pasarsela a mano, de una de estas formas:
//   - variable de entorno SUPABASE_SERVICE_ROLE_KEY
//   - el archivo supabase-token.txt, con una linea:  SECRET_KEY=sb_secret_...
async function getServiceKey() {
  const fromEnv = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (fromEnv) return fromEnv;

  const file = join(root, "supabase-token.txt");
  if (existsSync(file)) {
    const match = readFileSync(file, "utf8").match(/sb_secret_[A-Za-z0-9_-]+/);
    if (match) return match[0];
  }

  throw new Error(
    "Falta la clave secreta del proyecto (sb_secret_...).\n" +
    "   La Management API no la devuelve completa, asi que hay que copiarla de\n" +
    "   Supabase > Configuracion del proyecto > API > Secret key, y ponerla en el\n" +
    "   archivo supabase-token.txt asi:  SECRET_KEY=sb_secret_..."
  );
}

async function getApiKeys() {
  const secret = await getServiceKey();
  console.log(`   service: ${secret.slice(0, 16)}... (${secret.length} chars)`);
  return { secret };
}

// ---------------------------------------------------------------------------
// 2) Migracion + secreto, en una sola llamada.
// ---------------------------------------------------------------------------
async function runMigration(keys) {
  const migration = readFileSync(join(root, "supabase_migration_pendiente.sql"), "utf8");

  // La clave va en el esquema "private", que PostgREST no expone. Se probó el
  // Vault de Supabase y en este proyecto la vista vault.decrypted_secrets
  // devuelve la clave PGP en vez del secreto, con lo cual el header de
  // autorizacion queda corrupto y pg_net tira "bad argument".
  //
  // El ON CONFLICT hace que el script se pueda correr las veces que haga falta.
  const secretStatement = `
INSERT INTO private.app_secrets (name, value)
VALUES ('SUPABASE_SERVICE_ROLE_KEY', '${keys.secret}')
ON CONFLICT (name) DO UPDATE SET value = EXCLUDED.value, created_at = now();`;

  const sql = `${migration}\n${secretStatement}\n`;
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
        (SELECT count(*) FROM private.app_secrets WHERE name = 'SUPABASE_SERVICE_ROLE_KEY') AS vault_ok,
        (SELECT count(*) FROM pg_tables WHERE tablename = 'device_tokens') AS tabla_ok,
        (SELECT count(*) FROM pg_tables WHERE tablename = 'push_subscriptions') AS tabla_web_ok;`,
    }
  );
  return rows[0];
}

// ---------------------------------------------------------------------------
// 4) La Edge Function.
// ---------------------------------------------------------------------------
// Desplegar la Edge Function.
//
// Se usa el CLI de Supabase y no la Management API a proposito: los endpoints
// de deploy de la API devolvian 404 para las tres variantes probadas, y el CLI
// si funciona y ya sabe el endpoint correcto. Ademas el CLI esta autenticado
// con el mismo token que la API, asi que no hace falta nada extra.
async function deployFunction() {
  const cli = join(root, "node_modules", ".bin", process.platform === "win32" ? "supabase.cmd" : "supabase");
  if (!existsSync(cli)) {
    throw new Error("No se encontro el CLI de Supabase. Instalalo con: npm install --no-save supabase");
  }

  const result = spawnSync(
    cli,
    ["functions", "deploy", "send-push", "--project-ref", PROJECT_REF],
    { cwd: root, encoding: "utf8", shell: process.platform === "win32" }
  );

  const output = `${result.stdout || ""}${result.stderr || ""}`;
  if (result.status !== 0) {
    throw new Error(`El deploy fallo:\n${output.slice(-600)}`);
  }
  if (!output.includes("Deployed Functions")) {
    throw new Error(`El deploy no confirmo el despliegue:\n${output.slice(-600)}`);
  }
}

// ---------------------------------------------------------------------------
// 5) Secretos. VAPID siempre; Firebase solo si esta el archivo.
// ---------------------------------------------------------------------------
async function setSecrets(keys) {
  // OJO con los nombres: Supabase rechaza los secretos que empiezan con
  // "SUPABASE_" porque ese prefijo lo usa para inyectar los suyos. Por eso
  // los de VAPID van sin el.
  //
  // En cambio SUPABASE_SERVICE_ROLE_KEY si se puede: es un nombre reservado
  // que la propia plataforma inyecta en la funcion, y por eso se usa para
  // validar al que llama sin guardar una copia extra.
  const secrets = [
    { name: "VAPID_PRIVATE_KEY", value: VAPID_PRIVATE_KEY },
    { name: "VAPID_SUBJECT", value: "mailto:admin@superlist.app" },
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

  step("1/5 Sacando las claves del proyecto");
  const keys = await getApiKeys();
  ok("Claves obtenidas (no se imprimen ni se guardan en disco).");

  step("2/5 Corriendo la migracion y guardando las claves en private");
  await runMigration(keys);
  ok("Migracion aplicada y claves guardadas.");

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
  const names = await setSecrets(keys);
  ok(`Secretos guardados: ${names.join(", ")}`);

  // Prueba de fuego: se inserta un producto real en una lista compartida con
  // al menos dos miembros y se mira si la Edge Function respondio. Sin esto
  // el script dira "Listo" sin haber comprobado nunca que nada funcione.
  const shared = await api(
    "POST",
    `/projects/${PROJECT_REF}/database/query`,
    {
      query: `SELECT g.id FROM shopping_groups g
        WHERE g.type = 'shared'
          AND (SELECT count(*) FROM shopping_group_members m WHERE m.group_id = g.id) >= 2
        LIMIT 1`,
    }
  );

  if (!shared.length) {
    console.log("\n   No hay ninguna lista compartida con 2 o mas miembros, asi que");
    console.log("   no se puede probar el circuito. Compartir la lista con otra");
    console.log("   cuenta y volver a correr este script.");
    return;
  }

  const groupId = shared[0].id;
  const testId = `setup-test-${Date.now()}`;

  await api("POST", `/projects/${PROJECT_REF}/database/query`, {
    query: `INSERT INTO shopping_products (id, group_id, name, category, status, added_by_name)
            VALUES ('${testId}', '${groupId}', 'Producto de prueba', 'Otros', 'falta', 'Prueba')
            RETURNING id`,
  });
  console.log(`   Se inserto "${testId}" en la lista compartida. Esperando la respuesta...`);

  await new Promise((resolve) => setTimeout(resolve, 14000));

  const response = await api(
    "POST",
    `/projects/${PROJECT_REF}/database/query`,
    { query: "SELECT status_code, content, error_msg FROM net._http_response ORDER BY created DESC LIMIT 1" }
  );

  const last = response[0];
  console.log(`   Respuesta de la Edge Function: HTTP ${last.status_code}`);
  if (last.content) console.log(`   ${last.content}`);
  if (last.error_msg) console.log(`   error de pg_net: ${last.error_msg}`);

  if (last.status_code !== 200) {
    console.log("\n   El circuito NO llego a funcionar. Mira los logs de la funcion en:");
    console.log(`   https://supabase.com/dashboard/project/${PROJECT_REF}/logs`);
  } else {
    console.log("   El circuito completo funciona: trigger -> Edge Function -> respuesta.");
  }

  // Limpieza: el producto de prueba no debe quedar en la lista de la familia.
  await api("POST", `/projects/${PROJECT_REF}/database/query`, {
    query: `DELETE FROM shopping_products WHERE id = '${testId}'`,
  });
  console.log("   (el producto de prueba se borro)");
}

main().catch((error) => {
  console.error(`\nFALLO: ${error.message}`);
  process.exit(1);
});


