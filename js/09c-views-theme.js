// =======================================================================
// 09c-views-theme.js
//
// Dialogo de tema y paleta: markup, apertura y binding de los controles.
// =======================================================================
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