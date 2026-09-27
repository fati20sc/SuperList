// =======================================================================
// 06-auth.js
//
// Autenticacion: crear cuenta, iniciar sesion y cerrar sesion.
// =======================================================================
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
