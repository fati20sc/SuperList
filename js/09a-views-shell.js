// =======================================================================
// 09a-views-shell.js
//
// Armazon de la app: render(), menu lateral, pantalla de acceso y reinicio de contrasena.
// =======================================================================
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

