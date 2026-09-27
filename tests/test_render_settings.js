// Verifica que los botones de codigo esten en "Mis listas" (renderLists) y no
// en "Mi cuenta" (renderSettings), y que el admin vea ambos.
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
  let endIdx = startIdx;
  for (let i = startIdx; i < lines.length; i++) {
    if (/^\}/.test(lines[i])) { endIdx = i; break; }
  }
  return lines.slice(startIdx, endIdx + 1).join("\n");
}

function run(name, groups, selected) {
  let rendered = "";
  const app = { set innerHTML(v) { rendered = v; } };
  const sandbox = {
    app,
    document: { querySelector: () => null, querySelectorAll: () => [] },
    getCurrentGroup: () => (selected ? groups[0] : null),
    currentUser: () => ({ id: "u1", name: "Ana", email: "a@b.c", birthdate: null }),
    memberRole: (g) => g?.members.find((m) => m.userId === "u1")?.role || "member",
    userGroups: () => groups.filter((g) => g.members.some((m) => m.userId === "u1")),
    recentGroups: () => groups,
    escapeHtml: (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])),
    getUserDisplayName: (u) => u?.name || "Usuario",
    memberRow: (m) => `<div>${m.name}</div>`,
    empty: (m) => `<p>${m}</p>`,
    formatDate: (d) => d,
    bindCommonActions: () => {},
    bindEmojiOnlyInput: () => {},
    session: { groupId: selected ? groups[0].id : null },
    state: { groups },
  };
  const code = grabFn(name);
  const fn = new Function(...Object.keys(sandbox), `${code}; return ${name};`);
  fn(...Object.values(sandbox))();
  return rendered;
}

const sharedAdmin = {
  id: "g1", name: "Casa", emoji: "🏠", type: "shared", inviteCode: "ABCD-1234",
  members: [{ userId: "u1", role: "admin", name: "Ana", email: "a@b.c" }],
  products: [], categories: [], createdAt: new Date().toISOString(), lastOpenedAt: new Date().toISOString(),
};
const sharedMember = { ...sharedAdmin, id: "g2", name: "Oficina", inviteCode: "WXYZ-9876", members: [{ userId: "u1", role: "member" }] };
const individual = { ...sharedAdmin, id: "g3", name: "Mia", type: "individual", inviteCode: null };

let pass = 0, fail = 0;
const check = (n, c) => { c ? (pass++, console.log("  OK  " + n)) : (fail++, console.log("  FALLA " + n)); };

console.log("MIS LISTAS: lista compartida admin");
const lists = run("renderLists", [sharedAdmin], false);
check("muestra el boton Copiar", lists.includes('data-action="copy-invite-code"'));
check("muestra el boton Cambiar (admin)", lists.includes('data-action="regenerate-invite-code"'));
check("lleva el data-id de la lista", lists.includes('data-id="g1"'));
check("lleva el data-code", lists.includes('data-code="ABCD-1234"'));
check("usa la clase code-button", lists.includes("code-button-copy") && lists.includes("code-button-change"));
check("el contenedor los centra", lists.includes('class="list-code-actions"'));

console.log("\nMIS LISTAS: miembro NO admin");
const asMember = run("renderLists", [sharedMember], false);
check("ve Copiar", asMember.includes('data-action="copy-invite-code"'));
check("NO ve Cambiar", !asMember.includes('data-action="regenerate-invite-code"'));

console.log("\nMIS LISTAS: lista individual");
const ind = run("renderLists", [individual], false);
check("NO muestra botones de codigo", !ind.includes("copy-invite-code") && !ind.includes("regenerate-invite-code"));

console.log("\nMIS LISTAS: varias listas a la vez");
const many = run("renderLists", [sharedAdmin, sharedMember], false);
check("boton por lista (2 copiar)", (many.match(/data-action="copy-invite-code"/g) || []).length === 2);
check("1 solo Cambiar (solo admin)", (many.match(/data-action="regenerate-invite-code"/g) || []).length === 1);

console.log("\nMI CUENTA: ya NO debe tener los botones");
const acc = run("renderSettings", [sharedAdmin], true);
check("NO tiene boton Copiar", !acc.includes('data-action="copy-invite-code"'));
check("NO tiene boton Cambiar", !acc.includes('data-action="regenerate-invite-code"'));
check("manda a Mis listas", acc.includes("Mis listas"));
check("sigue mostrando miembros", acc.includes("Miembros"));

console.log(`\nResultado: ${pass} OK, ${fail} fallas`);
process.exit(fail ? 1 : 0);

