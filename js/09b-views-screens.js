// =======================================================================
// 09b-views-screens.js
//
// Las pantallas: Inicio, Inventario, Detalle, Compras, Mis listas y Mi cuenta.
// =======================================================================
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
          <img class="lists-illustration" src="./SUPERMERCADO.webp" alt="Supermercado" />
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
        <img class="lists-illustration" src="./SUPERMERCADO.webp" alt="Supermercado" />
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
                ${group.type === "shared" && group.inviteCode ? `
                <div class="list-code-actions">
                  <button class="code-button code-button-copy" type="button" data-action="copy-invite-code"
                          data-code="${escapeHtml(group.inviteCode)}"
                          aria-label="Copiar el código de ${escapeHtml(group.name)}">Copiar código</button>
                  ${memberRole(group) === "admin" ? `
                  <button class="code-button code-button-change" type="button" data-action="regenerate-invite-code"
                          data-id="${escapeHtml(group.id)}"
                          aria-label="Cambiar el código de ${escapeHtml(group.name)}">Cambiar código</button>
                  ` : ""}
                </div>
                ` : ""}
                ${pendingRequestsFor(group).length ? `
                <p class="pending-requests-badge">${pendingRequestsFor(group).length} solicitud${pendingRequestsFor(group).length === 1 ? "" : "es"} pendiente${pendingRequestsFor(group).length === 1 ? "" : "s"}</p>
                ` : ""}
              </div>
              <div class="product-actions compact-actions list-actions">
                <button class="list-action list-action-open" type="button" data-action="select-list" data-id="${group.id}"
                        aria-label="Abrir ${escapeHtml(group.name)}">Abrir</button>
                <button class="list-action list-action-edit" type="button" data-action="edit-group" data-id="${group.id}"
                        aria-label="Editar ${escapeHtml(group.name)}">Editar</button>
                <button class="list-action list-action-members" type="button" data-action="open-members" data-id="${group.id}"
                        aria-label="Ver miembros de ${escapeHtml(group.name)}">Miembros</button>
                ${memberRole(group) === "admin" ? `<button class="list-action list-action-delete" type="button" data-action="delete-list" data-id="${group.id}"
                        aria-label="Borrar ${escapeHtml(group.name)}">Borrar</button>` : ""}
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

// Pinta el botón de notificaciones según el estado real del dispositivo.
// Si el navegador no soporta push (por ejemplo dentro del APK), lo dice en vez
// de prometer algo que no va a pasar.
async function refreshPushButton() {
  const button = document.querySelector("#push-toggle-button");
  if (!button) return;
  const status = await getPushStatus();
  if (status.state === "unsupported") {
    button.textContent = "Notificaciones no disponibles acá";
    button.disabled = true;
    button.title = status.reason;
    return;
  }
  button.disabled = false;
  if (status.state === "enabled") {
    button.textContent = "Desactivar notificaciones";
    button.title = "Las notificaciones push están activas en este dispositivo.";
    return;
  }
  if (status.state === "denied") {
    button.textContent = "Notificaciones bloqueadas";
    button.title = status.reason;
    return;
  }
  button.textContent = "Activar notificaciones";
  button.title = "Recibí avisos aunque la app esté cerrada.";
}

// Alterna las notificaciones push según el estado actual.
async function togglePushNotifications() {
  const button = document.querySelector("#push-toggle-button");
  if (button) button.disabled = true;

  const status = await getPushStatus();
  if (status.state === "enabled") {
    await disablePushNotifications();
    showNotification("Desactivaste las notificaciones push.", "info");
  } else {
    const result = await enablePushNotifications();
    if (result.ok) {
      showNotification("Notificaciones activadas. Vas a recibir avisos aunque la app esté cerrada.", "success");
    } else {
      showNotification(result.motivo, "error");
    }
  }
  await refreshPushButton();
}

function renderSettings() {
  const user = currentUser();
  // Mi cuenta es solo el perfil. Las listas, sus codigos y sus miembros se
  // administran desde "Mis listas" (renderLists), que es el unico lugar donde
  // tiene sentido ver todo eso junto.
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
            <button class="secondary-button" type="button" data-action="toggle-push" id="push-toggle-button">Activar notificaciones</button>
            <button class="secondary-button" type="button" data-open-theme>Personalizar la app</button>
            <button class="danger-button logout-button" type="button" data-action="logout">Cerrar sesión</button>
          </div>
        </div>
      </section>
    </section>
  `;
  bindCommonActions();
  // El botón de notificaciones refleja el estado real del dispositivo, así que
  // se actualiza recién después de pintar la vista.
  refreshPushButton();
}

// ------------------------------------------------------------------------------
// Selector de tema y paleta, en un dialogo abierto desde el boton flotante.
// El boton vive en el index (no en una vista), asi que el dialogo esta disponible
// en toda la pagina. La eleccion se guarda y se refleja al instante.
// ------------------------------------------------------------------------------