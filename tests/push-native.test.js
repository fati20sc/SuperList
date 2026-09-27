// =======================================================================
// tests/push-native.test.js
//
// Tests de las notificaciones nativas de Android (js/12-push-native.js).
//
// Lo que se prueba aca es la parte que mas se rompe en silencio: el codigo
// tiene que distinguir correctamente entre "estoy en el navegador" y "estoy en
// el APK", y no tocar la base ni pedir permisos cuando no esta.
//
// Ojo con el stub de window.Capacitor: la constante PushNotifications se lee
// AL CARGAR el modulo, asi que hay que cambiar el stub antes de evaluar app.js
// en cada test. Por eso se arma el scope de a uno.
// =======================================================================
import { beforeEach, afterEach, describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const appSource = readFileSync(join(root, "app.js"), "utf8");
const indexHtml = readFileSync(join(root, "index.html"), "utf8");

// Tabla fake que registra lo que la app intenta guardar.
let upserts;
let deletes;

// Usuario con el que "esta conectada" la sesion del stub de Supabase.
let sessionUser;

function createSupabaseStub() {
  return {
    createClient: () => {
      const chain = {
        select: () => chain, insert: () => chain, update: () => chain,
        delete: () => chain, upsert: () => chain, eq: () => chain,
        in: () => chain, or: () => chain, order: () => chain, limit: () => chain,
        maybeSingle: async () => ({ data: null, error: null }),
        single: async () => ({ data: null, error: null }),
        then: (res) => Promise.resolve({ data: [], error: null }).then(res),
      };
      return {
        auth: {
          // El boot de app.js llama a getSession() de forma asincrona y pisa
          // la cache de usuario. Si el stub no devuelve el usuario, la cache
          // queda en null y los asserts fallan por una carrera.
          getSession: async () => ({
            data: { session: sessionUser ? { user: sessionUser } : null },
          }),
          onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
          getUser: async () => ({ data: { user: sessionUser }, error: null }),
          signOut: async () => ({ error: null }),
        },
        from: () => ({
          select: () => ({
            eq: () => ({ limit: async () => ({ data: [], error: null }) }),
          }),
          upsert: (row, opts) => {
            upserts.push({ row, opts });
            return Promise.resolve({ error: null });
          },
          delete: () => {
            deletes.push(true);
            return { eq: () => Promise.resolve({ error: null }) };
          },
        }),
        // El boot se suscribe a Realtime con varios .on() encadenados, asi que
        // el stub tiene que poder encadenar cuantos hagan falta.
        channel: () => {
          const filter = { on: () => filter, subscribe: () => {} };
          return { on: () => filter, removeChannel: () => {} };
        },
      };
    },
  };
}

// Crea un stub del plugin de push que registra lo que se le pide.
function createPushStub(overrides = {}) {
  const calls = { register: 0, requestPermissions: 0, listeners: [] };
  return {
    calls,
    plugin: {
      register: async () => { calls.register += 1; },
      checkPermissions: async () => ({ display: "prompt" }),
      requestPermissions: async () => { calls.requestPermissions += 1; return { display: "granted" }; },
      addListener: (event, cb) => { calls.listeners.push([event, cb]); return Promise.resolve({}); },
      removeListener: async () => {},
      ...overrides,
    },
  };
}

// registerNativePush hace varios await antes de enganchar el listener de
// "registration" (permiso, canal, registro en Firebase), asi que no esta listo
// en el mismo tick. Esto espera a que aparezca.
async function waitForRegistration(calls) {
  for (let i = 0; i < 50; i += 1) {
    const found = calls.listeners.find(([event]) => event === "registration");
    if (found) return found;
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
  return null;
}

// "Inicia sesion" para los tests: deja al usuario conectado en el stub de
// Supabase y en la cache de app.js. Son dos lugares distintos y estan en scopes
// distintos (el stub vive en este archivo, la cache vive dentro de app.js), asi
// que hay que setear los dos.
function loginAs(api, id) {
  sessionUser = { id };
  api.setUser({ id });
}


// Monta el HTML real: el boot de app.js busca #app y otros elementos, asi que
// sin el DOM app.js revienta antes de llegar a las funciones de push.
function mountDom() {
  document.documentElement.innerHTML = indexHtml
    .replace(/^[\s\S]*?<html[^>]*>/i, "")
    .replace(/<\/html>[\s\S]*$/i, "");

  if (!HTMLDialogElement.prototype.showModal) {
    HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  }
  if (!HTMLDialogElement.prototype.close) {
    HTMLDialogElement.prototype.close = function () { this.open = false; };
  }
}

describe("notificaciones nativas de Android", () => {
  beforeEach(() => {
    upserts = [];
    deletes = [];
    sessionUser = null;
    mountDom();
    window.supabase = createSupabaseStub();
    delete window.Capacitor;
  });

  afterEach(() => {
    delete window.supabase;
    delete window.Capacitor;
  });

  it("en el navegador NO es una app nativa", () => {
    const api = bootApp(null);
    expect(api.isNativeApp()).toBe(false);
  });

  it("dentro del APK se reconoce como nativo", () => {
    const { plugin } = createPushStub();
    asNativeApp(plugin);
    const api = bootApp(plugin);
    expect(api.isNativeApp()).toBe(true);
    expect(api.nativePushAvailable()).toBe(true);
  });

  it("en el navegador no intenta guardar un token de FCM", async () => {
    // El camino web no debe escribir en la tabla de FCM.
    const api = bootApp(null);
    const result = await api.enablePushNotifications();

    // En jsdom no hay PushManager, asi que falla por falta de soporte, pero lo
    // importante es que NO se haya guardado ningun token nativo.
    expect(result.ok).toBe(false);
    expect(upserts).toHaveLength(0);
  });

  it("en el APK pide permiso, registra con Firebase y guarda el token", async () => {
    const { plugin, calls } = createPushStub();
    asNativeApp(plugin);

    const api = bootApp(plugin);
    loginAs(api, "user-1");

    const promise = api.enablePushNotifications();
    // El plugin emite "registration" cuando Firebase devuelve el token.
    const registration = await waitForRegistration(calls);
    expect(registration).toBeTruthy();
    registration[1]({ value: "fcm-token-123" });

    const result = await promise;

    expect(result.ok).toBe(true);
    expect(calls.register).toBe(1);
    expect(calls.requestPermissions).toBe(1);
    expect(upserts).toHaveLength(1);
    expect(upserts[0].row.token).toBe("fcm-token-123");
    expect(upserts[0].row.user_id).toBe("user-1");
    // La clave es (user_id, token) para admitir varios telefonos por persona.
    expect(upserts[0].opts.onConflict).toBe("user_id,token");
  });

  it("no guarda el token si el usuario no esta autenticado", async () => {
    const { plugin, calls } = createPushStub();
    asNativeApp(plugin);

    const api = bootApp(plugin);
    api.setUser(null);

    const promise = api.enablePushNotifications();
    const registration = await waitForRegistration(calls);
    registration[1]({ value: "fcm-token-123" });

    const result = await promise;
    expect(result.ok).toBe(false);
    expect(upserts).toHaveLength(0);
  });

  it("avisa con un motivo claro si el usuario no da permiso", async () => {
    const { plugin } = createPushStub({
      requestPermissions: async () => ({ display: "denied" }),
    });
    asNativeApp(plugin);

    const api = bootApp(plugin);
    const result = await api.enablePushNotifications();

    expect(result.ok).toBe(false);
    expect(result.motivo).toMatch(/permiso/i);
    expect(upserts).toHaveLength(0);
  });

  it("sin Firebase en el APK lo dice en vez de fingir que funciona", async () => {
    // APK compilado sin el plugin: no hay PushNotifications en el bridge.
    asNativeApp(undefined);
    const api = bootApp(undefined);

    const result = await api.enablePushNotifications();
    expect(result.ok).toBe(false);
    expect(result.motivo).toMatch(/app instalada/i);

    const status = await api.getPushStatus();
    expect(status.state).toBe("unsupported");
    expect(status.reason).toMatch(/Firebase/i);
  });

  it("desactivar en el APK borra los tokens guardados", async () => {
    const { plugin } = createPushStub();
    asNativeApp(plugin);

    const api = bootApp(plugin);
    loginAs(api, "user-1");

    await api.disablePushNotifications();
    expect(deletes).toContain(true);
  });

  it("los listeners nativos se registran una sola vez", () => {
    const { plugin, calls } = createPushStub();
    asNativeApp(plugin);

    const api = bootApp(plugin);
    api.listenToNativeNotifications();
    const afterFirst = calls.listeners.length;
    api.listenToNativeNotifications();

    expect(afterFirst).toBeGreaterThan(0);
    expect(calls.listeners.length).toBe(afterFirst);
  });
});
function bootApp(pushPlugin) {
  const exported = [
    "isNativeApp", "nativePushAvailable", "enablePushNotifications",
    "getPushStatus", "disablePushNotifications", "listenToNativeNotifications",
    "setUser: (u) => { cachedSupabaseUser = u; }",
  ].join(", ");
  // eslint-disable-next-line no-new-func
  return new Function(`${appSource}\n;return { ${exported} };`)();
}

// Monta el puente de Capacitor como si fuera el APK nativo.
function asNativeApp(pushPlugin) {
  window.Capacitor = { isNativePlatform: () => true, Plugins: { PushNotifications: pushPlugin } };
}
