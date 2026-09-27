// Arranque de la app en jsdom, compartido por todos los tests.
// Monta el HTML real, stubea Supabase y evalua app.js devolviendo referencias
// a las funciones internas que cada test necesita.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

export const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const appSource = readFileSync(join(root, "app.js"), "utf8");
export const indexHtml = readFileSync(join(root, "index.html"), "utf8");

/**
 * @param {string[]} exports  nombres de funciones internas a exponer
 */
export function bootApp(exports) {
  document.documentElement.innerHTML = indexHtml
    .replace(/^[\s\S]*?<html[^>]*>/i, "")
    .replace(/<\/html>[\s\S]*$/i, "");

  if (!HTMLDialogElement.prototype.showModal) {
    HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  }
  if (!HTMLDialogElement.prototype.close) {
    HTMLDialogElement.prototype.close = function () { this.open = false; };
  }

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

  // eslint-disable-next-line no-new-func
  return new Function(`${appSource}\n;return { ${exports.join(", ")} };`)();
}
