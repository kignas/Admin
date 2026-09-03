(function () {
  const VEHICLE_LABELS = { bike: 'Bike', scooter: 'Scooter', bicycle: 'Bicycle', car: 'Car' };

  // ── Stats row ─────────────────────────────────────────────────
  const statTotal = document.getElementById('riders-stat-total');
  const statOnline = document.getElementById('riders-stat-online');
  const statOffline = document.getElementById('riders-stat-offline');
  const statActive = document.getElementById('riders-stat-active');

  async function loadStats() {
    try {
      const [allRes, onlineRes] = await Promise.all([
        apiRequest('/admin/riders', { query: { page: 1, limit: 1 } }),
        apiRequest('/admin/riders', { query: { online: 'true', page: 1, limit: 1 } }),
      ]);
      const total = allRes.data.total;
      const online = onlineRes.data.total;
      statTotal.textContent = total;
      statOnline.textContent = online;
      statOffline.textContent = Math.max(0, total - online);
    } catch (err) {
      statTotal.textContent = '—';
      statOnline.textContent = '—';
      statOffline.textContent = '—';
    }
    // No backend aggregation for in-progress deliveries yet — see adminController.getMetrics.
    // Falls back to 0 until that's wired up; nothing to fetch here in the meantime.
    statActive.textContent = '0';
  }

  // ── Rider list ────────────────────────────────────────────────
  const tableWrap = document.getElementById('riders-table-wrap');
  const footer = document.getElementById('riders-footer');
  const pageInfo = document.getElementById('riders-page-info');
  const paginationEl = document.getElementById('riders-pagination');
  const countEl = document.getElementById('riders-count');
  const searchInput = document.getElementById('riders-search');
  const onlineFilter = document.getElementById('riders-online-filter');
  const statusFilter = document.getElementById('riders-status-filter');
  const addBtn = document.getElementById('rider-add-btn');

  const state = { page: 1, limit: 10, search: '', online: '', status: '' };
  let currentRiders = [];

  // Every other field in this panel is escaped; avatar was the exception, and
  // it goes straight into a src="" attribute. Today only Cloudinary URLs land
  // there, but the field is not inherently trustworthy and this file renders
  // rider-controlled data inside the admin's browser — exactly the direction
  // an escalation would travel.
  function safeImageUrl(value) {
    if (!value) return '';
    try {
      const u = new URL(String(value), location.href);
      return (u.protocol === 'https:' || u.protocol === 'http:') ? u.href : '';
    } catch (_) { return ''; }
  }

  function avatarCell(r) {
    const src = safeImageUrl(r.avatar);
    if (src) {
      return `<img src="${escapeHtml(src)}" alt="" style="width:36px;height:36px;border-radius:50%;object-fit:cover;flex-shrink:0;" />`;
    }
    return `<div class="avatar" style="width:36px;height:36px;font-size:13px;flex-shrink:0;">${escapeHtml(initials(r.name))}</div>`;
  }

  function renderTable(riders) {
    if (!riders.length) {
      tableWrap.innerHTML = `<div class="state-block">
        <h4>No riders found</h4>
        <p>${state.search || state.status || state.online ? 'Try a different search or filter.' : 'Add your first rider to get started.'}</p>
      </div>`;
      return;
    }

    tableWrap.innerHTML = `
      <table class="data-table">
        <thead>
          <tr>
            <th>Rider</th><th>Contact</th><th>Vehicle</th><th>Zone</th><th>Online</th><th>Status</th><th></th>
          </tr>
        </thead>
        <tbody>
          ${riders.map(r => {
            const rd = r.riderDetails || {};
            return `
            <tr data-id="${r._id}">
              <td>
                <div style="display:flex;align-items:center;gap:10px;">
                  ${avatarCell(r)}
                  <div>
                    <div class="row-name">${escapeHtml(r.name)}</div>
                    <div class="row-sub">Joined ${formatDate(r.createdAt)}</div>
                  </div>
                </div>
              </td>
              <td>
                <div>${escapeHtml(r.email)}</div>
                <div class="row-sub mono">${escapeHtml(r.phone)}</div>
              </td>
              <td>
                <div class="row-name">${escapeHtml(VEHICLE_LABELS[rd.vehicleType] || rd.vehicleType || '—')}</div>
                <div class="row-sub mono">${escapeHtml(rd.vehicleNumber || '—')}</div>
              </td>
              <td>${escapeHtml(rd.deliveryZone || '—')}</td>
              <td>
                <span class="badge ${rd.isOnline ? 'badge-success' : 'badge-muted'}">${rd.isOnline ? 'Online' : 'Offline'}</span>
              </td>
              <td>
                <label class="switch" title="${r.isActive ? 'Disable rider' : 'Enable rider'}">
                  <input type="checkbox" class="rider-toggle" data-id="${r._id}" ${r.isActive ? 'checked' : ''} />
                  <span class="track"></span>
                </label>
              </td>
              <td>
                <div class="row-actions">
                  <button class="icon-btn rider-view-btn" data-id="${r._id}" title="View details">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>
                  </button>
                  <button class="icon-btn rider-edit-btn" data-id="${r._id}" title="Edit rider">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
                  </button>
                  <button class="icon-btn rider-delete-btn" data-id="${r._id}" title="Delete rider">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16"/><path d="M9 7V4h6v3"/><path d="M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13"/><path d="M10 11v6M14 11v6"/></svg>
                  </button>
                </div>
              </td>
            </tr>
          `;
          }).join('')}
        </tbody>
      </table>
    `;

    tableWrap.querySelectorAll('.rider-toggle').forEach(input => {
      input.addEventListener('change', () => toggleRider(input));
    });
    tableWrap.querySelectorAll('.rider-view-btn').forEach(btn => {
      btn.addEventListener('click', () => openDetailModal(currentRiders.find(r => r._id === btn.dataset.id)));
    });
    tableWrap.querySelectorAll('.rider-edit-btn').forEach(btn => {
      btn.addEventListener('click', () => openEditModal(currentRiders.find(r => r._id === btn.dataset.id)));
    });
    tableWrap.querySelectorAll('.rider-delete-btn').forEach(btn => {
      const rider = currentRiders.find(r => r._id === btn.dataset.id);
      btn.addEventListener('click', () => deleteRider(rider));
    });
  }

  async function loadRiders() {
    tableWrap.innerHTML = `<div class="state-block"><div class="spinner-lg"></div></div>`;
    try {
      const res = await apiRequest('/admin/riders', {
        query: { search: state.search, status: state.status, online: state.online, page: state.page, limit: state.limit },
      });
      const { riders, total, page, pages } = res.data;
      currentRiders = riders;
      countEl.textContent = `${total} rider${total === 1 ? '' : 's'}`;
      renderTable(riders);
      if (total > state.limit) {
        footer.style.display = 'flex';
        renderPagination(paginationEl, pageInfo, { page, pages, total }, (p) => { state.page = p; loadRiders(); });
      } else {
        footer.style.display = 'none';
      }
    } catch (err) {
      tableWrap.innerHTML = `<div class="state-block"><h4>Could not load riders</h4><p>${escapeHtml(err.message)}</p></div>`;
    }
  }

  async function toggleRider(input) {
    input.disabled = true;
    try {
      const res = await apiRequest(`/admin/riders/${input.dataset.id}/status`, { method: 'PATCH' });
      showToast(res.message || 'Rider status updated.', 'success');
      loadRiders();
      loadStats();
    } catch (err) {
      input.checked = !input.checked; // revert
      showToast(err.message || 'Could not update rider status.', 'error');
    } finally {
      input.disabled = false;
    }
  }

  async function deleteRider(rider) {
    if (!rider) return;
    if (!confirm(`Delete ${rider.name}? This permanently removes their account and cannot be undone.`)) return;
    try {
      const res = await apiRequest(`/admin/riders/${rider._id}`, { method: 'DELETE' });
      showToast(res.message || 'Rider deleted.', 'success');
      loadRiders();
      loadStats();
    } catch (err) {
      // Surfaces the backend's 409 message as-is, e.g. an order in progress.
      showToast(err.message || 'Could not delete rider.', 'error');
    }
  }

  // ── View details modal ──────────────────────────────────────
  const detailBody = document.getElementById('rider-detail-body');

  function openDetailModal(rider) {
    if (!rider) return;
    const rd = rider.riderDetails || {};
    detailBody.innerHTML = `
      <div style="display:flex;align-items:center;gap:14px;margin-bottom:18px;">
        ${safeImageUrl(rider.avatar)
          ? `<img src="${escapeHtml(safeImageUrl(rider.avatar))}" alt="" style="width:64px;height:64px;border-radius:50%;object-fit:cover;" />`
          : `<div class="avatar" style="width:64px;height:64px;font-size:20px;">${escapeHtml(initials(rider.name))}</div>`}
        <div>
          <div class="row-name" style="font-size:16px;">${escapeHtml(rider.name)}</div>
          <span class="badge ${rider.isActive ? 'badge-success' : 'badge-muted'}">${rider.isActive ? 'Active' : 'Disabled'}</span>
          <span class="badge ${rd.isOnline ? 'badge-success' : 'badge-muted'}">${rd.isOnline ? 'Online' : 'Offline'}</span>
        </div>
      </div>
      <div class="form-grid">
        <div class="field"><label>Email</label><div class="row-name">${escapeHtml(rider.email)}</div></div>
        <div class="field"><label>Phone</label><div class="row-name mono">${escapeHtml(rider.phone)}</div></div>
        <div class="field"><label>Vehicle type</label><div class="row-name">${escapeHtml(VEHICLE_LABELS[rd.vehicleType] || rd.vehicleType || '—')}</div></div>
        <div class="field"><label>Vehicle number</label><div class="row-name mono">${escapeHtml(rd.vehicleNumber || '—')}</div></div>
        <div class="field span-2"><label>Delivery zone</label><div class="row-name">${escapeHtml(rd.deliveryZone || '—')}</div></div>
        <div class="field"><label>Joined</label><div class="row-name">${formatDate(rider.createdAt)}</div></div>
        <div class="field"><label>Last login</label><div class="row-name">${formatDate(rider.lastLogin)}</div></div>
      </div>
    `;
    openModal('rider-detail-modal');
  }

  // ── Add / Edit modal ─────────────────────────────────────────
  const form = document.getElementById('rider-edit-form');
  const saveBtn = document.getElementById('rider-modal-save');
  const saveText = document.getElementById('rider-modal-save-text');
  const resultBox = document.getElementById('rider-modal-result');
  const titleEl = document.getElementById('rider-modal-title');
  const passwordHint = document.getElementById('rd-password-hint');
  const photoInput = document.getElementById('rd-photo-input');
  const photoPreview = document.getElementById('rd-photo-preview');
  let selectedPhotoFile = null;
  let saving = false;

  const FIELD_IDS = ['rd-name', 'rd-email', 'rd-phone', 'rd-password', 'rd-vehicleType', 'rd-vehicleNumber', 'rd-deliveryZone'];

  function clearErrors() {
    FIELD_IDS.forEach(id => setFieldError(id, ''));
  }

  function setFieldError(id, msg) {
    const el = document.querySelector(`[data-error-for="${id}"]`);
    const input = document.getElementById(id);
    if (el) el.textContent = msg || '';
    if (input) input.classList.toggle('invalid', !!msg);
  }

  photoInput.addEventListener('change', () => {
    const file = photoInput.files[0];
    if (!file) return;
    selectedPhotoFile = file;
    photoPreview.innerHTML = `<img src="${URL.createObjectURL(file)}" alt="" style="width:100%;height:100%;object-fit:cover;" />`;
  });

  function openCreateModal() {
    form.reset();
    clearErrors();
    resultBox.className = 'modal-result';
    document.getElementById('rd-id').value = '';
    titleEl.textContent = 'Add rider';
    saveText.textContent = 'Create rider';
    passwordHint.textContent = '(min. 10 characters)';
    document.getElementById('rd-password').placeholder = 'Min. 10 characters';
    photoInput.value = '';
    selectedPhotoFile = null;
    photoPreview.innerHTML = '—';
    openModal('rider-modal');
  }

  function openEditModal(rider) {
    if (!rider) return;
    const rd = rider.riderDetails || {};
    form.reset();
    clearErrors();
    resultBox.className = 'modal-result';
    document.getElementById('rd-id').value = rider._id;
    titleEl.textContent = 'Edit rider';
    saveText.textContent = 'Save changes';
    passwordHint.textContent = '(leave blank to keep current password)';
    document.getElementById('rd-password').placeholder = 'Leave blank to keep current password';
    document.getElementById('rd-name').value = rider.name || '';
    document.getElementById('rd-email').value = rider.email || '';
    document.getElementById('rd-phone').value = rider.phone || '';
    document.getElementById('rd-password').value = '';
    document.getElementById('rd-vehicleType').value = rd.vehicleType || '';
    document.getElementById('rd-vehicleNumber').value = rd.vehicleNumber || '';
    document.getElementById('rd-deliveryZone').value = rd.deliveryZone || '';
    selectedPhotoFile = null;
    photoInput.value = '';
    photoPreview.innerHTML = safeImageUrl(rider.avatar)
      ? `<img src="${escapeHtml(safeImageUrl(rider.avatar))}" alt="" style="width:100%;height:100%;object-fit:cover;" />`
      : initials(rider.name);
    openModal('rider-modal');
  }

  addBtn.addEventListener('click', openCreateModal);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (saving) return;

    const id = document.getElementById('rd-id').value;
    const isCreate = !id;

    clearErrors();
    let valid = true;

    const name = document.getElementById('rd-name').value.trim();
    if (!name) { setFieldError('rd-name', 'Name is required.'); valid = false; }

    const email = document.getElementById('rd-email').value.trim();
    if (!email || !/^\S+@\S+\.\S+$/.test(email)) { setFieldError('rd-email', 'Enter a valid email.'); valid = false; }

    const phone = document.getElementById('rd-phone').value.trim();
    if (!phone || !/^\+?[1-9]\d{9,14}$/.test(phone)) { setFieldError('rd-phone', 'Enter a valid phone number.'); valid = false; }

    const password = document.getElementById('rd-password').value;
    if (isCreate && (!password || password.length < 10)) {
      setFieldError('rd-password', 'At least 10 characters.'); valid = false;
    } else if (password && password.length < 10) {
      setFieldError('rd-password', 'At least 10 characters.'); valid = false;
    }

    const vehicleType = document.getElementById('rd-vehicleType').value;
    if (!vehicleType) { setFieldError('rd-vehicleType', 'Select a vehicle type.'); valid = false; }

    const vehicleNumber = document.getElementById('rd-vehicleNumber').value.trim();
    if (!vehicleNumber) { setFieldError('rd-vehicleNumber', 'Vehicle number is required.'); valid = false; }

    const deliveryZone = document.getElementById('rd-deliveryZone').value.trim();
    if (!deliveryZone) { setFieldError('rd-deliveryZone', 'Delivery zone is required.'); valid = false; }

    if (!valid) return;

    saving = true;
    saveBtn.disabled = true;
    saveText.innerHTML = '<span class="btn-spinner"></span> Saving…';

    try {
      const fd = new FormData();
      fd.append('name', name);
      fd.append('email', email);
      fd.append('phone', phone);
      if (password) fd.append('password', password);
      fd.append('vehicleType', vehicleType);
      fd.append('vehicleNumber', vehicleNumber);
      fd.append('deliveryZone', deliveryZone);
      if (selectedPhotoFile) fd.append('photo', selectedPhotoFile);

      const path = isCreate ? '/admin/riders' : `/admin/riders/${id}`;
      await apiRequestMultipart(path, isCreate ? 'POST' : 'PUT', fd);

      resultBox.textContent = isCreate ? 'Rider created.' : 'Rider updated.';
      resultBox.className = 'modal-result show success';
      showToast(isCreate ? 'Rider created.' : 'Rider updated.', 'success');
      loadRiders();
      loadStats();
      setTimeout(() => closeModal('rider-modal'), 700);
    } catch (err) {
      resultBox.textContent = err.message || 'Could not save rider.';
      resultBox.className = 'modal-result show error';
    } finally {
      saving = false;
      saveBtn.disabled = false;
      saveText.textContent = isCreate ? 'Create rider' : 'Save changes';
    }
  });

  // ── Filters ───────────────────────────────────────────────────
  searchInput.addEventListener('input', debounce(() => {
    state.search = searchInput.value.trim();
    state.page = 1;
    loadRiders();
  }, 350));

  onlineFilter.addEventListener('change', () => {
    state.online = onlineFilter.value;
    state.page = 1;
    loadRiders();
  });

  statusFilter.addEventListener('change', () => {
    state.status = statusFilter.value;
    state.page = 1;
    loadRiders();
  });

  // Unlike manage-vendors' one-time load, riders refetch on every visit to
  // this view — online/offline status changes far more often than vendor
  // account details, so a stale "loadedOnce" cache would show wrong figures.
  document.addEventListener('admin:view-changed', (e) => {
    if (e.detail.view === 'manage-riders') {
      loadRiders();
      loadStats();
    }
  });
})();
