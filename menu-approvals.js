/* ==========================================================================
   MODULE 4 — Menu Item Approval
   Confirmed backend contract:
     GET   /api/menu/pending?restaurantId=   → { count, data: MenuItem[] }
           (approvalStatus:'pending', isActive ≠ false; restaurant + createdBy populated)
     PATCH /api/menu/:itemId/review/approve  → no body
     PATCH /api/menu/:itemId/review/reject   body { reason } (required, ≤500)

   Backend behaviour honoured here:
   - Vendor-created items start as approvalStatus 'pending' and are invisible
     to customers until approved; a material vendor edit resets them to pending.
   - Admin-created items (POST /api/menu) are auto-approved by the backend.
   ========================================================================== */
(function () {
  const wrap = document.getElementById('menu-approvals-wrap');
  const countEl = document.getElementById('menu-approvals-count');
  const searchInput = document.getElementById('menu-approvals-search');
  const restaurantFilter = document.getElementById('menu-approvals-restaurant-filter');
  const refreshBtn = document.getElementById('menu-approvals-refresh');

  let items = [];
  let busy = false;
  let restaurantsLoaded = false;

  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function searchMatch(item) {
    const q = (searchInput?.value || '').trim().toLowerCase();
    if (!q) return true;
    const restaurant = item.restaurantId && typeof item.restaurantId === 'object' ? item.restaurantId.name : '';
    return [item.name, item.category, restaurant].some(v => String(v || '').toLowerCase().includes(q));
  }

  function isResubmission(item) {
    if (!item.createdAt || !item.updatedAt) return false;
    return new Date(item.updatedAt).getTime() - new Date(item.createdAt).getTime() > 1000;
  }

  function render() {
    const visible = items.filter(searchMatch);
    countEl.textContent = `${items.length} pending${items.length !== visible.length ? ` · ${visible.length} shown` : ''}`;
    if (!visible.length) {
      wrap.innerHTML = `<div class="state-block"><h4>${items.length ? 'No items match your search' : 'Approval queue is clear'}</h4>
        <p>${items.length ? 'Adjust the search to see the other pending items.' : 'Vendor-submitted menu items appear here for review. Approved items go live immediately.'}</p></div>`;
      return;
    }

    wrap.innerHTML = `<table class="data-table"><thead><tr>
        <th>Image</th><th>Item</th><th>Restaurant</th><th>Price</th><th>Submitted</th><th>Status</th><th></th>
      </tr></thead><tbody>${visible.map(item => {
        const restaurant = item.restaurantId && typeof item.restaurantId === 'object' ? item.restaurantId.name : '—';
        const createdBy = item.createdBy && typeof item.createdBy === 'object'
          ? `by ${item.createdBy.name || item.createdBy.email || 'vendor'}` : '';
        return `<tr data-id="${esc(item._id)}">
          <td>${item.image
            ? `<img class="thumb-sm" src="${esc(item.image)}" alt="${esc(item.name)}" />`
            : `<div class="thumb-sm thumb-empty"></div>`}</td>
          <td>
            <div class="row-name">${esc(item.name)}</div>
            <div class="row-sub">${esc(item.category || '—')}${createdBy ? ` · ${esc(createdBy)}` : ''}</div>
          </td>
          <td>${esc(restaurant)}</td>
          <td class="mono">₹${esc(item.price)}${item.originalPrice ? ` <s>₹${esc(item.originalPrice)}</s>` : ''}</td>
          <td class="mono">${formatDate(item.createdAt)}${isResubmission(item) ? `<div class="row-sub">updated ${formatDate(item.updatedAt)}</div>` : ''}</td>
          <td><span class="badge badge-warning">Pending</span></td>
          <td>
            <div class="row-actions">
              <button class="btn btn-sm btn-primary ma-approve" data-id="${esc(item._id)}" data-name="${esc(item.name)}">Approve</button>
              <button class="btn btn-sm btn-danger ma-reject" data-id="${esc(item._id)}" data-name="${esc(item.name)}">Reject</button>
            </div>
          </td>
        </tr>`;
      }).join('')}</tbody></table>`;

    wrap.querySelectorAll('.ma-approve').forEach(btn =>
      btn.addEventListener('click', () => review(btn.dataset.id, 'approve')));
    wrap.querySelectorAll('.ma-reject').forEach(btn =>
      btn.addEventListener('click', () => openRejectForm(btn.dataset.id, btn.dataset.name)));
  }

  /* ── Reject form (dynamic modal) ───────────────────────────── */
  function rejectModal() {
    let m = document.getElementById('menu-review-modal');
    if (m) return m;
    m = document.createElement('div');
    m.id = 'menu-review-modal';
    m.className = 'modal-overlay';
    m.innerHTML = `<div class="modal-box">
      <div class="modal-head"><h3>Reject menu item</h3><button class="modal-close" data-close-modal="menu-review-modal" type="button">✕</button></div>
      <div class="modal-body">
        <div class="field">
          <label for="ma-reason">Rejection reason *</label>
          <textarea id="ma-reason" rows="4" maxlength="500"
            placeholder="e.g. Image is blurry and the price does not match the menu description."></textarea>
          <div class="hint">Sent to the vendor (backend field <code>rejectionReason</code>, max 500 characters).</div>
          <div class="error-msg" id="ma-reason-error"></div>
        </div>
      </div>
      <div class="modal-foot">
        <div class="modal-result" id="ma-modal-result"></div>
        <button type="button" class="btn btn-ghost" data-close-modal="menu-review-modal">Cancel</button>
        <button type="button" class="btn btn-danger" id="ma-send-reject">Reject item</button>
      </div>
    </div>`;
    document.body.appendChild(m);
    m.querySelector('#ma-send-reject').addEventListener('click', async () => {
      const id = m.dataset.id;
      const reason = m.querySelector('#ma-reason').value.trim();
      const errEl = m.querySelector('#ma-reason-error');
      const result = m.querySelector('#ma-modal-result');
      if (!reason) { errEl.textContent = 'A rejection reason is required by the backend.'; return; }
      errEl.textContent = '';
      const sendBtn = m.querySelector('#ma-send-reject');
      sendBtn.disabled = true;
      try {
        await apiRequest(`/menu/${id}/review/reject`, { method: 'PATCH', body: { reason } });
        result.textContent = 'Menu item rejected.';
        result.className = 'modal-result show success';
        showToast('Menu item rejected.', 'success');
        closeModal('menu-review-modal');
        await load();
      } catch (err) {
        result.textContent = err.message || 'Could not reject the item.';
        result.className = 'modal-result show error';
      } finally {
        sendBtn.disabled = false;
      }
    });
    return m;
  }

  function openRejectForm(id, name) {
    const m = rejectModal();
    m.dataset.id = id;
    m.querySelector('h3').textContent = `Reject “${name}”`;
    m.querySelector('#ma-reason').value = '';
    m.querySelector('#ma-reason-error').textContent = '';
    m.querySelector('#ma-modal-result').className = 'modal-result';
    openModal('menu-review-modal');
  }

  /* ── Approve / reject actions ──────────────────────────────── */
  async function review(id, action) {
    if (busy) return;
    if (action === 'approve' && !confirm('Approve this menu item? It becomes visible to customers immediately.')) return;
    busy = true;
    try {
      const res = await apiRequest(`/menu/${id}/review/${action}`, { method: 'PATCH' });
      showToast(res.message || 'Menu item approved.', 'success');
      await load();
    } catch (err) {
      showToast(err.message || 'Could not update the menu item.', 'error');
    } finally {
      busy = false;
    }
  }

  /* ── Data loading ──────────────────────────────────────────── */
  async function load() {
    wrap.innerHTML = '<div class="state-block"><div class="spinner-lg"></div></div>';
    try {
      const query = {};
      if (restaurantFilter?.value) query.restaurantId = restaurantFilter.value;
      const res = await apiRequest('/menu/pending', { query });
      items = Array.isArray(res.data) ? res.data : [];
      render();
    } catch (err) {
      wrap.innerHTML = `<div class="state-block"><h4>Could not load pending menu items</h4><p>${esc(err.message)}</p>
        <button class="btn btn-ghost btn-sm" id="ma-retry">Retry</button></div>`;
      document.getElementById('ma-retry')?.addEventListener('click', load);
    }
  }

  async function loadRestaurants() {
    if (restaurantsLoaded) return;
    try {
      const res = await apiRequest('/admin/restaurants', { query: { status: 'active' } });
      const list = res.data || [];
      restaurantFilter.innerHTML = `<option value="">All restaurants</option>` +
        list.map(r => `<option value="${esc(r.id)}">${esc(r.name)}</option>`).join('');
      restaurantsLoaded = true;
    } catch (_) {
      // Restaurant filter stays as "All restaurants" — the queue itself still loads.
    }
  }

  searchInput?.addEventListener('input', debounce(render, 250));
  restaurantFilter?.addEventListener('change', load);
  refreshBtn?.addEventListener('click', load);
  document.addEventListener('admin:view-changed', async (e) => {
    if (e.detail.view === 'menu-approvals') {
      await loadRestaurants();
      load();
    }
  });
})();
