// Solicitudes de ingreso: el admin tiene que aprobar, y nadie se auto-acepta.
import { describe, it, expect } from "vitest";
import { appSource } from "./helpers/app.js";

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

describe("pendingRequestsFor", () => {
  const groups = [{ id: "g1", members: [{ userId: "u1", role: "admin" }] }];
  const state = {
    joinRequests: [
      { id: "r1", groupId: "g1", userId: "u2", status: "pending" },
      { id: "r2", groupId: "g1", userId: "u3", status: "accepted" },
    ],
  };
  const asAdmin = () => "admin";
  const asMember = () => "member";
  // eslint-disable-next-line no-new-func
  const call = new Function("state", "memberRole", "group", `${grabFn("pendingRequestsFor")}; return pendingRequestsFor(group);`);

  it("el admin ve solo las pendientes", () => {
    const result = call(state, asAdmin, groups[0]);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("r1");
  });

  it("un miembro no ve ninguna solicitud", () => {
    expect(call(state, asMember, groups[0])).toHaveLength(0);
  });

  it("sin grupo no hay solicitudes", () => {
    expect(call(state, asAdmin, null)).toHaveLength(0);
  });
});

describe("requestToJoinGroup", () => {
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
      supabaseClient: {
        from: () => ({
          select: () => ({ eq: () => ({ maybeSingle: async () => (found ? { id: "g1", name: "Casa" } : null) }) }),
          insert: () => ({ select: () => ({ single: async () => ({ id: "req-new", group_id: "g1", user_id: "u2", status: "pending" }) }) }),
          update: () => ({ eq: () => Promise.resolve() }),
        }),
      },
      GROUPS_TABLE: "g", REQUESTS_TABLE: "r", createId: () => "x",
    };
    // eslint-disable-next-line no-new-func
    return new Function(...Object.keys(s), `${grabFn("requestToJoinGroup")}; return requestToJoinGroup;`)(...Object.values(s));
  }

  it("con un código inexistente devuelve invalid", async () => {
    expect(await make({ isMember: false, existing: null, found: false })("XX-YY")).toBe("invalid");
  });

  it("si ya es miembro devuelve already-member", async () => {
    expect(await make({ isMember: true, existing: null, found: true })("AA-BB")).toBe("already-member");
  });

  it("con una solicitud ya pendiente devuelve duplicate", async () => {
    const dup = { id: "r9", groupId: "g1", userId: "u2", status: "pending" };
    expect(await make({ isMember: false, existing: dup, found: true })("AA-BB")).toBe("duplicate");
  });

  it("un pedido nuevo queda pending", async () => {
    expect(await make({ isMember: false, existing: null, found: true })("aa-bb")).toBe("pending");
  });
});
