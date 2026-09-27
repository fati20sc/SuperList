// =======================================================================
// 09e-actions.js
//
// Delegacion de clics y acciones destructivas: borrar producto, lista y quitar miembros.
// =======================================================================
function bindCommonActions() {
  document.querySelectorAll("[data-action]").forEach((element) => {
    element.addEventListener("click", async (event) => {
      const action = element.dataset.action;
      const id = element.dataset.id;
      // support create buttons in other locations
      if (action === "create-individual-list") {
        openCreateGroup("individual");
        event.stopPropagation();
        return;
      }
      if (action === "create-shared-list") {
        openCreateGroup("shared");
        event.stopPropagation();
        return;
      }
      if (action === "join-with-code") {
        if (joinDialog) {
          joinMessage.textContent = "";
          joinForm?.reset();
          joinDialog.showModal();
        }
        event.stopPropagation();
        return;
      }
      if (action === "add") openProductDialog();
      if (action === "edit") openProductDialog(getProduct(id));
      if (action === "copy-invite-code") {
        await copyInviteCode(element.dataset.code || "");
        event.stopPropagation();
        return;
      }
      if (action === "regenerate-invite-code") {
        await regenerateInviteCode(id || null);
        event.stopPropagation();
        return;
      }
      if (action === "delete") {
        await deleteProduct(id);
        return;
      }
      if (action === "cycle") cycleStatus(id);
      if (action === "bought") {
        await markBought([id]);
        render();
      }
      if (action === "increase") await adjustQuantity(id, 1);
      if (action === "decrease") await adjustQuantity(id, -1);
      if (action === "toggle-market") {
        marketMode = !marketMode;
        renderShopping();
      }
      if (action === "finish-shopping") {
        await markBought([...selectedShoppingIds]);
        renderShopping();
      }
      if (action === "logout") signOut();
      if (action === "settings") renderSettings();
      if (action === "edit-profile") {
        const user = currentUser();
        const dlg = document.querySelector("#edit-profile-dialog");
        const frm = document.querySelector("#edit-profile-form");
        if (dlg && frm) {
          frm.elements.name.value = user ? (user.name || "") : "";
          if (frm.elements.birthdate) frm.elements.birthdate.value = user ? (user.birthdate || "") : "";
          dlg.showModal();
        }
        event.stopPropagation();
        return;
      }
      if (action === "toggle-push") {
        await togglePushNotifications();
        event.stopPropagation();
        return;
      }
      if (action === "change-password") {
        const dlg = document.querySelector("#change-password-dialog");
        const frm = document.querySelector("#change-password-form");
        const msg = document.querySelector("#change-password-message");
        if (dlg && frm) {
          if (msg) msg.textContent = "";
          frm.reset();
          dlg.showModal();
        }
        event.stopPropagation();
        return;
      }
      if (action === "select-list") {
        const group = state.groups.find((item) => item.id === id);
        if (!group) return;
        session.groupId = id;
        group.lastOpenedAt = new Date().toISOString();
        await runSupabase(
          supabaseClient.from(GROUPS_TABLE).update({ last_opened_at: group.lastOpenedAt }).eq("id", group.id),
          "No se pudo abrir la lista."
        );
        currentView = "list-detail";
        persist();
        render();
        return;
      }
      if (action === "edit-group" || action === "edit-group-emoji") {
        const group = state.groups.find((item) => item.id === id);
        if (!group) return;
        // La politica de Supabase para shopping_groups_update usa is_group_member:
        // cualquier miembro puede editar nombre y emoji. Se replica esa misma
        // regla aca; no se amplia ni se restringe.
        const user = currentUser();
        const isMember = group.members.some((member) => member.userId === user?.id);
        if (!user || !isMember) return;
        openEditGroupDialog(group);
        return;
      }
      if (action === "delete-list") {
        const group = state.groups.find((g) => g.id === id);
        const name = group ? group.name : "esta lista";
        pendingDeleteGroupId = id;
        const messageEl = document.querySelector("#confirm-dialog-message");
        const titleEl = document.querySelector("#confirm-dialog-title");
        if (titleEl) titleEl.textContent = `Borrar lista`;
        if (messageEl) messageEl.textContent = `¿Estás seguro/a de borrar la lista "${name}"? Se perderán todos los productos y miembros.`;
        confirmDialog?.showModal();
        return;
      }
      if (action === "remove-member") {
        const group = element.dataset.groupId
          ? state.groups.find((item) => item.id === element.dataset.groupId)
          : getCurrentGroup();
        if (!group) return;
        if (memberRole(group) !== "admin") {
          showNotification("Solo el administrador puede quitar miembros.", "error");
          return;
        }
        if (id === currentUser()?.id) return;
        const member = group.members.find((item) => item.userId === id);
        const memberName = member?.name || member?.email || "este miembro";
        pendingRemoveMemberId = id;
        pendingRemoveGroupId = group.id;
        const messageEl = document.querySelector("#confirm-dialog-message");
        const titleEl = document.querySelector("#confirm-dialog-title");
        const deleteBtn = document.querySelector("#confirm-delete");
        if (titleEl) titleEl.textContent = "Quitar miembro";
        if (messageEl) messageEl.textContent = `¿Quitar a ${memberName} de "${group.name}"? Va a poder volver a pedir ingreso con el código.`;
        if (deleteBtn) deleteBtn.textContent = "Quitar";
        confirmDialog?.showModal();
        event.stopPropagation();
        return;
      }
      if (action === "open-members") {
        const group = state.groups.find((item) => item.id === id);
        if (!group) return;
        openMembersDialog(group);
        event.stopPropagation();
        return;
      }
      if (action === "approve-request") {
        await approveJoinRequest(element.dataset.requestId);
        event.stopPropagation();
        return;
      }
      if (action === "reject-request") {
        await rejectJoinRequest(element.dataset.requestId);
        event.stopPropagation();
        return;
      }
      event.stopPropagation();
    });
  });

  document.querySelectorAll("[data-action='select-shop']").forEach((checkbox) => {
    checkbox.addEventListener("change", () => {
      if (checkbox.checked) selectedShoppingIds.add(checkbox.dataset.id);
      else selectedShoppingIds.delete(checkbox.dataset.id);
    });
  });
}

async function deleteProduct(id, options = {}) {
  const group = getCurrentGroup();
  if (!group) return;

  // Capture product info before deletion for the broadcast
  const deletedProduct = group.products.find((item) => item.id === id);

  await runSupabase(supabaseClient.from(PRODUCTS_TABLE).delete().eq("id", id), "No se pudo borrar el producto.");
  group.products = group.products.filter((item) => item.id !== id);
  selectedShoppingIds.delete(id);

  // Broadcast deletion in shared lists
  if (deletedProduct && group.type === "shared" && currentUser()) {
    const user = currentUser();
    broadcastGroupNotification({
      id: createId("notif"),
      dedupKey: `delete-${id}`,
      type: "product_deleted",
      title: "Producto eliminado",
      message: `${getUserDisplayName(user)} eliminó "${deletedProduct.name}" de la lista "${group.name}"`,
      actorId: user.id,
      actorName: getUserDisplayName(user),
      targetId: id,
      targetName: deletedProduct.name,
      groupId: group.id,
      groupName: group.name,
      timestamp: new Date().toISOString(),
      read: false,
    });
  }

  persist();

  if (overlayState.open && overlayState.status) {
    openStatusOverlay(overlayState.status);
    return;
  }

  if (options.renderAfter !== false) {
    render();
  }
}

async function deleteGroup(groupId) {
  const user = currentUser();
  if (!user) return;
  const group = state.groups.find((item) => item.id === groupId);
  if (!group || !group.members.some((member) => member.userId === user.id && member.role === "admin")) return;

  await runSupabase(supabaseClient.from(PRODUCTS_TABLE).delete().eq("group_id", groupId), "No se pudieron borrar los productos.");
  await runSupabase(supabaseClient.from(REQUESTS_TABLE).delete().eq("group_id", groupId), "No se pudieron borrar las solicitudes.");
  await runSupabase(supabaseClient.from(MEMBERS_TABLE).delete().eq("group_id", groupId), "No se pudieron borrar los miembros.");
  await runSupabase(supabaseClient.from(GROUPS_TABLE).delete().eq("id", groupId), "No se pudo borrar la lista.");
  state.groups = state.groups.filter((item) => item.id !== groupId);

  if (session.groupId === groupId) {
    session.groupId = state.groups[0]?.id || null;
    // Mantener la vista actual si estamos en lists o settings
    if (currentView === "lists" || currentView === "settings") {
      currentView = currentView;
    } else {
      currentView = session.groupId ? "home" : "lists";
    }
  }

  persist();
  render();
}

// Quita a un miembro. Acepta el id de la lista para funcionar desde el dialogo
// de "Mis listas", donde la lista abierta puede ser otra.
async function removeMember(userId, groupId = null) {
  const group = groupId
    ? state.groups.find((item) => item.id === groupId)
    : getCurrentGroup();
  if (!group) return;
  if (memberRole(group) !== "admin") {
    showNotification("Solo el administrador puede quitar miembros.", "error");
    return;
  }
  // No permitir que el admin se quite a si mismo por la via de eliminar.
  if (userId === currentUser()?.id) return;

  const member = group.members.find((item) => item.userId === userId);
  const memberName = member?.name || member?.email || "el miembro";

  await runSupabase(
    supabaseClient.from(MEMBERS_TABLE).delete().eq("group_id", group.id).eq("user_id", userId),
    "No se pudo quitar el miembro."
  );
  group.members = group.members.filter((item) => item.userId !== userId);
  persist();

  // Avisar al resto de la lista de que se fue alguien.
  await notifyMembersAboutMembership(
    group.id,
    `${memberName} fue quitado de la lista`,
    `remove-${group.id}-${userId}`
  );
  showNotification(`Quitaste a ${memberName} de la lista.`, "success");
  renderLists();
  // Si el dialogo de miembros esta abierto, se refresca con la lista nueva.
  const membersDialog = document.querySelector("#members-dialog");
  if (membersDialog?.open) openMembersDialog(group);
}
