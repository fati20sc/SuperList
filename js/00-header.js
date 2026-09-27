// =======================================================================
// 00-header.js
//
// Constantes de la app, claves de storage y configuracion de Supabase.
// Es el primer modulo: define cosas que usan todos los demas.
// =======================================================================
const APP_KEY = "superlist-state-v2";
const SESSION_KEY = "superlist-session-v2";
const GROUPS_TABLE = "shopping_groups";
const MEMBERS_TABLE = "shopping_group_members";
const PRODUCTS_TABLE = "shopping_products";
const REQUESTS_TABLE = "shopping_join_requests";
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
