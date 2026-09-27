// =======================================================================
// 01-theme.js
//
// Sistema de temas y paletas.
// Modos claro/oscuro/auto, paletas por nombre, y el selector de tema.
// =======================================================================
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