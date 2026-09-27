// Reproduce el handler real de bindCommonActions para el boton de codigo.
// El bug original usaba `button.dataset` cuando la variable del forEach es
// `element`; esto verifica que el clic ahora llega a copyInviteCode.
const fs = require("fs");
const path = require("path");
const src = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");

// Extraer el cuerpo de bindCommonActions entre sus llaves.
const start = src.indexOf("function bindCommonActions()");
const braceStart = src.indexOf("{", start);
let depth = 0, i = braceStart;
for (; i < src.length; i++) {
  if (src[i] === "{") depth++;
  if (src[i] === "}") { depth--; if (depth === 0) { i++; break; } }
}
const body = src.slice(braceStart + 1, i - 1);

// fake DOM
let listeners = [];
const element = {
  dataset: { action: "copy-invite-code", code: "ABC-123" },
  addEventListener: (evt, fn) => listeners.push(fn),
};
const document = {
  querySelectorAll: (sel) => (sel === "[data-action]" ? [element] : []),
  querySelector: () => null,
};

let copied = null;
const event = { stopPropagation() {} };
const sandbox = {
  document,
  copyInviteCode: async (c) => { copied = c; },
  regenerateInviteCode: async () => {},
  openCreateGroup() {}, openProductDialog() {}, getProduct() {},
  deleteProduct() {}, cycleStatus() {}, markBought() {}, render() {},
  adjustQuantity() {}, renderShopping() {}, signOut() {}, renderSettings() {},
  openEditGroupDialog() {}, getCurrentGroup: () => null, currentUser: () => ({ id: "u1" }),
  memberRole: () => "admin", showNotification() {}, runSupabase: async () => [],
  joinDialog: null, joinMessage: null, joinForm: null, confirmDialog: null,
  currentView: "", state: { groups: [] }, supabaseClient: {}, GROUPS_TABLE: "",
  MEMBER_ROLE: "admin", MARKET_MODE: false, selectedShoppingIds: new Set(),
};

const fn = new Function(...Object.keys(sandbox), body);
fn(...Object.values(sandbox));

(async () => {
  let pass = 0, fail = 0;
  const check = (n, c) => { c ? (pass++, console.log("  OK  " + n)) : (fail++, console.log("  FALLA " + n)); };

  check("se registro 1 listener de click", listeners.length === 1);

  // esto es lo que antes tiraba ReferenceError: button no existe en el scope
  let threw = null;
  try {
    await listeners[0](event);
  } catch (e) {
    threw = e;
  }
  check("el clic no lanza ReferenceError", threw === null);
  if (threw) console.log("       -> " + threw.message);
  check("llego el data-code correcto a copyInviteCode", copied === "ABC-123");

  console.log(`\nResultado: ${pass} OK, ${fail} fallas`);
  process.exit(fail ? 1 : 0);
})();
