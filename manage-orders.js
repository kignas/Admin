/* ==========================================================================
   MODULE 5 — Order Management
   Confirmed backend contract:
     GET   /admin/orders?search=&status=&page=&limit=
           → { data:{ orders:[compact], total, page, pages } }  (supports search)
     GET   /orders/all?status=&page=&limit=   (admin)
           → { data:[full order docs], total, page, pages }
           Full docs include items, statusHistory, paymentStatus, cancelReason
           and live restaurant info — used for the details modal/timeline.
     PATCH /admin/orders/:id/status   body { status }   — only backend-valid transitions
     PATCH /admin/orders/:id/cancel   body { reason }
     PUT   /orders/:id/assign-rider   body { riderId }  (orders in waiting_for_rider)
     GET   /admin/riders              rider options for manual assignment

   Status transitions are exactly what adminController.updateOrderStatus allows.
   ========================================================================== */
(function () {
  const tableWrap = document.getElementById('orders-table-wrap');
  const footer = document.getElementById('orders-footer');
  const pageInfo = document.getElementById('orders-page-info');
  const paginationEl = document.getElementById('orders-pagination');
  const countEl = document.getElementById('orders-count');
  const searchInput = document.getElementById('orders-search');
  const statusFilter = document.getElementById('orders-status-filter');

  const STATUS_BADGE = {
    placed: 'muted', confirmed: 'warning', preparing: 'warning',
    waiting_for_rider: 'warning', assigned: 'warning', out_for_delivery: 'warning',
    otp_verified: 'warning', delivered: 'success', cancelled: 'danger',
  };

  // Backend transition map (adminController.updateOrderStatus).
  const TRANSITIONS = {
    placed: ['confirmed', 'cancelled'],
    confirmed: ['preparing', 'cancelled'],
    preparing: ['waiting_for_rider', 'cancelled'],
    waiting_for_rider: ['assigned', 'cancelled'],
    assigned: ['out_for_delivery', 'cancelled'],
    out_for_delivery: ['otp_verified', 'cancelled'],
    otp_verified: ['delivered'],
    delivered: [],
    cancelled: [],
  };
  const ALL_STATUSES = Object.keys(TRANSITIONS);

  const state = { page: 1, limit: 15, search: '', status: '' };
  let loadedOnce = false;
  let availableRiders = [];
  let busy = false;

  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pretty = (s) => String(s || '').replace(/_/g, ' ');

  /* ── Normalisation: both endpoints feed one renderer ───────── */
  function fromCompact(o) {
    return {
      id: o.id || o._id,
      orderNumber: o.publicOrderId || o.orderNumber || o.id || '',
      shipmentId: o.publicShipmentId || o.shipmentId || '',
      customerName: o.customerName || 'Unknown',
      customerPhone: o.customerPhone || '',
      restaurantName: o.restaurantName || '—',
      restaurantAddress: '', restaurantPhone: '',
      totalAmount: o.totalAmount,
      status: String(o.status || '').toLowerCase(),
      paymentMethod: o.paymentMethod || '',
      paymentStatus: '',
      commission: o.commission || null,
      createdAt: o.createdAt,
      cancelReason: '',
      riderId: '', riderName: o.riderName || '',
      items: null, statusHistory: null,
      hasDetail: false,
    };
  }

  function fromFull(o) {
    const user = (o.user && typeof o.user === 'object') ? o.user : {};
    let riderId = '', riderName = '';
    if (o.rider) {
      if (typeof o.rider === 'object') {
        riderId = o.rider._id || '';
        riderName = o.rider.name || '';
      } else {
        riderId = String(o.rider);
      }
    }
    return {
      id: o._id || o.id,
      orderNumber: o.publicOrderId || o.orderNumber || o._id || '',
      shipmentId: o.publicShipmentId || o.shipmentId || '',
      customerName: user.name || o.customerName || 'Unknown',
      customerPhone: user.phone || o.customerPhone || '',
      restaurantName: o.restaurantName || '—',
      restaurantAddress: o.restaurantAddress || '',
      restaurantPhone: o.restaurantPhone || '',
      totalAmount: o.total ?? o.totalAmount,
      status: String(o.status || '').toLowerCase(),
      paymentMethod: o.paymentMethod || '',
      paymentStatus: o.paymentStatus || '',
      commission: o.commission || null,
      createdAt: o.createdAt,
      cancelReason: o.cancelReason || '',
      riderId, riderName,
      items: Array.isArray(o.items) ? o.items : null,
      statusHistory: Array.isArray(o.statusHistory) ? o.statusHistory : null,
      hasDetail: true,
    };
  }

  async function loadRiders() {
    try {
      const res = await apiRequest('/admin/riders', { query: { page: 1, limit: 100 } });
      const riders = Array.isArray(res.data) ? res.data : (res.data?.riders || []);
      availableRiders = riders.filter(r => r.isActive !== false);
    } catch (err) {
      console.error('Could not load riders for assignment dropdown', err);
      availableRiders = [];
    }
  }

  /* ── Table ─────────────────────────────────────────────────── */
  function statusCell(o) {
    const options = TRANSITIONS[o.status] || [];
    if (!options.length) {
      return `<span class="badge badge-${STATUS_BADGE[o.status] || 'muted'}">${esc(pretty(o.status))}</span>`;
    }
    return `<select class="status-select" data-id="${esc(o.id)}" data-current="${esc(o.status)}" aria-label="Order status">
      <option value="${esc(o.status)}" selected>${esc(pretty(o.status))}</option>
      ${options.map(s => `<option value="${s}">${esc(pretty(s))}</option>`).join('')}
    </select>`;
  }

  function riderCell(o) {
    // Manual assignment is only possible while the order waits for a rider
    // (backend: PUT /orders/:id/assign-rider).
    if (o.status === 'waiting_for_rider') {
      return `<select class="rider-select" data-id="${esc(o.id)}" data-current="${esc(o.riderId)}" aria-label="Assign rider">
        <option value="">${o.riderId ? 'Unassigned' : 'Unassigned'}</option>
        ${availableRiders.map(r => {
          const rid = r._id || r.id;
          return `<option value="${esc(rid)}" ${o.riderId === rid ? 'selected' : ''}>${esc(r.name)}</option>`;
        }).join('')}
      </select>`;
    }
    if (o.riderName) return `<span class="badge badge-muted">${esc(o.riderName)}</span>`;
    if (o.riderId) return `<span class="badge badge-muted" title="Rider id ${esc(o.riderId)} — name not returned by this endpoint">Assigned</span>`;
    return `<span class="row-sub">—</span>`;
  }

  function renderTable(orders) {
    if (!orders.length) {
      tableWrap.innerHTML = `<div class="state-block">
        <h4>No orders found</h4>
        <p>${state.search || state.status ? 'Try a different search or filter.' : 'Orders will show up here as customers place them.'}</p>
      </div>`;
      return;
    }

    tableWrap.innerHTML = `
      <table class="data-table">
        <thead>
          <tr>
            <th>Order / Shipment</th><th>Customer</th><th>Restaurant</th><th>Total</th>
            <th>Payment</th><th>Rider</th><th>Status</th><th>Placed</th><th></th>
          </tr>
        </thead>
        <tbody>
          ${orders.map(o => `
            <tr data-id="${esc(o.id)}">
              <td class="mono row-name">
                <div>${esc(o.orderNumber)}</div>
                ${o.shipmentId ? `<div class="row-sub mono">Shipment: ${esc(o.shipmentId)}</div>` : ''}
              </td>
              <td>
                <div>${esc(o.customerName)}</div>
                <div class="row-sub mono">${esc(o.customerPhone)}</div>
              </td>
              <td>${esc(o.restaurantName)}</td>
              <td class="mono">${formatMoney(o.totalAmount)}</td>
              <td>
                <div>${esc(o.paymentMethod || '—')}</div>
                ${o.paymentStatus ? `<div class="row-sub">${esc(o.paymentStatus)}</div>` : ''}
              </td>
              <td>${riderCell(o)}</td>
              <td>${statusCell(o)}</td>
              <td class="mono">${formatDate(o.createdAt)}</td>
              <td>
                <div class="row-actions">
                  <button class="btn btn-sm btn-ghost order-detail-btn" data-id="${esc(o.id)}">Details</button>
                  ${(TRANSITIONS[o.status] || []).length && o.status !== 'delivered' && o.status !== 'cancelled'
                    ? `<button class="icon-btn order-cancel-btn" data-id="${esc(o.id)}" title="Cancel order">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><path d="m9 9 6 6M15 9l-6 6"/></svg>
                      </button>` : ''}
                </div>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;

    tableWrap.querySelectorAll('.status-select').forEach(sel =>
      sel.addEventListener('change', () => updateStatus(sel)));
    tableWrap.querySelectorAll('.rider-select').forEach(sel =>
      sel.addEventListener('change', () => updateRider(sel)));
    tableWrap.querySelectorAll('.order-cancel-btn').forEach(btn =>
      btn.addEventListener('click', () => openCancelModal(btn.dataset.id)));
    tableWrap.querySelectorAll('.order-detail-btn').forEach(btn =>
      btn.addEventListener('click', () => openDetail(btn.dataset.id)));
  }

  /* ── Loading (dual source, normalised) ─────────────────────── */
  async function loadOrders() {
    tableWrap.innerHTML = `<div class="state-block"><div class="spinner-lg"></div></div>`;
    try {
      let rows, total, page, pages;
      if (state.search) {
        // Search is supported by /admin/orders (compact rows).
        const res = await apiRequest('/admin/orders', {
          query: { search: state.search, status: state.status, page: state.page, limit: state.limit },
        });
        const d = res.data || {};
        rows = (d.orders || []).map(fromCompact);
        total = d.total ?? rows.length; page = d.page ?? state.page; pages = d.pages ?? 1;
      } else {
        // Rich rows (items, timeline, payment status) from the admin full list.
        const res = await apiRequest('/orders/all', {
          query: { status: state.status, page: state.page, limit: state.limit },
        });
        rows = (res.data || []).map(fromFull);
        total = res.total ?? rows.length; page = res.page ?? state.page; pages = res.pages ?? 1;
      }
      countEl.textContent = `${total} order${total === 1 ? '' : 's'}`;
      window.__adminOrderRows = rows;
      renderTable(rows);
      if (total > state.limit) {
        footer.style.display = 'flex';
        renderPagination(paginationEl, pageInfo, { page, pages, total }, (p) => { state.page = p; loadOrders(); });
      } else {
        footer.style.display = 'none';
      }
    } catch (err) {
      tableWrap.innerHTML = `<div class="state-block"><h4>Could not load orders</h4><p>${esc(err.message)}</p>
        <button class="btn btn-ghost btn-sm" id="orders-retry">Retry</button></div>`;
      document.getElementById('orders-retry')?.addEventListener('click', loadOrders);
    }
  }

  /* ── Actions ───────────────────────────────────────────────── */
  async function updateStatus(sel) {
    if (busy) return;
    const newStatus = sel.value;
    const prev = sel.dataset.current;
    if (newStatus === prev) return;
    busy = true;
    sel.disabled = true;
    try {
      await apiRequest(`/admin/orders/${sel.dataset.id}/status`, { method: 'PATCH', body: { status: newStatus } });
      showToast(`Order moved to “${pretty(newStatus)}”.`, 'success');
      await loadOrders();
    } catch (err) {
      sel.value = prev;
      showToast(err.message || 'Could not update order status.', 'error');
    } finally {
      busy = false;
      sel.disabled = false;
    }
  }

  async function updateRider(sel) {
    if (busy) return;
    const newRiderId = sel.value;
    const prev = sel.dataset.current;
    if (!newRiderId) {
      showToast('Pick a rider to assign — the backend has no unassign action.', 'info');
      sel.value = prev;
      return;
    }
    busy = true;
    sel.disabled = true;
    try {
      await apiRequest(`/orders/${sel.dataset.id}/assign-rider`, { method: 'PUT', body: { riderId: newRiderId } });
      sel.dataset.current = newRiderId;
      showToast('Rider assigned successfully.', 'success');
      await loadOrders();
    } catch (err) {
      sel.value = prev;
      showToast(err.message || 'Could not assign rider.', 'error');
    } finally {
      busy = false;
      sel.disabled = false;
    }
  }

  /* ── Details modal ─────────────────────────────────────────── */
  function detailModal() {
    let m = document.getElementById('order-detail-modal');
    if (m) return m;
    m = document.createElement('div');
    m.id = 'order-detail-modal';
    m.className = 'modal-overlay';
    m.innerHTML = `<div class="modal-box" style="max-width:720px;">
      <div class="modal-head"><h3>Order details</h3><button class="modal-close" data-close-modal="order-detail-modal" type="button">✕</button></div>
      <div class="modal-body" id="order-detail-body"></div>
      <div class="modal-foot"><button type="button" class="btn btn-ghost" data-close-modal="order-detail-modal">Close</button></div>
    </div>`;
    document.body.appendChild(m);
    return m;
  }

  function openDetail(id) {
    const o = (window.__adminOrderRows || []).find(x => String(x.id) === String(id));
    if (!o) return;
    const m = detailModal();
    const body = m.querySelector('#order-detail-body');
    const timeline = (o.statusHistory || []).slice().reverse();

    body.innerHTML = `
      <div class="detail-head">
        <div>
          <div class="detail-title mono">${esc(o.orderNumber)}</div>
          <div class="detail-sub">${o.shipmentId ? `Shipment <span class="mono">${esc(o.shipmentId)}</span> · ` : ''}${formatDate(o.createdAt)}</div>
        </div>
        <span class="badge badge-${STATUS_BADGE[o.status] || 'muted'}">${esc(pretty(o.status))}</span>
      </div>

      ${o.cancelReason ? `<div class="callout callout-danger"><strong>Cancellation reason</strong><p>${esc(o.cancelReason)}</p></div>` : ''}

      <div class="form-grid">
        <div class="field"><label>Customer</label><div>${esc(o.customerName)}</div><div class="hint mono">${esc(o.customerPhone)}</div></div>
        <div class="field"><label>Restaurant</label><div>${esc(o.restaurantName)}</div>${o.restaurantPhone ? `<div class="hint mono">${esc(o.restaurantPhone)}</div>` : ''}</div>
        ${o.restaurantAddress ? `<div class="field span-2"><label>Restaurant address</label><div>${esc(o.restaurantAddress)}</div></div>` : ''}
        <div class="field"><label>Order amount</label><div class="mono">${formatMoney(o.totalAmount)}</div></div>
        <div class="field"><label>Payment</label><div>${esc(o.paymentMethod || '—')}${o.paymentStatus ? ` · ${esc(o.paymentStatus)}` : ''}</div></div>
        ${o.commission ? `<div class="field span-2"><label>Commission snapshot</label>
          <div class="mono">${Number(o.commission.rate ?? 0)}% of ${formatMoney(o.commission.baseAmount ?? 0)} = ${formatMoney(o.commission.amount ?? 0)} → restaurant net ${formatMoney(o.commission.restaurantNetAmount ?? 0)}</div>
          <div class="hint">Snapshot taken when the order was placed — later commission changes do not affect it.</div></div>` : ''}
        <div class="field"><label>Rider</label><div>${esc(o.riderName || (o.riderId ? 'Assigned' : 'Not assigned'))}</div></div>
      </div>

      ${o.items ? `
        <div class="field"><label>Items (${o.items.length})</label>
          <div class="mini-list">${o.items.map(it => `
            <div class="mini-row">
              <div><div class="name">${esc(it.name || 'Item')} × ${esc(it.quantity ?? 1)}</div>
              ${it.customizationsSelected?.length || it.addons?.length ? `<div class="meta">${esc(JSON.stringify(it.customizationsSelected || it.addons))}</div>` : ''}</div>
              <div class="mono">${formatMoney((it.price ?? 0) * (it.quantity ?? 1))}</div>
            </div>`).join('')}</div>
        </div>` : `
        <div class="callout callout-muted"><strong>Line items unavailable in search mode</strong>
          <span class="hint">Clear the search box to load full order documents (items, timeline, payment status) from <code>GET /orders/all</code>.</span>
        </div>`}

      ${timeline.length ? `
        <div class="field"><label>Status timeline</label>
          <div class="timeline">${timeline.map(ev => `
            <div class="timeline-item">
              <span class="timeline-dot"></span>
              <div>
                <div class="row-name">${esc(pretty(ev.status || ''))}</div>
                <div class="row-sub">${esc(ev.note || '')}${ev.createdAt || ev.at ? ` · ${formatDate(ev.createdAt || ev.at)}` : ''}</div>
              </div>
            </div>`).join('')}</div>
        </div>` : (o.statusHistory === null && !o.hasDetail ? '' : `
        <div class="field"><label>Status timeline</label><div class="row-sub">No timeline entries returned for this order.</div></div>`)}
    `;
    openModal('order-detail-modal');
  }

  /* ── Cancel modal (reason required) ────────────────────────── */
  const cancelForm = document.getElementById('cancel-order-form');
  const cancelSaveBtn = document.getElementById('cancel-order-save');
  const cancelSaveText = document.getElementById('cancel-order-save-text');
  const cancelResult = document.getElementById('cancel-order-modal-result');
  let cancelling = false;

  function openCancelModal(id) {
    cancelForm.reset();
    document.querySelector('[data-error-for="co-reason"]').textContent = '';
    cancelResult.className = 'modal-result';
    document.getElementById('co-id').value = id;
    openModal('cancel-order-modal');
  }

  cancelForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (cancelling) return;

    const reason = document.getElementById('co-reason').value.trim();
    if (!reason) {
      document.querySelector('[data-error-for="co-reason"]').textContent = 'A reason is required.';
      return;
    }
    if (!confirm(`Cancel this order?\n\nReason: ${reason}\n\nThe backend will release inventory and refund online payments.`)) return;
    document.querySelector('[data-error-for="co-reason"]').textContent = '';

    cancelling = true;
    cancelSaveBtn.disabled = true;
    cancelSaveText.innerHTML = '<span class="btn-spinner"></span> Cancelling…';

    try {
      await apiRequest(`/admin/orders/${document.getElementById('co-id').value}/cancel`, {
        method: 'PATCH',
        body: { reason },
      });
      cancelResult.textContent = 'Order cancelled.';
      cancelResult.className = 'modal-result show success';
      showToast('Order cancelled.', 'success');
      loadOrders();
      setTimeout(() => closeModal('cancel-order-modal'), 700);
    } catch (err) {
      cancelResult.textContent = err.message || 'Could not cancel order.';
      cancelResult.className = 'modal-result show error';
    } finally {
      cancelling = false;
      cancelSaveBtn.disabled = false;
      cancelSaveText.textContent = 'Cancel order';
    }
  });

  /* ── Filters ───────────────────────────────────────────────── */
  searchInput.addEventListener('input', debounce(() => {
    state.search = searchInput.value.trim();
    state.page = 1;
    loadOrders();
  }, 350));

  statusFilter.addEventListener('change', () => {
    state.status = statusFilter.value;
    state.page = 1;
    loadOrders();
  });

  // Called by admin-push.js when a new-order push arrives while the portal is open.
  window.refreshAdminOrders = () => { if (loadedOnce) loadOrders(); };

  document.addEventListener('admin:view-changed', async (e) => {
    if (e.detail.view === 'manage-orders' && !loadedOnce) {
      loadedOnce = true;
      await loadRiders();
      loadOrders();
    } else if (e.detail.view === 'manage-orders') {
      loadOrders();
    }
  });
})();
