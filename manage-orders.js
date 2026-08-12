(function () {
  const tableWrap = document.getElementById('orders-table-wrap');
  const footer = document.getElementById('orders-footer');
  const pageInfo = document.getElementById('orders-page-info');
  const paginationEl = document.getElementById('orders-pagination');
  const countEl = document.getElementById('orders-count');
  const searchInput = document.getElementById('orders-search');
  const statusFilter = document.getElementById('orders-status-filter');

  const STATUS_BADGE = {
    PLACED: 'muted', CONFIRMED: 'warning', PREPARING: 'warning',
    OUT_FOR_DELIVERY: 'warning', DELIVERED: 'success', CANCELLED: 'danger',
  };
  
  const SETTABLE_STATUSES = ['placed', 'confirmed', 'preparing', 'out_for_delivery', 'delivered'];
  const TERMINAL = ['DELIVERED', 'CANCELLED'];

  const state = { page: 1, limit: 15, search: '', status: '' };
  let loadedOnce = false;
  
  // NEW: Store available riders for the manual assignment dropdown
  let availableRiders = [];

  // NEW: Fetch active riders so we can populate the dropdown
  async function loadRiders() {
    try {
      // Assuming your admin routes have an endpoint to list riders
      const res = await apiRequest('/admin/riders'); 
      // Handle standard response shapes
      availableRiders = Array.isArray(res.data) ? res.data : (res.data.riders || res.data.users || []);
      // Filter to only show active riders
      availableRiders = availableRiders.filter(r => r.isActive !== false);
    } catch (err) {
      console.error("Could not load riders for assignment dropdown", err);
    }
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
            <th>Order / Shipment</th>
            <th>Customer</th>
            <th>Restaurant</th>
            <th>Total</th>
            <th>Rider</th> <!-- NEW RIDER COLUMN -->
            <th>Status</th>
            <th>Placed</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          ${orders.map(o => {
            // Safely extract rider ID and Name if already assigned
            const currentRiderId = o.rider ? (typeof o.rider === 'object' ? o.rider._id || o.rider.id : o.rider) : '';
            const currentRiderName = o.rider && typeof o.rider === 'object' ? o.rider.name : 'Assigned';

            return `
            <tr data-id="${o.id}">
              <td class="mono row-name">
                <div>${escapeHtml(o.publicOrderId || o.orderNumber || o.id || '')}</div>
                ${o.publicShipmentId || o.shipmentId ? `<div class="row-sub mono">Shipment: ${escapeHtml(o.publicShipmentId || o.shipmentId)}</div>` : ''}
              </td>
              <td>
                <div>${escapeHtml(o.customerName)}</div>
                <div class="row-sub mono">${escapeHtml(o.customerPhone || '')}</div>
              </td>
              <td>${escapeHtml(o.restaurantName)}</td>
              <td class="mono">${formatMoney(o.totalAmount)}</td>
              
              <!-- NEW: Rider Assignment Dropdown -->
              <td>
                ${TERMINAL.includes(o.status)
                  ? `<span class="badge badge-muted">${currentRiderId ? escapeHtml(currentRiderName) : 'Unassigned'}</span>`
                  : `<select class="rider-select" data-id="${o.id}" data-current="${currentRiderId}">
                      <option value="">Unassigned</option>
                      ${availableRiders.map(r => `
                        <option value="${r._id || r.id}" ${currentRiderId === (r._id || r.id) ? 'selected' : ''}>
                          ${escapeHtml(r.name)}
                        </option>
                      `).join('')}
                    </select>`}
              </td>

              <td>
                ${TERMINAL.includes(o.status)
                  ? `<span class="badge badge-${STATUS_BADGE[o.status] || 'muted'}">${o.status.replace(/_/g, ' ')}</span>`
                  : `<select class="status-select" data-id="${o.id}" data-current="${o.status}">
                      ${SETTABLE_STATUSES.map(s => `<option value="${s}" ${s.toUpperCase() === o.status ? 'selected' : ''}>${s.replace(/_/g, ' ')}</option>`).join('')}
                    </select>`}
              </td>
              <td class="mono">${formatDate(o.createdAt)}</td>
              <td>
                <div class="row-actions">
                  ${!TERMINAL.includes(o.status)
                    ? `<button class="icon-btn order-cancel-btn" data-id="${o.id}" title="Cancel order">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><path d="m9 9 6 6M15 9l-6 6"/></svg>
                      </button>`
                    : ''}
                </div>
              </td>
            </tr>
          `}).join('')}
        </tbody>
      </table>
    `;

    tableWrap.querySelectorAll('.status-select').forEach(sel => {
      sel.addEventListener('change', () => updateStatus(sel));
    });

    // NEW: Listen for Rider Assignment changes
    tableWrap.querySelectorAll('.rider-select').forEach(sel => {
      sel.addEventListener('change', () => updateRider(sel));
    });

    tableWrap.querySelectorAll('.order-cancel-btn').forEach(btn => {
      btn.addEventListener('click', () => openCancelModal(btn.dataset.id));
    });
  }

  async function loadOrders() {
    tableWrap.innerHTML = `<div class="state-block"><div class="spinner-lg"></div></div>`;
    try {
      const res = await apiRequest('/admin/orders', {
        query: { search: state.search, status: state.status, page: state.page, limit: state.limit },
      });
      const { orders, total, page, pages } = res.data;
      countEl.textContent = `${total} order${total === 1 ? '' : 's'}`;
      renderTable(orders);
      if (total > state.limit) {
        footer.style.display = 'flex';
        renderPagination(paginationEl, pageInfo, { page, pages, total }, (p) => { state.page = p; loadOrders(); });
      } else {
        footer.style.display = 'none';
      }
    } catch (err) {
      tableWrap.innerHTML = `<div class="state-block"><h4>Could not load orders</h4><p>${escapeHtml(err.message)}</p></div>`;
    }
  }

  async function updateStatus(sel) {
    const newStatus = sel.value;
    const prev = sel.dataset.current;
    sel.disabled = true;
    try {
      await apiRequest(`/admin/orders/${sel.dataset.id}/status`, { method: 'PATCH', body: { status: newStatus } });
      sel.dataset.current = newStatus.toUpperCase();
      showToast('Order status updated.', 'success');
    } catch (err) {
      sel.value = prev.toLowerCase();
      showToast(err.message || 'Could not update order status.', 'error');
    } finally {
      sel.disabled = false;
    }
  }

  // NEW: Function to handle saving the Rider assignment to the backend
  async function updateRider(sel) {
    const newRiderId = sel.value;
    const prev = sel.dataset.current;
    
    if (!newRiderId) {
      showToast('Cannot unassign a rider directly. Assign to a new rider instead.', 'info');
      sel.value = prev;
      return;
    }

    sel.disabled = true;
    try {
      // Connects to the assignRider function we reviewed in orderController.js
      await apiRequest(`/admin/orders/${sel.dataset.id}/assign`, { 
        method: 'POST', // or PATCH depending on your specific route setup
        body: { riderId: newRiderId } 
      });
      sel.dataset.current = newRiderId;
      showToast('Rider assigned successfully.', 'success');
    } catch (err) {
      sel.value = prev;
      showToast(err.message || 'Could not assign rider.', 'error');
    } finally {
      sel.disabled = false;
    }
  }

  // ── Cancel modal ────────────────────────────────────────────
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

  // ── Filters ─────────────────────────────────────────────────
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

  document.addEventListener('admin:view-changed', async (e) => {
    if (e.detail.view === 'manage-orders' && !loadedOnce) {
      loadedOnce = true;
      // Load riders first, then load orders so the dropdowns have data
      await loadRiders();
      loadOrders();
    }
  });
})();
