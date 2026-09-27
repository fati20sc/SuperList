// Vistas: Mi cuenta (solo perfil) y Mis listas (botones de código, miembros y
// solicitudes).
import { beforeEach, afterEach, describe, it, expect } from "vitest";
import { bootApp, appSource } from "./helpers/app.js";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const sharedAdmin = {
  id: "g1", name: "Casa", emoji: "🏠", type: "shared", inviteCode: "ABCD-1234",
  members: [{ userId: "u1", role: "admin", name: "Ana", email: "a@b.c" }],
  products: [], categories: [], createdAt: new Date().toISOString(), lastOpenedAt: new Date().toISOString(),
};
const sharedMember = { ...sharedAdmin, id: "g2", name: "Oficina", inviteCode: "WXYZ-9876", members: [{ userId: "u1", role: "member" }] };
const individual = { ...sharedAdmin, id: "g3", name: "Mia", type: "individual", inviteCode: null };

// Renderiza una vista contra un estado de listas dado y devuelve el HTML.
function renderView(name, groups, selected) {
  let html = "";
  const app = { set innerHTML(v) { html = v; } };
  const user = { id: "u1", name: "Ana", email: "a@b.c", birthdate: null };
  const memberRole = (g) => g?.members.find((m) => m.userId === "u1")?.role || "member";

  const sandbox = {
    app,
    document: { querySelector: () => null, querySelectorAll: () => [] },
    getCurrentGroup: () => (selected ? groups[0] : null),
    currentUser: () => user,
    userGroups: () => groups.filter((g) => g.members.some((m) => m.userId === "u1")),
    recentGroups: () => groups,
    memberRole,
    state: { groups, joinRequests: [] },
    session: { groupId: selected ? groups[0].id : null },
    pendingRequestsFor: () => [],
    escapeHtml: esc,
    empty: (m) => `<p>${m}</p>`,
    getUserDisplayName: (u) => u?.name || "Usuario",
    memberRow: (m) => `<div>${m.name}</div>`,
    formatDate: (d) => d,
    bindEmojiOnlyInput: () => {},
    bindCommonActions: () => {},
    // El push se consulta al pintar Mi cuenta; acá alcanza con que no rompa.
    refreshPushButton: () => {},
  };

  // eslint-disable-next-line no-new-func
  const lines = readFunction(name);
  // eslint-disable-next-line no-new-func
  new Function(...Object.keys(sandbox), `${lines}; ${name}();`)(
    ...Object.values(sandbox)
  );
  return html;
}

// Extrae el cuerpo de una función de nivel superior desde app.js.
let src = null;
function readFunction(name) {
  if (!src) src = appSource;
  const lines = src.split("\n");
  const re = new RegExp(`^(?:async\\s+)?function\\s+${name}\\s*\\(`);
  const start = lines.findIndex((l) => re.test(l));
  if (start === -1) throw new Error(`no se encontro ${name}`);
  let end = start;
  for (let i = start; i < lines.length; i++) {
    if (/^\}/.test(lines[i])) { end = i; break; }
  }
  return lines.slice(start, end + 1).join("\n");
}

describe("Mi cuenta", () => {
  let html;
  beforeEach(() => { html = renderView("renderSettings", [sharedAdmin], true); });
  afterEach(() => { delete window.supabase; });

  it("no tiene el panel de la lista actual", () => {
    expect(html).not.toContain("Lista actual");
    expect(html).not.toContain("Grupo actual");
  });

  it("no tiene el bloque de miembros", () => {
    expect(html).not.toContain("<h3>Miembros</h3>");
  });

  it("no tiene el bloque del codigo de invitacion", () => {
    expect(html).not.toContain("invite-code-value");
  });

  it("si tiene los botones de perfil", () => {
    expect(html).toContain('data-action="edit-profile"');
    expect(html).toContain('data-action="change-password"');
    expect(html).toContain('data-action="logout"');
  });

  it("tiene el boton de notificaciones", () => {
    expect(html).toContain('data-action="toggle-push"');
  });
});

describe("Mis listas", () => {
  afterEach(() => { delete window.supabase; });

  it("muestra el boton Copiar y el de Cambiar para el admin", () => {
    const html = renderView("renderLists", [sharedAdmin], false);
    expect(html).toContain('data-action="copy-invite-code"');
    expect(html).toContain('data-action="regenerate-invite-code"');
    expect(html).toContain('data-id="g1"');
    expect(html).toContain('data-code="ABCD-1234"');
  });

  it("los cuatro botones usan la clase list-action con su variante", () => {
    const html = renderView("renderLists", [sharedAdmin], false);
    expect(html).toContain("list-action list-action-open");
    expect(html).toContain("list-action list-action-edit");
    expect(html).toContain("list-action list-action-members");
    expect(html).toContain("list-action list-action-delete");
  });

  it("un miembro que no es admin ve Copiar pero no Cambiar", () => {
    const html = renderView("renderLists", [sharedMember], false);
    expect(html).toContain('data-action="copy-invite-code"');
    expect(html).not.toContain('data-action="regenerate-invite-code"');
  });

  it("las listas individuales no muestran botones de codigo", () => {
    const html = renderView("renderLists", [individual], false);
    expect(html).not.toContain("copy-invite-code");
    expect(html).not.toContain("regenerate-invite-code");
  });

  it("con varias listas hay un boton por lista y un solo Cambiar", () => {
    const html = renderView("renderLists", [sharedAdmin, sharedMember], false);
    expect(html.match(/data-action="copy-invite-code"/g)).toHaveLength(2);
    expect(html.match(/data-action="regenerate-invite-code"/g)).toHaveLength(1);
  });

  it("tiene el boton Miembros", () => {
    const html = renderView("renderLists", [sharedAdmin], false);
    expect(html).toContain('data-action="open-members"');
  });
});
