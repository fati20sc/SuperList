// =======================================================================
// 04-data-and-supabase.js
//
// Persistencia y acceso a Supabase.
// Carga de datos, mapeo entre filas y objetos, y la suscripcion Realtime.
// =======================================================================
function loadState() {
  return { users: [], groups: [], notifications: loadStoredNotifications(), joinRequests: [], uiNotice: "" };
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

function requestFromRow(row) {
  return {
    id: row.id,
    groupId: row.group_id,
    userId: row.user_id,
    name: row.user_name || "Usuario",
    email: row.user_email || "",
    status: row.status || "pending",
    createdAt: row.created_at || new Date().toISOString(),
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

    const [groups, members, products, profiles, joinRequests] = await Promise.all([
      runSupabase(supabaseClient.from(GROUPS_TABLE).select("*").in("id", groupIds), "No se pudieron cargar tus listas."),
      runSupabase(supabaseClient.from(MEMBERS_TABLE).select("*").in("group_id", groupIds), "No se pudieron cargar los miembros."),
      runSupabase(supabaseClient.from(PRODUCTS_TABLE).select("*").in("group_id", groupIds), "No se pudieron cargar los productos."),
      supabaseClient.from(PROFILES_TABLE).select("id, name, email").then(({ data }) => data || []).catch(() => []),
      // Solicitudes de ingreso: las pendientes directedas a las listas donde soy
      // admin, mas las mias, para poder mostrar "esperando aprobacion".
      supabaseClient.from(REQUESTS_TABLE).select("*")
        .or(`user_id.eq.${user.id},group_id.in.(${groupIds.join(",")})`)
        .then(({ data }) => data || []).catch(() => []),
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
      joinRequests: (joinRequests || []).map(requestFromRow),
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