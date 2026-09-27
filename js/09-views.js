// =======================================================================
// 09-views.js
//
// Todas las vistas (funciones render) y sus plantillas HTML.
// Es el modulo mas grande: cada render dibuja una pantalla completa en #app.
// =======================================================================
function renderPasswordReset() {
  groupSwitcher.innerHTML = "";
  app.innerHTML = `
    <section class="auth-layout">
      <div class="hero-band auth-hero">
        <img class="auth-brand-mark" src="./superlist.webp" alt="Superlist" />
        <img class="hero-illustration" src="./logo.webp" alt="Logo de SuperList" />
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
        <img class="auth-brand-mark" src="./superlist.webp" alt="Superlist" />
        <img class="hero-illustration" src="./logo.webp" alt="Logo de SuperList" />
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
            <button class="secondary-button" type="button" data-open-theme>Personalizar la app</button>
            <button class="danger-button logout-button" type="button" data-action="logout">Cerrar sesión</button>
          </div>
        </div>
      </section>
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
  renderLists();
  showNotification(`Código nuevo: ${next}. El anterior ya no funciona.`, "success");
}

// Dialogo de miembros de una lista, abierto desde "Mis listas". Incluye las
// solicitudes pendientes cuando el usuario es admin, que es quien las aprueba.
function openMembersDialog(group) {
  const dialog = document.querySelector("#members-dialog");
  const title = document.querySelector("#members-dialog-title");
  const eyebrow = document.querySelector("#members-dialog-eyebrow");
  const body = document.querySelector("#members-dialog-body");
  if (!dialog || !body || !group) return;

  if (title) title.textContent = group.members.length === 1 ? "1 miembro" : `${group.members.length} miembros`;
  if (eyebrow) eyebrow.textContent = `${group.emoji || "🏠"} ${group.name}`;

  const pending = pendingRequestsFor(group);
  const isAdmin = memberRole(group) === "admin";

  body.innerHTML = `
    ${pending.length ? `
      <div class="requests-block">
        <h3>Solicitudes pendientes (${pending.length})</h3>
        <p class="invite-box-hint">Quien entra con el código necesita tu aprobación.</p>
        <div class="product-list">
          ${pending.map((request) => `
            <article class="product-card request-card">
              <div class="product-main">
                <div class="product-name">${escapeHtml(request.name)}</div>
                <div class="product-meta">
                  <span>${escapeHtml(request.email || "sin email")}</span>
                </div>
              </div>
              <div class="product-actions compact-actions">
                <button class="list-action list-action-open" type="button" data-action="approve-request"
                        data-request-id="${escapeHtml(request.id)}"
                        aria-label="Aceptar a ${escapeHtml(request.name)}">Aceptar</button>
                <button class="list-action list-action-delete" type="button" data-action="reject-request"
                        data-request-id="${escapeHtml(request.id)}"
                        aria-label="Rechazar a ${escapeHtml(request.name)}">Rechazar</button>
              </div>
            </article>
          `).join("")}
        </div>
      </div>
    ` : ""}
    <div class="requests-block">
      <h3>Miembros</h3>
      <div class="product-list">
        ${group.members.map((member) => memberRow(member, group)).join("")}
      </div>
      ${!isAdmin ? `<p class="invite-box-hint">Solo el administrador puede quitar miembros.</p>` : ""}
    </div>
  `;

  bindCommonActions();
  if (!dialog.open) dialog.showModal();
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
        <button class="danger-button danger-inline remove-member-button" type="button" data-action="remove-member" data-id="${member.userId}" data-group-id="${escapeHtml(group.id)}"
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
