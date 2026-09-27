// =======================================================================
// 07-groups.js
//
// Listas compartidas: crear, editar, solicitar ingreso y miembros.
// Incluye el flujo de aprobacion: el admin acepta o rechaza solicitudes.
// =======================================================================
async function createGroup(name, emoji = "🏠", options = {}) {
  const user = currentUser();
  if (!user) return;
  const type = options.type === "shared" ? "shared" : "individual";
  const group = {
    id: createId("group"),
    name: clean(name) || (type === "shared" ? "Espacio compartido" : "Mi lista"),
    emoji: normalizeGroupEmoji(emoji),
    type,
    inviteCode: type === "shared" ? createInviteCode() : null,
    categories: [...INITIAL_CATEGORIES],
    products: [],
    members: [{ userId: user.id, role: "admin", joinedAt: new Date().toISOString() }],
    createdBy: user.id,
    createdAt: new Date().toISOString(),
    lastOpenedAt: new Date().toISOString(),
  };

  await runSupabase(supabaseClient.from(GROUPS_TABLE).insert(groupToRow(group)), "No se pudo crear la lista.");
  await runSupabase(supabaseClient.from(MEMBERS_TABLE).insert(memberToRow(group.id, group.members[0])), "No se pudo crear el miembro administrador.");

  state.groups.push(group);
  session.groupId = group.id;
  currentView = "home";
  persist();
  return group;
}

// Envia la solicitud de ingreso. Antes el usuario se sumaba directo; ahora
// queda en estado "pending" y el admin tiene que aceptarlo.
// Devuelve: "pending" | "already-member" | "invalid" | "duplicate".
async function requestToJoinGroup(code) {
  const user = currentUser();
  const normalized = clean(code).toUpperCase();
  const groupRow = await runSupabase(
    supabaseClient.from(GROUPS_TABLE).select("*").eq("invite_code", normalized).maybeSingle(),
    "No se pudo buscar el código."
  );
  const group = groupRow ? groupFromRow(groupRow) : null;
  if (!user || !group) return "invalid";

  // Ya es miembro: no se pide nada.
  const isMember = (state.groups.find((item) => item.id === group.id)?.members || [])
    .some((member) => member.userId === user.id);
  if (isMember) return "already-member";

  // Ya habia enviado una solicitud pendiente.
  const existing = (state.joinRequests || []).find(
    (item) => item.groupId === group.id && item.userId === user.id
  );
  if (existing && existing.status === "pending") return "duplicate";

  if (existing) {
    // Reenvia una solicitud que habia sido rechazada.
    await runSupabase(
      supabaseClient.from(REQUESTS_TABLE)
        .update({ status: "pending", created_at: new Date().toISOString() })
        .eq("id", existing.id),
      "No se pudo reenviar la solicitud."
    );
    existing.status = "pending";
  } else {
    const row = {
      group_id: group.id,
      user_id: user.id,
      user_name: getUserDisplayName(user),
      user_email: user.email || "",
      status: "pending",
      created_at: new Date().toISOString(),
    };
    const created = await runSupabase(
      supabaseClient.from(REQUESTS_TABLE).insert(row).select().single(),
      "No se pudo enviar la solicitud."
    );
    if (created) state.joinRequests = [...(state.joinRequests || []), requestFromRow(created)];
  }

  persist();
  // Avisar a los admins de que hay una solicitud pendiente.
  await broadcastGroupNotification({
    id: `notif-req-${group.id}-${user.id}`,
    dedupKey: `req-${group.id}-${user.id}`,
    groupId: group.id,
    title: "Solicitud de ingreso",
    message: `${getUserDisplayName(user)} pidió entrar a la lista`,
    actorId: null,
    timestamp: new Date().toISOString(),
  });
  return "pending";
}

// Solicitudes pendientes de una lista (solo si soy admin).
function pendingRequestsFor(group) {
  if (!group || memberRole(group) !== "admin") return [];
  return (state.joinRequests || []).filter(
    (item) => item.groupId === group.id && item.status === "pending"
  );
}

// El admin acepta una solicitud: agrega el miembro y cierra la solicitud.
async function approveJoinRequest(requestId) {
  const request = (state.joinRequests || []).find((item) => item.id === requestId);
  if (!request) return;
  const group = state.groups.find((item) => item.id === request.groupId);
  if (!group) return;
  if (memberRole(group) !== "admin") {
    showNotification("Solo el administrador puede aceptar solicitudes.", "error");
    return;
  }

  const member = {
    userId: request.userId,
    role: "member",
    joinedAt: new Date().toISOString(),
    name: request.name,
    email: request.email,
  };
  await runSupabase(
    supabaseClient.from(MEMBERS_TABLE).upsert(memberToRow(group.id, member), { onConflict: "group_id,user_id" }),
    "No se pudo agregar al miembro."
  );
  await runSupabase(
    supabaseClient.from(REQUESTS_TABLE).update({ status: "accepted" }).eq("id", requestId),
    "No se pudo cerrar la solicitud."
  );

  if (!group.members.some((item) => item.userId === request.userId)) {
    group.members.push(member);
  }
  request.status = "accepted";
  persist();
  showNotification(`${request.name} ahora es parte de la lista.`, "success");
  await notifyMembersAboutMembership(
    group.id,
    `${request.name} fue aceptado en la lista`,
    `accept-${group.id}-${request.userId}`
  );
  renderLists();
  openMembersDialog(group);
}

async function rejectJoinRequest(requestId) {
  const request = (state.joinRequests || []).find((item) => item.id === requestId);
  if (!request) return;
  const group = state.groups.find((item) => item.id === request.groupId);
  if (!group || memberRole(group) !== "admin") {
    showNotification("Solo el administrador puede rechazar solicitudes.", "error");
    return;
  }
  await runSupabase(
    supabaseClient.from(REQUESTS_TABLE).update({ status: "rejected" }).eq("id", requestId),
    "No se pudo rechazar la solicitud."
  );
  request.status = "rejected";
  persist();
  showNotification(`Rechazaste la solicitud de ${request.name}.`, "info");
  renderLists();
  openMembersDialog(group);
}

// Avisa al resto de la lista sobre un movimiento de miembros. Reutiliza el
// broadcast de Realtime que ya existe; quien lo hizo no lo recibe (lo filtra
// handleIncomingNotification por actorId).
async function notifyMembersAboutMembership(groupId, message, dedupKey) {
  await broadcastGroupNotification({
    id: `notif-${dedupKey}`,
    dedupKey,
    groupId,
    message,
    title: "Lista compartida",
    actorId: currentUser()?.id || null,
    timestamp: new Date().toISOString(),
  });
}

// Abre el dialogo de editar lista con los datos cargados. La usan tanto el
// boton "Editar" de Mis listas como el del emoji del encabezado.
function openEditGroupDialog(group) {
  const form = editGroupForm;
  if (!form) return;
  pendingEditGroupId = group.id;
  form.elements.id.value = group.id;
  form.elements.name.value = group.name;
  form.elements.emoji.value = group.emoji || "🏠";
  bindEmojiOnlyInput(form.elements.emoji);
  editGroupDialog?.showModal();
}

function memberRole(group = getCurrentGroup()) {
  const user = currentUser();
  return group?.members.find((member) => member.userId === user?.id)?.role || "member";
}
