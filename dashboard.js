(function () {
  const STATUS_BADGE = {
    PLACED: 'muted', CONFIRMED: 'warning', PREPARING: 'warning',
    OUT_FOR_DELIVERY: 'warning', DELIVERED: 'success', CANCELLED: 'danger',
  };

  let loaded = false;

  function renderStatGrid(m) {
    const grid = document.getElementById('stat-grid');
    grid.innerHTML = `
      <div class="card stat-card">
        <div class="stat-label"><span class="live-dot"></span>Orders today</div>
        <div class="stat-value mono">${m.ordersToday}</div>
        <div class="stat-sub">${m.totalOrders.toLocaleString('en-IN')} all-time</div>
      </div>
      <div class="card stat-card">
        <div class="stat-label">Revenue today</div>
        <div class="stat-value mono">${formatMoney(m.revenueToday)}</div>
        <div class="stat-sub">${formatMoney(m.totalRevenue)} all-time</div>
      </div>
      <div class="card stat-card">
        <div class="stat-label">Success rate</div>
        <div class="stat-value mono">${m.successRate}%</div>
        <div class="stat-sub">${m.cancelledToday} cancelled today</div>
      </div>
      <div class="card stat-card">
        <div class="stat-label">Online restaurants</div>
        <div class="stat-value mono">${m.onlineRestaurants}</div>
        <div class="stat-sub">${m.totalCustomers.toLocaleString('en-IN')} total customers</div>
      </div>
    `;
  }

  function renderRecentOrders(orders) {
    const wrap = document.getElementById('recent-orders-wrap');
    if (!orders.length) {
      wrap.innerHTML = `<div class="state-block"><h4>No orders yet</h4><p>Orders will show up here as customers place them.</p></div>`;
      return;
    }
    wrap.innerHTML = `<div class="mini-list">${orders.map(o => `
      <div class="mini-row">
        <div>
          <div class="name">${escapeHtml(o.restaurantName)}</div>
          <div class="meta">${escapeHtml(o.customerName)} · ${formatDate(o.createdAt)}</div>
        </div>
        <div style="text-align:right;">
          <div class="mono row-name">${formatMoney(o.totalAmount)}</div>
          <span class="badge badge-${STATUS_BADGE[o.status] || 'muted'}">${o.status.replace(/_/g, ' ')}</span>
        </div>
      </div>
    `).join('')}</div>`;
  }

  function renderPeakHours(hours) {
    const wrap = document.getElementById('peak-hours-wrap');
    const max = Math.max(1, ...hours.map(h => h.orders));
    wrap.innerHTML = `
      <div style="display:flex; align-items:flex-end; gap:3px; height:120px;">
        ${hours.map(h => `
          <div title="${h.hour} — ${h.orders} orders"
               style="flex:1; background:${h.orders ? 'var(--flame)' : 'var(--border)'};
                      opacity:${h.orders ? 0.85 : 0.5};
                      height:${Math.max(4, (h.orders / max) * 100)}%;
                      border-radius:3px 3px 0 0;"></div>
        `).join('')}
      </div>
      <div style="display:flex; justify-content:space-between; margin-top:8px; font-size:10.5px; color:var(--text-faint);">
        <span>12am</span><span>6am</span><span>12pm</span><span>6pm</span><span>11pm</span>
      </div>
    `;
  }

  function escapeHtml(str) {
    return String(str ?? '').replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }

  async function loadDashboard() {
    if (loaded) return;
    loaded = true;

    try {
      const [metricsRes, ordersRes, hoursRes] = await Promise.all([
        apiRequest('/admin/metrics'),
        apiRequest('/admin/dashboard/recent-orders'),
        apiRequest('/admin/dashboard/peak-hours'),
      ]);
      renderStatGrid(metricsRes.data);
      renderRecentOrders(ordersRes.data.slice(0, 6));
      renderPeakHours(hoursRes.data);
    } catch (err) {
      showToast(err.message || 'Could not load dashboard data.', 'error');
      document.getElementById('stat-grid').innerHTML =
        `<div class="card"><div class="state-block"><h4>Could not load metrics</h4><p>${err.message}</p></div></div>`;
    }
  }

  document.addEventListener('DOMContentLoaded', loadDashboard);
})();
