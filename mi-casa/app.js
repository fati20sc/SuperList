const APP_KEY = "superlist-state-v2";
const SESSION_KEY = "superlist-session-v2";
const GROUPS_TABLE = "shopping_groups";
const MEMBERS_TABLE = "shopping_group_members";
const PRODUCTS_TABLE = "shopping_products";
const PROFILES_TABLE = "profiles";

const supabaseClient = window.supabase.createClient(
  "https://ismweucgziipplsnkwuh.supabase.co",
  "sb_publishable_BdLR3gchcohSMV7VefHQMw_lgnIph5U"
);

// Caché del usuario actual de Supabase
let cachedSupabaseUser = null;

// Sistema de notificaciones
function showNotification(message, type = "info") {
  const notification = document.createElement("div");
  notification.className = "notification";
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: ${type === "error" ? "var(--error)" : type === "success" ? "var(--sage)" : "var(--text)"};
    color: ${type === "error" || type === "success" ? "#fff" : "var(--surface)"};
    padding: 16px 24px;
    border-radius: 12px;
    box-shadow: 0 4px 20px rgba(0,0,0,0.3);
    z-index: 2000;
    max-width: 300px;
    animation: slideIn 0.3s ease-out;
  `;
  notification.textContent = message;
  document.body.appendChild(notification);

  setTimeout(() => {
    notification.style.animation = "slideOut 0.3s ease-in";
    setTimeout(() => notification.remove(), 300);
  }, 4000);
}

// Agregar estilos de animación
const style = document.createElement("style");
style.textContent = `
  @keyframes slideIn {
    from { transform: translateX(100%); opacity: 0; }
    to { transform: translateX(0); opacity: 1; }
  }
  @keyframes slideOut {
    from { transform: translateX(0); opacity: 1; }
    to { transform: translateX(100%); opacity: 0; }
  }
`;
document.head.appendChild(style);

if (new URLSearchParams(location.search).has("reset")) {
  localStorage.removeItem(APP_KEY);
  localStorage.removeItem(SESSION_KEY);
  history.replaceState(null, "", location.pathname);
}

const STATUSES = {
  tengo: { label: "Tengo", short: "Tengo", next: "agotarse", className: "status-tengo" },
  agotarse: { label: "A punto de agotarse", short: "Por agotarse", next: "falta", className: "status-agotarse" },
  falta: { label: "En falta", short: "En falta", next: "tengo", className: "status-falta" },
  quiero: { label: "Con ganas de comprar", short: "Quiero", next: "falta", className: "status-quiero" },
};

const INITIAL_CATEGORIES = [
  "Frutas y verduras",
  "Lácteos",
  "Carnes",
  "Almacén",
  "Panadería",
  "Congelados",
  "Bebidas",
  "Snacks",
  "Limpieza",
  "Higiene",
  "Mascotas",
  "Otros",
];

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
const categoryList = document.querySelector("#category-list");
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
  codeMessage.style.cssText = "position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); background: #fff; padding: 24px; border-radius: 28px; box-shadow: 0 8px 32px rgba(0,0,0,0.3); z-index: 1000; text-align: center; max-width: 400px; width: 90%; border: 1px solid #e0e0e0;";
  codeMessage.innerHTML = `
    <div style="margin-bottom: 20px;">
      <h2 style="margin: 0 0 8px 0; color: var(--text);">¡Lista compartida creada!</h2>
      <p style="margin: 0; color: var(--text-muted);">Código de invitación</p>
    </div>
    <div id="invite-code-display" style="background: var(--line); padding: 20px; border-radius: 16px; font-size: 32px; font-weight: bold; letter-spacing: 4px; margin-bottom: 20px; cursor: pointer; user-select: all; color: var(--text); transition: all 0.2s;">${inviteCode}</div>
    <p style="margin: 0 0 20px 0; font-size: 14px; color: var(--text-muted);">Tocá el código para copiarlo</p>
    <button style="width: 100%; padding: 14px 24px; background: var(--sage); color: #fffaf0; border: none; border-radius: 12px; cursor: pointer; font-size: 16px; font-weight: 600;" onclick="this.parentElement.remove()">Cerrar</button>
  `;
  document.body.appendChild(codeMessage);

  const codeDisplay = codeMessage.querySelector("#invite-code-display");
  codeDisplay.addEventListener("click", () => {
    navigator.clipboard.writeText(inviteCode);
    codeDisplay.textContent = "¡Copiado!";
    codeDisplay.style.background = "var(--primary)";
    codeDisplay.style.color = "white";
    setTimeout(() => {
      codeDisplay.textContent = inviteCode;
      codeDisplay.style.background = "var(--line)";
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
  group.name = name || group.name;
  group.emoji = emoji;
  await runSupabase(
    supabaseClient.from(GROUPS_TABLE).update({ name: group.name, emoji: group.emoji }).eq("id", group.id),
    "No se pudo editar la lista."
  );
  persist();
  pendingEditGroupId = null;
  editGroupDialog.close();
  renderLists();
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

document.addEventListener("DOMContentLoaded", () => {
  // Event listeners de navegación principal con delegación de eventos
  document.addEventListener("click", (event) => {
    const button = event.target.closest("[data-view]");
    if (button) {
      currentView = button.dataset.view;
      render();
      return;
    }

    const actionButton = event.target.closest("[data-action='edit-profile'], [data-action='change-password'], [data-action='install-pwa']");
    if (actionButton) {
      const action = actionButton.dataset.action;
      if (action === "install-pwa") {
        if (typeof window.triggerInstallPWA === "function") {
          window.triggerInstallPWA();
        }
        return;
      } else if (action === "edit-profile") {
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
  document.querySelector("#confirm-close")?.addEventListener("click", () => confirmDialog.close());
  document.querySelector("#confirm-cancel")?.addEventListener("click", () => {
    pendingDeleteGroupId = null;
    confirmDialog.close();
  });
  document.querySelector("#confirm-delete")?.addEventListener("click", () => {
    if (pendingDeleteGroupId) {
      deleteGroup(pendingDeleteGroupId);
    }
    pendingDeleteGroupId = null;
    confirmDialog.close();
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
      if (await joinGroup(code)) {
        joinMessage.textContent = "Te uniste correctamente a la lista.";
        setTimeout(() => {
          joinDialog?.close();
          render();
        }, 1200);
      } else {
        joinMessage.textContent = "Código inválido o lista no encontrada.";
      }
    } catch (e) {
      joinMessage.textContent = e.message || "No se pudo unir a la lista.";
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
  await deleteProduct(id, { renderAfter: false });
  dialog.close();
  render();
});

markBoughtForm.addEventListener("click", async () => {
  const id = form.elements.id.value;
  if (!id) return;
  await markBought([id]);
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

syncChannel?.addEventListener("message", async () => {
  session = loadSession();
  if (currentUser()) {
    await loadAppData();
  }
  render();
});

function loadState() {
  return { users: [], groups: [], uiNotice: "" };
}

function loadSession() {
  const savedLocal = localStorage.getItem(SESSION_KEY);
  const savedSession = sessionStorage.getItem(SESSION_KEY);
  const parsed = savedLocal ? JSON.parse(savedLocal) : savedSession ? JSON.parse(savedSession) : { userId: null, groupId: null, remember: false };
  
  let userId = parsed.userId || null;
  let groupId = parsed.groupId || null;
  const remember = Boolean(parsed.remember);

  // Auto-login con usuario de prueba eliminado
  // if (!userId && state.users.length > 0) {
  //   const testUser = state.users.find(u => u.email === "test@demo.com");
  //   if (testUser) {
  //     userId = testUser.id;
  //     // Seleccionar el grupo de prueba automáticamente
  //     const testGroup = state.groups.find(g => g.inviteCode === "TEST-DEMO");
  //     if (testGroup) {
  //       groupId = testGroup.id;
  //     }
  //     // Guardar la sesión
  //     const newSession = { userId, groupId, remember: true };
  //     localStorage.setItem(SESSION_KEY, JSON.stringify(newSession));
  //     return newSession;
  //   }
  // }
  
  return { userId, groupId, remember };
}

function persist() {
  if (session.remember) {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    sessionStorage.removeItem(SESSION_KEY);
  } else {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
    localStorage.removeItem(SESSION_KEY);
  }
  syncChannel?.postMessage({ type: "changed", at: Date.now() });
}

function groupFromRow(row, members = [], products = []) {
  return {
    id: row.id,
    name: row.name,
    emoji: row.emoji || "🏠",
    type: row.type || "individual",
    inviteCode: row.invite_code || null,
    categories: Array.isArray(row.categories) && row.categories.length ? row.categories : [...INITIAL_CATEGORIES],
    products,
    members,
    createdBy: row.created_by,
    createdAt: row.created_at,
    lastOpenedAt: row.last_opened_at,
  };
}

function memberFromRow(row) {
  return {
    userId: row.user_id,
    role: row.role || "member",
    joinedAt: row.joined_at,
    name: row.user_name || "Usuario",
    email: row.user_email || "",
  };
}

function productFromRow(row, profilesById = new Map()) {
  const resolvedAddedByName = (row.added_by && profilesById.get(row.added_by)) || row.added_by_name || "Usuario";
  return {
    id: row.id,
    groupId: row.group_id,
    name: row.name,
    category: row.category || "Otros",
    status: row.status || "tengo",
    quantity: row.quantity || "",
    unit: row.unit || "",
    brand: row.brand || "",
    expiry: row.expiry || "",
    plannedFor: row.planned_for || "",
    note: row.note || "",
    history: Array.isArray(row.history) ? row.history : [],
    addedBy: row.added_by || null,
    addedByName: resolvedAddedByName,
    updatedBy: row.updated_by || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function groupToRow(group) {
  return {
    id: group.id,
    name: group.name,
    emoji: group.emoji || "🏠",
    type: group.type,
    invite_code: group.inviteCode || null,
    categories: group.categories || [...INITIAL_CATEGORIES],
    created_by: group.createdBy,
    created_at: group.createdAt,
    last_opened_at: group.lastOpenedAt || new Date().toISOString(),
  };
}

function memberToRow(groupId, member) {
  const user = currentUser();
  return {
    group_id: groupId,
    user_id: member.userId,
    role: member.role || "member",
    joined_at: member.joinedAt || new Date().toISOString(),
    user_email: member.email || (member.userId === user?.id ? user.email : ""),
    user_name: member.name || (member.userId === user?.id ? getUserDisplayName(user) : "Usuario"),
  };
}

function productToRow(product) {
  return {
    id: product.id,
    group_id: product.groupId,
    name: product.name,
    category: product.category || "Otros",
    status: product.status || "tengo",
    quantity: product.quantity || "",
    unit: product.unit || "",
    brand: product.brand || "",
    expiry: product.expiry || null,
    planned_for: product.plannedFor || "",
    note: product.note || "",
    history: product.history || [],
    added_by: product.addedBy || null,
    added_by_name: product.addedByName || "",
    updated_by: product.updatedBy || null,
    created_at: product.createdAt || new Date().toISOString(),
    updated_at: product.updatedAt || new Date().toISOString(),
  };
}

async function runSupabase(operation, fallbackMessage = "No se pudo guardar el cambio.") {
  const { error, data } = await operation;
  if (error) {
    console.error(error);
    showNotification(error.message || fallbackMessage, "error");
    throw error;
  }
  return data;
}

let realtimeChannel = null;

function setupRealtimeSubscription() {
  if (realtimeChannel) {
    supabaseClient.removeChannel(realtimeChannel);
    realtimeChannel = null;
  }

  const user = currentUser();
  if (!user) return;

  realtimeChannel = supabaseClient
    .channel("superlist-realtime-sync")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: PRODUCTS_TABLE },
      async () => {
        if (!currentUser()) return;
        await loadAppData();
        render();
      }
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: GROUPS_TABLE },
      async () => {
        if (!currentUser()) return;
        await loadAppData();
        render();
      }
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: MEMBERS_TABLE },
      async () => {
        if (!currentUser()) return;
        await loadAppData();
        render();
      }
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: PROFILES_TABLE },
      async () => {
        if (!currentUser()) return;
        await refreshCurrentUser();
        await loadAppData();
        render();
      }
    )
    .subscribe();
}

function cleanupRealtimeSubscription() {
  if (realtimeChannel) {
    supabaseClient.removeChannel(realtimeChannel);
    realtimeChannel = null;
  }
}

async function migrateLocalDataIfAny(user) {
  try {
    const rawLocal = localStorage.getItem(APP_KEY);
    if (!rawLocal) return false;
    const parsed = JSON.parse(rawLocal);
    if (!parsed || !Array.isArray(parsed.groups) || !parsed.groups.length) return false;

    for (const localGroup of parsed.groups) {
      if (!localGroup.name) continue;
      const type = localGroup.type === "shared" ? "shared" : "individual";
      const newGroupId = localGroup.id || createId("group");
      const groupData = {
        id: newGroupId,
        name: clean(localGroup.name),
        emoji: normalizeGroupEmoji(localGroup.emoji || "🏠"),
        type,
        inviteCode: type === "shared" ? (localGroup.inviteCode || createInviteCode()) : null,
        categories: Array.isArray(localGroup.categories) && localGroup.categories.length ? localGroup.categories : [...INITIAL_CATEGORIES],
        createdBy: user.id,
        createdAt: localGroup.createdAt || new Date().toISOString(),
        lastOpenedAt: new Date().toISOString(),
      };

      await supabaseClient.from(GROUPS_TABLE).insert(groupToRow(groupData));
      await supabaseClient.from(MEMBERS_TABLE).insert({
        group_id: newGroupId,
        user_id: user.id,
        role: "admin",
        joined_at: new Date().toISOString(),
        user_name: getUserDisplayName(user),
        user_email: user.email || "",
      });

      if (Array.isArray(localGroup.products) && localGroup.products.length) {
        const productRows = localGroup.products.map((p) => productToRow({
          ...p,
          groupId: newGroupId,
          addedBy: user.id,
          addedByName: getUserDisplayName(user),
          updatedBy: user.id,
        }));
        await supabaseClient.from(PRODUCTS_TABLE).insert(productRows);
      }
    }

    localStorage.removeItem(APP_KEY);
    await loadAppData();
    return true;
  } catch (err) {
    console.warn("No se pudieron migrar los datos locales:", err);
    return false;
  }
}

async function loadAppData() {
  const user = currentUser();
  if (!user) {
    state = loadState();
    return;
  }

  isDataLoading = true;
  dataLoadError = "";

  try {
    const memberships = await runSupabase(
      supabaseClient.from(MEMBERS_TABLE).select("*").eq("user_id", user.id),
      "No se pudieron cargar tus listas."
    );

    const groupIds = memberships.map((member) => member.group_id);
    if (!groupIds.length) {
      const migrated = await migrateLocalDataIfAny(user);
      if (migrated) return;

      state = { users: [user], groups: [], uiNotice: state.uiNotice || "" };
      session.groupId = null;
      persist();
      return;
    }

    const [groups, members, products, profiles] = await Promise.all([
      runSupabase(supabaseClient.from(GROUPS_TABLE).select("*").in("id", groupIds), "No se pudieron cargar tus listas."),
      runSupabase(supabaseClient.from(MEMBERS_TABLE).select("*").in("group_id", groupIds), "No se pudieron cargar los miembros."),
      runSupabase(supabaseClient.from(PRODUCTS_TABLE).select("*").in("group_id", groupIds), "No se pudieron cargar los productos."),
      supabaseClient.from(PROFILES_TABLE).select("id, name, email").then(({ data }) => data || []).catch(() => []),
    ]);

    const profilesById = new Map();
    profiles.forEach((p) => {
      if (p.id && p.name) profilesById.set(p.id, p.name);
    });
    members.forEach((m) => {
      if (!profilesById.has(m.user_id) && m.user_name) {
        profilesById.set(m.user_id, m.user_name);
      }
    });
    if (user && user.name) {
      profilesById.set(user.id, user.name);
    }

    const membersByGroup = new Map();
    members.forEach((row) => {
      const list = membersByGroup.get(row.group_id) || [];
      list.push(memberFromRow(row));
      membersByGroup.set(row.group_id, list);
    });

    const productsByGroup = new Map();
    products.forEach((row) => {
      const list = productsByGroup.get(row.group_id) || [];
      list.push(productFromRow(row, profilesById));
      productsByGroup.set(row.group_id, list);
    });

    const usersById = new Map([[user.id, user]]);
    members.forEach((row) => {
      if (!usersById.has(row.user_id)) {
        usersById.set(row.user_id, {
          id: row.user_id,
          name: profilesById.get(row.user_id) || row.user_name || "Usuario",
          email: row.user_email || "",
        });
      }
    });

    state = {
      users: [...usersById.values()],
      groups: groups.map((group) => groupFromRow(
        group,
        membersByGroup.get(group.id) || [],
        (productsByGroup.get(group.id) || []).sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
      )),
      uiNotice: state.uiNotice || "",
    };

    if (session.groupId && !state.groups.some((group) => group.id === session.groupId)) {
      session.groupId = state.groups[0]?.id || null;
      persist();
    }
  } catch (error) {
    dataLoadError = error.message || "No se pudieron cargar los datos.";
  } finally {
    isDataLoading = false;
  }
}

function currentUser() {
  // Devolver el usuario de la caché si existe
  if (cachedSupabaseUser) {
    return cachedSupabaseUser;
  }
  return null;
}

async function refreshCurrentUser() {
  // Actualizar la caché del usuario desde Supabase
  const { data: { session: supabaseSession }, error } = await supabaseClient.auth.getSession();

  if (error || !supabaseSession) {
    cachedSupabaseUser = null;
    return null;
  }

  // Actualizar la caché
  const supabaseUser = supabaseSession.user;
  let profileName = supabaseUser.user_metadata?.name || null;
  let profileBirthdate = supabaseUser.user_metadata?.birthdate || null;

  try {
    const { data: profileRow } = await supabaseClient
      .from(PROFILES_TABLE)
      .select("name, birthdate")
      .eq("id", supabaseUser.id)
      .maybeSingle();
    if (profileRow) {
      if (profileRow.name) profileName = profileRow.name;
      if (profileRow.birthdate) profileBirthdate = profileRow.birthdate;
    }
  } catch (e) {
    // Si no está disponible la tabla profiles, usamos user_metadata
  }

  cachedSupabaseUser = {
    id: supabaseUser.id,
    email: supabaseUser.email,
    name: profileName || "Usuario",
    birthdate: profileBirthdate,
    emailVerified: supabaseUser.email_confirmed_at !== null,
  };

  return cachedSupabaseUser;
}

function getCurrentGroup() {
  const user = currentUser();
  if (!user) return null;
  const group = state.groups.find((item) => item.id === session.groupId);
  if (!group || !group.members.some((member) => member.userId === user.id)) return null;
  return group;
}

function goHome() {
  currentView = "home";
  session.groupId = null;
  persist();
  closeMenu();
  render();
}

// Funciones globales para el menú (accesibles desde onclick en HTML)
window.goToHome = goHome;
window.goToSettings = function() {
  currentView = "settings";
  closeMenu();
  render();
};
window.goToLists = function() {
  currentView = "lists";
  closeMenu();
  render();
};
window.doLogout = function() {
  closeMenu();
  signOut().then(() => {
    render();
  });
};

function getUserDisplayName(user) {
  if (!user) return "Usuario";
  return clean(user.name) || user.email || "Usuario";
}

function recentGroups(limit = 4) {
  const user = currentUser();
  if (!user) return [];
  return userGroups()
    .slice()
    .sort((a, b) => {
      const getLastProductDate = (group) => {
        if (!group.products.length) return group.createdAt || 0;
        return group.products.reduce((latest, product) => {
          const productDate = new Date(product.createdAt || 0).getTime();
          return productDate > latest ? productDate : latest;
        }, 0);
      };
      return getLastProductDate(b) - getLastProductDate(a);
    })
    .slice(0, limit);
}

function userGroups() {
  const user = currentUser();
  if (!user) return [];
  return state.groups.filter((group) => group.members.some((member) => member.userId === user.id));
}

function groupProducts() {
  return getCurrentGroup()?.products || [];
}

function getProduct(id) {
  return groupProducts().find((product) => product.id === id) || null;
}

function guardedAdd() {
  if (!currentUser() || !getCurrentGroup()) return;
  openProductDialog();
}

function clean(value) {
  return String(value || "").trim();
}

function createId(prefix) {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function normalizeEmail(value) {
  return clean(value).toLowerCase();
}

function isSingleEmoji(value) {
  const chars = [...String(value || "")];
  if (!chars.length || chars.length > 2) return false;
  return chars.every((char) => /[\p{Extended_Pictographic}\p{Regional_Indicator}\u{FE0F}\u{200D}]/u.test(char));
}

function normalizeGroupEmoji(value) {
  const raw = clean(value || "🏠");
  if (!raw) return "🏠";
  const chars = [...raw].filter((char) => /[\p{Extended_Pictographic}\p{Regional_Indicator}\u{FE0F}\u{200D}]/u.test(char));
  const candidate = chars.slice(0, 2).join("");
  return isSingleEmoji(candidate) ? candidate : "🏠";
}

function bindEmojiOnlyInput(element) {
  if (!element) return;
  element.setAttribute("inputmode", "text");
  element.setAttribute("autocomplete", "off");
  element.setAttribute("autocapitalize", "none");
  element.setAttribute("spellcheck", "false");
  element.setAttribute("maxlength", "2");

  element.addEventListener("input", () => {
    const next = normalizeGroupEmoji(element.value);
    if (next !== element.value) {
      element.value = next;
    }
  });
}

function createInviteCode() {
  return Math.random().toString(36).slice(2, 6).toUpperCase() + "-" + Math.random().toString(36).slice(2, 6).toUpperCase();
}

async function createUser(email, password, profile = {}) {
  const { data, error } = await supabaseClient.auth.signUp({
    email,
    password,
    options: {
      data: {
        name: clean(profile.name) || "Usuario",
        birthdate: clean(profile.birthdate) || null,
      },
      emailRedirectTo: `${location.origin}${location.pathname}`,
    },
  });

  if (error) {
    throw new Error(error.message);
  }

  return {
    user: data.user,
    requiresEmailConfirmation: !data.session,
  };
}
async function signIn(email, password, options = {}) {
  const { data, error } = await supabaseClient.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    throw new Error(error.message);
  }

  // Actualizar la caché del usuario después del login exitoso
  await refreshCurrentUser();

  // Reconstruir la sesión local
  session.userId = data.user.id;
  session.groupId = null;
  session.remember = Boolean(options.rememberSession ?? true);
  persist();
  await loadAppData();
  setupRealtimeSubscription();

  return data.user;
}

async function signOut() {
  // Cerrar sesión en Supabase
  await supabaseClient.auth.signOut();

  // Limpiar la caché y tiempo real
  cachedSupabaseUser = null;
  cleanupRealtimeSubscription();

  session = { userId: null, groupId: null, remember: false };
  currentView = "home";
  selectedShoppingIds.clear();
  localStorage.removeItem(SESSION_KEY);
  sessionStorage.removeItem(SESSION_KEY);
  persist();
  render();
}

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

async function joinGroup(code) {
  const user = currentUser();
  const normalized = clean(code).toUpperCase();
  const groupRow = await runSupabase(
    supabaseClient.from(GROUPS_TABLE).select("*").eq("invite_code", normalized).maybeSingle(),
    "No se pudo buscar el código."
  );
  const group = groupRow ? groupFromRow(groupRow) : null;
  if (!user || !group) return false;

  const member = {
    userId: user.id,
    role: "member",
    joinedAt: new Date().toISOString(),
    name: getUserDisplayName(user),
    email: user.email,
  };

  await runSupabase(
    supabaseClient.from(MEMBERS_TABLE).upsert(memberToRow(group.id, member), { onConflict: "group_id,user_id" }),
    "No se pudo unir a la lista."
  );

  session.groupId = group.id;
  currentView = "home";
  persist();
  await loadAppData();
  return true;
}

function memberRole(group = getCurrentGroup()) {
  const user = currentUser();
  return group?.members.find((member) => member.userId === user?.id)?.role || "member";
}

async function upsertProduct(product) {
  const group = getCurrentGroup();
  if (!group) return;
  const user = currentUser();
  const index = group.products.findIndex((item) => item.id === product.id);
  const base = {
    ...product,
    addedBy: product.addedBy || user?.id || null,
    addedByName: product.addedByName || getUserDisplayName(user),
    createdAt: product.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    updatedBy: user?.id || null,
  };

  if (index >= 0) {
    group.products[index] = {
      ...group.products[index],
      ...base,
      addedBy: group.products[index].addedBy || base.addedBy,
      addedByName: group.products[index].addedByName || base.addedByName,
      createdAt: group.products[index].createdAt || base.createdAt,
    };
  } else {
    group.products = [base, ...group.products];
  }

  await runSupabase(
    supabaseClient.from(PRODUCTS_TABLE).upsert(productToRow(base), { onConflict: "id" }),
    "No se pudo guardar el producto."
  );
  persist();
}

async function setStatus(id, status) {
  const group = getCurrentGroup();
  if (!group) return;
  let changedProduct = null;
  group.products = group.products.map((product) => {
    if (product.id !== id) return product;
    changedProduct = {
      ...product,
      status,
      history: [...(product.history || []), { type: "status", status, at: new Date().toISOString() }],
      updatedAt: new Date().toISOString(),
      updatedBy: currentUser()?.id || null,
    };
    return changedProduct;
  });
  if (changedProduct) {
    await runSupabase(
      supabaseClient.from(PRODUCTS_TABLE).upsert(productToRow(changedProduct), { onConflict: "id" }),
      "No se pudo actualizar el estado."
    );
  }
  persist();
  render();
}

function cycleStatus(id) {
  const product = getProduct(id);
  if (!product) return;
  setStatus(id, STATUSES[product.status].next);
}

async function markBought(ids) {
  const idSet = new Set(ids);
  const group = getCurrentGroup();
  if (!group) return;
  const changedProducts = [];
  group.products = group.products.map((product) => {
    if (!idSet.has(product.id)) return product;
    const changedProduct = {
      ...product,
      status: "tengo",
      history: [...(product.history || []), { type: "bought", at: new Date().toISOString() }],
      updatedAt: new Date().toISOString(),
      updatedBy: currentUser()?.id || null,
    };
    changedProducts.push(changedProduct);
    return changedProduct;
  });
  ids.forEach((id) => selectedShoppingIds.delete(id));
  if (changedProducts.length) {
    await runSupabase(
      supabaseClient.from(PRODUCTS_TABLE).upsert(changedProducts.map(productToRow), { onConflict: "id" }),
      "No se pudo marcar la compra."
    );
  }
  persist();
}

async function adjustQuantity(id, amount) {
  const group = getCurrentGroup();
  if (!group) return;
  let changedProduct = null;
  group.products = group.products.map((product) => {
    if (product.id !== id) return product;
    const numeric = Number(String(product.quantity).replace(",", "."));
    if (!Number.isFinite(numeric)) return product;
    const nextQuantity = Math.max(0, numeric + amount);
    changedProduct = {
      ...product,
      quantity: String(Number(nextQuantity.toFixed(2))),
      updatedAt: new Date().toISOString(),
      updatedBy: currentUser()?.id || null,
    };
    return changedProduct;
  });
  if (changedProduct) {
    await runSupabase(
      supabaseClient.from(PRODUCTS_TABLE).upsert(productToRow(changedProduct), { onConflict: "id" }),
      "No se pudo actualizar la cantidad."
    );
  }
  persist();
  render();
}

function openProductDialog(product = null) {
  const group = getCurrentGroup();
  if (!group) return;
  form.reset();
  fillCategories(group);
  document.querySelector("#dialog-title").textContent = product ? "Editar producto" : "Agregar rápido";
  deleteButton.hidden = !product;
  markBoughtForm.hidden = !product;
  form.elements.id.value = product?.id || "";
  form.elements.name.value = product?.name || "";
  form.elements.category.value = product?.category || "";
  form.elements.quantity.value = product?.quantity || "";
  form.elements.unit.value = product?.unit || "";
  form.elements.brand.value = product?.brand || "";
  form.elements.expiry.value = product?.expiry || "";
  form.elements.plannedFor.value = product?.plannedFor || "";
  form.elements.note.value = product?.note || "";
  form.elements.status.value = product?.status || "tengo";
  optionalFields.hidden = true;
  optionalToggle.setAttribute("aria-expanded", "false");
  dialog.showModal();
  requestAnimationFrame(() => form.elements.name.focus());
}

function fillCategories(group) {
  categoryList.innerHTML = group.categories.map((category) => `<option value="${escapeHtml(category)}"></option>`).join("");
}

function renderPasswordReset() {
  groupSwitcher.innerHTML = "";
  app.innerHTML = `
    <section class="auth-layout">
      <div class="hero-band auth-hero">
        <img class="auth-brand-mark" src="./superlist.png" alt="Superlist" />
        <img class="hero-illustration" src="./logo.png" alt="Logo de SuperList" />
        <div>
          <h2>Cambiá tu contraseña</h2>
          <p>Ingresá tu nueva contraseña para continuar.</p>
        </div>
      </div>
      <section class="panel">
        <form class="stack-form" id="password-reset-form">
          <label class="field">
            <span>Nueva contraseña</span>
            <div class="password-row">
              <input name="newPassword" type="password" autocomplete="new-password" required />
              <button class="password-toggle is-hidden" type="button" data-password-toggle aria-label="Mostrar contraseña" title="Mostrar contraseña">
                <svg class="password-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                  <path d="M2 12s3.8-6 10-6 10 6 10 6-3.8 6-10 6S2 12 2 12Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"></path>
                  <circle cx="12" cy="12" r="3.2" fill="none" stroke="currentColor" stroke-width="1.8"></circle>
                </svg>
              </button>
            </div>
          </label>
          <label class="field">
            <span>Repetir nueva contraseña</span>
            <div class="password-row">
              <input name="confirmNewPassword" type="password" autocomplete="new-password" required />
              <button class="password-toggle is-hidden" type="button" data-password-toggle aria-label="Mostrar contraseña" title="Mostrar contraseña">
                <svg class="password-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                  <path d="M2 12s3.8-6 10-6 10 6 10 6-3.8 6-10 6S2 12 2 12Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"></path>
                  <circle cx="12" cy="12" r="3.2" fill="none" stroke="currentColor" stroke-width="1.8"></circle>
                </svg>
              </button>
            </div>
          </label>
          <p class="form-message" id="reset-message"></p>
          <button class="primary-button" type="submit">Cambiar contraseña</button>
          <button class="secondary-button" type="button" id="back-to-signin">Volver al inicio de sesión</button>
        </form>
      </section>
    </section>
  `;

  const resetForm = document.getElementById("password-reset-form");
  const resetMessage = document.getElementById("reset-message");
  const backToSignin = document.getElementById("back-to-signin");

  // Password toggles
  resetForm.querySelectorAll("[data-password-toggle]").forEach((toggle) => {
    toggle.addEventListener("click", () => {
      const input = toggle.previousElementSibling;
      const shouldShow = input.type === "password";
      input.type = shouldShow ? "text" : "password";
      toggle.classList.toggle("is-hidden", !shouldShow);
      toggle.setAttribute("aria-label", shouldShow ? "Ocultar contraseña" : "Mostrar contraseña");
      toggle.setAttribute("title", shouldShow ? "Ocultar contraseña" : "Mostrar contraseña");
      input.focus();
    });
  });

  backToSignin.addEventListener("click", () => {
    currentView = "home";
    render();
  });

  resetForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const newPassword = resetForm.elements.newPassword.value;
    const confirmNewPassword = resetForm.elements.confirmNewPassword.value;

    if (newPassword !== confirmNewPassword) {
      resetMessage.textContent = "Las contraseñas no coinciden.";
      return;
    }

    if (newPassword.length < 8) {
      resetMessage.textContent = "La contraseña debe tener al menos 8 caracteres.";
      return;
    }

    try {
      const { error } = await supabaseClient.auth.updateUser({ password: newPassword });

      if (error) {
        resetMessage.textContent = error.message || "Error al cambiar la contraseña.";
        return;
      }

      resetMessage.textContent = "Contraseña cambiada correctamente. Ya podés iniciar sesión con tu nueva contraseña.";
      resetForm.reset();

      setTimeout(() => {
        currentView = "home";
        render();
      }, 2000);
    } catch (error) {
      resetMessage.textContent = "Error al cambiar la contraseña. Inténtalo nuevamente.";
    }
  });
}

function render() {
  if (!currentUser()) {
    renderShell();
    return renderAuth();
  }

  if (currentView === "home") {
    renderShell();
    return renderHome();
  }

  // Vistas que no requieren grupo seleccionado
  if (currentView === "lists") {
    renderLists();
    renderShell();
    return;
  }
  if (currentView === "settings") {
    renderSettings();
    renderShell();
    return;
  }

  // Vistas que requieren grupo seleccionado
  if (!getCurrentGroup()) {
    renderShell();
    return renderHome();
  }

  renderShell();

  document.querySelectorAll("[data-view]").forEach((button) => {
    button.disabled = false;
    button.classList.toggle("active", button.dataset.view === currentView);
  });

  if (currentView === "inventory") renderInventory();
  if (currentView === "shopping") renderShopping();
  if (currentView === "list-detail") renderListDetail();
}

function renderShell() {
  const user = currentUser();
  const isAuthenticated = Boolean(user);
  const addTopButton = document.querySelector("#open-add-top");

  document.body.classList.toggle("locked", !isAuthenticated);
  document.body.classList.toggle("auth-screen", !user);
  if (!user) {
    closeMenu();
  }

  if (addTopButton) {
    addTopButton.disabled = !isAuthenticated;
  }
  document.querySelectorAll("[data-view]").forEach((button) => {
    button.disabled = !isAuthenticated;
  });

  if (!user) {
    groupSwitcher.innerHTML = "";
    return;
  }

  groupSwitcher.innerHTML = "";
  // If the user has groups but no group is selected, pick the first one so dialogs and actions work immediately.
  if (!session.groupId) {
    const firstGroupId = userGroups()[0]?.id;
    if (firstGroupId) {
      session.groupId = firstGroupId;
      persist();
    }
  }
  menuToggle?.removeAttribute("hidden");
}

function renderAuth() {
  groupSwitcher.innerHTML = "";
  app.innerHTML = `
    <section class="auth-layout">
      <div class="hero-band auth-hero">
        <img class="auth-brand-mark" src="./superlist.png" alt="Superlist" />
        <img class="hero-illustration" src="./logo.png" alt="Logo de SuperList" />
        <div>
          <h2>Entrá a tu lista digital.</h2>
          <p>Una app diseñada para que puedas organizar tus compras.</p>
        </div>
      </div>
      <section class="panel">
        <div class="tabs">
          <button class="filter-button active" type="button" data-auth-tab="signin">Iniciar sesión</button>
          <button class="filter-button" type="button" data-auth-tab="signup">Crear cuenta</button>
        </div>
        <form class="stack-form" id="auth-form">
          <input type="hidden" name="mode" value="signin" />
          <label class="field auth-extra hidden" data-signup-field>
            <span>Nombre</span>
            <input name="name" type="text" autocomplete="name" placeholder="María" />
          </label>
          <label class="field auth-extra hidden" data-signup-field>
            <span>Fecha de nacimiento</span>
            <input name="birthdate" type="date" />
          </label>
          <label class="field">
            <span>Email</span>
            <input name="email" type="email" autocomplete="email" required />
          </label>
          <label class="field">
            <span>Contraseña</span>
            <div class="password-row">
              <input name="password" type="password" autocomplete="current-password" required />
              <button class="password-toggle is-hidden" type="button" data-password-toggle aria-label="Mostrar contraseña" title="Mostrar contraseña">
                <svg class="password-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                  <path d="M2 12s3.8-6 10-6 10 6 10 6-3.8 6-10 6S2 12 2 12Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"></path>
                  <circle cx="12" cy="12" r="3.2" fill="none" stroke="currentColor" stroke-width="1.8"></circle>
                </svg>
              </button>
            </div>
          </label>
          <label class="field auth-extra hidden" data-signup-field>
            <span>Confirmación de contraseña</span>
            <div class="password-row">
              <input name="confirmPassword" type="password" autocomplete="new-password" />
              <button class="password-toggle is-hidden" type="button" data-password-toggle aria-label="Mostrar contraseña" title="Mostrar contraseña">
                <svg class="password-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                  <path d="M2 12s3.8-6 10-6 10 6 10 6-3.8 6-10 6S2 12 2 12Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"></path>
                  <circle cx="12" cy="12" r="3.2" fill="none" stroke="currentColor" stroke-width="1.8"></circle>
                </svg>
              </button>
            </div>
          </label>
          <label class="check-row check-row--green auth-signin-only">
            <input type="checkbox" name="rememberSession" checked />
            <span>Mantener sesión iniciada</span>
          </label>
          <div class="auth-links">
            <button class="text-link subtle-link" type="button" data-action="forgot-password">¿Olvidaste tu contraseña?</button>
          </div>
          <p class="form-message" id="auth-message"></p>
          <button class="primary-button" type="submit">Entrar</button>
        </form>
      </section>
    </section>
  `;

  const authForm = document.querySelector("#auth-form");
  const message = document.querySelector("#auth-message");
  const passwordInput = authForm.elements.password;
  const confirmPasswordInput = authForm.elements.confirmPassword;
  const passwordToggles = [...authForm.querySelectorAll("[data-password-toggle]")];
  const forgotPasswordButton = authForm.querySelector("[data-action='forgot-password']");
  const signupFields = [...document.querySelectorAll("[data-signup-field]")];
  const signinToggle = authForm.querySelector(".auth-signin-only");

  const setAuthMode = (mode) => {
    const isSignup = mode === "signup";
    const isReset = mode === "reset";
    const isSignin = !isSignup && !isReset;
    authForm.elements.mode.value = mode;
    signupFields.forEach((field) => field.classList.toggle("hidden", !isSignup));
    signinToggle.classList.toggle("hidden", !isSignin);
    forgotPasswordButton.style.visibility = isSignin ? "visible" : "hidden";
    authForm.querySelector("button[type='submit']").textContent = isSignup ? "Crear cuenta" : "Entrar";
    message.textContent = "";
  };

  passwordToggles.forEach((toggle) => {
    toggle.addEventListener("click", () => {
      const input = toggle.previousElementSibling;
      const shouldShow = input.type === "password";
      input.type = shouldShow ? "text" : "password";
      toggle.classList.toggle("is-hidden", !shouldShow);
      toggle.setAttribute("aria-label", shouldShow ? "Ocultar contraseña" : "Mostrar contraseña");
      toggle.setAttribute("title", shouldShow ? "Ocultar contraseña" : "Mostrar contraseña");
      input.focus();
    });
  });

  forgotPasswordButton.addEventListener("click", async () => {
    const email = normalizeEmail(authForm.elements.email.value);
    if (!email) {
      message.textContent = "Ingresá tu email para recuperar la contraseña.";
      authForm.elements.email.focus();
      return;
    }

    try {
      const { error } = await supabaseClient.auth.resetPasswordForEmail(email, {
        redirectTo: `${location.origin}${location.pathname}`,
      });

      if (error) {
        message.textContent = error.message || "Error al enviar el correo de recuperación.";
        return;
      }

      message.textContent = "Te enviamos un correo para restablecer tu contraseña. Revisá tu bandeja de entrada y spam.";
    } catch (error) {
      message.textContent = "Error al enviar el correo de recuperación. Inténtalo nuevamente.";
    }
  });

  document.querySelectorAll("[data-auth-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelectorAll("[data-auth-tab]").forEach((item) => item.classList.remove("active"));
      button.classList.add("active");
      setAuthMode(button.dataset.authTab);
    });
  });

 authForm.addEventListener("submit" , async (event) => {
    event.preventDefault();
    const mode = authForm.elements.mode.value;
    const email = normalizeEmail(authForm.elements.email.value);
    const password = authForm.elements.password.value;
    const rememberSession = authForm.elements.rememberSession?.checked ?? true;

    if (mode === "signup") {
      const name = clean(authForm.elements.name.value);
      const birthdate = authForm.elements.birthdate.value;
      const confirmPassword = authForm.elements.confirmPassword.value;
      const emailIsValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
      const passwordMeetsRequirements = password.length >= 8 && /[A-Za-z]/.test(password) && /\d/.test(password);

      if (!name) {
        message.textContent = "Ingresá tu nombre para continuar.";
        return;
      }
      if (!birthdate) {
        message.textContent = "Ingresá tu fecha de nacimiento.";
        return;
      }
      if (!emailIsValid) {
        message.textContent = "Ingresá un correo electrónico válido.";
        return;
      }
      if (!passwordMeetsRequirements) {
        message.textContent = "La contraseña debe tener al menos 8 caracteres, una letra y un número.";
        return;
      }
      if (password !== confirmPassword) {
        message.textContent = "La confirmación de contraseña no coincide.";
        return;
      }
      if (state.users.some((user) => user.email === email)) {
        message.textContent = "Ya existe una cuenta con ese email.";
        return;
      }

      try {
        const result = await createUser(email, password, { name, birthdate, rememberSession });

        if (result.requiresEmailConfirmation) {
          message.textContent = "Cuenta creada. Te enviamos un correo para confirmar tu dirección. Confirmá tu email antes de iniciar sesión. Revisá tu bandeja de entrada y spam.";
          setAuthMode("signin");
          return;
        }

        persist();
        render();
        return;
      } catch (error) {
        message.textContent = error.message || "Error al crear la cuenta. Inténtalo nuevamente.";
        return;
      }
    }

    if (mode === "reset") {
      const user = state.users.find((item) => item.email === email);
      if (!user) {
        message.textContent = "No encontré esa cuenta.";
        return;
      }
      if (!password || password.length < 8) {
        message.textContent = "La nueva contraseña debe tener al menos 8 caracteres.";
        return;
      }
      user.password = password;
      user.resetToken = "";
      user.resetExpiresAt = null;
      state.uiNotice = "Tu contraseña se actualizó correctamente.";
      persist();
      setAuthMode("signin");
      message.textContent = "Contraseña actualizada. Ya podés iniciar sesión.";
      return;
    }

    try {
      await signIn(email, password, { rememberSession });
      render();
    } catch (error) {
      message.textContent = error.message || "Email o contraseña incorrectos.";
      return;
    }
  });

  setAuthMode("signin");
}

function renderGroupStart() {
  app.innerHTML = `
    <section class="group-start">
      <div class="hero-band">
        <div>
          <h2>¿Cómo querés empezar?</h2>
          <p>Creá una lista individual o un espacio compartido. Cada lista tiene su propio inventario y sus categorías.</p>
        </div>
        <img class="hero-illustration" src="./logo.png" alt="Logo de SuperList" />
      </div>
      <div class="two-panels">
        <section class="panel">
          <h2>Crear lista individual</h2>
          <form class="stack-form" data-group-form="create-individual">
            <label class="field">
              <span>Nombre</span>
              <input name="name" placeholder="Mercado" required />
            </label>
            <label class="field emoji-field">
              <span>Emoji</span>
              <input name="emoji" class="emoji-input" placeholder="🛒" value="🛒" />
            </label>
            <button class="primary-button" type="submit">Crear lista</button>
          </form>
        </section>
        <section class="panel">
          <h2>Crear espacio compartido</h2>
          <form class="stack-form" data-group-form="create-shared">
            <label class="field">
              <span>Nombre</span>
              <input name="name" placeholder="Casa" required />
            </label>
            <label class="field emoji-field">
              <span>Emoji</span>
              <input name="emoji" class="emoji-input" placeholder="🏠" value="🏠" />
            </label>
            <button class="secondary-button" type="submit">Crear espacio</button>
          </form>
        </section>
      </div>
    </section>
  `;

  const individualForm = document.querySelector("[data-group-form='create-individual']");
  const sharedForm = document.querySelector("[data-group-form='create-shared']");
  if (individualForm?.elements.emoji) bindEmojiOnlyInput(individualForm.elements.emoji);
  if (sharedForm?.elements.emoji) bindEmojiOnlyInput(sharedForm.elements.emoji);

  individualForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.target;
    await createGroup(form.elements.name.value, form.elements.emoji.value, { type: "individual" });
    currentView = "home";
    render();
  });

  sharedForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.target;
    const newGroup = await createGroup(form.elements.name.value, form.elements.emoji.value, { type: "shared" });
    showInviteCodeMessage(newGroup?.inviteCode);
    currentView = "home";
    render();
  });
}

function renderHome() {
  const currentGroup = getCurrentGroup();
  const groups = recentGroups();
  const notice = state.uiNotice ? `<div class="notice-banner">${escapeHtml(state.uiNotice)}</div>` : "";
  const counts = currentGroup ? countByStatus() : { falta: 0, agotarse: 0, quiero: 0, tengo: 0 };
  const products = currentGroup ? groupProducts() : [];
  const nextShop = products.filter((product) => ["falta", "agotarse"].includes(product.status));

  // Encontrar la lista más reciente
  const getMostRecentGroupId = () => {
    if (!groups.length) return null;
    const getLastProductDate = (group) => {
      if (!group.products.length) return group.createdAt || 0;
      return group.products.reduce((latest, product) => {
        const productDate = new Date(product.createdAt || 0).getTime();
        return productDate > latest ? productDate : latest;
      }, 0);
    };
    const sorted = [...groups].sort((a, b) => getLastProductDate(b) - getLastProductDate(a));
    return sorted[0]?.id || null;
  };
  const mostRecentGroupId = getMostRecentGroupId();

  state.uiNotice = "";
  app.innerHTML = `
    <section class="hero-band">
      <div>
        <h2>${currentUser() ? `Hola ${escapeHtml(getUserDisplayName(currentUser()))}, ¿Qué tenemos que comprar?` : escapeHtml(currentGroup ? currentGroup.name : "Inicio")}</h2>
      </div>
      <img class="hero-illustration" src="./pensando.jpg" alt="Ilustración" />
    </section>

    ${notice}

    <section class="panel">
      <div class="panel-head vertical">
        <h2>Tus listas</h2>
      </div>
      <div class="product-list grid-lists">
        ${groups.length ? groups.map((group) => `
          <article class="product-card list-card ${session.groupId === group.id ? "active" : ""}" role="button" tabindex="0" data-action="select-list" data-id="${group.id}">
            <div class="product-main">
              <div class="product-title-row">
                <span class="group-emoji">${escapeHtml(group.emoji || "🏠")}</span>
                <span class="product-name">${escapeHtml(group.name)}</span>
                ${group.id === mostRecentGroupId ? '<span class="chip active">Reciente</span>' : ''}
              </div>
              <div class="product-meta">
                <span>${group.products.length} artículos</span>
              </div>
            </div>
          </article>
        `).join("") : `<div class="empty-state">Todavía no tenés listas. Creá la primera.</div>`}
      </div>

      <div class="create-list-row">
        <button class="primary-button" type="button" data-action="create-individual-list">Lista individual</button>
        <button class="secondary-button" type="button" data-action="create-shared-list">Lista compartida</button>
        <button class="secondary-button" type="button" data-action="join-with-code">Unirse con código</button>
      </div>
    </section>
    <!-- Próxima compra eliminada según preferencia del usuario -->
  `;

  document.querySelectorAll("[data-status-summary]").forEach((card) => {
    card.addEventListener("click", () => {
      openStatusOverlay(card.dataset.statusSummary);
    });
    card.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        card.click();
      }
    });
  });

  // Ensure clicking the list cards on Home opens that list
  document.querySelectorAll('.product-list .list-card[role="button"]').forEach((el) => {
    el.addEventListener('click', (e) => {
      const id = el.dataset.id;
      if (!id) return;
      const group = state.groups.find((g) => g.id === id);
      if (!group) return;
      session.groupId = id;
      group.lastOpenedAt = new Date().toISOString();
      currentView = "list-detail";
      persist();
      render();
    });
    el.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter' || ev.key === ' ') {
        ev.preventDefault();
        el.click();
      }
    });
  });

  // Ensure create buttons under lists open the create dialog
  document.querySelectorAll('.create-list-row [data-action="create-individual-list"]').forEach((btn) => {
    btn.addEventListener('click', () => openCreateGroup('individual'));
  });
  document.querySelectorAll('.create-list-row [data-action="create-shared-list"]').forEach((btn) => {
    btn.addEventListener('click', () => openCreateGroup('shared'));
  });

  // Open create-group dialog when tapping create buttons on home
  document.querySelectorAll("[data-action='create-individual-list']").forEach((btn) => {
    btn.addEventListener("click", () => openCreateGroup("individual"));
  });
  document.querySelectorAll("[data-action='create-shared-list']").forEach((btn) => {
    btn.addEventListener("click", () => openCreateGroup("shared"));
  });

  bindCommonActions();
}

function renderInventory() {
  const filtered = groupProducts().filter((product) => {
    const matchesSearch = product.name.toLowerCase().includes(searchText.toLowerCase());
    const matchesFilter = currentFilter === "todos" || product.status === currentFilter;
    return matchesSearch && matchesFilter;
  });

  app.innerHTML = `
    <section class="inventory-layout">
      <div class="section-head">
        <h2>Inventario</h2>
        <button class="primary-button" type="button" data-action="add">Agregar</button>
      </div>
      <div class="toolbar">
        <input class="search-input" type="search" value="${escapeHtml(searchText)}" placeholder="Buscar por nombre" aria-label="Buscar por nombre" />
      </div>
      <div class="filter-row">
        ${filterButton("todos", "Todos")}
        ${filterButton("falta", "En falta")}
        ${filterButton("agotarse", "Por agotarse")}
        ${filterButton("quiero", "Quiero")}
        ${filterButton("tengo", "Tengo")}
      </div>
      ${filtered.length ? productList(filtered, { quantity: true }) : empty(groupProducts().length ? "No hay productos con esos filtros." : "Todavía no tenés productos.")}
    </section>
  `;

  document.querySelector(".search-input").addEventListener("input", (event) => {
    searchText = event.target.value;
    renderInventory();
  });
  document.querySelectorAll("[data-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      currentFilter = button.dataset.filter;
      renderInventory();
    });
  });
  bindCommonActions();
}

function renderListDetail() {
  const currentGroup = getCurrentGroup();
  if (!currentGroup) return renderHome();
  
  const counts = countByStatus();
  const products = groupProducts();
  
  app.innerHTML = `
    <section class="panel">
      <div class="panel-head vertical list-detail-header">
        <span class="list-detail-emoji">${escapeHtml(currentGroup.emoji || "🏠")}</span>
        <h2>${escapeHtml(currentGroup.name)}</h2>
      </div>
    </section>

    <section class="summary-grid">
      ${summaryCard("En falta", counts.falta, "status-falta", "falta")}
      ${summaryCard("Por agotarse", counts.agotarse, "status-agotarse", "agotarse")}
      ${summaryCard("Quiero", counts.quiero, "status-quiero", "quiero")}
      ${summaryCard("Tengo", counts.tengo, "status-tengo", "tengo")}
    </section>

    <section class="panel">
      <div class="panel-head vertical">
        <h2>Artículos</h2>
      </div>
      ${products.length ? productList(products, { quantity: true }) : empty("Todavía no tenés artículos en esta lista.")}
    </section>

    ${memberRole(currentGroup) === "admin" ? `
    <section class="panel">
      <button class="danger-button" type="button" data-action="delete-list" data-id="${currentGroup.id}" style="width: 100%; padding: 16px;">Borrar esta lista</button>
    </section>
    ` : ""}

  `;

  document.querySelectorAll("[data-status-summary]").forEach((card) => {
    card.addEventListener("click", () => {
      openStatusOverlay(card.dataset.statusSummary);
    });
    card.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        card.click();
      }
    });
  });

  bindCommonActions();
}

function renderShopping() {
  const products = groupProducts();
  const groups = {
    "Necesario": products.filter((product) => product.status === "falta"),
    "Conviene comprar": products.filter((product) => product.status === "agotarse"),
    "Opcional": products.filter((product) => product.status === "quiero"),
  };
  const allShopping = Object.values(groups).flat();

  app.innerHTML = `
    <section class="shopping-layout">
      <div class="section-head">
        <h2>Compra</h2>
        <button class="mode-toggle ${marketMode ? "active" : ""}" type="button" data-action="toggle-market">
          Modo supermercado
        </button>
      </div>
      ${
        marketMode
          ? marketModeView(allShopping)
          : products.length
            ? `<div class="shopping-sections">${Object.entries(groups).map(([title, items]) => shoppingPanel(title, items)).join("")}</div>`
            : firstEmptyState()
      }
    </section>
  `;
  bindCommonActions();
}

function renderLists() {
  const user = currentUser();
  if (!user) return;
  const groups = userGroups();

  // Encontrar la lista más reciente
  const getMostRecentGroupId = () => {
    if (!groups.length) return null;
    const getLastProductDate = (group) => {
      if (!group.products.length) return group.createdAt || 0;
      return group.products.reduce((latest, product) => {
        const productDate = new Date(product.createdAt || 0).getTime();
        return productDate > latest ? productDate : latest;
      }, 0);
    };
    const sorted = [...groups].sort((a, b) => getLastProductDate(b) - getLastProductDate(a));
    return sorted[0]?.id || null;
  };
  const mostRecentGroupId = getMostRecentGroupId();

  // Si no hay grupos, mostrar estado vacío con opciones
  if (!groups.length) {
    app.innerHTML = `
      <section class="settings-layout lists-layout">
        <section class="panel lists-overview-panel">
          <div class="panel-head vertical">
            <p class="eyebrow">Mis listas</p>
            <h2>Gestioná tus listas</h2>
          </div>
          <img class="lists-illustration" src="./SUPERMERCADO.png" alt="Supermercado" />
          <div class="product-list lists-state">
            ${empty("Todavía no tenés listas. Creá la primera o unite con un código.")}
          </div>
          <div class="create-list-row">
            <button class="secondary-button" type="button" data-action="join-with-code">Unirse con código</button>
          </div>
        </section>

        <section class="panel create-list-panel">
          <div class="panel-head vertical">
            <h2>Crear lista</h2>
          </div>
          <form class="stack-form" id="create-list-form">
            <div class="field-grid">
              <label class="field">
                <span>Nombre</span>
                <input name="name" placeholder="Mercado" required />
              </label>
              <div class="field">
                <span>Tipo</span>
                <fieldset class="type-picker" role="radiogroup" aria-label="Tipo de lista">
                  <label class="type-option individual"><input type="radio" name="type" value="individual" checked /><span>Lista individual</span></label>
                  <label class="type-option shared"><input type="radio" name="type" value="shared" /><span>Lista compartida</span></label>
                </fieldset>
              </div>
            </div>
            <label class="field emoji-field">
              <span>Emoji</span>
              <input name="emoji" class="emoji-input" maxlength="2" placeholder="🛒" value="🛒" />
            </label>
            <button class="primary-button" type="submit">Crear lista</button>
          </form>
        </section>
      </section>
    `;
    const createListForm = document.querySelector("#create-list-form");
    const emojiInput = createListForm?.elements.emoji;
    if (emojiInput) bindEmojiOnlyInput(emojiInput);
    bindCommonActions();
    return;
  }

  app.innerHTML = `
    <section class="settings-layout lists-layout">
      <section class="panel lists-overview-panel">
        <div class="panel-head vertical">
          <p class="eyebrow">Mis listas</p>
          <h2>Gestioná tus listas</h2>
        </div>
        <img class="lists-illustration" src="./SUPERMERCADO.png" alt="Supermercado" />
        <div class="product-list lists-state">
          ${groups.length ? groups.map((group) => `
            <article class="product-card list-card ${session.groupId === group.id ? "active" : ""}">
              <div class="product-main">
                <div class="product-title-row">
                  <button class="group-emoji-button" type="button" data-action="edit-group-emoji" data-id="${group.id}" aria-label="Cambiar emoji de ${escapeHtml(group.name)}">${escapeHtml(group.emoji || "🏠")}</button>
                  <span class="product-name">${escapeHtml(group.name)}</span>
                  ${group.id === mostRecentGroupId ? '<span class="chip active">Reciente</span>' : ""}
                </div>
                <div class="product-meta">
                  <span>${escapeHtml(group.members.length)} miembros</span>
                  ${group.type === "shared" && group.inviteCode ? `<span>${escapeHtml(group.inviteCode)}</span>` : ""}
                </div>
              </div>
              <div class="product-actions compact-actions">
                <button class="secondary-button" type="button" data-action="select-list" data-id="${group.id}">Abrir</button>
                ${memberRole(group) === "admin" ? `<button class="danger-button danger-inline" type="button" data-action="delete-list" data-id="${group.id}">Borrar</button>` : ""}
              </div>
            </article>
          `).join("") : empty("Todavía no tenés listas. Creá la primera.")}
        </div>
        <div class="create-list-row">
          <button class="secondary-button" type="button" data-action="join-with-code">Unirse con código</button>
        </div>
      </section>

      <section class="panel create-list-panel">
        <div class="panel-head vertical">
          <h2>Crear lista</h2>
        </div>
        <form class="stack-form" id="create-list-form">
          <div class="field-grid">
            <label class="field">
              <span>Nombre</span>
              <input name="name" placeholder="Mercado" required />
            </label>
            <div class="field">
              <span>Tipo</span>
              <fieldset class="type-picker" role="radiogroup" aria-label="Tipo de lista">
                <label class="type-option individual"><input type="radio" name="type" value="individual" checked /><span>Lista individual</span></label>
                <label class="type-option shared"><input type="radio" name="type" value="shared" /><span>Espacio compartido</span></label>
              </fieldset>
            </div>
          </div>
          <label class="field emoji-field">
            <span>Emoji</span>
            <input name="emoji" class="emoji-input" maxlength="2" placeholder="🛒" value="🛒" />
          </label>
          <button class="primary-button" type="submit">Crear lista</button>
        </form>
      </section>
    </section>
  `;

  const createListForm = document.querySelector("#create-list-form");
  const emojiInput = createListForm?.elements.emoji;
  if (emojiInput) bindEmojiOnlyInput(emojiInput);

  bindCommonActions();
}

function renderSettings() {
  const group = getCurrentGroup();
  const user = currentUser();
  const role = memberRole(group);

  const groupSection = group ? `
      <section class="panel">
        <div class="panel-head vertical">
          <div>
            <p class="eyebrow">Lista actual</p>
            <h2>${escapeHtml(group.name)}</h2>
          </div>
          <span class="chip">${role}</span>
        </div>
        ${group.type === "shared" && group.inviteCode ? `
        <div class="invite-box">
          <span>Código de invitación</span>
          <strong>${escapeHtml(group.inviteCode)}</strong>
        </div>
        ` : `
        <div class="invite-box">
          <span>Tipo de lista</span>
          <strong>Lista individual</strong>
        </div>
        `}
        <h3>Miembros</h3>
        <div class="product-list">
          ${group.members.map((member) => memberRow(member, group)).join("")}
        </div>
      </section>
  ` : `
      <section class="panel">
        <div class="panel-head vertical">
          <div>
            <p class="eyebrow">Grupo actual</p>
            <h2>No tenés una lista creada</h2>
          </div>
        </div>
        <p style="color: var(--text-muted);">Seleccioná o creá una lista desde "Mis listas" para ver los detalles.</p>
      </section>
  `;

  app.innerHTML = `
    <section class="settings-layout">
      <section class="panel account-panel">
        <div class="account-header">
          <div class="account-info">
            <p class="eyebrow">Sesión</p>
            <h2>${escapeHtml(getUserDisplayName(user))}</h2>
            <div class="account-meta">
              <span>${escapeHtml(user.email)}</span>
              ${user.birthdate ? `<span>Fecha de nacimiento: ${escapeHtml(formatDate(user.birthdate))}</span>` : ""}
            </div>
          </div>
          <div class="account-actions">
            
            <button class="secondary-button" type="button" data-action="edit-profile">Editar perfil</button>
            <button class="secondary-button" type="button" data-action="change-password">Cambiar contraseña</button>
            <button class="danger-button logout-button" type="button" data-action="logout">Cerrar sesión</button>
          </div>
        </div>
      </section>
      ${groupSection}
    </section>
  `;
  bindCommonActions();
}

function memberRow(member, group) {
  const user = state.users.find((item) => item.id === member.userId);
  const displayName = member.name || user?.name || member.email || user?.email || "Usuario";
  const displayEmail = member.email || user?.email || "";
  const canRemove = memberRole(group) === "admin" && member.userId !== currentUser()?.id;
  return `
    <article class="product-card">
      <div>
        <div class="product-name">${escapeHtml(displayName)}</div>
        <div class="product-meta"><span>${escapeHtml(member.role)}</span>${displayEmail && displayEmail !== displayName ? `<span>${escapeHtml(displayEmail)}</span>` : ""}</div>
      </div>
      ${canRemove ? `<button class="danger-button" type="button" data-action="remove-member" data-id="${member.userId}">✖</button>` : ""}
    </article>
  `;
}

function summaryCard(label, count, className, status = "") {
  return `
    <article class="summary-card ${className}" data-status-summary="${status}" tabindex="0" role="button" aria-label="Ver productos en ${label}">
      <strong>${count}</strong>
      <span>${label}</span>
    </article>
  `;
}

function openStatusOverlay(status) {
  const overlay = document.querySelector("#status-overlay");
  const title = document.querySelector("#status-overlay-title");
  const body = document.querySelector("#status-overlay-body");
  if (!overlay || !title || !body) return;

  const products = groupProducts().filter((product) => product.status === status);
  const label = STATUSES[status]?.label || "Productos";
  overlayState = { open: true, previousView: currentView, status };
  currentFilter = status;
  title.textContent = label;
  body.innerHTML = products.length ? productList(products, { compact: true }) : empty("No hay productos en este estado.");
  overlay.hidden = false;
  overlay.classList.add("is-open");
  bindCommonActions();
}

function closeStatusOverlay() {
  const overlay = document.querySelector("#status-overlay");
  if (!overlay) return;

  const previousView = overlayState.previousView;
  overlay.classList.remove("is-open");
  overlay.hidden = true;
  currentFilter = "todos";
  currentView = previousView;
  overlayState = { open: false, previousView: "home", status: null };
  render();
}

function countByStatus() {
  return Object.keys(STATUSES).reduce((counts, status) => {
    counts[status] = groupProducts().filter((product) => product.status === status).length;
    return counts;
  }, {});
}

function filterButton(status, label) {
  return `<button class="filter-button ${currentFilter === status ? "active" : ""}" type="button" data-filter="${status}">${label}</button>`;
}

function productList(items, options = {}) {
  return `<div class="product-list">${items.map((product) => productCard(product, options)).join("")}</div>`;
}

function productCard(product, options = {}) {
  const status = STATUSES[product.status] || STATUSES.tengo;
  const quantity = [product.quantity, product.unit].filter(Boolean).join(" ");
  const note = product.note ? `<span>${escapeHtml(product.note)}</span>` : "";
  const quantityTools = options.quantity && isNumeric(product.quantity)
    ? `<span class="quantity-tools"><button type="button" data-action="decrease" data-id="${product.id}" aria-label="Disminuir">-</button><button type="button" data-action="increase" data-id="${product.id}" aria-label="Aumentar">+</button></span>`
    : "";
  const addedBy = getCurrentGroup()?.type === "shared" && product.addedByName ? `<span>Agregado por: ${escapeHtml(product.addedByName)}</span>` : "";

  return `
    <article class="product-card">
      <div class="product-main">
        <div class="product-title-row">
          <span class="product-name">${escapeHtml(product.name)}</span>
          <button class="status-pill ${status.className}" type="button" data-action="cycle" data-id="${product.id}" title="Cambiar estado">${status.short}</button>
        </div>
        <div class="product-meta">
          ${quantity ? `<span>${escapeHtml(quantity)}</span>` : ""}
          <span>${escapeHtml(product.category || "Otros")}</span>
          ${product.brand ? `<span>${escapeHtml(product.brand)}</span>` : ""}
          ${product.expiry ? `<span>Vence ${formatDate(product.expiry)}</span>` : ""}
          ${note}
          ${addedBy}
        </div>
      </div>
      <div class="product-actions">
        ${quantityTools}
        ${["falta", "agotarse", "quiero"].includes(product.status) ? `<button class="quick-button" type="button" data-action="bought" data-id="${product.id}">Comprado</button>` : ""}
        <button class="secondary-button" type="button" data-action="edit" data-id="${product.id}">Detalles</button>
        <button class="danger-button danger-inline" type="button" data-action="delete" data-id="${product.id}">✖</button>
      </div>
    </article>
  `;
}

function shoppingPanel(title, items) {
  return `
    <section class="panel">
      <div class="list-head">
        <h3>${title}</h3>
        <span class="chip">${items.length}</span>
      </div>
      ${items.length ? productList(items, { compact: true }) : empty("Sin productos")}
    </section>
  `;
}

function marketModeView(items) {
  if (!items.length) return empty("La lista de compra está vacía.");
  const grouped = groupBy(items, "category");
  return `
    <section class="panel">
      <div class="panel-head vertical">
        <h2>Modo supermercado</h2>
        <button class="primary-button" type="button" data-action="finish-shopping">Finalizar compra</button>
      </div>
      <div class="category-group">
        ${Object.entries(grouped)
          .map(([category, productsByCategory]) => `
            <h3 class="category-title">${escapeHtml(category)}</h3>
            ${productsByCategory.map((product) => marketCard(product)).join("")}
          `)
          .join("")}
      </div>
    </section>
  `;
}

function marketCard(product) {
  const quantity = [product.quantity, product.unit].filter(Boolean).join(" ");
  return `
    <label class="product-card market-card">
      <input class="market-check" type="checkbox" data-action="select-shop" data-id="${product.id}" ${selectedShoppingIds.has(product.id) ? "checked" : ""} />
      <span class="product-main">
        <span class="product-title-row">
          <span class="product-name">${escapeHtml(product.name)}</span>
          <span class="status-pill ${STATUSES[product.status].className}">${STATUSES[product.status].short}</span>
        </span>
        <span class="product-meta">${quantity ? `<span>${escapeHtml(quantity)}</span>` : ""}</span>
      </span>
    </label>
  `;
}

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
      if (action === "edit-group-emoji") {
        const group = state.groups.find((item) => item.id === id);
        if (!group) return;
        pendingEditGroupId = id;
        const form = editGroupForm;
        if (!form) return;
        form.elements.id.value = group.id;
        form.elements.name.value = group.name;
        form.elements.emoji.value = group.emoji || "🏠";
        bindEmojiOnlyInput(form.elements.emoji);
        editGroupDialog?.showModal();
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
      if (action === "remove-member") await removeMember(id);
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

  await runSupabase(supabaseClient.from(PRODUCTS_TABLE).delete().eq("id", id), "No se pudo borrar el producto.");
  group.products = group.products.filter((item) => item.id !== id);
  selectedShoppingIds.delete(id);
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

async function removeMember(userId) {
  const group = getCurrentGroup();
  if (memberRole(group) !== "admin") return;
  await runSupabase(
    supabaseClient.from(MEMBERS_TABLE).delete().eq("group_id", group.id).eq("user_id", userId),
    "No se pudo quitar el miembro."
  );
  group.members = group.members.filter((member) => member.userId !== userId);
  persist();
  renderSettings();
}

function firstEmptyState() {
  return `
    <div class="empty-state empty-large">
      <strong>Todavía no tenés productos.</strong>
      <span>Agregá el primero cuando quieras empezar a ordenar tu casa.</span>
      <button class="primary-button" type="button" data-action="add">+ Agregar producto</button>
    </div>
  `;
}

function empty(message) {
  return `<div class="empty-state">${message}</div>`;
}

function groupBy(items, key) {
  return items.reduce((groups, item) => {
    const group = item[key] || "Otros";
    groups[group] = groups[group] || [];
    groups[group].push(item);
    return groups;
  }, {});
}

function isNumeric(value) {
  return Number.isFinite(Number(String(value).replace(",", ".")));
}

function formatDate(value) {
  if (!value) return "";
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

// Inicialización de la aplicación y carga reactiva de datos reales desde Supabase
async function initApp() {
  try {
    const { data: { session: currentSession } } = await supabaseClient.auth.getSession();
    await refreshCurrentUser();

    if (currentSession && currentSession.access_token && !currentUser()) {
      renderPasswordReset();
      return;
    }

    if (currentUser()) {
      await loadAppData();
      setupRealtimeSubscription();
    }
  } catch (error) {
    console.error("Error al inicializar la aplicación:", error);
  } finally {
    render();
  }
}

initApp();

// Listener de cambios de autenticación de Supabase
supabaseClient.auth.onAuthStateChange(async (event, currentSession) => {
  if (event === "PASSWORD_RECOVERY") {
    renderPasswordReset();
    return;
  }

  if (event === "SIGNED_IN") {
    await refreshCurrentUser();
    if (currentUser()) {
      await loadAppData();
      setupRealtimeSubscription();
      render();
    }
  } else if (event === "SIGNED_OUT") {
    cachedSupabaseUser = null;
    cleanupRealtimeSubscription();
    session = { userId: null, groupId: null, remember: false };
    state = loadState();
    render();
  } else if (event === "USER_UPDATED") {
    await refreshCurrentUser();
    render();
  }
});

// ==============================================================================
// Registro de Service Worker para PWA (Instalable en móviles y desktop)
// ==============================================================================
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("./sw.js")
      .then((reg) => {
        reg.onupdatefound = () => {
          const installingWorker = reg.installing;
          if (installingWorker) {
            installingWorker.onstatechange = () => {
              if (installingWorker.state === "installed" && navigator.serviceWorker.controller) {
                console.log("Nueva versión de SuperList disponible en caché.");
              }
            };
          }
        };
      })
      .catch((err) => {
        console.warn("No se pudo registrar el ServiceWorker:", err);
      });
  });
}

// Soporte para instalación de PWA en móviles y navegador
let deferredInstallPrompt = null;
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
});

window.addEventListener("appinstalled", () => {
  deferredInstallPrompt = null;
  showNotification("¡SuperList se instaló correctamente en tu dispositivo!", "success");
});

window.triggerInstallPWA = async function() {
  if (deferredInstallPrompt) {
    deferredInstallPrompt.prompt();
    const { outcome } = await deferredInstallPrompt.userChoice;
    if (outcome === "accepted") {
      deferredInstallPrompt = null;
    }
  } else {
    // Si no está el prompt nativo de Chromium (ej. iOS Safari o ya instalada)
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    if (isIOS) {
      showNotification("Para instalar en iPhone: tocá el botón Compartir (icono con flecha hacia arriba) y elegí 'Agregar a pantalla de inicio'.", "info");
    } else {
      showNotification("Para instalar: abrí el menú (tres puntos) de tu navegador y elegí 'Instalar aplicación' o 'Agregar a la pantalla principal'.", "info");
    }
  }
};

