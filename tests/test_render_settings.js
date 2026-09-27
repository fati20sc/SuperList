// Reproduce el render real de renderSettings() para ver si el bloque de codigo
// de invitacion aparece. El bug reportado es que el boton no esta.
const fs = require("fs");
const path = require("path");
const src = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");

// Extraer funciones de nivel superior. En app.js todas las declaraciones
// globales empiezan en la columna 0, asi que se recortan por bloques de lineas
// en vez de contar llaves (los template literals anidados rompen ese conteo).
function grabFn(name) {
  const lines = src.split(/\r?\n/);
  const startRe = new RegExp(`^(?:async\\s+)?function\\s+${name}\\s*\\(`);
  const startIdx = lines.findIndex((l) => startRe.test(l));
  if (startIdx === -1) throw new Error(`no se encontro ${name}`);
  // Termina en la primera linea con menos de 2 espacios de indentacion que
  // cierre el bloque (llave de cierre de la funcion).
  let endIdx = startIdx;
  for (let i = startIdx; i < lines.length; i++) {
    if (/^\}/.test(lines[i])) { endIdx = i; break; }
  }
  return lines.slice(startIdx, endIdx + 1).join("\n");
}

let rendered = "";
const app = { set innerHTML(v) { rendered = v; }, get innerHTML() { return rendered; } };

function build(scenario) {
  const groups = scenario.groups || [{
    id: "g1", name: "Casa", emoji: "🏠", type: "shared", inviteCode: "ABCD-1234",
    members: [{ userId: "u1", role: "admin", name: "Ana", email: "a@b.c" }],
    products: [], categories: [],
  }];

  const sandbox = {
    app,
    document: { querySelector: () => null, querySelectorAll: () => [] },
    getCurrentGroup: () => (scenario.selected ? groups[0] : null),
    currentUser: () => ({ id: "u1", name: "Ana", email: "a@b.c", birthdate: null }),
    memberRole: (g) => g?.members.find((m) => m.userId === "u1")?.role || "member",
    userGroups: () => groups.filter((g) => g.members.some((m) => m.userId === "u1")),
    escapeHtml: (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])),
    getUserDisplayName: (u) => u?.name || "Usuario",
    memberRow: (m) => `<div>${m.name}</div>`,
    formatDate: (d) => d,
    bindCommonActions: () => {},
    state: { groups },
  };

  const code = grabFn("inviteCodeBox") + "\n" + grabFn("renderSettings");
  const fn = new Function(...Object.keys(sandbox), `${code}; return renderSettings;`);
  fn(...Object.values(sandbox))();
  return rendered;
}

let pass = 0, fail = 0;
const check = (n, c) => { c ? (pass++, console.log("  OK  " + n)) : (fail++, console.log("  FALLA " + n)); };

console.log("Escenario A: hay lista seleccionada (session.groupId seteado)");
const a = build({ selected: true });
check("muestra el codigo de invitacion", a.includes("ABCD-1234"));
check("muestra boton Copiar", a.includes('data-action="copy-invite-code"'));
check("muestra boton Cambiar (admin)", a.includes('data-action="regenerate-invite-code"'));

console.log("\nEscenario B: NO hay lista seleccionada (session.groupId = null)");
const b = build({ selected: false });
check("MUESTRA el codigo igual (fix del bug)", b.includes("ABCD-1234"));
check("MUESTRA el boton Copiar (fix del bug)", b.includes('data-action="copy-invite-code"'));
check("MUESTRA el boton Cambiar para admin", b.includes('data-action="regenerate-invite-code"'));
check("avisa que elija una lista", b.includes("Elegí una lista"));

console.log("\nEscenario C: varias listas compartidas, sin seleccionar");
const multi = build({
  selected: false,
  groups: [
    { id: "g1", name: "Casa", emoji: "🏠", type: "shared", inviteCode: "AAAA-1111",
      members: [{ userId: "u1", role: "admin" }], products: [] },
    { id: "g2", name: "Oficina", emoji: "💼", type: "shared", inviteCode: "BBBB-2222",
      members: [{ userId: "u1", role: "member" }], products: [] },
    { id: "g3", name: "Individual", emoji: "🛒", type: "individual", inviteCode: null,
      members: [{ userId: "u1", role: "admin" }], products: [] },
  ],
});
check("muestra las 2 compartidas", multi.includes("AAAA-1111") && multi.includes("BBBB-2222"));
check("NO muestra la individual", !multi.includes("g3") || !multi.includes("codigo-inividual"));
check("muestra el nombre de cada lista", multi.includes("Casa") && multi.includes("Oficina"));
check("admin ve Cambiar en la suya", (multi.match(/regenerate-invite-code/g) || []).length === 1);
check("member NO ve Cambiar en la ajena", !multi.includes('data-id="g2" data-action="regenerate') && !/data-id="g2"[\s\S]{0,120}regenerate/.test(multi));

console.log("\nEscenario D: usuario sin listas");
const none = build({ selected: false, groups: [] });
check("muestra aviso de sin listas", none.includes("No tenés una lista creada"));
check("no rompe con lista vacia", !none.includes("undefined"));

console.log(`\nResultado: ${pass} OK, ${fail} fallas`);
if (fail) {
  console.log("\n>>> DIAGNOSTICO: el bloque depende de getCurrentGroup().");
  console.log(">>> Si session.groupId es null (pasa tras ir a Inicio), no se renderiza.");
}
process.exit(fail ? 1 : 0);
