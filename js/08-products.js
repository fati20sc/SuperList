// =======================================================================
// 08-products.js
//
// Productos: alta, edicion, estados, cantidades y marcado como comprado.
// =======================================================================
async function upsertProduct(product) {
  const group = getCurrentGroup();
  if (!group) return;
  const user = currentUser();
  const index = group.products.findIndex((item) => item.id === product.id);
  const base = {
    ...product,
    addedBy: product.addedBy || user?.id || null,
    addedByName: product.addedByName || getUserDisplayName(user),
    createdAt: product.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    updatedBy: user?.id || null,
  };

  if (index >= 0) {
    group.products[index] = {
      ...group.products[index],
      ...base,
      addedBy: group.products[index].addedBy || base.addedBy,
      addedByName: group.products[index].addedByName || base.addedByName,
      createdAt: group.products[index].createdAt || base.createdAt,
    };
  } else {
    group.products = [base, ...group.products];
  }

  await runSupabase(
    supabaseClient.from(PRODUCTS_TABLE).upsert(productToRow(base), { onConflict: "id" }),
    "No se pudo guardar el producto."
  );

  // Broadcast notification for new products in shared lists
  if (index < 0 && group.type === "shared" && user) {
    const notif = {
      id: createId("notif"),
      dedupKey: `add-${base.id}`,
      type: "product_added",
      title: "Producto agregado",
      message: `${getUserDisplayName(user)} agregó "${base.name}" en la lista "${group.name}"`,
      actorId: user.id,
      actorName: getUserDisplayName(user),
      targetId: base.id,
      targetName: base.name,
      groupId: group.id,
      groupName: group.name,
      timestamp: new Date().toISOString(),
      read: false,
    };
    broadcastGroupNotification(notif);
  }

  persist();
}

async function setStatus(id, status) {
  const group = getCurrentGroup();
  if (!group) return;
  let changedProduct = null;
  group.products = group.products.map((product) => {
    if (product.id !== id) return product;
    changedProduct = {
      ...product,
      status,
      history: [...(product.history || []), { type: "status", status, at: new Date().toISOString() }],
      updatedAt: new Date().toISOString(),
      updatedBy: currentUser()?.id || null,
    };
    return changedProduct;
  });
  if (changedProduct) {
    await runSupabase(
      supabaseClient.from(PRODUCTS_TABLE).upsert(productToRow(changedProduct), { onConflict: "id" }),
      "No se pudo actualizar el estado."
    );
    // Broadcast status change in shared lists
    if (group.type === "shared" && currentUser()) {
      const user = currentUser();
      const statusLabel = STATUSES[status]?.label || status;
      broadcastGroupNotification({
        id: createId("notif"),
        dedupKey: `status-${changedProduct.id}-${status}-${Date.now()}`,
        type: "product_status",
        title: "Estado actualizado",
        message: `${getUserDisplayName(user)} cambió "${changedProduct.name}" a "${statusLabel}" en la lista "${group.name}"`,
        actorId: user.id,
        actorName: getUserDisplayName(user),
        targetId: changedProduct.id,
        targetName: changedProduct.name,
        groupId: group.id,
        groupName: group.name,
        timestamp: new Date().toISOString(),
        read: false,
      });
    }
  }
  persist();
  render();
}

function cycleStatus(id) {
  const product = getProduct(id);
  if (!product) return;
  setStatus(id, STATUSES[product.status].next);
}

async function markBought(ids) {
  const idSet = new Set(ids);
  const group = getCurrentGroup();
  if (!group) return;
  const changedProducts = [];
  group.products = group.products.map((product) => {
    if (!idSet.has(product.id)) return product;
    const changedProduct = {
      ...product,
      status: "tengo",
      history: [...(product.history || []), { type: "bought", at: new Date().toISOString() }],
      updatedAt: new Date().toISOString(),
      updatedBy: currentUser()?.id || null,
    };
    changedProducts.push(changedProduct);
    return changedProduct;
  });
  ids.forEach((id) => selectedShoppingIds.delete(id));
  if (changedProducts.length) {
    await runSupabase(
      supabaseClient.from(PRODUCTS_TABLE).upsert(changedProducts.map(productToRow), { onConflict: "id" }),
      "No se pudo marcar la compra."
    );
    // Broadcast bought in shared lists
    const group = getCurrentGroup();
    if (group && group.type === "shared" && currentUser()) {
      const user = currentUser();
      const names = changedProducts.map((p) => `"${p.name}"`).join(", ");
      broadcastGroupNotification({
        id: createId("notif"),
        dedupKey: `bought-${changedProducts.map((p) => p.id).join("-")}-${Date.now()}`,
        type: "product_bought",
        title: "Producto comprado",
        message: `${getUserDisplayName(user)} marcó como comprado: ${names} en la lista "${group.name}"`,
        actorId: user.id,
        actorName: getUserDisplayName(user),
        targetId: changedProducts[0]?.id || null,
        targetName: changedProducts.map((p) => p.name).join(", "),
        groupId: group.id,
        groupName: group.name,
        timestamp: new Date().toISOString(),
        read: false,
      });
    }
  }
  persist();
}

async function adjustQuantity(id, amount) {
  const group = getCurrentGroup();
  if (!group) return;
  let changedProduct = null;
  group.products = group.products.map((product) => {
    if (product.id !== id) return product;
    const numeric = Number(String(product.quantity).replace(",", "."));
    if (!Number.isFinite(numeric)) return product;
    const nextQuantity = Math.max(0, numeric + amount);
    changedProduct = {
      ...product,
      quantity: String(Number(nextQuantity.toFixed(2))),
      updatedAt: new Date().toISOString(),
      updatedBy: currentUser()?.id || null,
    };
    return changedProduct;
  });
  if (changedProduct) {
    await runSupabase(
      supabaseClient.from(PRODUCTS_TABLE).upsert(productToRow(changedProduct), { onConflict: "id" }),
      "No se pudo actualizar la cantidad."
    );
  }
  persist();
  render();
}

function openProductDialog(product = null) {
  const group = getCurrentGroup();
  if (!group) return;
  form.reset();
  fillCategories(group);
  document.querySelector("#dialog-title").textContent = product ? "Editar producto" : "Agregar rápido";
  deleteButton.hidden = !product;
  markBoughtForm.hidden = !product;
  form.elements.id.value = product?.id || "";
  form.elements.name.value = product?.name || "";
  form.elements.category.value = product?.category || "";
  form.elements.quantity.value = product?.quantity || "";
  form.elements.unit.value = product?.unit || "";
  form.elements.brand.value = product?.brand || "";
  form.elements.expiry.value = product?.expiry || "";
  form.elements.plannedFor.value = product?.plannedFor || "";
  form.elements.note.value = product?.note || "";
  form.elements.status.value = product?.status || "tengo";
  optionalFields.hidden = true;
  optionalToggle.setAttribute("aria-expanded", "false");
  dialog.showModal();
  requestAnimationFrame(() => form.elements.name.focus());
}

function fillCategories(group) {
  const chips = document.querySelector("#category-chips");
  if (!chips) return;
  chips.innerHTML = group.categories
    .map(
      (category) => `<button class="category-chip" type="button" data-category="${escapeHtml(category)}"
           aria-label="Usar la categoría ${escapeHtml(category)}">${escapeHtml(category)}</button>`
    )
    .join("");
  syncCategoryChips();
}

// Marca como elegido el chip que coincide con lo escrito en el input.
function syncCategoryChips() {
  const chips = document.querySelector("#category-chips");
  const input = form?.elements.category;
  if (!chips || !input) return;
  const current = clean(input.value).toLowerCase();
  chips.querySelectorAll("[data-category]").forEach((chip) => {
    const match = clean(chip.dataset.category).toLowerCase() === current;
    chip.classList.toggle("is-selected", match);
    chip.setAttribute("aria-pressed", String(match));
  });
}
