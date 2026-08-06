(function () {
  const restaurantSelect = document.getElementById('menu-restaurant-select');
  const modalRestaurantSelect = document.getElementById('mi-restaurant');
  const tableWrap = document.getElementById('menu-table-wrap');
  const countEl = document.getElementById('menu-count');
  const addBtn = document.getElementById('menu-add-btn');

  let loadedOnce = false;
  let restaurantsLoaded = false;
  let currentItems = []; // cache of the currently-loaded restaurant's items, keyed by id for the edit modal

  // ── Restaurant dropdown (shared by the toolbar filter and the modal's "assign to" field) ──
  // Sourced from /admin/restaurants — the same endpoint manage-restaurants.js
  // uses — instead of the public /restaurants list. manage-restaurants.js has
  // no client-side CEO/Vendor branching at all; it calls this one endpoint
  // unconditionally and the backend returns every restaurant for a CEO token
  // or just the vendor's own restaurant for a vendor token. Mirroring that
  // means no role check belongs here either — just the same endpoint call.
  // Note the response is the flattened admin summary shape (id, not _id),
  // same as manage-restaurants.js consumes.
  async function loadRestaurants() {
    try {
      const res = await apiRequest('/admin/restaurants', { query: { status: 'all' } });
      const restaurants = res.data || [];

      const options = restaurants
        .map(r => `<option value="${r.id}">${escapeHtml(r.name)}</option>`)
        .join('');

      restaurantSelect.innerHTML = `<option value="">Select a restaurant…</option>${options}`;
      modalRestaurantSelect.innerHTML = options;
      restaurantsLoaded = true;

      // A vendor's scoped list comes back with exactly one restaurant —
      // select it automatically rather than leaving them to pick from a
      // single-option dropdown.
      if (restaurants.length === 1) {
        restaurantSelect.value = restaurants[0].id;
        addBtn.disabled = false;
        loadMenu(restaurants[0].id);
      }
    } catch (err) {
      showToast(err.message || 'Could not load restaurants.', 'error');
    }
  }

  // ── Menu table for the selected restaurant ──
  function renderTable(items) {
    countEl.textContent = items.length ? `${items.length} item${items.length === 1 ? '' : 's'}` : '';

    if (!items.length) {
      tableWrap.innerHTML = `<div class="state-block">
        <h4>No menu items yet</h4>
        <p>Add the first item for this restaurant.</p>
      </div>`;
      return;
    }

    const sorted = [...items].sort((a, b) => (a.category || '').localeCompare(b.category || '') || a.name.localeCompare(b.name));

    tableWrap.innerHTML = `
      <table class="data-table">
        <thead>
          <tr>
            <th>Image</th><th>Name</th><th>Category</th><th>Price</th><th>Veg</th><th>Tags</th><th>In stock</th><th></th>
          </tr>
        </thead>
        <tbody>
          ${sorted.map(item => `
            <tr data-id="${item._id}">
              <td>
                ${item.image
                  ? `<img class="thumb-sm" src="${item.image}" alt="${escapeHtml(item.name)}" />`
                  : `<div class="thumb-sm thumb-empty"></div>`}
              </td>
              <td>
                <div class="row-name">${escapeHtml(item.name)}</div>
              </td>
              <td>${escapeHtml(item.category || '—')}</td>
              <td class="mono">
                ₹${item.price}${item.originalPrice ? ` <s>₹${item.originalPrice}</s>` : ''}
              </td>
              <td>
                <span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:${item.isVeg ? '#1e9e4a' : '#c0392b'};"></span>
              </td>
              <td>${[item.isBestseller ? 'Best seller' : '', item.isRecommended ? 'Recommended' : ''].filter(Boolean).join(', ') || '—'}</td>
              <td>
                <label class="switch" title="${item.inStock ? 'Mark out of stock' : 'Mark in stock'}">
                  <input type="checkbox" class="menu-item-toggle" data-id="${item._id}" ${item.inStock ? 'checked' : ''} />
                  <span class="track"></span>
                </label>
              </td>
              <td>
                <div class="row-actions">
                  <button class="icon-btn menu-item-edit-btn" data-id="${item._id}" title="Edit item">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
                  </button>
                  <button class="icon-btn menu-item-delete-btn" data-id="${item._id}" data-name="${escapeHtml(item.name)}" title="Delete item">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 6h18"/><path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2"/><path d="M19 6l-1 14a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1L5 6"/></svg>
                  </button>
                </div>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;

    tableWrap.querySelectorAll('.menu-item-toggle').forEach(input => {
      input.addEventListener('change', () => toggleInStock(input));
    });
    tableWrap.querySelectorAll('.menu-item-edit-btn').forEach(btn => {
      btn.addEventListener('click', () => openEditModal(btn.dataset.id));
    });
    tableWrap.querySelectorAll('.menu-item-delete-btn').forEach(btn => {
      btn.addEventListener('click', () => deleteMenuItem(btn.dataset.id, btn.dataset.name));
    });
  }

  async function loadMenu(restaurantId) {
    if (!restaurantId) {
      currentItems = [];
      countEl.textContent = '';
      tableWrap.innerHTML = `<div class="state-block">
        <h4>Pick a restaurant</h4>
        <p>Choose a restaurant above to view and manage its menu.</p>
      </div>`;
      return;
    }

    tableWrap.innerHTML = `<div class="state-block"><div class="spinner-lg"></div></div>`;
    try {
      const res = await apiRequest(`/menu?restaurantId=${restaurantId}`);
      currentItems = res.data || [];
      renderTable(currentItems);
    } catch (err) {
      tableWrap.innerHTML = `<div class="state-block"><h4>Could not load menu</h4><p>${escapeHtml(err.message)}</p></div>`;
    }
  }

  async function toggleInStock(input) {
    input.disabled = true;
    try {
      await apiRequest(`/menu/${input.dataset.id}`, { method: 'PUT', body: { inStock: input.checked } });
      showToast(input.checked ? 'Item marked in stock.' : 'Item marked out of stock.', 'success');
      const item = currentItems.find(i => i._id === input.dataset.id);
      if (item) item.inStock = input.checked;
    } catch (err) {
      input.checked = !input.checked;
      showToast(err.message || 'Could not update stock status.', 'error');
    } finally {
      input.disabled = false;
    }
  }

  async function deleteMenuItem(id, name) {
    if (!confirm(`Delete "${name}"? This cannot be undone.`)) return;
    try {
      await apiRequest(`/menu/${id}`, { method: 'DELETE' });
      showToast('Menu item deleted.', 'success');
      loadMenu(restaurantSelect.value);
    } catch (err) {
      showToast(err.message || 'Could not delete menu item.', 'error');
    }
  }

  restaurantSelect.addEventListener('change', () => {
    addBtn.disabled = !restaurantSelect.value;
    loadMenu(restaurantSelect.value);
  });

  // ── Add / Edit modal ────────────────────────────────────────
  const form = document.getElementById('menu-item-form');
  const modalTitle = document.getElementById('menu-item-modal-title');
  const saveBtn = document.getElementById('menu-item-modal-save');
  const saveText = document.getElementById('menu-item-modal-save-text');
  const resultBox = document.getElementById('menu-item-modal-result');
  let saving = false;

  function setFieldError(id, msg) {
    const el = document.querySelector(`[data-error-for="${id}"]`);
    const input = document.getElementById(id);
    if (el) el.textContent = msg || '';
    if (input) input.classList.toggle('invalid', !!msg);
  }

  function clearErrors() {
    form.querySelectorAll('[data-error-for]').forEach(el => el.textContent = '');
    form.querySelectorAll('.invalid').forEach(el => el.classList.remove('invalid'));
    resultBox.className = 'modal-result';
  }

  function openAddModal() {
    form.reset();
    clearErrors();
    document.getElementById('mi-id').value = '';
    document.getElementById('mi-restaurant').value = restaurantSelect.value;
    document.getElementById('mi-inStock').checked = true;
    document.getElementById('mi-isVeg').checked = true;
    modalTitle.textContent = 'Add menu item';
    saveText.textContent = 'Create item';
    document.getElementById('mi-image').dispatchEvent(new Event('change'));
    openModal('menu-item-modal');
  }

  function openEditModal(id) {
    // The list view already carries full menu-item docs (no separate detail
    // endpoint), so populate straight from the row cache — same approach as
    // the rest of the admin panel.
    const item = currentItems.find(i => i._id === id);
    if (!item) return;

    form.reset();
    clearErrors();
    document.getElementById('mi-id').value = item._id;
    document.getElementById('mi-name').value = item.name || '';
    document.getElementById('mi-description').value = item.description || '';
    document.getElementById('mi-restaurant').value = item.restaurantId || restaurantSelect.value;
    document.getElementById('mi-category').value = item.category || '';
    document.getElementById('mi-price').value = item.price ?? '';
    document.getElementById('mi-originalPrice').value = item.originalPrice ?? '';
    document.getElementById('mi-image').value = item.image || '';
    document.getElementById('mi-isVeg').checked = !!item.isVeg;
    document.getElementById('mi-inStock').checked = !!item.inStock;
    document.getElementById('mi-isBestseller').checked = !!item.isBestseller;
    document.getElementById('mi-isRecommended').checked = !!item.isRecommended;
    modalTitle.textContent = 'Edit menu item';
    saveText.textContent = 'Save changes';
    document.getElementById('mi-image').dispatchEvent(new Event('change'));
    openModal('menu-item-modal');
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (saving) return;

    let valid = true;
    setFieldError('mi-name', '');
    setFieldError('mi-restaurant', '');
    setFieldError('mi-price', '');

    const name = document.getElementById('mi-name').value.trim();
    if (!name) { setFieldError('mi-name', 'Item name is required.'); valid = false; }

    const restaurantId = document.getElementById('mi-restaurant').value;
    if (!restaurantId) { setFieldError('mi-restaurant', 'Restaurant is required.'); valid = false; }

    const price = Number(document.getElementById('mi-price').value);
    if (!price || price < 0) { setFieldError('mi-price', 'Enter a valid price.'); valid = false; }

    if (!valid) return;

    const id = document.getElementById('mi-id').value;
    const originalPriceRaw = document.getElementById('mi-originalPrice').value;

    const body = {
      name,
      description: document.getElementById('mi-description').value.trim(),
      restaurantId,
      category: document.getElementById('mi-category').value.trim() || 'Main Course',
      price,
      originalPrice: originalPriceRaw ? Number(originalPriceRaw) : undefined,
      image: document.getElementById('mi-image').value.trim(),
      isVeg: document.getElementById('mi-isVeg').checked,
      inStock: document.getElementById('mi-inStock').checked,
      isBestseller: document.getElementById('mi-isBestseller').checked,
      isRecommended: document.getElementById('mi-isRecommended').checked,
    };

    saving = true;
    saveBtn.disabled = true;
    const savingLabel = id ? 'Saving…' : 'Creating…';
    saveText.innerHTML = `<span class="btn-spinner"></span> ${savingLabel}`;

    try {
      if (id) {
        await apiRequest(`/menu/${id}`, { method: 'PUT', body });
        resultBox.textContent = 'Menu item updated.';
      } else {
        await apiRequest('/menu', { method: 'POST', body });
        resultBox.textContent = 'Menu item created.';
      }
      resultBox.className = 'modal-result show success';
      showToast(id ? 'Menu item updated.' : 'Menu item created.', 'success');
      loadMenu(restaurantSelect.value);
      setTimeout(() => closeModal('menu-item-modal'), 700);
    } catch (err) {
      resultBox.textContent = err.message || 'Could not save menu item.';
      resultBox.className = 'modal-result show error';
    } finally {
      saving = false;
      saveBtn.disabled = false;
      saveText.textContent = id ? 'Save changes' : 'Create item';
    }
  });

  addBtn.addEventListener('click', openAddModal);

  document.addEventListener('admin:view-changed', (e) => {
    if (e.detail.view !== 'manage-menu') return;
    if (!restaurantsLoaded) loadRestaurants();
    if (!loadedOnce) {
      loadedOnce = true;
      loadMenu(restaurantSelect.value);
    }
  });
})();
