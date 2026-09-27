const APP_KEY = "superlist-state-v2";
const SESSION_KEY = "superlist-session-v2";
const GROUPS_TABLE = "shopping_groups";
const MEMBERS_TABLE = "shopping_group_members";
const PRODUCTS_TABLE = "shopping_products";
const PROFILES_TABLE = "profiles";

// ==============================================================================
// SISTEMA DE TEMAS Y PALETAS
// Unico punto de entrada: applyTheme() y applyPalette().
// La preferencia manual (superlist_theme_mode) tiene prioridad sobre la
// deteccion automatica del dispositivo (prefers-color-scheme: dark).
// ==============================================================================
const THEME_MODE_KEY = "superlist_theme_mode";      // "light" | "dark" | "auto"
const THEME_PALETTE_KEY = "superlist_theme_palette"; // id de THEME_PALETTES

// Modos de tema. El icono se dibuja con SVG en linea (themeModeIcon) para no
// depender de la fuente de emoji del sistema.
const THEME_MODES = [
  { id: "light", label: "Claro" },
  { id: "dark", label: "Oscuro" },
  { id: "auto", label: "Automático" },
];

// Paletas, cada una con su version clara y su version nocturna.
// "verde" es la original de SuperList y la que se aplica por defecto (automatica);
// las demas solo entran si el usuario las elige explicitamente.
// El color se muestra con un cuadradito (.theme-swatch), no hace falta emoji.
// Cada paleta ademas define --text-*: su color de texto con 18% de tinte del
// acento mezclado con el gris base, validado con WCAG AA en ambos modos.
const THEME_PALETTES = [
  { id: "verde",    label: "Verde",    light: "#517d49", dark: "#5b8e52" },
  { id: "lila",     label: "Lila",     light: "#8365a5", dark: "#8f77ab" },
  { id: "rojo",     label: "Rojo",     light: "#b0594c", dark: "#b76e63" },
  { id: "rosa",     label: "Rosa",     light: "#a8496b", dark: "#c86d8f" },
  { id: "azul",     label: "Azul",     light: "#4b7892", dark: "#5887a2" },
  { id: "turquesa", label: "Turquesa", light: "#3b7d76", dark: "#478d86" },
  { id: "naranja",  label: "Naranja",  light: "#9f6538", dark: "#b07344" },
  { id: "amarillo", label: "Amarillo", light: "#886f30", dark: "#997e3b" },
];

const DEFAULT_PALETTE = "verde";
const DARK_QUERY = "(prefers-color-scheme: dark)";

const darkMediaQuery =
  typeof window.matchMedia === "function" ? window.matchMedia(DARK_QUERY) : null;

function readStoredThemeMode() {
  try {
    const value = localStorage.getItem(THEME_MODE_KEY);
    return THEME_MODES.some((mode) => mode.id === value) ? value : "auto";
  } catch (error) {
    return "auto";
  }
}

function readStoredPalette() {
  try {
    const value = localStorage.getItem(THEME_PALETTE_KEY);
    return THEME_PALETTES.some((palette) => palette.id === value) ? value : DEFAULT_PALETTE;
  } catch (error) {
    return DEFAULT_PALETTE;
  }
}

// "auto" delega en el dispositivo; "light"/"dark" son la eleccion manual.
function resolveThemeMode(mode) {
  if (mode === "light" || mode === "dark") return mode;
  return darkMediaQuery && darkMediaQuery.matches ? "dark" : "light";
}

function getActiveThemeMode() {
  return resolveThemeMode(readStoredThemeMode());
}

function getActivePalette() {
  return readStoredPalette();
}

function getPaletteById(id) {
  return THEME_PALETTES.find((palette) => palette.id === id) || THEME_PALETTES[0];
}

// Aplica el modo (claro/oscuro). No guarda nada: solo resuelve y refleja.
function applyTheme() {
  const mode = getActiveThemeMode();
  const root = document.documentElement;
  root.setAttribute("data-theme", mode);
  root.style.colorScheme = mode;
  syncThemeColorMeta(mode);
  // El boton flotante depende del modo resuelto: se refresca aqui para que
  // tambien quede al dia cuando el sistema cambia en modo "auto".
  if (typeof updateThemeButton === "function") updateThemeButton();
  return mode;
}

// Aplica la paleta elegida y la persiste localmente.
function applyPalette(id) {
  const palette = getPaletteById(id);
  document.documentElement.setAttribute("data-palette", palette.id);
  try {
    localStorage.setItem(THEME_PALETTE_KEY, palette.id);
  } catch (error) {
    console.warn("No se pudo guardar la paleta:", error);
  }
  if (typeof updateThemeButton === "function") updateThemeButton();
  return palette;
}

// Guarda la preferencia manual de modo y la aplica de inmediato.
function setThemeMode(mode) {
  if (!THEME_MODES.some((item) => item.id === mode)) return getActiveThemeMode();
  try {
    localStorage.setItem(THEME_MODE_KEY, mode);
  } catch (error) {
    console.warn("No se pudo guardar el modo de tema:", error);
  }
  return applyTheme();
}

// Mantiene la barra del navegador / PWA alineada con el modo actual.
function syncThemeColorMeta(mode) {
  let meta = document.querySelector('meta[name="theme-color"]');
  if (!meta) {
    meta = document.createElement("meta");
    meta.setAttribute("name", "theme-color");
    document.head.appendChild(meta);
  }
  meta.setAttribute("content", mode === "dark" ? "#191713" : "#f8f5ee");
}

// Si el usuario esta en "auto", reacciona a los cambios del sistema.
function watchSystemTheme() {
  if (!darkMediaQuery) return;
  const handler = () => {
    if (readStoredThemeMode() === "auto") applyTheme();
  };
  if (typeof darkMediaQuery.addEventListener === "function") {
    darkMediaQuery.addEventListener("change", handler);
  } else if (typeof darkMediaQuery.addListener === "function") {
    darkMediaQuery.addListener(handler);
  }
}

// ------------------------------------------------------------------------------
// Iconos de los modos de tema, en SVG en linea. Se usan en vez de emoji para no
// depender de la fuente del sistema: el sol y la luna se ven siempre iguales.
// ------------------------------------------------------------------------------
function themeModeIcon(id) {
  const svg = (paths) => `
    <svg class="theme-mode-icon" viewBox="0 0 24 24" width="18" height="18"
         fill="none" stroke="currentColor" stroke-width="2"
         stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
      ${paths}
    </svg>`;

  if (id === "dark") {
    return svg('<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />');
  }
  if (id === "auto") {
    return svg('<rect x="6" y="2" width="12" height="20" rx="2.5" />' + '<path d="M10.5 18.5h3" />');
  }
  return svg(
    '<circle cx="12" cy="12" r="4.2" />' +
      '<path d="M12 2.4v2.2M12 19.4v2.2M4.2 12H2M22 12h-2.2M5.8 5.8 4.2 4.2M19.8 19.8l-1.6-1.6M18.2 5.8l1.6-1.6M4.2 19.8l1.6-1.6" />'
  );
}

// Tarjeta de acceso a la personalizacion, usada en Inicio. Muestra el estado
// actual (cuadradito de la paleta + modo) y abre el dialogo al tocarla.
function themeEntryMarkup() {
  const palette = getPaletteById(getActivePalette());
  const dark = getActiveThemeMode() === "dark";
  const modeText = readStoredThemeMode() === "auto" ? "Automático" : dark ? "Oscuro" : "Claro";
  return `
    <button class="theme-entry" type="button" data-open-theme
            aria-label="Personalizar el tema. Actual: ${escapeHtml(palette.label)}, ${escapeHtml(modeText.toLowerCase())}">
      <span class="theme-swatch theme-entry-swatch"
            style="--swatch-light:${palette.light}; --swatch-dark:${palette.dark}; background:${palette.light};"
            aria-hidden="true"></span>
      <span class="theme-entry-text">
        <strong>Personalizar la app</strong>
        <span>${escapeHtml(palette.label)} · ${escapeHtml(modeText)}</span>
      </span>
      <span class="theme-entry-chevron" aria-hidden="true">›</span>
    </button>`;
}

// Arranque: aplica la preferencia guardada (o la del dispositivo) sin parpadeo.
function initTheme() {
  applyTheme();
  applyPalette(getActivePalette());
  watchSystemTheme();
  updateThemeButton();

  // No hay boton flotante: el acceso al tema vive en Inicio y en Mi cuenta, y
  // ambas vistas se re-renderizan. Se engancha una sola vez por delegacion.
  if (!document.documentElement.dataset.themeBound) {
    document.documentElement.dataset.themeBound = "1";
    document.addEventListener("click", (event) => {
      if (event.target.closest("[data-open-theme]")) openThemeDialog();
    });
  }
}


const supabaseClient = window.supabase.createClient(
  "https://ismweucgziipplsnkwuh.supabase.co",
  "sb_publishable_BdLR3gchcohSMV7VefHQMw_lgnIph5U"
);

const PRODUCTION_URL = "https://fati20sc.github.io/SuperList/";

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
    background: ${type === "error" ? "var(--danger-bg)" : type === "success" ? "var(--accent)" : "var(--text)"};
    color: ${type === "error" ? "var(--danger-ink)" : type === "success" ? "var(--on-solid)" : "var(--surface)"};
    padding: 16px 24px;
    border-radius: 12px;
    box-shadow: var(--shadow-dialog);
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

// ==============================================================================
// Sistema de Notificaciones Internas para Listas Compartidas
// ==============================================================================
function getNotificationsStorageKey() {
  const user = currentUser();
  return user ? `superlist-notifications-v2-${user.id}` : "superlist-notifications-v2-anon";
}

function loadStoredNotifications() {
  try {
    const raw = localStorage.getItem(getNotificationsStorageKey());
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

function saveNotifications() {
  try {
    localStorage.setItem(getNotificationsStorageKey(), JSON.stringify(state.notifications || []));
  } catch (e) {
    console.warn("No se pudieron guardar las notificaciones:", e);
  }
}

function updateNotificationBadge() {
  const notifs = state.notifications || [];
  const unreadCount = notifs.filter((n) => !n.read).length;

  const bellBadge = document.querySelector("#notification-badge");
  if (bellBadge) {
    if (unreadCount > 0) {
      bellBadge.textContent = unreadCount > 99 ? "99+" : String(unreadCount);
      bellBadge.style.display = "inline-flex";
    } else {
      bellBadge.style.display = "none";
    }
  }

  const menuBadge = document.querySelector("#menu-notification-badge");
  if (menuBadge) {
    if (unreadCount > 0) {
      menuBadge.textContent = unreadCount > 99 ? "99+" : String(unreadCount);
      menuBadge.style.display = "inline-flex";
    } else {
      menuBadge.style.display = "none";
    }
  }

  const bellBtn = document.querySelector("#notification-bell");
  if (bellBtn) {
    bellBtn.style.display = currentUser() ? "inline-flex" : "none";
  }
}

function addNotification(notification) {
  if (!notification || !notification.id) return;
  if (!Array.isArray(state.notifications)) {
    state.notifications = [];
  }

  // De-duplicación estricta por ID o dedupKey para evitar duplicados entre Realtime y local
  const exists = state.notifications.some(
    (n) => n.id === notification.id || (notification.dedupKey && n.dedupKey === notification.dedupKey)
  );
  if (exists) return;

  state.notifications.unshift(notification);
  if (state.notifications.length > 100) {
    state.notifications = state.notifications.slice(0, 100);
  }

  saveNotifications();
  updateNotificationBadge();

  if (currentView === "notifications") {
    renderNotifications();
  }
}

function markAllRead() {
  if (!Array.isArray(state.notifications)) return;
  state.notifications = state.notifications.map((n) => ({ ...n, read: true }));
  saveNotifications();
  updateNotificationBadge();
  if (currentView === "notifications") {
    renderNotifications();
  }
}

function clearHistory() {
  state.notifications = [];
  saveNotifications();
  updateNotificationBadge();
  if (currentView === "notifications") {
    renderNotifications();
  }
}

function markNotificationRead(id) {
  if (!Array.isArray(state.notifications) || !id) return;
  let changed = false;
  state.notifications = state.notifications.map((n) => {
    if (n.id === id && !n.read) {
      changed = true;
      return { ...n, read: true };
    }
    return n;
  });
  if (changed) {
    saveNotifications();
    updateNotificationBadge();
    if (currentView === "notifications") {
      renderNotifications();
    }
  }
}

function formatTimeAgo(isoString) {
  if (!isoString) return "";
  const date = new Date(isoString);
  const now = new Date();
  const diffSec = Math.floor((now.getTime() - date.getTime()) / 1000);
  if (isNaN(diffSec) || diffSec < 45) return "Hace un momento";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `Hace ${diffMin} min`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `Hace ${diffHours} h`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return "Ayer";
  if (diffDays < 7) return `Hace ${diffDays} días`;
  return `${date.getDate().toString().padStart(2, "0")}/${(date.getMonth() + 1).toString().padStart(2, "0")}/${date.getFullYear()}`;
}

async function broadcastGroupNotification(notification) {
  if (!notification) return;
  try {
    if (realtimeChannel) {
      await realtimeChannel.send({
        type: "broadcast",
        event: "group_notification",
        payload: notification,
      });
    }
  } catch (err) {
    console.warn("No se pudo transmitir notificación realtime:", err);
  }
}

function handleIncomingNotification(payload) {
  if (!payload || !payload.id) return;
  const user = currentUser();
  if (!user) return;
  // No notificar al propio autor de la acción
  if (payload.actorId && payload.actorId === user.id) return;
  // Solo notificar si el usuario pertenece al grupo
  const isMember = (state.groups || []).some((g) => g.id === payload.groupId);
  if (!isMember) return;

  const exists = (state.notifications || []).some(
    (n) => n.id === payload.id || (payload.dedupKey && n.dedupKey === payload.dedupKey)
  );
  if (exists) return;

  addNotification(payload);
  showNotification(payload.message || payload.title, "info");
}

function renderNotifications() {
  const user = currentUser();
  if (!user) return;
  const notifs = state.notifications || [];
  const unreadCount = notifs.filter((n) => !n.read).length;

  app.innerHTML = `
    <section class="settings-layout notifications-layout" style="max-width: 680px; margin: 0 auto; width: 100%;">
      <section class="panel">
        <div class="panel-head" style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px; margin-bottom: 16px;">
          <div>
            <p class="eyebrow">Listas compartidas</p>
            <h2 style="margin: 0;">Notificaciones</h2>
          </div>
          <div style="display: flex; gap: 8px; flex-wrap: wrap;">
            <button class="secondary-button" type="button" id="mark-all-read-btn" style="font-size: 0.82rem; padding: 7px 12px;" ${unreadCount === 0 ? "disabled" : ""}>
              ✓ Marcar leídas
            </button>
            <button class="secondary-button" type="button" id="clear-notifications-btn" style="font-size: 0.82rem; padding: 7px 12px; color: var(--tomato); border-color: var(--line);" ${notifs.length === 0 ? "disabled" : ""}>
              Limpiar historial
            </button>
          </div>
        </div>

        ${unreadCount > 0 ? `
          <div style="background: var(--sage-soft); color: var(--ink); padding: 8px 14px; border-radius: 8px; font-size: 0.88rem; font-weight: 600; margin-bottom: 14px; display: flex; align-items: center; justify-content: space-between;">
            <span>Tenés ${unreadCount} notificación${unreadCount === 1 ? "" : "es"} sin leer</span>
            <span style="font-size: 0.78rem; font-weight: normal; opacity: 0.8;">Tocá una para marcarla como leída</span>
          </div>
        ` : ""}

        ${notifs.length === 0 ? `
          <div class="product-list lists-state">
            ${empty("No tenés notificaciones aún. Los cambios en listas compartidas aparecerán acá.")}
          </div>
        ` : `
          <div class="product-list" style="display: flex; flex-direction: column; gap: 10px;">
            ${notifs.map((n) => {
              const isUnread = !n.read;
              const typeIcon = n.type === "product_added" ? "🛒" :
                               n.type === "product_deleted" ? "🗑️" :
                               n.type === "product_status" ? "🔄" :
                               n.type === "product_bought" ? "✅" :
                               n.type === "member_joined" ? "👥" : "📌";
              return `
                <div class="product-card notification-card" data-notification-id="${escapeHtml(n.id)}" role="button" tabindex="0" style="cursor: pointer; transition: all 0.2s ease; border-left: 4px solid ${isUnread ? "var(--accent)" : "transparent"}; background: ${isUnread ? "var(--surface)" : "var(--glass-read)"}; display: flex; align-items: flex-start; gap: 12px; padding: 12px 14px;">
                  <div style="font-size: 1.4rem; line-height: 1; flex-shrink: 0; padding-top: 2px;">${typeIcon}</div>
                  <div class="product-main" style="flex: 1; min-width: 0;">
                    <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 4px;">
                      <span style="font-weight: ${isUnread ? "750" : "600"}; font-size: 0.95rem; color: var(--ink);">
                        ${escapeHtml(n.title || "Notificación")}
                      </span>
                      <span style="font-size: 0.78rem; color: var(--muted); white-space: nowrap;">
                        ${formatTimeAgo(n.timestamp)}
                      </span>
                    </div>
                    <p style="margin: 0 0 6px 0; font-size: 0.9rem; color: ${isUnread ? "var(--ink)" : "var(--muted)"}; line-height: 1.4;">
                      ${escapeHtml(n.message || "")}
                    </p>
                    <div class="product-meta" style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                      ${n.groupName ? `<span class="chip" style="font-size: 0.75rem; padding: 2px 8px; min-height: unset;">🏠 ${escapeHtml(n.groupName)}</span>` : ""}
                      ${n.actorName ? `<span style="font-size: 0.78rem; color: var(--muted);">Por: ${escapeHtml(n.actorName)}</span>` : ""}
                      ${isUnread ? `<span style="margin-left: auto; width: 8px; height: 8px; border-radius: 50%; background: var(--sage); display: inline-block;" title="No leída"></span>` : `<span style="margin-left: auto; font-size: 0.75rem; color: var(--muted);">Leída</span>`}
                    </div>
                  </div>
                </div>
              `;
            }).join("")}
          </div>
        `}
      </section>
    </section>
  `;
}

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
    <div id="invite-code-display" style="background: var(--surface-3); padding: 20px; border-radius: 16px; font-size: 32px; font-weight: bold; letter-spacing: 4px; margin-bottom: 20px; cursor: pointer; user-select: all; color: var(--text); transition: all 0.2s;">${inviteCode}</div>
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
    confirmDialog.close();
  });
  document.querySelector("#confirm-cancel")?.addEventListener("click", () => {
    pendingDeleteGroupId = null;
    pendingRemoveMemberId = null;
    confirmDialog.close();
  });
  document.querySelector("#confirm-delete")?.addEventListener("click", async () => {
    if (pendingRemoveMemberId) {
      await removeMember(pendingRemoveMemberId);
      pendingRemoveMemberId = null;
    } else if (pendingDeleteGroupId) {
      deleteGroup(pendingDeleteGroupId);
    }
    pendingDeleteGroupId = null;
    // Restaurar la etiqueta del boton para el proximo uso (borrar lista).
    const deleteBtn = document.querySelector("#confirm-delete");
    if (deleteBtn) deleteBtn.textContent = "Borrar lista";
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

function loadState() {
  return { users: [], groups: [], notifications: loadStoredNotifications(), uiNotice: "" };
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
    .on("broadcast", { event: "group_notification" }, ({ payload }) => {
      handleIncomingNotification(payload);
    })
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: PRODUCTS_TABLE },
      async (payload) => {
        if (!currentUser()) return;
        if (payload?.eventType === "INSERT" && payload.new) {
          const row = payload.new;
          if (row.added_by && row.added_by !== currentUser()?.id) {
            const grp = state.groups.find((g) => g.id === row.group_id);
            if (grp) {
              handleIncomingNotification({
                id: createId("notif"),
                dedupKey: `add-${row.id}`,
                type: "product_added",
                title: "Producto agregado",
                message: `${row.added_by_name || "Un miembro"} agregó "${row.name}" en la lista "${grp.name}"`,
                actorId: row.added_by,
                actorName: row.added_by_name || "Un miembro",
                targetId: row.id,
                targetName: row.name,
                groupId: grp.id,
                groupName: grp.name,
                timestamp: row.created_at || new Date().toISOString(),
                read: false,
              });
            }
          }
        }
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
      async (payload) => {
        if (!currentUser()) return;
        if (payload?.eventType === "INSERT" && payload.new) {
          const row = payload.new;
          if (row.user_id && row.user_id !== currentUser()?.id) {
            const grp = state.groups.find((g) => g.id === row.group_id);
            if (grp) {
              handleIncomingNotification({
                id: createId("notif"),
                dedupKey: `join-${row.group_id}-${row.user_id}`,
                type: "member_joined",
                title: "Nuevo miembro",
                message: `${row.user_name || "Un nuevo miembro"} se unió a la lista "${grp.name}"`,
                actorId: row.user_id,
                actorName: row.user_name || "Un miembro",
                targetId: row.user_id,
                targetName: row.user_name,
                groupId: grp.id,
                groupName: grp.name,
                timestamp: row.joined_at || new Date().toISOString(),
                read: false,
              });
            }
          }
        }
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

      state = { users: [user], groups: [], notifications: (state.notifications && state.notifications.length) ? state.notifications : loadStoredNotifications(), uiNotice: state.uiNotice || "" };
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

    const currentNotifs = (state.notifications && state.notifications.length) ? state.notifications : loadStoredNotifications();

    state = {
      users: [...usersById.values()],
      groups: groups.map((group) => groupFromRow(
        group,
        membersByGroup.get(group.id) || [],
        (productsByGroup.get(group.id) || []).sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
      )),
      notifications: currentNotifs,
      uiNotice: state.uiNotice || "",
    };

    // Historial inicial si el usuario no tiene notificaciones guardadas
    if (!state.notifications || state.notifications.length === 0) {
      const initialNotifs = [];
      state.groups.forEach((g) => {
        if (g.type === "shared") {
          g.products.forEach((p) => {
            if (p.addedBy && p.addedBy !== user.id) {
              initialNotifs.push({
                id: createId("notif"),
                dedupKey: `add-${p.id}`,
                type: "product_added",
                title: "Producto agregado",
                message: `${p.addedByName || "Un miembro"} agregó "${p.name}" en la lista "${g.name}"`,
                actorId: p.addedBy,
                actorName: p.addedByName || "Un miembro",
                targetId: p.id,
                targetName: p.name,
                groupId: g.id,
                groupName: g.name,
                timestamp: p.createdAt || g.createdAt || new Date().toISOString(),
                read: true,
              });
            }
          });
        }
      });
      if (initialNotifs.length > 0) {
        initialNotifs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        state.notifications = initialNotifs.slice(0, 50);
        saveNotifications();
      }
    }
    updateNotificationBadge();

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

// Emojis sugeridos para el selector. Formato igual al que ya usa la app:
// texto plano de 1-2 caracteres.
const GROUP_EMOJI_CHOICES = [
  "🏠", "🛒", "🛍️", "🥑", "🍎", "🍌", "🍞", "🥛", "☕", "🍕",
  "🍗", "🐟", "🥕", "🥦", "🍅", "🥚", "🧀", "🍫", "🍺", "🧃",
  "🧹", "🧺", "🧼", "🐶", "🐱", "👶", "🎒", "⛺", "🍽️", "💊",
];

// Abre el selector junto al campo de emoji del dialogo de edicion.
// No cambia como se guarda: solo escribe en el input, que sigue siendo la
// fuente de verdad y se normaliza con normalizeGroupEmoji() al guardar.
function openEmojiPicker(input) {
  if (!input) return;
  document.querySelector("#emoji-picker")?.remove();

  const picker = document.createElement("div");
  picker.id = "emoji-picker";
  picker.className = "emoji-picker";
  picker.setAttribute("role", "group");
  picker.setAttribute("aria-label", "Elegir emoji");
  picker.innerHTML = `
    <div class="emoji-picker-grid">
      ${GROUP_EMOJI_CHOICES.map(
        (emoji) => `<button class="emoji-picker-item" type="button" data-emoji="${emoji}"
             aria-label="Elegir ${emoji}">${emoji}</button>`
      ).join("")}
    </div>
    <button class="emoji-picker-close" type="button">Cerrar</button>`;

  const field = input.closest(".emoji-field") || input.parentElement;
  (field || document.body).appendChild(picker);

  const close = () => picker.remove();
  picker.querySelector(".emoji-picker-close")?.addEventListener("click", close);

  picker.addEventListener("click", (event) => {
    const item = event.target.closest("[data-emoji]");
    if (!item) return;
    input.value = normalizeGroupEmoji(item.dataset.emoji);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    close();
  });

  setTimeout(() => {
    document.addEventListener("click", (event) => {
      if (!picker.contains(event.target) && event.target !== input) close();
    });
  }, 0);
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
      emailRedirectTo: PRODUCTION_URL,
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

  // Limpiar notificaciones en memoria
  state.notifications = [];
  updateNotificationBadge();

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
  // Avisar al resto de la lista de que este usuario se sumo. A los que ya
  // estaban les llega por Realtime; a los que no, al recargar.
  await notifyMembersAboutMembership(
    group.id,
    `${getUserDisplayName(user)} se unió a la lista`,
    `join-${group.id}-${user.id}`
  );
  return true;
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

  // Broadcast notification for new products in shared lists
  if (index < 0 && group.type === "shared" && user) {
    const notif = {
      id: createId("notif"),
      dedupKey: `add-${base.id}`,
      type: "product_added",
      title: "Producto agregado",
      message: `${getUserDisplayName(user)} agregó "${base.name}" en la lista "${group.name}"`,
      actorId: user.id,
      actorName: getUserDisplayName(user),
      targetId: base.id,
      targetName: base.name,
      groupId: group.id,
      groupName: group.name,
      timestamp: new Date().toISOString(),
      read: false,
    };
    broadcastGroupNotification(notif);
  }

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
    // Broadcast status change in shared lists
    if (group.type === "shared" && currentUser()) {
      const user = currentUser();
      const statusLabel = STATUSES[status]?.label || status;
      broadcastGroupNotification({
        id: createId("notif"),
        dedupKey: `status-${changedProduct.id}-${status}-${Date.now()}`,
        type: "product_status",
        title: "Estado actualizado",
        message: `${getUserDisplayName(user)} cambió "${changedProduct.name}" a "${statusLabel}" en la lista "${group.name}"`,
        actorId: user.id,
        actorName: getUserDisplayName(user),
        targetId: changedProduct.id,
        targetName: changedProduct.name,
        groupId: group.id,
        groupName: group.name,
        timestamp: new Date().toISOString(),
        read: false,
      });
    }
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
    // Broadcast bought in shared lists
    const group = getCurrentGroup();
    if (group && group.type === "shared" && currentUser()) {
      const user = currentUser();
      const names = changedProducts.map((p) => `"${p.name}"`).join(", ");
      broadcastGroupNotification({
        id: createId("notif"),
        dedupKey: `bought-${changedProducts.map((p) => p.id).join("-")}-${Date.now()}`,
        type: "product_bought",
        title: "Producto comprado",
        message: `${getUserDisplayName(user)} marcó como comprado: ${names} en la lista "${group.name}"`,
        actorId: user.id,
        actorName: getUserDisplayName(user),
        targetId: changedProducts[0]?.id || null,
        targetName: changedProducts.map((p) => p.name).join(", "),
        groupId: group.id,
        groupName: group.name,
        timestamp: new Date().toISOString(),
        read: false,
      });
    }
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
  const chips = document.querySelector("#category-chips");
  if (!chips) return;
  chips.innerHTML = group.categories
    .map(
      (category) => `<button class="category-chip" type="button" data-category="${escapeHtml(category)}"
           aria-label="Usar la categoría ${escapeHtml(category)}">${escapeHtml(category)}</button>`
    )
    .join("");
  syncCategoryChips();
}

// Marca como elegido el chip que coincide con lo escrito en el input.
function syncCategoryChips() {
  const chips = document.querySelector("#category-chips");
  const input = form?.elements.category;
  if (!chips || !input) return;
  const current = clean(input.value).toLowerCase();
  chips.querySelectorAll("[data-category]").forEach((chip) => {
    const match = clean(chip.dataset.category).toLowerCase() === current;
    chip.classList.toggle("is-selected", match);
    chip.setAttribute("aria-pressed", String(match));
  });
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
  if (currentView === "notifications") {
    renderNotifications();
    // Wire buttons after render
    requestAnimationFrame(() => {
      document.querySelector("#mark-all-read-btn")?.addEventListener("click", () => { markAllRead(); });
      document.querySelector("#clear-notifications-btn")?.addEventListener("click", () => { clearHistory(); });
      document.querySelectorAll(".notification-card").forEach((card) => {
        card.addEventListener("click", () => {
          const nid = card.dataset.notificationId;
          if (nid) markNotificationRead(nid);
        });
        card.addEventListener("keydown", (e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            const nid = card.dataset.notificationId;
            if (nid) markNotificationRead(nid);
          }
        });
      });
    });
  }
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

    <section class="panel">
      <div class="panel-head vertical">
        <h2>Ajustes de la app</h2>
      </div>
      ${themeEntryMarkup()}
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
        <button class="list-detail-emoji list-detail-emoji-button" type="button"
                data-action="edit-group-emoji" data-id="${currentGroup.id}"
                aria-label="Cambiar emoji de ${escapeHtml(currentGroup.name)}"
                title="Cambiar emoji">${escapeHtml(currentGroup.emoji || "🏠")}</button>
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
        <button class="primary-button" type="button" data-action="add">+ Agregar producto</button>
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
                <button class="secondary-button" type="button" data-action="edit-group" data-id="${group.id}"
                        aria-label="Editar ${escapeHtml(group.name)}">Editar</button>
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

// Bloque de codigo de invitacion de una lista. Se usa para la lista actual y
// para cada lista compartida cuando no hay ninguna seleccionada.
function inviteCodeBox(group, options = {}) {
  if (!group || group.type !== "shared" || !group.inviteCode) return "";
  const role = memberRole(group);
  const { showListName = false, switchAction = "switch-invite-group" } = options;
  return `
    <div class="invite-box">
      ${showListName ? `<p class="invite-box-list">${escapeHtml(group.emoji || "🏠")} ${escapeHtml(group.name)}</p>` : ""}
      <span>Código de invitación</span>
      <strong class="invite-code-value">${escapeHtml(group.inviteCode)}</strong>
      <div class="invite-box-actions">
        <button class="secondary-button" type="button" data-action="copy-invite-code"
                data-code="${escapeHtml(group.inviteCode)}"
                aria-label="Copiar el código de ${escapeHtml(group.name)}">Copiar código</button>
        ${role === "admin" ? `<button class="secondary-button" type="button" data-action="regenerate-invite-code"
                data-id="${escapeHtml(group.id)}"
                aria-label="Cambiar el código de ${escapeHtml(group.name)}">Cambiar código</button>` : ""}
        ${showListName && userGroups().filter((item) => item.type === "shared").length > 1 ? `<button class="secondary-button" type="button" data-action="${switchAction}" data-id="${escapeHtml(group.id)}">Usar esta lista</button>` : ""}
      </div>
      ${role === "admin" ? `<p class="invite-box-hint">Al cambiarlo, el código anterior deja de funcionar.</p>` : ""}
    </div>
  `;
}

function renderSettings() {
  const group = getCurrentGroup();
  const user = currentUser();
  const role = memberRole(group);
  // Todas las listas donde el usuario es miembro: el codigo de invitacion se
  // muestra siempre, incluso sin lista seleccionada (getCurrentGroup() null).
  const myGroups = userGroups();
  const sharedGroups = myGroups.filter((item) => item.type === "shared" && item.inviteCode);
  const inviteSection = sharedGroups.length ? `
      <section class="panel">
        <div class="panel-head vertical">
          <div>
            <p class="eyebrow">Códigos de invitación</p>
            <h2>${sharedGroups.length === 1 ? escapeHtml(sharedGroups[0].name) : `${sharedGroups.length} listas compartidas`}</h2>
          </div>
        </div>
        ${sharedGroups.map((item) => inviteCodeBox(item, { showListName: sharedGroups.length > 1 })).join("")}
        <p class="invite-box-hint">Compartí el código para que alguien más se sume a la lista.</p>
      </section>
    ` : "";

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
          <strong class="invite-code-value">${escapeHtml(group.inviteCode)}</strong>
          <div class="invite-box-actions">
            <button class="secondary-button" type="button" data-action="copy-invite-code"
                    data-code="${escapeHtml(group.inviteCode)}">Copiar código</button>
            ${role === "admin" ? `<button class="secondary-button" type="button" data-action="regenerate-invite-code"
                    data-id="${escapeHtml(group.id)}">Cambiar código</button>` : ""}
          </div>
          ${role === "admin" ? `<p class="invite-box-hint">Al cambiarlo, el código anterior deja de funcionar.</p>` : ""}
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
  ` : (myGroups.length ? `
      <section class="panel">
        <div class="panel-head vertical">
          <div>
            <p class="eyebrow">Grupo actual</p>
            <h2>Elegí una lista</h2>
          </div>
        </div>
        <p style="color: var(--text-muted);">No hay ninguna lista abierta. Abrí una desde "Mis listas" para ver sus miembros.</p>
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
  `);

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
            <button class="secondary-button" type="button" data-open-theme>Personalizar la app</button>
            <button class="danger-button logout-button" type="button" data-action="logout">Cerrar sesión</button>
          </div>
        </div>
      </section>
      ${inviteSection}
      ${groupSection}
    </section>
  `;
  bindCommonActions();
}

// ------------------------------------------------------------------------------
// Selector de tema y paleta, en un dialogo abierto desde el boton flotante.
// El boton vive en el index (no en una vista), asi que el dialogo esta disponible
// en toda la pagina. La eleccion se guarda y se refleja al instante.
// ------------------------------------------------------------------------------
function themeOptionsMarkup() {
  const storedMode = readStoredThemeMode();
  const activePalette = getPaletteById(getActivePalette());

  const modeOptions = THEME_MODES.map((mode) => `
    <label class="theme-option">
      <input type="radio" name="superlist-theme-mode" value="${mode.id}" data-theme-mode-input
        ${mode.id === storedMode ? "checked" : ""} />
      <span class="theme-option-body">${themeModeIcon(mode.id)}<span>${escapeHtml(mode.label)}</span></span>
    </label>`).join("");

  const paletteOptions = THEME_PALETTES.map((palette) => `
    <label class="theme-option">
      <input type="radio" name="superlist-theme-palette" value="${palette.id}" data-theme-palette-input
        ${palette.id === activePalette.id ? "checked" : ""} />
      <span class="theme-option-body">
        <span class="theme-swatch" style="--swatch-light:${palette.light}; --swatch-dark:${palette.dark}; background:${palette.light};" aria-hidden="true"></span>
        <span>${escapeHtml(palette.label)}</span>
      </span>
    </label>`).join("");

  const modeLabel = THEME_MODES.find((mode) => mode.id === storedMode)?.label || "Automático";
  const systemNote =
    storedMode === "auto"
      ? `Sigue a tu dispositivo (ahora: ${getActiveThemeMode() === "dark" ? "oscuro" : "claro"}).`
      : `Elegiste el modo ${modeLabel.toLowerCase()}.`;

  const isDark = getActiveThemeMode() === "dark";
  const modeLabelShort = isDark ? "Oscuro" : "Claro";

  return `
    <div class="theme-preview">
      <span class="theme-swatch" style="--swatch: var(--accent); background: var(--accent);" aria-hidden="true"></span>
      <span class="theme-preview-text">
        <strong>${escapeHtml(activePalette.label)} · ${modeLabelShort}</strong>
        <span>${escapeHtml(systemNote)}</span>
      </span>
    </div>

    <fieldset class="theme-group">
      <legend class="theme-group-legend">Modo</legend>
      <div class="theme-modes">${modeOptions}</div>
    </fieldset>

    <fieldset class="theme-group">
      <legend class="theme-group-legend">Paleta</legend>
      <div class="theme-palettes">${paletteOptions}</div>
    </fieldset>

    <p class="theme-hint">El verde es el color original y se aplica solo. Las demás paletas son opcionales y tu elección se guarda en este dispositivo.</p>
  `;
}

// Vuelca los controles dentro del dialogo y engancha sus eventos.
function renderThemeDialog() {
  const dialog = document.querySelector("#theme-dialog");
  if (!dialog) return;
  dialog.innerHTML = `
    <form method="dialog" class="theme-dialog-form">
      <div class="dialog-head">
        <div>
          <p class="eyebrow">Personalización</p>
          <h2>Tema y color</h2>
        </div>
        <button class="ghost-icon" type="button" data-theme-close aria-label="Cerrar">×</button>
      </div>
      <div class="theme-dialog-body">${themeOptionsMarkup()}</div>
      <div class="dialog-actions">
        <button class="primary-button" type="submit">Listo</button>
      </div>
    </form>`;
  bindThemeControls();
}

function openThemeDialog() {
  const dialog = document.querySelector("#theme-dialog");
  if (!dialog) return;
  renderThemeDialog();
  if (typeof dialog.showModal === "function") dialog.showModal();
  else dialog.setAttribute("open", "");
}

function bindThemeControls() {
  document.querySelectorAll("[data-theme-mode-input]").forEach((input) => {
    input.addEventListener("change", () => {
      if (!input.checked) return;
      setThemeMode(input.value);   // ya refresca el boton flotante
      renderThemeDialog();
    });
  });

  document.querySelectorAll("[data-theme-palette-input]").forEach((input) => {
    input.addEventListener("change", () => {
      if (!input.checked) return;
      applyPalette(input.value);   // ya refresca el boton flotante
      renderThemeDialog();
    });
  });

  document.querySelectorAll("[data-theme-close]").forEach((button) => {
    button.addEventListener("click", () => {
      const dialog = document.querySelector("#theme-dialog");
      if (!dialog) return;
      if (typeof dialog.close === "function") dialog.close();
      else dialog.removeAttribute("open");
    });
  });
}

// Refleja en la tarjeta de Inicio el modo y la paleta que estan activos.
function updateThemeButton() {
  const entry = document.querySelector(".theme-entry");
  if (!entry) return;
  const dark = getActiveThemeMode() === "dark";
  const palette = getPaletteById(getActivePalette());
  const modeText = readStoredThemeMode() === "auto" ? "Automático" : dark ? "Oscuro" : "Claro";

  const swatch = entry.querySelector(".theme-entry-swatch");
  if (swatch) {
    swatch.style.setProperty("--swatch-light", palette.light);
    swatch.style.setProperty("--swatch-dark", palette.dark);
    swatch.style.background = dark ? palette.dark : palette.light;
  }
  const detail = entry.querySelector(".theme-entry-text span");
  if (detail) detail.textContent = `${palette.label} · ${modeText}`;
  entry.setAttribute("aria-label", `Personalizar el tema. Actual: ${palette.label}, ${modeText.toLowerCase()}`);
}

// Copia el codigo de invitacion al portapapeles. Primero intenta la API
// moderna; si no esta disponible (contexto no seguro, por ejemplo al probar
// la app en un http local), cae a un textarea temporal con execCommand.
async function copyInviteCode(code) {
  if (!code) return;
  const copied = await writeToClipboard(code);
  if (copied) {
    showNotification(`Código copiado: ${code}`, "success");
    return;
  }
  showNotification(`No se pudo copiar. El código es: ${code}`, "info");
}

async function writeToClipboard(text) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch (error) {
    console.warn("Clipboard API no disponible:", error);
  }

  // Fallback para navegadores sin Clipboard API o sin contexto seguro.
  try {
    const helper = document.createElement("textarea");
    helper.value = text;
    helper.setAttribute("readonly", "");
    helper.style.cssText = "position: fixed; top: -9999px; opacity: 0;";
    document.body.appendChild(helper);
    helper.select();
    helper.setSelectionRange(0, text.length);
    const ok = document.execCommand("copy");
    helper.remove();
    return ok;
  } catch (error) {
    console.warn("No se pudo copiar el codigo:", error);
    return false;
  }
}

// Genera un codigo nuevo para la lista. Solo admin: cambiarlo afecta a todos
// los que todavia no se unieron, asi que se restringe a ese rol.
// Acepta el id de la lista para funcionar con varias compartidas en pantalla.
async function regenerateInviteCode(groupId = null) {
  const group = groupId
    ? state.groups.find((item) => item.id === groupId)
    : getCurrentGroup();
  if (!group || group.type !== "shared") return;
  if (memberRole(group) !== "admin") {
    showNotification("Solo el administrador puede cambiar el código.", "error");
    return;
  }

  const next = createInviteCode();
  try {
    await runSupabase(
      supabaseClient.from(GROUPS_TABLE).update({ invite_code: next }).eq("id", group.id),
      "No se pudo cambiar el código."
    );
  } catch (error) {
    // runSupabase ya mostro el aviso; no seguimos con el estado local.
    console.error(error);
    return;
  }

  group.inviteCode = next;
  persist();
  renderSettings();
  showNotification(`Código nuevo: ${next}. El anterior ya no funciona.`, "success");
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
      ${canRemove ? `
        <button class="danger-button danger-inline remove-member-button" type="button" data-action="remove-member" data-id="${member.userId}"
                aria-label="Quitar a ${escapeHtml(displayName)} de la lista"
                title="Quitar de la lista">Quitar</button>
      ` : ""}
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
      if (action === "switch-invite-group") {
        const target = state.groups.find((item) => item.id === id);
        if (!target) return;
        session.groupId = id;
        persist();
        renderSettings();
        showNotification(`Abriste ${target.name}.`, "success");
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
        const group = getCurrentGroup();
        if (!group) return;
        if (memberRole(group) !== "admin") {
          showNotification("Solo el administrador puede quitar miembros.", "error");
          return;
        }
        if (id === currentUser()?.id) return;
        const member = group.members.find((item) => item.userId === id);
        const memberName = member?.name || member?.email || "este miembro";
        pendingRemoveMemberId = id;
        const messageEl = document.querySelector("#confirm-dialog-message");
        const titleEl = document.querySelector("#confirm-dialog-title");
        const deleteBtn = document.querySelector("#confirm-delete");
        if (titleEl) titleEl.textContent = "Quitar miembro";
        if (messageEl) messageEl.textContent = `¿Quitar a ${memberName} de la lista? Va a poder unirse otra vez con el código.`;
        if (deleteBtn) deleteBtn.textContent = "Quitar";
        confirmDialog?.showModal();
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
    initTheme();
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

