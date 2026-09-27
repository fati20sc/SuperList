// =======================================================================
// 03-state-and-dialogs.js
//
// Estado global, referencias al DOM, menu lateral y dialogos.
// Guarda el estado en memoria y engancha los formularios de index.html.
// =======================================================================
let state = loadState();
let session = loadSession();
let isDataLoading = false;
let dataLoadError = "";
let currentView = "home";
let currentFilter = "todos";
let searchText = "";
let marketMode = false;
let overlayState = { open: false, previousView: "home", status: null };
const selectedShoppingIds = new Set();
const syncChannel = "BroadcastChannel" in window ? new BroadcastChannel("super-list-sync") : null;

const app = document.querySelector("#app");
const dialog = document.querySelector("#product-dialog");
const form = document.querySelector("#product-form");
const deleteButton = document.querySelector("#delete-product");
const markBoughtForm = document.querySelector("#mark-bought-form");
const joinDialog = document.querySelector("#join-dialog");
const joinForm = document.querySelector("#join-form");
const joinMessage = document.querySelector("#join-message");
const optionalToggle = document.querySelector("#optional-toggle");
const optionalFields = document.querySelector("#optional-fields");
const groupSwitcher = document.querySelector("#group-switcher");
const menuToggle = document.querySelector("#menu-toggle");
const sideMenu = document.querySelector("#side-menu");
const menuBackdrop = document.querySelector("#menu-backdrop");
const menuClose = document.querySelector("#menu-close");
const confirmDialog = document.querySelector("#confirm-dialog");
const confirmForm = document.querySelector("#confirm-form");
const editProfileDialog = document.querySelector("#edit-profile-dialog");
const editProfileForm = document.querySelector("#edit-profile-form");
const changePasswordDialog = document.querySelector("#change-password-dialog");
const changePasswordForm = document.querySelector("#change-password-form");
const changePasswordMessage = document.querySelector("#change-password-message");
let pendingDeleteGroupId = null;
let pendingRemoveMemberId = null;
let pendingRemoveGroupId = null;
const editGroupDialog = document.querySelector("#edit-group-dialog");
const editGroupForm = document.querySelector("#edit-group-form");
let pendingEditGroupId = null;
function openCreateGroup(type = "individual") {
  if (!editGroupForm || !editGroupDialog) return;
  editGroupForm.elements.id.value = "";
  editGroupForm.elements.name.value = "";
  editGroupForm.elements.emoji.value = type === "shared" ? "🏠" : "🛒";
  editGroupForm.dataset.createType = type;
  bindEmojiOnlyInput(editGroupForm.elements.emoji);
  editGroupDialog.showModal();
}

function closeMenu() {
  document.body.classList.remove("menu-open");
  sideMenu?.classList.remove("is-open");
  menuBackdrop?.setAttribute("hidden", "hidden");
  menuToggle?.setAttribute("aria-expanded", "false");
}

function openMenu() {
  // Allow opening the menu when a user exists, even if no group is selected yet.
  if (!currentUser()) return;
  document.body.classList.add("menu-open");
  sideMenu?.classList.add("is-open");
  menuBackdrop?.removeAttribute("hidden");
  menuToggle?.setAttribute("aria-expanded", "true");
}

function showInviteCodeMessage(inviteCode) {
  if (!inviteCode) return;
  const codeMessage = document.createElement("div");
  codeMessage.className = "dialog";
  codeMessage.style.cssText = "position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); background: var(--surface); color: var(--text); padding: 24px; border-radius: 28px; box-shadow: var(--shadow-dialog); z-index: 1000; text-align: center; max-width: 400px; width: 90%; border: 1px solid var(--line);";
  codeMessage.innerHTML = `
    <div style="margin-bottom: 20px;">
      <h2 style="margin: 0 0 8px 0; color: var(--text);">¡Lista compartida creada!</h2>
      <p style="margin: 0; color: var(--text-muted);">Código de invitación</p>
    </div>
    <div id="invite-code-display" style="background: var(--surface-3); padding: 20px; border-radius: 16px; font-size: 32px; font-weight: bold; letter-spacing: 4px; margin-bottom: 20px; cursor: pointer; user-select: all; color: var(--text); transition: all 0.2s;">${escapeHtml(inviteCode)}</div>
    <p style="margin: 0 0 20px 0; font-size: 14px; color: var(--text-muted);">Tocá el código para copiarlo</p>
    <button style="width: 100%; padding: 14px 24px; background: var(--accent); color: var(--on-solid); border: none; border-radius: 12px; cursor: pointer; font-size: 16px; font-weight: 600;" onclick="this.parentElement.remove()">Cerrar</button>
  `;
  document.body.appendChild(codeMessage);

  const codeDisplay = codeMessage.querySelector("#invite-code-display");
  codeDisplay.addEventListener("click", () => {
    navigator.clipboard.writeText(inviteCode);
    codeDisplay.textContent = "¡Copiado!";
    codeDisplay.style.background = "var(--accent)";
    codeDisplay.style.color = "var(--on-solid)";
    setTimeout(() => {
      codeDisplay.textContent = inviteCode;
      codeDisplay.style.background = "var(--surface-3)";
      codeDisplay.style.color = "var(--text)";
    }, 1500);
  });

  setTimeout(() => codeMessage.remove(), 60000);
}

editGroupForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.target;
  const id = form.elements.id.value;
  const name = clean(form.elements.name.value);
  const emoji = normalizeGroupEmoji(form.elements.emoji.value || "🏠");
  if (!id) {
    const type = form.dataset.createType === "shared" ? "shared" : "individual";
    const newGroup = await createGroup(name || "Lista", emoji, { type });
    form.reset();
    pendingEditGroupId = null;
    editGroupDialog.close();
    if (type === "shared" && newGroup && newGroup.inviteCode) {
      showInviteCodeMessage(newGroup.inviteCode);
    }
    render();
    return;
  }

  const group = state.groups.find((g) => g.id === id);
  if (!group) return;
  // Misma regla que en el handler del click y que la politica de la base:
  // solo miembros de la lista pueden editarla.
  const member = currentUser();
  if (!member || !group.members.some((m) => m.userId === member.id)) {
    showNotification("No tenés permiso para editar esta lista.", "error");
    editGroupDialog.close();
    return;
  }
  group.name = name || group.name;
  group.emoji = emoji;
  await runSupabase(
    supabaseClient.from(GROUPS_TABLE).update({ name: group.name, emoji: group.emoji }).eq("id", group.id),
    "No se pudo editar la lista."
  );
  persist();
  pendingEditGroupId = null;
  document.querySelector("#emoji-picker")?.remove();
  editGroupDialog.close();
  // Re-renderiza la vista activa para que el nuevo emoji se vea al toque.
  render();
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && overlayState.open) {
    closeStatusOverlay();
  }
});

menuBackdrop?.setAttribute("hidden", "hidden");
optionalToggle?.addEventListener("click", () => {
  const isExpanded = optionalToggle.getAttribute("aria-expanded") === "true";
  optionalToggle.setAttribute("aria-expanded", String(!isExpanded));
  if (isExpanded) {
    optionalFields.hidden = true;
  } else {
    optionalFields.hidden = false;
  }
});

// Chips de categoria: rellenan el input. Se delegan porque los chips se
// re-renderizan cada vez que se abre el dialogo.
document.querySelector("#category-chips")?.addEventListener("click", (event) => {
  const chip = event.target.closest("[data-category]");
  if (!chip) return;
  const input = form?.elements.category;
  if (!input) return;
  input.value = chip.dataset.category;
  input.dispatchEvent(new Event("input", { bubbles: true }));
});

// Si la categoria se escribe a mano, el chip que coincida se marca igual.
form?.elements.category?.addEventListener("input", syncCategoryChips);

// Selector de emojis del dialogo de editar lista.
editGroupForm?.querySelector("[data-emoji-picker-toggle]")?.addEventListener("click", () => {
  openEmojiPicker(editGroupForm.elements.emoji);
});

document.addEventListener("DOMContentLoaded", () => {
  // Event listeners de navegación principal con delegación de eventos
  document.addEventListener("click", (event) => {
    const button = event.target.closest("[data-view]");
    if (button) {
      currentView = button.dataset.view;
      render();
      return;
    }

    const actionButton = event.target.closest("[data-action='edit-profile'], [data-action='change-password']");
    if (actionButton) {
      const action = actionButton.dataset.action;
      if (action === "edit-profile") {
        const user = currentUser();
        const dlg = document.querySelector("#edit-profile-dialog");
        const frm = document.querySelector("#edit-profile-form");
        if (dlg && frm) {
          frm.elements.name.value = user ? (user.name || "") : "";
          if (frm.elements.birthdate) frm.elements.birthdate.value = user ? (user.birthdate || "") : "";
          dlg.showModal();
        }
      } else if (action === "change-password") {
        const dlg = document.querySelector("#change-password-dialog");
        const frm = document.querySelector("#change-password-form");
        const msg = document.querySelector("#change-password-message");
        if (dlg && frm) {
          if (msg) msg.textContent = "";
          frm.reset();
          dlg.showModal();
        }
      }
    }
  });

  document.querySelectorAll("[data-menu-action]").forEach((button) => {
    button.addEventListener("click", () => {
      const action = button.dataset.menuAction;
      if (action === "home") {
        goHome();
        return;
      }
      if (action === "account") {
        currentView = "settings";
        closeMenu();
        render();
      }
      if (action === "lists") {
        currentView = "lists";
        closeMenu();
        render();
      }
      if (action === "notifications") {
        currentView = "notifications";
        closeMenu();
        render();
      }
      if (action === "logout") {
        closeMenu();
        signOut();
      }
    });
  });

  document.querySelector("#brand-button")?.addEventListener("click", goHome);
  menuToggle?.addEventListener("click", () => {
    const isOpen = document.body.classList.contains("menu-open");
    isOpen ? closeMenu() : openMenu();
  });
  menuBackdrop?.addEventListener("click", closeMenu);
  menuClose?.addEventListener("click", closeMenu);
  document.querySelector("#close-dialog")?.addEventListener("click", () => dialog.close());
  document.querySelector("#status-overlay-close")?.addEventListener("click", closeStatusOverlay);
  document.querySelector("#status-overlay-backdrop")?.addEventListener("click", closeStatusOverlay);
  document.querySelector("#confirm-close")?.addEventListener("click", () => {
    pendingDeleteGroupId = null;
    pendingRemoveMemberId = null;
    pendingRemoveGroupId = null;
    confirmDialog.close();
  });
  document.querySelector("#confirm-cancel")?.addEventListener("click", () => {
    pendingDeleteGroupId = null;
    pendingRemoveMemberId = null;
    pendingRemoveGroupId = null;
    confirmDialog.close();
  });
  document.querySelector("#confirm-delete")?.addEventListener("click", async () => {
    if (pendingRemoveMemberId) {
      await removeMember(pendingRemoveMemberId, pendingRemoveGroupId);
      pendingRemoveMemberId = null;
      pendingRemoveGroupId = null;
    } else if (pendingDeleteGroupId) {
      deleteGroup(pendingDeleteGroupId);
    }
    pendingDeleteGroupId = null;
    // Restaurar la etiqueta del boton para el proximo uso (borrar lista).
    const deleteBtn = document.querySelector("#confirm-delete");
    if (deleteBtn) deleteBtn.textContent = "Borrar lista";
    confirmDialog.close();
  });
  document.querySelector("#members-dialog-close")?.addEventListener("click", () => {
    document.querySelector("#members-dialog")?.close();
  });
  document.querySelector("#members-dialog-cancel")?.addEventListener("click", () => {
    document.querySelector("#members-dialog")?.close();
  });
  document.querySelector("#edit-group-close")?.addEventListener("click", () => {
    pendingEditGroupId = null;
    editGroupDialog.close();
  });
  document.querySelector("#edit-group-cancel")?.addEventListener("click", () => {
    pendingEditGroupId = null;
    editGroupDialog.close();
  });

  // Event listeners del diálogo de editar perfil
  document.querySelector("#edit-profile-close")?.addEventListener("click", () => {
    document.querySelector("#edit-profile-dialog")?.close();
  });
  document.querySelector("#edit-profile-cancel")?.addEventListener("click", () => {
    document.querySelector("#edit-profile-dialog")?.close();
  });
  document.querySelector("#edit-profile-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.target;
    const name = clean(form.elements.name.value);
    const birthdate = form.elements.birthdate.value;
    const user = currentUser();
    if (!user) {
      showNotification("No hay una sesión activa.", "error");
      return;
    }

    const saveBtn = form.querySelector('button[type="submit"]');
    if (saveBtn) saveBtn.disabled = true;

    try {
      const { error } = await supabaseClient.auth.updateUser({
        data: {
          name: name,
          birthdate: birthdate || null
        }
      });

      if (error) {
        showNotification("Error al actualizar perfil: " + error.message, "error");
        return;
      }

      // Actualizar tabla profiles
      await supabaseClient.from(PROFILES_TABLE).upsert({
        id: user.id,
        name: name || "Usuario",
        email: user.email,
        birthdate: birthdate || null,
        updated_at: new Date().toISOString()
      });

      // Actualizar user_name en shopping_group_members
      await supabaseClient.from(MEMBERS_TABLE).update({
        user_name: name || "Usuario"
      }).eq("user_id", user.id);

      // Actualizar la caché
      await refreshCurrentUser();
      await loadAppData();
      persist();
      renderSettings();
      showNotification("Perfil actualizado correctamente", "success");
      document.querySelector("#edit-profile-dialog")?.close();
      form.reset();
    } catch (e) {
      showNotification("Error al actualizar perfil.", "error");
    } finally {
      if (saveBtn) saveBtn.disabled = false;
    }
  });

  // Event listeners del diálogo de cambiar contraseña
  document.querySelector("#change-password-close")?.addEventListener("click", () => {
    document.querySelector("#change-password-dialog")?.close();
  });
  document.querySelector("#change-password-cancel")?.addEventListener("click", () => {
    document.querySelector("#change-password-dialog")?.close();
  });

  // Password toggles en change-password-form
  document.querySelectorAll("#change-password-form [data-password-toggle]").forEach((toggle) => {
    toggle.addEventListener("click", () => {
      const input = toggle.previousElementSibling;
      const shouldShow = input.type === "password";
      input.type = shouldShow ? "text" : "password";
      toggle.classList.toggle("is-hidden", !shouldShow);
    });
  });

  document.querySelector("#change-password-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.target;
    const currentPassword = form.elements.currentPassword.value;
    const newPassword = form.elements.newPassword.value;
    const confirmPassword = form.elements.confirmPassword.value;
    const msgEl = document.querySelector("#change-password-message");
    if (msgEl) msgEl.textContent = "";

    if (newPassword !== confirmPassword) {
      const msg = "Las contraseñas no coinciden.";
      if (msgEl) msgEl.textContent = msg;
      showNotification(msg, "error");
      return;
    }

    if (newPassword.length < 6) {
      const msg = "La contraseña debe tener al menos 6 caracteres.";
      if (msgEl) msgEl.textContent = msg;
      showNotification(msg, "error");
      return;
    }

    if (!currentPassword) {
      const msg = "Debes ingresar tu contraseña actual.";
      if (msgEl) msgEl.textContent = msg;
      showNotification(msg, "error");
      return;
    }

    const saveBtn = form.querySelector('button[type="submit"]');
    if (saveBtn) saveBtn.disabled = true;

    try {
      const user = currentUser();
      if (!user || !user.email) {
        showNotification("No hay una sesión activa.", "error");
        return;
      }

      // Verificar contraseña actual intentando reautenticar
      const { error: signInError } = await supabaseClient.auth.signInWithPassword({
        email: user.email,
        password: currentPassword
      });

      if (signInError) {
        const msg = "La contraseña actual es incorrecta.";
        if (msgEl) msgEl.textContent = msg;
        showNotification(msg, "error");
        return;
      }

      // Cambiar contraseña
      const { error } = await supabaseClient.auth.updateUser({
        password: newPassword
      });

      if (error) {
        const msg = "Error al cambiar la contraseña: " + error.message;
        if (msgEl) msgEl.textContent = msg;
        showNotification(msg, "error");
      } else {
        if (msgEl) msgEl.textContent = "Contraseña cambiada exitosamente.";
        showNotification("Contraseña cambiada exitosamente.", "success");
        setTimeout(() => {
          document.querySelector("#change-password-dialog")?.close();
          form.reset();
          if (msgEl) msgEl.textContent = "";
        }, 1200);
      }
    } catch (e) {
      showNotification("Error al cambiar la contraseña.", "error");
    } finally {
      if (saveBtn) saveBtn.disabled = false;
    }
  });

  // Event listeners del diálogo de unirse con código
  document.querySelector("#join-close")?.addEventListener("click", () => {
    joinDialog?.close();
  });
  document.querySelector("#join-cancel")?.addEventListener("click", () => {
    joinDialog?.close();
  });
  joinForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const code = joinForm.elements.code.value;
    try {
      const result = await requestToJoinGroup(code);
      if (result === "pending") {
        joinMessage.textContent = "Solicitud enviada. El administrador tiene que aprobarte antes de entrar.";
        setTimeout(() => {
          joinDialog?.close();
          currentView = "lists";
          render();
        }, 1800);
      } else if (result === "already-member") {
        joinMessage.textContent = "Ya sos miembro de esa lista.";
      } else if (result === "duplicate") {
        joinMessage.textContent = "Ya enviaste una solicitud y está esperando aprobación.";
      } else {
        joinMessage.textContent = "Código inválido o lista no encontrada.";
      }
    } catch (e) {
      joinMessage.textContent = e.message || "No se pudo enviar la solicitud.";
    }
  });

  // Event listener del formulario de crear lista (delegación)
  document.addEventListener("submit", async (event) => {
    if (event.target.id === "create-list-form") {
      event.preventDefault();
      const form = event.target;
      const type = form.elements.type.value === "shared" ? "shared" : "individual";
      const previousView = currentView;
      const newGroup = await createGroup(form.elements.name.value, form.elements.emoji.value, { type });
      form.reset();
      currentView = previousView;
      if (type === "shared" && newGroup && newGroup.inviteCode) {
        showInviteCodeMessage(newGroup.inviteCode);
      }
      renderLists();
    }
  });
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const group = getCurrentGroup();
  if (!group) return;

  const formData = new FormData(form);
  const id = formData.get("id") || createId("product");
  const currentUserRecord = currentUser();
  const existing = getProduct(id);
  const product = {
    id,
    groupId: group.id,
    name: clean(formData.get("name")),
    category: clean(formData.get("category")) || "Otros",
    status: formData.get("status") || "tengo",
    quantity: clean(formData.get("quantity")),
    unit: clean(formData.get("unit")),
    brand: clean(formData.get("brand")),
    expiry: formData.get("expiry") || "",
    plannedFor: clean(formData.get("plannedFor")),
    note: clean(formData.get("note")),
    history: existing?.history || [],
    addedBy: existing?.addedBy || currentUserRecord?.id || null,
    addedByName: existing?.addedByName || getUserDisplayName(currentUserRecord),
    updatedBy: currentUserRecord?.id || null,
    createdAt: existing?.createdAt || new Date().toISOString(),
  };

  if (!product.name) return;
  await upsertProduct(product);
  if (!group.categories.includes(product.category)) {
    group.categories = [...group.categories, product.category].sort((a, b) => a.localeCompare(b));
    await runSupabase(
      supabaseClient.from(GROUPS_TABLE).update({ categories: group.categories }).eq("id", group.id),
      "No se pudo guardar la categoría."
    );
    persist();
  }
  dialog.close();
  render();
});

deleteButton.addEventListener("click", async () => {
  const id = form.elements.id.value;
  if (!id) return;
  try {
    await deleteProduct(id, { renderAfter: false });
  } catch (e) {
    console.error(e);
  }
  dialog.close();
  render();
});

markBoughtForm.addEventListener("click", async () => {
  const id = form.elements.id.value;
  if (!id) return;
  try {
    await markBought([id]);
  } catch (e) {
    console.error(e);
  }
  dialog.close();
  render();
});

window.addEventListener("storage", async (event) => {
  if (event.key !== APP_KEY && event.key !== SESSION_KEY) return;
  session = loadSession();
  if (currentUser()) {
    await loadAppData();
  }
  selectedShoppingIds.clear();
  render();
});

syncChannel?.addEventListener("message", async (event) => {
  if (event.data?.type === "notification") {
    handleIncomingNotification(event.data.notification);
    return;
  }
  session = loadSession();
  if (currentUser()) {
    await loadAppData();
  }
  render();
});
