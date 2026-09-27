// =======================================================================
// 05-utils.js
//
// Utilidades puras: escape, formato de fechas, emojis y codigos.
// Sin efectos secundarios: se pueden usar y probar aisladas.
// =======================================================================
  let profileBirthdate = supabaseUser.user_metadata?.birthdate || null;

  try {
    const { data: profileRow } = await supabaseClient
      .from(PROFILES_TABLE)
      .select("name, birthdate")
      .eq("id", supabaseUser.id)
      .maybeSingle();
    if (profileRow) {
      if (profileRow.name) profileName = profileRow.name;
      if (profileRow.birthdate) profileBirthdate = profileRow.birthdate;
    }
  } catch (e) {
    // Si no está disponible la tabla profiles, usamos user_metadata
  }

  cachedSupabaseUser = {
    id: supabaseUser.id,
    email: supabaseUser.email,
    name: profileName || "Usuario",
    birthdate: profileBirthdate,
    emailVerified: supabaseUser.email_confirmed_at !== null,
  };

  return cachedSupabaseUser;
}

function getCurrentGroup() {
  const user = currentUser();
  if (!user) return null;
  const group = state.groups.find((item) => item.id === session.groupId);
  if (!group || !group.members.some((member) => member.userId === user.id)) return null;
  return group;
}

function goHome() {
  currentView = "home";
  session.groupId = null;
  persist();
  closeMenu();
  render();
}

// Funciones globales para el menú (accesibles desde onclick en HTML)
window.goToHome = goHome;
window.goToSettings = function() {
  currentView = "settings";
  closeMenu();
  render();
};
window.goToLists = function() {
  currentView = "lists";
  closeMenu();
  render();
};
window.doLogout = function() {
  closeMenu();
  signOut().then(() => {
    render();
  });
};

function getUserDisplayName(user) {
  if (!user) return "Usuario";
  return clean(user.name) || user.email || "Usuario";
}

function recentGroups(limit = 4) {
  const user = currentUser();
  if (!user) return [];
  return userGroups()
    .slice()
    .sort((a, b) => {
      const getLastProductDate = (group) => {
        if (!group.products.length) return group.createdAt || 0;
        return group.products.reduce((latest, product) => {
          const productDate = new Date(product.createdAt || 0).getTime();
          return productDate > latest ? productDate : latest;
        }, 0);
      };
      return getLastProductDate(b) - getLastProductDate(a);
    })
    .slice(0, limit);
}

function userGroups() {
  const user = currentUser();
  if (!user) return [];
  return state.groups.filter((group) => group.members.some((member) => member.userId === user.id));
}

function groupProducts() {
  return getCurrentGroup()?.products || [];
}

function getProduct(id) {
  return groupProducts().find((product) => product.id === id) || null;
}

function clean(value) {
  return String(value || "").trim();
}

function createId(prefix) {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function normalizeEmail(value) {
  return clean(value).toLowerCase();
}

function isSingleEmoji(value) {
  const chars = [...String(value || "")];
  if (!chars.length || chars.length > 2) return false;
  return chars.every((char) => /[\p{Extended_Pictographic}\p{Regional_Indicator}\u{FE0F}\u{200D}]/u.test(char));
}

function normalizeGroupEmoji(value) {
  const raw = clean(value || "🏠");
  if (!raw) return "🏠";
  const chars = [...raw].filter((char) => /[\p{Extended_Pictographic}\p{Regional_Indicator}\u{FE0F}\u{200D}]/u.test(char));
  const candidate = chars.slice(0, 2).join("");
  return isSingleEmoji(candidate) ? candidate : "🏠";
}

function bindEmojiOnlyInput(element) {
  if (!element) return;
  element.setAttribute("inputmode", "text");
  element.setAttribute("autocomplete", "off");
  element.setAttribute("autocapitalize", "none");
  element.setAttribute("spellcheck", "false");
  element.setAttribute("maxlength", "2");

  element.addEventListener("input", () => {
    const next = normalizeGroupEmoji(element.value);
    if (next !== element.value) {
      element.value = next;
    }
  });
}

// Emojis sugeridos para el selector. Formato igual al que ya usa la app:
// texto plano de 1-2 caracteres.
const GROUP_EMOJI_CHOICES = [
  "🏠", "🛒", "🛍️", "🥑", "🍎", "🍌", "🍞", "🥛", "☕", "🍕",
  "🍗", "🐟", "🥕", "🥦", "🍅", "🥚", "🧀", "🍫", "🍺", "🧃",
  "🧹", "🧺", "🧼", "🐶", "🐱", "👶", "🎒", "⛺", "🍽️", "💊",
];

// Abre el selector junto al campo de emoji del dialogo de edicion.
// No cambia como se guarda: solo escribe en el input, que sigue siendo la
// fuente de verdad y se normaliza con normalizeGroupEmoji() al guardar.
function openEmojiPicker(input) {
  if (!input) return;
  document.querySelector("#emoji-picker")?.remove();

  const picker = document.createElement("div");
  picker.id = "emoji-picker";
  picker.className = "emoji-picker";
  picker.setAttribute("role", "group");
  picker.setAttribute("aria-label", "Elegir emoji");
  picker.innerHTML = `
    <div class="emoji-picker-grid">
      ${GROUP_EMOJI_CHOICES.map(
        (emoji) => `<button class="emoji-picker-item" type="button" data-emoji="${emoji}"
             aria-label="Elegir ${emoji}">${emoji}</button>`
      ).join("")}
    </div>
    <button class="emoji-picker-close" type="button">Cerrar</button>`;

  const field = input.closest(".emoji-field") || input.parentElement;
  (field || document.body).appendChild(picker);

  // El listener de "click afuera" se registra en document, asi que hay que
  // sacarlo al cerrar. Antes se olvidaba y cada apertura sumaba un listener
  // permanente que ademas mantenia vivo el nodo ya desconectado.
  let outsideHandler = null;
  const close = () => {
    if (outsideHandler) {
      document.removeEventListener("click", outsideHandler, true);
      outsideHandler = null;
    }
    picker.remove();
  };
  picker.querySelector(".emoji-picker-close")?.addEventListener("click", close);

  picker.addEventListener("click", (event) => {
    const item = event.target.closest("[data-emoji]");
    if (!item) return;
    input.value = normalizeGroupEmoji(item.dataset.emoji);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    close();
  });

  setTimeout(() => {
    // Si el picker se cerro antes de que corra este timeout, no se registra nada.
    if (!picker.isConnected) return;
    outsideHandler = (event) => {
      if (!picker.contains(event.target) && event.target !== input) close();
    };
    document.addEventListener("click", outsideHandler, true);
  }, 0);
}
