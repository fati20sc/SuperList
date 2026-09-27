// =======================================================================
// 02-notifications.js
//
// Notificaciones internas de las listas compartidas.
// Avisos en pantalla, historial, y el puente con Supabase Realtime.
// =======================================================================
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
