// Flujo del código de invitación: copiar al portapapeles y rotar el código.
import { describe, it, expect } from "vitest";
import { appSource } from "./helpers/app.js";

// Recorta una función (sync o async) del código de app.js.
function grabFn(name) {
  const lines = appSource.split("\n");
  const re = new RegExp(`^(?:async\\s+)?function\\s+${name}\\s*\\(`);
  const start = lines.findIndex((l) => re.test(l));
  if (start === -1) throw new Error(`no se encontro ${name}`);
  let end = start;
  for (let i = start; i < lines.length; i++) {
    if (/^\}/.test(lines[i])) { end = i; break; }
  }
  return lines.slice(start, end + 1).join("\n");
}

// --- copiar al portapapeles -------------------------------------------------
function clipboardSandbox() {
  const notifications = [];
  const sb = {
    notifications,
    navigator: { clipboard: { writeText: async () => {} } },
    document: {
      createElement: () => ({ style: {}, setAttribute() {}, select() {}, setSelectionRange() {}, remove() {} }),
      body: { appendChild() {} },
      execCommand: () => true,
    },
    console,
    showNotification: (msg, type) => notifications.push({ msg, type }),
  };
  const code = `${grabFn("copyInviteCode")}\n${grabFn("writeToClipboard")}`;
  // eslint-disable-next-line no-new-func
  const api = new Function(...Object.keys(sb), `${code}; return { copyInviteCode };`)(...Object.values(sb));
  return { sb, api };
}

describe("copyInviteCode", () => {
  it("copia con la Clipboard API y avisa del éxito", async () => {
    const { sb, api } = clipboardSandbox();
    let copied = null;
    sb.navigator.clipboard.writeText = async (t) => { copied = t; };
    const result = await api.copyInviteCode("CODE-123");
    expect(result).toBe(true);
    expect(copied).toBe("CODE-123");
    expect(sb.notifications[0].type).toBe("success");
  });

  it("cae al fallback cuando no hay Clipboard API", async () => {
    const { sb, api } = clipboardSandbox();
    sb.navigator.clipboard = undefined;
    const result = await api.copyInviteCode("CODE-999");
    expect(result).toBe(true);
    expect(sb.notifications[0].type).toBe("success");
  });

  it("no hace nada con un código vacío", async () => {
    const { sb, api } = clipboardSandbox();
    const result = await api.copyInviteCode("");
    expect(result).toBe(false);
    expect(sb.notifications).toHaveLength(0);
  });

  it("avisa que no pudo cuando ninguna vía funciona", async () => {
    const { sb, api } = clipboardSandbox();
    sb.navigator.clipboard = { writeText: async () => { throw new Error("bloqueado"); } };
    sb.document.execCommand = () => false;
    const result = await api.copyInviteCode("CODE-777");
    expect(result).toBe(false);
    expect(sb.notifications[0].type).toBe("info");
  });
});

// --- rotar el código --------------------------------------------------------
function rotateSandbox() {
  const notifications = [];
  const sb = {
    notifications,
    updatePayload: null,
    rendered: false,
    currentUser: () => ({ id: "u1", name: "Ana", email: "a@b.c" }),
    createInviteCode: () => "AAAA-BBBB",
    memberRole: () => sb.role,
    getCurrentGroup: () => sb.group,
    state: { groups: [] },
    persist() {},
    renderLists() { sb.rendered = true; },
    showNotification: (msg, type) => notifications.push({ msg, type }),
    runSupabase: async () => [],
    GROUPS_TABLE: "shopping_groups",
    supabaseClient: { from: () => ({ update: (v) => { sb.updatePayload = v; return { eq: () => "PROMISE" }; } }) },
    group: null,
    role: "admin",
  };
  // eslint-disable-next-line no-new-func
  const api = new Function(...Object.keys(sb), `${grabFn("regenerateInviteCode")}; return { regenerateInviteCode };`)(...Object.values(sb));
  return { sb, api };
}

describe("regenerateInviteCode", () => {
  it("rota el código para el admin", async () => {
    const { sb, api } = rotateSandbox();
    sb.group = { id: "g1", type: "shared", inviteCode: "VIEJO-1" };
    sb.role = "admin";
    await api.regenerateInviteCode();
    expect(sb.updatePayload.invite_code).toBe("AAAA-BBBB");
    expect(sb.group.inviteCode).toBe("AAAA-BBBB");
    expect(sb.rendered).toBe(true);
    expect(sb.notifications[0].type).toBe("success");
  });

  it("rechaza a un miembro sin escribir nada", async () => {
    const { sb, api } = rotateSandbox();
    sb.group = { id: "g1", type: "shared", inviteCode: "VIEJO-2" };
    sb.role = "member";
    await api.regenerateInviteCode();
    expect(sb.updatePayload).toBe(null);
    expect(sb.group.inviteCode).toBe("VIEJO-2");
    expect(sb.notifications[0].type).toBe("error");
  });

  it("no hace nada con una lista individual", async () => {
    const { sb, api } = rotateSandbox();
    sb.group = { id: "g1", type: "individual", inviteCode: null };
    await api.regenerateInviteCode();
    expect(sb.updatePayload).toBe(null);
    expect(sb.notifications).toHaveLength(0);
  });

  it("rota la lista indicada por id, aunque no haya lista abierta", async () => {
    const { sb, api } = rotateSandbox();
    // Ojo: state se pasa por valor al sandbox, así que hay que MUTAR el array
    // en vez de reasignar sb.state, o la función no lo ve.
    sb.state.groups.push({ id: "gX", type: "shared", inviteCode: "OTRO-1" });
    sb.group = null;
    sb.role = "admin";
    await api.regenerateInviteCode("gX");
    expect(sb.updatePayload.invite_code).toBe("AAAA-BBBB");
    expect(sb.state.groups[0].inviteCode).toBe("AAAA-BBBB");
  });
});
