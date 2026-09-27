// =======================================================================
// 09d-views-shared.js
//
// Piezas compartidas entre pantallas: codigo de invitacion, miembros y tarjetas de producto.
// =======================================================================
async function copyInviteCode(code) {
  if (!code) return false;
  const copied = await writeToClipboard(code);
  if (copied) {
    showNotification(`Código copiado: ${code}`, "success");
    return true;
  }
  showNotification(`No se pudo copiar. El código es: ${code}`, "info");
  return false;
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
