(function () {
  const tableWrap = document.getElementById('restaurants-table-wrap');
  const countEl = document.getElementById('restaurants-count');
  const searchInput = document.getElementById('restaurants-search');
  const statusFilter = document.getElementById('restaurants-status-filter');

  const state = { status: 'all', search: '' };
  let loadedOnce = false;

  function renderTable(restaurants) {
    if (!restaurants.length) {
      tableWrap.innerHTML = `<div class="state-block">
        <h4>No restaurants found</h4>
        <p>${state.search || state.status !== 'all' ? 'Try a different search or filter.' : 'Restaurants appear here once a vendor account is created for them.'}</p>
      </div>`;
      return;
    }

    tableWrap.innerHTML = `
      <table class="data-table">
        <thead>
          <tr>
            <th>Restaurant</th><th>Homepage</th><th>Owner</th><th>Cuisine</th><th>Rating</th><th>Orders</th><th>Status</th><th></th>
          </tr>
        </thead>
        <tbody>
          ${restaurants.map(r => `
            <tr data-id="${r.id}">
              <td>
                <div class="row-name">${escapeHtml(r.name)}</div>
                <div class="row-sub">${escapeHtml(r.address || '—')}</div>
              </td>
              <td>
                <div class="mono">${r.homeOrder && r.homeOrder < 999999 ? '#' + r.homeOrder : 'Auto'}</div>
                <div class="row-sub">${r.isBestSeller ? '★ Best Seller' : ''}${r.isBestSeller && r.isNearFast ? ' · ' : ''}${r.isNearFast ? '⚡ Near & Fast' : ''}</div>
              </td>
              <td>
                <div>${escapeHtml(r.ownerName || '—')}</div>
                <div class="row-sub mono">${escapeHtml(r.phone || '')}</div>
              </td>
              <td>${escapeHtml(r.cuisine || '—')}</td>
              <td class="mono">${r.rating != null ? r.rating.toFixed(1) : '—'} ★</td>
              <td class="mono">${r.totalOrders ?? 0}</td>
              <td>
                ${r.isActive
                  ? `<label class="switch" title="${r.isOpen ? 'Close restaurant' : 'Open restaurant'}">
                       <input type="checkbox" class="restaurant-toggle" data-id="${r.id}" ${r.isOpen ? 'checked' : ''} />
                       <span class="track"></span>
                     </label>`
                  : `<span class="badge badge-danger"><span class="badge-dot"></span>Deactivated</span>`}
              </td>
              <td>
                <div class="row-actions">
                  ${r.isActive ? `
                    <button class="icon-btn restaurant-edit-btn" data-id="${r.id}" title="Edit restaurant">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
                    </button>
                    <button class="icon-btn restaurant-deactivate-btn" data-id="${r.id}" data-name="${escapeHtml(r.name)}" title="Deactivate restaurant">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 6h18"/><path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2"/><path d="M19 6l-1 14a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1L5 6"/></svg>
                    </button>
                  ` : `
                    <button class="btn btn-sm btn-ghost restaurant-restore-btn" data-id="${r.id}" data-name="${escapeHtml(r.name)}">Restore</button>
                  `}
                </div>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;

    tableWrap.querySelectorAll('.restaurant-toggle').forEach(input => {
      input.addEventListener('change', () => toggleOpen(input));
    });
    tableWrap.querySelectorAll('.restaurant-edit-btn').forEach(btn => {
      btn.addEventListener('click', () => openEditModal(btn.dataset.id));
    });
    tableWrap.querySelectorAll('.restaurant-deactivate-btn').forEach(btn => {
      btn.addEventListener('click', () => deactivateRestaurant(btn.dataset.id, btn.dataset.name));
    });
    tableWrap.querySelectorAll('.restaurant-restore-btn').forEach(btn => {
      btn.addEventListener('click', () => restoreRestaurant(btn.dataset.id, btn.dataset.name, btn));
    });
  }

  async function loadRestaurants() {
    tableWrap.innerHTML = `<div class="state-block"><div class="spinner-lg"></div></div>`;
    try {
      const res = await apiRequest('/admin/restaurants', {
        query: { search: state.search, status: state.status },
      });
      const restaurants = res.data;
      countEl.textContent = `${restaurants.length} restaurant${restaurants.length === 1 ? '' : 's'}`;
      renderTable(restaurants);
    } catch (err) {
      tableWrap.innerHTML = `<div class="state-block"><h4>Could not load restaurants</h4><p>${escapeHtml(err.message)}</p></div>`;
    }
  }

  async function toggleOpen(input) {
    input.disabled = true;
    try {
      await apiRequest(`/admin/restaurants/${input.dataset.id}/toggle`, { method: 'PATCH' });
      showToast(input.checked ? 'Restaurant is now open.' : 'Restaurant closed.', 'success');
    } catch (err) {
      input.checked = !input.checked;
      showToast(err.message || 'Could not update restaurant status.', 'error');
    } finally {
      input.disabled = false;
    }
  }

  async function deactivateRestaurant(id, name) {
    if (!confirm(`Deactivate "${name}"? It will stop accepting orders immediately. You can restore it any time from the Deactivated filter.`)) return;
    try {
      await apiRequest(`/restaurants/${id}`, { method: 'DELETE' });
      showToast('Restaurant deactivated. It can be restored from the Deactivated filter.', 'success');
      loadRestaurants();
    } catch (err) {
      showToast(err.message || 'Could not deactivate restaurant.', 'error');
    }
  }

  // Restore reuses the existing generic restaurant-update endpoint
  // (PUT /api/restaurants/:id) rather than a new dedicated route —
  // isActive/isOpen are ordinary fields on that document.
  async function restoreRestaurant(id, name, btn) {
    if (!confirm(`Restore "${name}"? It will become active and open for orders again.`)) return;
    btn.disabled = true;
    btn.textContent = 'Restoring…';
    try {
      await apiRequest(`/restaurants/${id}`, { method: 'PUT', body: { isActive: true, isOpen: true } });
      showToast('Restaurant restored.', 'success');
      loadRestaurants();
    } catch (err) {
      showToast(err.message || 'Could not restore restaurant.', 'error');
      btn.disabled = false;
      btn.textContent = 'Restore';
    }
  }

  // ── Edit modal ──────────────────────────────────────────────
  const editForm = document.getElementById('restaurant-edit-form');
  const saveBtn = document.getElementById('restaurant-modal-save');
  const saveText = document.getElementById('restaurant-modal-save-text');
  const resultBox = document.getElementById('restaurant-modal-result');
  let saving = false;

  const HOURS_DAYS = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'];

  function getWeeklyHours(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return undefined;
    const hours = {};
    HOURS_DAYS.forEach(day => {
      const row = container.querySelector(`[data-hours-day=\"${day}\"]`);
      if (!row) return;
      hours[day] = {
        closed: !!row.querySelector('[data-closed]')?.checked,
        opensAt: row.querySelector('[data-opens]')?.value || '10:00',
        closesAt: row.querySelector('[data-closes]')?.value || '22:00',
      };
    });
    return hours;
  }

  function setWeeklyHours(containerId, value) {
    const container = document.getElementById(containerId);
    if (!container) return;
    HOURS_DAYS.forEach(day => {
      const row = container.querySelector(`[data-hours-day=\"${day}\"]`);
      if (!row) return;
      const data = value?.[day] || {};
      const closed = row.querySelector('[data-closed]');
      const opens = row.querySelector('[data-opens]');
      const closes = row.querySelector('[data-closes]');
      if (closed) closed.checked = data.closed === true;
      if (opens) opens.value = data.opensAt || '10:00';
      if (closes) closes.value = data.closesAt || '22:00';
      [opens, closes].forEach(input => { if (input) input.disabled = !!closed?.checked; });
    });
  }

  function bindWeeklyHours(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.querySelectorAll('[data-hours-day]').forEach(row => {
      const closed = row.querySelector('[data-closed]');
      const inputs = row.querySelectorAll('[data-opens], [data-closes]');
      closed?.addEventListener('change', () => {
        inputs.forEach(input => { input.disabled = closed.checked; });
      });
    });
  }

  function setFieldError(id, msg) {
    const el = document.querySelector(`[data-error-for="${id}"]`);
    const input = document.getElementById(id);
    if (el) el.textContent = msg || '';
    if (input) input.classList.toggle('invalid', !!msg);
  }

  // ── Availability (Open / Closed Today / Temporarily Closed / Auto Hours) ──
  const availabilityStatusSelect = document.getElementById('rm-availability-status');
  const autoHoursToggle = document.getElementById('rm-auto-hours');
  const opensAtInput = document.getElementById('rm-opens-at');
  const closesAtInput = document.getElementById('rm-closes-at');
  const hoursRow = document.getElementById('rm-hours-row');
  const availabilityBadge = document.getElementById('rm-availability-badge');
  const availabilityResultBox = document.getElementById('rm-availability-result');
  const availabilitySaveBtn = document.getElementById('rm-availability-save');
  let savingAvailability = false;

  const AVAILABILITY_LABELS = {
    open: 'Open',
    closed_today: 'Closed Today',
    temporarily_closed: 'Temporarily Closed',
  };

  function renderAvailabilityBadge(status) {
    const label = AVAILABILITY_LABELS[status] || AVAILABILITY_LABELS.open;
    const cls = status === 'open' ? '' : 'badge-danger';
    availabilityBadge.innerHTML = `<span class="badge ${cls}"><span class="badge-dot"></span>${label}</span>`;
  }

  function updateHoursRowState() {
    const auto = autoHoursToggle.checked;
    opensAtInput.disabled = auto;
    closesAtInput.disabled = auto;
    hoursRow.style.opacity = auto ? '0.5' : '1';
  }
  autoHoursToggle.addEventListener('change', updateHoursRowState);

  async function openEditModal(id) {
    editForm.reset();
    editForm.querySelectorAll('[data-error-for]').forEach(el => el.textContent = '');
    editForm.querySelectorAll('input.invalid').forEach(el => el.classList.remove('invalid'));
    resultBox.className = 'modal-result';
    availabilityResultBox.className = 'modal-result';
    document.getElementById('rm-id').value = id;
    openModal('restaurant-modal');

    // The admin list view is a flattened summary — fetch the full document
    // (public GET, reused rather than duplicated) so fields like fees are available to edit.
    try {
      const res = await apiRequest(`/restaurants/${id}`);
      const r = res.data;
      document.getElementById('rm-name').value = r.name || '';
      document.getElementById('rm-address').value = r.address || '';
      document.getElementById('rm-phone').value = r.phone || '';
      document.getElementById('rm-description').value = r.description || '';
      document.getElementById('rm-cuisine').value = (r.cuisine || []).join(', ');
      document.getElementById('rm-deliveryFee').value = r.deliveryFee ?? '';
      document.getElementById('rm-rating').value = r.rating ?? '';
      document.getElementById('rm-ratingCount').value = r.ratingCount ?? '';
      document.getElementById('rm-homeOrder').value = (r.homeOrder && r.homeOrder < 999999) ? r.homeOrder : '';
      document.getElementById('rm-displayPriority').value = r.displayPriority ?? 0;
      document.getElementById('rm-isFeatured').checked = r.isFeatured === true;
      document.getElementById('rm-isBestSeller').checked = r.isBestSeller === true;
      document.getElementById('rm-isNearFast').checked = r.isNearFast === true;
      document.getElementById('rm-freeDeliveryEnabled').checked = r.freeDeliveryEnabled !== false;
      document.getElementById('rm-codEnabled').checked = r.codEnabled === true;
      document.getElementById('rm-freeDeliveryAbove').value = r.freeDeliveryAbove ?? '';
      document.getElementById('rm-deliveryRadiusKm').value = r.deliveryRadiusKm ?? 15;
      const gallery = Array.isArray(r.images) && r.images.length ? r.images : (r.image ? [r.image] : []);
      for (let i = 1; i <= 4; i++) {
        const input = document.getElementById(`rm-image-${i}`);
        input.value = gallery[i - 1] || '';
        input.dispatchEvent(new Event('change'));
      }

      const availabilityStatus = r.availabilityStatus || 'open';
      availabilityStatusSelect.value = availabilityStatus;
      autoHoursToggle.checked = !!r.autoHours;
      opensAtInput.value = r.opensAt || '';
      closesAtInput.value = r.closesAt || '';
      renderAvailabilityBadge(availabilityStatus);
      updateHoursRowState();
      setWeeklyHours('rm-weekly-hours', r.openingHours);
    } catch (err) {
      resultBox.textContent = err.message || 'Could not load restaurant details.';
      resultBox.className = 'modal-result show error';
    }
  }

  async function saveAvailability() {
    if (savingAvailability) return;

    const id = document.getElementById('rm-id').value;
    const status = availabilityStatusSelect.value;
    const autoHours = autoHoursToggle.checked;
    const opensAt = opensAtInput.value;
    const closesAt = closesAtInput.value;

    availabilityResultBox.className = 'modal-result';

    if (!autoHours && (!opensAt || !closesAt)) {
      availabilityResultBox.textContent = 'Set both Opens At and Closes At, or enable Auto Hours.';
      availabilityResultBox.className = 'modal-result show error';
      return;
    }

    const statusLabel = AVAILABILITY_LABELS[status];
    const hoursSummary = autoHours ? 'Auto Hours enabled.' : `Manual hours ${opensAt}–${closesAt}.`;
    if (!confirm(`Save availability changes?\n\nStatus: ${statusLabel}\n${hoursSummary}`)) return;

    savingAvailability = true;
    availabilitySaveBtn.disabled = true;
    const originalLabel = availabilitySaveBtn.textContent;
    availabilitySaveBtn.textContent = 'Saving…';

    try {
      const body = { availabilityStatus: status, autoHours };
      if (!autoHours) {
        body.opensAt = opensAt;
        body.closesAt = closesAt;
      }
      await apiRequest(`/restaurants/${id}/availability`, { method: 'PATCH', body });
      renderAvailabilityBadge(status);
      availabilityResultBox.textContent = 'Availability updated.';
      availabilityResultBox.className = 'modal-result show success';
      showToast('Availability updated.', 'success');
      loadRestaurants();
    } catch (err) {
      availabilityResultBox.textContent = err.message || 'Could not update availability.';
      availabilityResultBox.className = 'modal-result show error';
      showToast(err.message || 'Could not update availability.', 'error');
    } finally {
      savingAvailability = false;
      availabilitySaveBtn.disabled = false;
      availabilitySaveBtn.textContent = originalLabel;
    }
  }
  availabilitySaveBtn.addEventListener('click', saveAvailability);
  bindWeeklyHours('rm-weekly-hours');

  editForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (saving) return;

    let valid = true;
    setFieldError('rm-name', ''); setFieldError('rm-cuisine', '');
    for (let i = 1; i <= 4; i++) setFieldError(`rm-image-${i}`, '');

    const name = document.getElementById('rm-name').value.trim();
    if (!name) { setFieldError('rm-name', 'Name is required.'); valid = false; }

    const cuisine = document.getElementById('rm-cuisine').value.split(',').map(s => s.trim()).filter(Boolean);
    if (!cuisine.length) { setFieldError('rm-cuisine', 'At least one cuisine is required.'); valid = false; }

    const images = [1,2,3,4].map(i => document.getElementById(`rm-image-${i}`).value.trim()).filter(Boolean);
    images.forEach((url, idx) => {
      if (!/^https?:\/\/.+/i.test(url)) { setFieldError(`rm-image-${idx + 1}`, 'Must be a valid http(s) URL.'); valid = false; }
    });
    const rating = Number(document.getElementById('rm-rating').value);
    if (!Number.isFinite(rating) || rating < 1 || rating > 5) { setFieldError('rm-rating', 'Rating must be between 1 and 5.'); valid = false; }

    const homeOrderRaw = document.getElementById('rm-homeOrder').value.trim();
    if (homeOrderRaw !== '') {
      const homeOrder = Number(homeOrderRaw);
      if (!Number.isInteger(homeOrder) || homeOrder < 1 || homeOrder > 999999) {
        showToast('Homepage position must be a whole number from 1 to 999999.', 'error');
        valid = false;
      }
    }

    const deliveryRadiusKm = Number(document.getElementById('rm-deliveryRadiusKm').value || 15);
    if (!Number.isFinite(deliveryRadiusKm) || deliveryRadiusKm <= 0 || deliveryRadiusKm > 100) {
      showToast('Delivery radius must be between 0 and 100 km.', 'error');
      valid = false;
    }

    if (!valid) return;

    saving = true;
    saveBtn.disabled = true;
    saveText.innerHTML = '<span class="btn-spinner"></span> Saving…';

    try {
      const body = {
        name,
        address: document.getElementById('rm-address').value.trim(),
        phone: document.getElementById('rm-phone').value.trim(),
        description: document.getElementById('rm-description').value.trim(),
        openingHours: getWeeklyHours('rm-weekly-hours'),
        cuisine,
        image: images[0] || '',
        images,
        rating,
        ratingCount: Number(document.getElementById('rm-ratingCount').value || 0),
        homeOrder: document.getElementById('rm-homeOrder').value ? Number(document.getElementById('rm-homeOrder').value) : 999999,
        displayPriority: Number(document.getElementById('rm-displayPriority').value || 0),
        isFeatured: document.getElementById('rm-isFeatured').checked,
        isBestSeller: document.getElementById('rm-isBestSeller').checked,
        isNearFast: document.getElementById('rm-isNearFast').checked,
        freeDeliveryEnabled: document.getElementById('rm-freeDeliveryEnabled').checked,
        codEnabled: document.getElementById('rm-codEnabled').checked,
        freeDeliveryAbove: Number(document.getElementById('rm-freeDeliveryAbove').value || 0),
        deliveryRadiusKm: Number(document.getElementById('rm-deliveryRadiusKm').value || 15),
      };
      const deliveryFee = document.getElementById('rm-deliveryFee').value;
      if (deliveryFee !== '') body.deliveryFee = Number(deliveryFee);

      await apiRequest(`/restaurants/${document.getElementById('rm-id').value}`, { method: 'PUT', body });
      resultBox.textContent = 'Restaurant updated.';
      resultBox.className = 'modal-result show success';
      showToast('Restaurant updated.', 'success');
      loadRestaurants();
      setTimeout(() => closeModal('restaurant-modal'), 700);
    } catch (err) {
      resultBox.textContent = err.message || 'Could not update restaurant.';
      resultBox.className = 'modal-result show error';
    } finally {
      saving = false;
      saveBtn.disabled = false;
      saveText.textContent = 'Save changes';
    }
  });

  // ── Filters ─────────────────────────────────────────────────
  searchInput.addEventListener('input', debounce(() => {
    state.search = searchInput.value.trim();
    loadRestaurants();
  }, 350));

  statusFilter.addEventListener('change', () => {
    state.status = statusFilter.value;
    loadRestaurants();
  });

  document.addEventListener('admin:view-changed', (e) => {
    if (e.detail.view === 'manage-restaurants' && !loadedOnce) {
      loadedOnce = true;
      loadRestaurants();
    }
  });
})();
