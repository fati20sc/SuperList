// Test de humo: monta el HTML real en jsdom, evalua app.js y verifica que
// arranque sin romperse. Es la red de seguridad de cualquier refactor: si
// app.js deja de ejecutar, o busca un elemento que ya no existe, esto falla.
import { beforeEach, afterEach, describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const appSource = readFileSync(join(root, "app.js"), "utf8");
const indexHtml = readFileSync(join(root, "index.html"), "utf8");

// Evalua app.js y devuelve referencias a funciones internas, para poder
// probarlas de a uno.
function bootApp() {
  const exported = [
    "openEmojiPicker", "normalizeGroupEmoji", "isSingleEmoji", "escapeHtml",
    "createInviteCode", "renderLists", "renderSettings", "memberRole",
    "pendingRequestsFor", "requestToJoinGroup",
    "state: () => state", "setState: (s) => { state = s; }",
    "setSession: (s) => { session = s; }",
  ].join(", ");
  // eslint-disable-next-line no-new-func
  return new Function(`${appSource}\n;return { ${exported} };`)();
}

describe("arranque de la app", () => {
  let api;

  beforeEach(() => {
    // 1) El HTML real, para que existan #app, #product-dialog, etc.
    document.documentElement.innerHTML = indexHtml
      .replace(/^[\s\S]*?<html[^>]*>/i, "")
      .replace(/<\/html>[\s\S]*$/i, "");

    // 2) <dialog>.showModal no existe en jsdom.
    if (!HTMLDialogElement.prototype.showModal) {
      HTMLDialogElement.prototype.showModal = function () { this.open = true; };
    }
    if (!HTMLDialogElement.prototype.close) {
      HTMLDialogElement.prototype.close = function () { this.open = false; };
    }

    // 3) supabase viene de un CDN: se stubea para no tocar la red.
    window.supabase = {
      createClient: () => {
        const chain = {
          select: () => chain, insert: () => chain, update: () => chain,
          delete: () => chain, upsert: () => chain,
          eq: () => chain, in: () => chain, or: () => chain,
          order: () => chain, limit: () => chain,
          maybeSingle: async () => ({ data: null, error: null }),
          single: async () => ({ data: null, error: null }),
          then: (res) => Promise.resolve({ data: [], error: null }).then(res),
        };
        return {
          auth: {
            getSession: async () => ({ data: { session: null } }),
            onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
            getUser: async () => ({ data: { user: null }, error: null }),
            signOut: async () => ({ error: null }),
          },
          from: () => chain,
          channel: () => ({ on: () => ({ on: () => ({ on: () => ({ subscribe: () => {} }) }) }) }),
          removeChannel: () => {},
        };
      },
    };

    api = bootApp();
  });

  afterEach(() => { delete window.supabase; });

  it("app.js no tiene errores de sintaxis", () => {
    expect(() => new Function(appSource)).not.toThrow();
  });

  it("arranca sin lanzar excepciones y expone los helpers internos", () => {
    expect(api).toBeTruthy();
    expect(typeof api.escapeHtml).toBe("function");
    expect(typeof api.openEmojiPicker).toBe("function");
  });

  it("escapa HTML correctamente", () => {
    expect(api.escapeHtml('<img src=x onerror="alert(1)">'))
      .toBe("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
    expect(api.escapeHtml("Ana")).toBe("Ana");
  });

  it("el codigo de invitacion sale escapado en el modal", () => {
    // Regresion: antes el inviteCode se interpolaba crudo en innerHTML.
    expect(appSource).toContain("${escapeHtml(inviteCode)}");
    expect(appSource).not.toMatch(/0\.2s;">\$\{inviteCode\}/);
  });

  it("el selector de emoji NO acumula listeners de document", async () => {
    // Regresion de la fuga de memoria: por cada apertura tiene que haber un
    // remove, porque el listener se registra en document (dentro de un
    // setTimeout, asi que hay que dejar correr el timer).
    const input = document.createElement("input");
    const field = document.createElement("label");
    field.className = "emoji-field";
    field.appendChild(input);
    document.body.appendChild(field);

    const realAdd = document.addEventListener.bind(document);
    const realRemove = document.removeEventListener.bind(document);
    let added = 0;
    let removed = 0;
    document.addEventListener = (t, f, o) => { if (t === "click") added++; return realAdd(t, f, o); };
    document.removeEventListener = (t, f, o) => { if (t === "click") removed++; return realRemove(t, f, o); };

    try {
      for (let i = 0; i < 5; i++) {
        api.openEmojiPicker(input);
        await new Promise((r) => setTimeout(r, 1));
        document.querySelector("#emoji-picker .emoji-picker-close")
          ?.dispatchEvent(new window.Event("click", { bubbles: true }));
      }
    } finally {
      document.addEventListener = realAdd;
      document.removeEventListener = realRemove;
    }

    expect(added).toBe(5);
    expect(removed).toBe(5);
  });

  it("acepta solo un emoji por lista", () => {
    expect(api.isSingleEmoji("🏠")).toBe(true);
    expect(api.isSingleEmoji("🛒")).toBe(true);
    expect(api.isSingleEmoji("hola")).toBe(false);
    expect(api.normalizeGroupEmoji("hola")).toBe("🏠");
  });

  it("el codigo de invitacion tiene el formato ABCD-EFGH", () => {
    expect(api.createInviteCode()).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/);
  });
});
