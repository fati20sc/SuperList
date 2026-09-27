// Cubre: Mi cuenta sin panel de lista, Miembros en Mis listas, solicitudes
// pendientes solo para admin, y los estados de requestToJoinGroup.
const fs = require("fs");
const path = require("path");
const src = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");

function grabFn(name) {
  const lines = src.split(/\r?\n/);
  const re = new RegExp(`^(?:async\\s+)?function\\s+${name}\\s*\\(`);
  const start = lines.findIndex((l) => re.test(l));
  if (start === -1) throw new Error(`no se encontro ${name}`);
  let end = start;
  for (let i = start; i < lines.length; i++) {
    if (/^\}/.test(lines[i])) { end = i; break; }
  }
  return lines.slice(start, end + 1).join("\n");
}

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
let pass = 0, fail = 0;
const check = (n, c) => { c ? (pass++, console.log("  OK  " + n)) : (fail++, console.log("  FALLA " + n)); };

(async function run() {

console.log("1) MI CUENTA: solo perfil");
{
  let html = "";
  const sandbox = {
    app: { set innerHTML(v) { html = v; } },
    currentUser: () => ({ id: "u1", name: "Ana", email: "a@b.c", birthdate: null }),
    escapeHtml: esc, getUserDisplayName: (u) => u?.name || "Usuario",
    formatDate: (d) => d, bindCommonActions: () => {},
  };
  const fn = new Function(...Object.keys(sandbox), `${grabFn("renderSettings")}; return renderSettings;`);
  fn(...Object.values(sandbox))();
  check("NO tiene 'Lista actual'", !html.includes("Lista actual"));
  check("NO tiene 'Grupo actual'", !html.includes("Grupo actual"));
  check("NO tiene bloque de miembros", !html.includes("<h3>Miembros</h3>"));
  check("NO tiene el codigo de invitacion", !html.includes("invite-code-value"));
  // Se comparan data-action (ASCII) para no depender de la codificacion de
  // este archivo con los acentos del HTML original.
  check("SI tiene los botones de perfil",
    html.includes('data-action="edit-profile"') &&
    html.includes('data-action="change-password"') &&
    html.includes('data-action="logout"'));
}

console.log("\n2) MIS LISTAS: boton Miembros");
{
  let html = "";
  const groups = [{ id: "g1", name: "Casa", emoji: "ðŸ ", type: "shared", inviteCode: "AA-BB",
    members: [{ userId: "u1", role: "admin" }], products: [], createdAt: new Date().toISOString() }];
  const sandbox = {
    app: { set innerHTML(v) { html = v; } },
    currentUser: () => ({ id: "u1" }), userGroups: () => groups, recentGroups: () => groups,
    state: { groups, joinRequests: [] }, session: { groupId: null },
    document: { querySelector: () => null, querySelectorAll: () => [] },
    memberRole: (g) => g?.members.find((m) => m.userId === "u1")?.role || "member",
    pendingRequestsFor: () => [], escapeHtml: esc, empty: (m) => `<p>${m}</p>`,
    getUserDisplayName: (u) => u?.name || "Usuario", bindEmojiOnlyInput: () => {},
    bindCommonActions: () => {},
  };
  const fn = new Function(...Object.keys(sandbox), `${grabFn("renderLists")}; return renderLists;`);
  fn(...Object.values(sandbox))();
  check("tiene data-action=open-members", html.includes('data-action="open-members"'));
  check("lleva el data-id de la lista", html.includes('data-id="g1"'));
  check("los 4 botones usan list-action", (html.match(/class="list-action /g) || []).length === 4);
  check("Abrir con list-action-open", html.includes("list-action list-action-open"));
  check("Editar con list-action-edit", html.includes("list-action list-action-edit"));
  check("Miembros con list-action-members", html.includes("list-action list-action-members"));
  check("Borrar con list-action-delete", html.includes("list-action list-action-delete"));
  // secondary-button sigue apareciendo en el boton "Unirse con codigo", que esta
  // fuera de la tarjeta; lo que no debe quedar es ninguno en los 4 botones.
  check("ningun boton de la tarjeta usa secondary-button (era gris)",
    !/class="[^"]*product-actions[^"]*"[\s\S]{0,600}secondary-button/.test(html));
}

console.log("\n3) Solicitudes pendientes: solo admin");
{
  const groups = [{ id: "g1", members: [{ userId: "u1", role: "admin" }] }];
  const reqs = [{ id: "r1", groupId: "g1", userId: "u2", status: "pending" },
                { id: "r2", groupId: "g1", userId: "u3", status: "accepted" }];
  const st = { joinRequests: reqs };
  const asAdmin = () => "admin", asMember = () => "member";
  const admin = new Function("state", "memberRole", "group", `${grabFn("pendingRequestsFor")}; return pendingRequestsFor(group);`);
  const member = new Function("state", "memberRole", "group", `${grabFn("pendingRequestsFor")}; return pendingRequestsFor(group);`);
  check("admin ve solo las pendientes", admin(st, asAdmin, groups[0]).length === 1);
  check("admin ve la pendiente correcta", admin(st, asAdmin, groups[0])[0]?.id === "r1");
  check("member NO ve solicitudes", member(st, asMember, groups[0]).length === 0);
  check("sin grupo no hay solicitudes", member(st, asAdmin, null).length === 0);
}

console.log("\n4) requestToJoinGroup: estados del flujo");
{
  function make({ isMember, existing, found }) {
    const s = {
      currentUser: () => ({ id: "u2", name: "Beto", email: "b@e.c" }),
      clean: (v) => String(v || "").trim(),
      // runSupabase recibe la promesa final de la cadena de Supabase y la
      // devuelve tal cual, igual que en app.js.
      runSupabase: async (op) => op,
      groupFromRow: (row) => ({ id: row.id, name: row.name }),
      getUserDisplayName: (u) => u?.name || "Usuario",
      requestFromRow: (r) => ({ id: r.id, groupId: r.group_id, userId: r.user_id, status: r.status }),
      state: { groups: [{ id: "g1", members: isMember ? [{ userId: "u2" }] : [] }], joinRequests: existing ? [existing] : [] },
      persist: () => {},
      broadcastGroupNotification: async () => {},
      supabaseClient: { from: (table) => ({
        // Solo la tabla de grupos se consulta con maybeSingle; la de
        // solicitudes se inserta. Se distinguen por tabla, no por encadenado.
        select: () => ({ eq: () => ({ maybeSingle: async () => (found ? { id: "g1", name: "Casa" } : null) }) }),
        insert: () => ({ select: () => ({ single: async () => ({ id: "req-new", group_id: "g1", user_id: "u2", status: "pending" }) }) }),
        update: () => ({ eq: () => Promise.resolve() }),
      }) },
      GROUPS_TABLE: "g", REQUESTS_TABLE: "r", createId: () => "x",
    };
    const fn = new Function(...Object.keys(s), `${grabFn("requestToJoinGroup")}; return requestToJoinGroup;`);
    return fn(...Object.values(s));
  }

  const r1 = await make({ isMember: false, existing: null, found: false })("XX-YY");
  check("codigo inexistente -> invalid", r1 === "invalid");
  const r2 = await make({ isMember: true, existing: null, found: true })("AA-BB");
  check("ya miembro -> already-member", r2 === "already-member");
  const r3 = await make({ isMember: false, existing: { id: "r9", groupId: "g1", userId: "u2", status: "pending" }, found: true })("AA-BB");
  check("solicitud repetida -> duplicate", r3 === "duplicate");
  const r4 = await make({ isMember: false, existing: null, found: true })("aa-bb");
  check("nuevo -> pending", r4 === "pending");
}

console.log(`\nResultado: ${pass} OK, ${fail} fallas`);
process.exit(fail ? 1 : 0);
})();
