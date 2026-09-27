// Prueba aislada de los flujos de codigo de invitacion.
// Simula lo minimo del DOM y de Supabase para verificar que el handler
// dispare las acciones correctas sin ReferenceError.
const fs = require("fs");
const path = require("path");
const src = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");

// Extraer las funciones a probar tal cual estan en app.js.
function grab(name) {
  const start = src.indexOf(`async function ${name}(`);
  if (start === -1) throw new Error(`no se encontro ${name}`);
  let depth = 0, i = src.indexOf("{", start);
  const from = i;
  for (; i < src.length; i++) {
    if (src[i] === "{") depth++;
    if (src[i] === "}") { depth--; if (depth === 0) { i++; break; } }
  }
  return src.slice(start, i);
}

const notifications = [];
let copiedText = null;
let supabaseUpdate = null;

const sandbox = {
  navigator: {
    clipboard: {
      writeText: async (t) => { copiedText = t; },
    },
  },
  document: {
    createElement: () => ({
      style: {},
      setAttribute() {},
      select() {},
      setSelectionRange() {},
      remove() {},
    }),
    body: { appendChild() {} },
    execCommand: () => true,
  },
  console,
  showNotification: (msg, type) => notifications.push({ msg, type }),
  runSupabase: async (op) => { supabaseUpdate = op; return []; },
  createInviteCode: () => "AAAA-BBBB",
  getCurrentGroup: () => sandbox.group,
  memberRole: () => sandbox.role,
  currentUser: () => ({ id: "u1", name: "Ana", email: "a@b.c" }),
  persist() {},
  renderSettings() { sandbox.rendered = true; },
  GROUPS_TABLE: "shopping_groups",
  supabaseClient: { from: (t) => ({ update: (v) => { sandbox.updatePayload = v; return { eq: () => "PROMISE" }; } }) },
  group: null,
  role: "admin",
};

const code = [
  grab("copyInviteCode"),
  grab("writeToClipboard"),
  grab("regenerateInviteCode"),
].join("\n\n");

const fn = new Function(...Object.keys(sandbox), `${code}; return { copyInviteCode, regenerateInviteCode, writeToClipboard };`);
const api = fn(...Object.values(sandbox));

(async () => {
  let pass = 0, fail = 0;
  const check = (name, cond) => { cond ? (pass++, console.log("  OK  " + name)) : (fail++, console.log("  FALLA " + name)); };

  console.log("1) copyInviteCode con Clipboard API");
  notifications.length = 0;
  await api.copyInviteCode("CODE-123");
  check("copio el codigo", copiedText === "CODE-123");
  check("aviso de exito", notifications[0]?.type === "success");

  console.log("2) copyInviteCode sin Clipboard API (http local)");
  copiedText = null; notifications.length = 0;
  sandbox.navigator.clipboard = undefined;
  const api2 = fn(...Object.values(sandbox));
  await api2.copyInviteCode("CODE-999");
  check("cae al fallback y reporta exito", notifications[0]?.type === "success");
  sandbox.navigator.clipboard = { writeText: async (t) => { copiedText = t; } };

  console.log("3) copyInviteCode con codigo vacio");
  notifications.length = 0;
  await api.copyInviteCode("");
  check("no hace nada sin codigo", notifications.length === 0);

  console.log("4) regenerateInviteCode como admin");
  notifications.length = 0;
  sandbox.group = { id: "g1", type: "shared", inviteCode: "VIEJO-1" };
  sandbox.role = "admin";
  sandbox.updatePayload = null;
  await api.regenerateInviteCode();
  check("escribio invite_code nuevo", sandbox.updatePayload?.invite_code === "AAAA-BBBB");
  check("actualizo el estado local", sandbox.group.inviteCode === "AAAA-BBBB");
  check("re-renderizo la vista", sandbox.rendered === true);
  check("aviso de exito", notifications[0]?.type === "success");

  console.log("5) regenerateInviteCode como member (debe rechazar)");
  notifications.length = 0;
  sandbox.group = { id: "g1", type: "shared", inviteCode: "VIEJO-2" };
  sandbox.role = "member";
  sandbox.updatePayload = null;
  await api.regenerateInviteCode();
  check("no escribio en Supabase", sandbox.updatePayload === null);
  check("no toco el codigo", sandbox.group.inviteCode === "VIEJO-2");
  check("aviso de error", notifications[0]?.type === "error");

  console.log("6) regenerateInviteCode con lista individual");
  notifications.length = 0;
  sandbox.group = { id: "g1", type: "individual", inviteCode: null };
  sandbox.updatePayload = null;
  await api.regenerateInviteCode();
  check("no hace nada", sandbox.updatePayload === null && notifications.length === 0);

  console.log(`\nResultado: ${pass} OK, ${fail} fallas`);
  process.exit(fail ? 1 : 0);
})();
