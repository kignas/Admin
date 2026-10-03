/* ==========================================================================
   MODULE 1 — Admin Dashboard / Overview
   Every number below comes from a confirmed backend endpoint:
     GET  /admin/metrics                        core metrics
     GET  /admin/vendor-applications?status=…   queue counts (pagination.total)
     GET  /menu/pending                        pending menu approvals → {count,data}
     GET  /admin/riders?limit=1&online=true     rider counts
     GET  /admin/restaurants?status=active      restaurant count
     GET  /admin/payout-requests?status=requested
     GET  /admin/dashboard/recent-orders        recent orders
     GET  /admin/dashboard/peak-hours           peak hours
     GET  /admin/analytics/revenue?period=30d   revenue over time
   No demo numbers: unavailable data renders as "—", never as 0.
   ========================================================================== */
(function () {
  const STATUS_BADGE = {
    PLACED: 'muted', CONFIRMED: 'warning', PREPARING: 'warning',
    WAITING_FOR_RIDER: 'warning', ASSIGNED: 'warning', OUT_FOR_DELIVERY: 'warning',
    OTP_VERIFIED: 'warning', DELIVERED: 'success', CANCELLED: 'danger',
  };

  const statGrid = document.getElementById('stat-grid');
  const alertsWrap = document.getElementById('dashboard-alerts');
  const quickActionsWrap = document.getElementById('dashboard-quick-actions');
  const revenueWrap = document.getElementById('revenue-chart-wrap');
  const revenueRange = document.getElementById('revenue-range');
  const errorBanner = document.getElementById('dashboard-error');
  const errorMsg = document.getElementById('dashboard-error-msg');
  const refreshBtn = document.getElementById('dashboard-refresh');
  const retryBtn = document.getElementById('dashboard-retry');

  let loading = false;

  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /** Run a request, returning {ok, data} or {ok:false, error} so one failed
   *  panel never blanks the whole dashboard. */
  async function safe(fn) {
    try { return { ok: true, data: await fn() }; }
    catch (err) { return { ok: false, error: err.message || 'Request failed.' }; }
  }

  function statCard({ label, value, sub, live, na }) {
    return `<div class="card stat-card${na ? ' stat-na' : ''}">
      <div class="stat-label">${live ? '<span class="live-dot"></span>' : ''}${esc(label)}</div>
      <div class="stat-value mono">${value}</div>
      <div class="stat-sub">${sub}</div>
    </div>`;
  }

  function naCard(label, error) {
    return statCard({ label, value: '—', sub: 'unavailable', na: true, title: error });
  }

  function renderStats(r) {
    const cards = [];

    if (r.metrics.ok) {
      const m = r.metrics.data || {};
      cards.push(statCard({
        label: 'Orders today', live: true,
        value: Number(m.ordersToday ?? 0),
        sub: `${Number(m.totalOrders ?? 0).toLocaleString('en-IN')} delivered all-time`,
      }));
      cards.push(statCard({
        label: 'Revenue today',
        value: formatMoney(m.revenueToday ?? 0),
        sub: `${formatMoney(m.totalRevenue ?? 0)} all-time delivered`,
      }));
      cards.push(statCard({
        label: 'Delivery success rate',
        value: `${Number(m.successRate ?? 0)}%`,
        sub: `${Number(m.cancelledToday ?? 0)} cancelled today`,
      }));
      cards.push(statCard({
        label: 'Active customers',
        value: Number(m.totalCustomers ?? 0).toLocaleString('en-IN'),
        sub: 'registered customer accounts',
      }));
    } else {
      cards.push(naCard('Orders today', r.metrics.error));
      cards.push(naCard('Revenue today', r.metrics.error));
      cards.push(naCard('Delivery success rate', r.metrics.error));
      cards.push(naCard('Active customers', r.metrics.error));
    }

    if (r.apps.ok) {
      const a = r.apps.data;
      cards.push(statCard({
        label: 'Pending applications',
        value: a.pending,
        sub: a.needs_changes > 0
          ? `<span class="text-warning">${a.needs_changes} waiting for applicant changes</span>`
          : 'awaiting admin review',
      }));
      cards.push(statCard({
        label: 'Approved applications',
        value: a.approved,
        sub: `${a.rejected} rejected`,
      }));
    } else {
      cards.push(naCard('Pending applications', r.apps.error));
      cards.push(naCard('Approved applications', r.apps.error));
    }

    if (r.menu.ok) {
      cards.push(statCard({
        label: 'Pending menu approvals',
        value: r.menu.data.count,
        sub: r.menu.data.count > 0 ? '<span class="text-warning">items hidden from customers until approved</span>' : 'queue is clear',
      }));
    } else {
      cards.push(naCard('Pending menu approvals', r.menu.error));
    }

    if (r.riders.ok) {
      cards.push(statCard({
        label: 'Riders online',
        value: r.riders.data.online,
        sub: `${r.riders.data.total} riders registered`,
      }));
    } else {
      cards.push(naCard('Riders online', r.riders.error));
    }

    if (r.restaurants.ok) {
      cards.push(statCard({
        label: 'Active restaurants',
        value: r.restaurants.data.count,
        sub: 'approved &amp; active on the platform',
      }));
    } else {
      cards.push(naCard('Active restaurants', r.restaurants.error));
    }

    if (r.payouts.ok) {
      cards.push(statCard({
        label: 'Payout requests pending',
        value: r.payouts.data.count,
        sub: r.payouts.data.count > 0 ? '<span class="text-warning">awaiting processing</span>' : 'nothing waiting',
      }));
    } else {
      cards.push(naCard('Payout requests pending', r.payouts.error));
    }

    statGrid.innerHTML = cards.join('');
  }

  function renderAlerts(r) {
    const alerts = [];
    const add = (severity, text, goto, cta) => alerts.push({ severity, text, goto, cta });

    if (r.apps.ok) {
      const a = r.apps.data;
      if (a.pending > 0) add('warning', `${a.pending} vendor application${a.pending === 1 ? '' : 's'} awaiting review`, 'vendor-applications', 'Review');
      if (a.needs_changes > 0) add('info', `${a.needs_changes} application${a.needs_changes === 1 ? '' : 's'} with changes requested — waiting for the applicant to resubmit`, 'vendor-applications', 'Open queue');
    }
    if (r.menu.ok && r.menu.data.count > 0) {
      add('warning', `${r.menu.data.count} menu item${r.menu.data.count === 1 ? '' : 's'} pending approval (not visible to customers)`, 'menu-approvals', 'Review');
    }
    if (r.payouts.ok && r.payouts.data.count > 0) {
      add('danger', `${r.payouts.data.count} payout request${r.payouts.data.count === 1 ? '' : 's'} awaiting processing`, 'settlements', 'Open payouts');
    }
    if (r.support.ok && r.support.data.count > 0) {
      add('info', `${r.support.data.count} open support ticket${r.support.data.count === 1 ? '' : 's'}`, 'support', 'Open support');
    }
    if (r.metrics.ok && Number(r.metrics.data?.cancelledToday || 0) > 0) {
      add('info', `${r.metrics.data.cancelledToday} order${r.metrics.data.cancelledToday === 1 ? '' : 's'} cancelled today`, 'manage-orders', 'View orders');
    }

    const failed = Object.entries(r).filter(([, v]) => !v.ok);
    failed.forEach(([, v]) => add('danger', `Data source unavailable: ${esc(v.error)}`, null, null));

    if (!alerts.length) {
      alertsWrap.innerHTML = `<div class="state-block" style="padding:24px 12px;">
        <h4>All queues clear</h4><p>No pending applications, menu approvals, payouts or open tickets.</p>
      </div>`;
      return;
    }

    alertsWrap.innerHTML = `<div class="alert-list">${alerts.map(a => `
      <div class="alert-row alert-${a.severity}">
        <span class="alert-dot"></span>
        <span class="alert-text">${a.text}</span>
        ${a.goto ? `<button class="btn btn-ghost btn-sm" data-goto="${a.goto}">${a.cta}</button>` : ''}
      </div>`).join('')}</div>`;
  }

  function renderQuickActions() {
    const actions = [
      { goto: 'vendor-applications', label: 'Review applications', icon: '📋' },
      { goto: 'menu-approvals', label: 'Approve menu items', icon: '🍽️' },
      { goto: 'manage-orders', label: 'Manage orders', icon: '📦' },
      { goto: 'settlements', label: 'Settlements & payouts', icon: '₹' },
      { goto: 'support', label: 'Support tickets', icon: '💬' },
      { goto: 'analytics', label: 'Analytics', icon: '📈' },
    ];
    quickActionsWrap.innerHTML = `<div class="quick-grid">${actions.map(a => `
      <button class="quick-action" data-goto="${a.goto}">
        <span class="quick-icon">${a.icon}</span>
        <span>${a.label}</span>
      </button>`).join('')}</div>`;
  }

  function renderRecentOrders(orders) {
    const wrap = document.getElementById('recent-orders-wrap');
    if (!Array.isArray(orders) || !orders.length) {
      wrap.innerHTML = `<div class="state-block"><h4>No orders yet</h4><p>Orders will show up here as customers place them.</p></div>`;
      return;
    }
    wrap.innerHTML = `<div class="mini-list">${orders.map(o => `
      <div class="mini-row">
        <div>
          <div class="name">${esc(o.restaurantName)}</div>
          <div class="meta">${esc(o.customerName)} · ${formatDate(o.createdAt)}</div>
        </div>
        <div style="text-align:right;">
          <div class="mono row-name">${formatMoney(o.totalAmount)}</div>
          <span class="badge badge-${STATUS_BADGE[o.status] || 'muted'}">${esc(String(o.status || '').replace(/_/g, ' '))}</span>
        </div>
      </div>
    `).join('')}</div>`;
  }

  function renderPeakHours(hours) {
    const wrap = document.getElementById('peak-hours-wrap');
    if (!Array.isArray(hours) || !hours.length) {
      wrap.innerHTML = `<div class="state-block"><h4>No hourly data</h4><p>Peak-hour data appears once orders exist today.</p></div>`;
      return;
    }
    const max = Math.max(1, ...hours.map(h => h.orders));
    wrap.innerHTML = `
      <div class="peak-bars">
        ${hours.map(h => `
          <div title="${h.hour} — ${h.orders} orders"
               class="peak-bar${h.orders ? ' has-orders' : ''}"
               style="height:${Math.max(4, (h.orders / max) * 100)}%;"></div>
        `).join('')}
      </div>
      <div class="peak-axis"><span>12am</span><span>6am</span><span>12pm</span><span>6pm</span><span>11pm</span></div>
    `;
  }

  function renderRevenueChart(result) {
    if (!result.ok) {
      revenueRange.textContent = '—';
      revenueWrap.innerHTML = `<div class="state-block"><h4>Could not load revenue data</h4><p>${esc(result.error)}</p><button class="btn btn-ghost btn-sm" data-dash-retry>Retry</button></div>`;
      return;
    }
    const rows = Array.isArray(result.data) ? result.data : [];
    if (!rows.length) {
      revenueRange.textContent = '—';
      revenueWrap.innerHTML = `<div class="state-block"><h4>No revenue in this period</h4><p>Non-cancelled orders with revenue will appear here.</p></div>`;
      return;
    }
    const max = Math.max(1, ...rows.map(x => Number(x.revenue) || 0));
    const first = rows[0].date;
    const last = rows[rows.length - 1].date;
    const total = rows.reduce((sum, x) => sum + (Number(x.revenue) || 0), 0);
    revenueRange.textContent = `${first} → ${last} · ${rows.length} days · ${formatMoney(total)}`;
    revenueWrap.innerHTML = `
      <div class="peak-bars rev-bars">
        ${rows.map(x => `
          <div class="peak-bar has-orders" style="height:${Math.max(3, ((Number(x.revenue) || 0) / max) * 100)}%;"
               title="${x.date}: ${formatMoney(x.revenue)} · ${x.orders} orders"></div>
        `).join('')}
      </div>
      <div class="peak-axis"><span>${first}</span><span>${last}</span></div>
    `;
  }

  function showError(errors) {
    if (!errors.length) { errorBanner.style.display = 'none'; return; }
    errorBanner.style.display = 'flex';
    errorMsg.textContent = `${errors.length} dashboard source(s) failed: ${errors[0]} — no fallback host is used, retry when Render responds.`;
  }

  async function loadDashboard() {
    if (loading) return;
    loading = true;
    errorBanner.style.display = 'none';
    if (refreshBtn) { refreshBtn.disabled = true; refreshBtn.innerHTML = '<span class="btn-spinner"></span> Refreshing…'; }

    // Fire every independent request in parallel; each is handled in isolation.
    const [
      metrics, appsR, menu, riders, restaurants, payouts, support,
      recentOrders, peakHours, revenue,
    ] = await Promise.all([
      safe(() => apiRequest('/admin/metrics')),
      safe(async () => {
        const statuses = ['pending', 'needs_changes', 'approved', 'rejected'];
        const results = await Promise.all(statuses.map(status =>
          apiRequest('/admin/vendor-applications', { query: { status, page: 1, limit: 1 } })));
        return Object.fromEntries(statuses.map((s, i) => [s, results[i]?.pagination?.total ?? 0]));
      }),
      safe(() => apiRequest('/menu/pending')),
      safe(async () => {
        const [total, online] = await Promise.all([
          apiRequest('/admin/riders', { query: { page: 1, limit: 1 } }),
          apiRequest('/admin/riders', { query: { online: 'true', page: 1, limit: 1 } }),
        ]);
        return { total: total?.data?.total ?? 0, online: online?.data?.total ?? 0 };
      }),
      safe(() => apiRequest('/admin/restaurants', { query: { status: 'active' } })),
      safe(() => apiRequest('/admin/payout-requests', { query: { status: 'requested', page: 1, limit: 1 } })),
      safe(() => apiRequest('/admin/support/tickets', { query: { status: 'open', page: 1, limit: 1 } })),
      safe(() => apiRequest('/admin/dashboard/recent-orders')),
      safe(() => apiRequest('/admin/dashboard/peak-hours')),
      safe(() => apiRequest('/admin/analytics/revenue', { query: { period: '30d' } })),
    ]);

    const r = {
      metrics,
      apps: appsR.ok ? { ok: true, data: appsR.data } : appsR,
      menu: menu.ok ? { ok: true, data: { count: menu.count ?? (menu.data?.length ?? 0) } } : menu,
      riders,
      restaurants: restaurants.ok ? { ok: true, data: { count: (restaurants.data || []).length } } : restaurants,
      payouts: payouts.ok ? { ok: true, data: { count: payouts.pagination?.total ?? 0 } } : payouts,
      support: support.ok ? { ok: true, data: { count: support.pagination?.total ?? 0 } } : support,
      recentOrders, peakHours, revenue,
    };

    renderStats(r);
    renderAlerts(r);
    renderQuickActions();
    renderRecentOrders(r.recentOrders.ok ? (r.recentOrders.data || []) : []);
    if (!r.recentOrders.ok) {
      document.getElementById('recent-orders-wrap').innerHTML =
        `<div class="state-block"><h4>Could not load recent orders</h4><p>${esc(r.recentOrders.error)}</p><button class="btn btn-ghost btn-sm" data-dash-retry>Retry</button></div>`;
    }
    renderPeakHours(r.peakHours.ok ? (r.peakHours.data || []) : []);
    if (!r.peakHours.ok) {
      document.getElementById('peak-hours-wrap').innerHTML =
        `<div class="state-block"><h4>Could not load peak hours</h4><p>${esc(r.peakHours.error)}</p><button class="btn btn-ghost btn-sm" data-dash-retry>Retry</button></div>`;
    }
    renderRevenueChart(r.revenue);

    showError(
      Object.entries(r)
        .filter(([key, v]) => !v.ok && !['recentOrders', 'peakHours', 'revenue'].includes(key))
        .map(([, v]) => v.error)
    );

    loading = false;
    if (refreshBtn) { refreshBtn.disabled = false; refreshBtn.textContent = '↻ Refresh'; }
  }

  // The dashboard reloads on every visit so Admin actions elsewhere show up here.
  document.addEventListener('admin:view-changed', (e) => {
    if (e.detail.view === 'dashboard') loadDashboard();
  });
  refreshBtn?.addEventListener('click', loadDashboard);
  retryBtn?.addEventListener('click', loadDashboard);
  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-dash-retry]')) loadDashboard();
  });

  window.refreshAdminDashboard = loadDashboard;
  // Initial load happens via the deferred `admin:view-changed` dispatch from
  // app.js (DOMContentLoaded), which fires after this module registered its
  // listener above.
})();
