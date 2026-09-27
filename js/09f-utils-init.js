// =======================================================================
// 09f-utils-init.js
//
// Utilidades de render, escape de HTML e inicializacion de la app.
// =======================================================================
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
      // Escucha las notificaciones nativas de Android. En el navegador esta
      // funcion no hace nada (no hay plugin), asi que se puede llamar siempre.
      listenToNativeNotifications();
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
