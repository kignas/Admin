/* ==========================================================================
   MODULE 15 — Analytics and Reports
   Confirmed backend contract:
     GET /admin/analytics/revenue?period=14d|30d|90d
         → { data: [{ date:'YYYY-MM-DD', revenue, orders }] }
           (non-cancelled orders only; any period other than 30d/90d = 14d)
     GET /admin/analytics/top-restaurants
         → { data: [{ id, name, orders, revenue }] }  (all-time delivered)
   No export endpoint exists on the backend, so no export button is offered.
   Totals shown here are sums of the daily rows returned by the same endpoint.
   ========================================================================== */
(function () {
  const statGrid = document.getElementById('analytics-stat-grid');
  const chartWrap = document.getElementById('analytics-chart-wrap');
  const rangeEl = document.getElementById('analytics-range');
  const topWrap = document.getElementById('top-restaurants-wrap');
  const periodSelect = document.getElementById('analytics-period');
  const refreshBtn = document.getElementById('analytics-refresh');


  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function card(label, value, sub) {
    return `<div class="card stat-card">
      <div class="stat-label">${label}</div>
      <div class="stat-value mono">${value}</div>
      <div class="stat-sub">${sub}</div>
    </div>`;
  }

  function naCard(label, sub) {
    return card(label, '—', sub || 'unavailable');
  }

  function renderChart(rows) {
    if (!rows.length) {
      rangeEl.textContent = '—';
      chartWrap.innerHTML = `<div class="state-block"><h4>No data in this range</h4><p>Orders with revenue will appear once they exist in the selected period.</p></div>`;
      return;
    }
    const max = Math.max(1, ...rows.map(r => Number(r.revenue) || 0));
    const first = rows[0].date;
    const last = rows[rows.length - 1].date;
    const totalRevenue = rows.reduce((s, r) => s + (Number(r.revenue) || 0), 0);
    rangeEl.textContent = `${first} → ${last} · ${rows.length} days · ${formatMoney(totalRevenue)}`;
    chartWrap.innerHTML = `
      <div class="peak-bars rev-bars">
        ${rows.map(r => `
          <div class="peak-bar has-orders" style="height:${Math.max(3, ((Number(r.revenue) || 0) / max) * 100)}%;"
               title="${esc(r.date)}: ${formatMoney(r.revenue)} · ${r.orders} orders"></div>
        `).join('')}
      </div>
      <div class="peak-axis"><span>${first}</span><span>${last}</span></div>
    `;
  }

  function renderStats(rows, top) {
    if (!rows) {
      statGrid.innerHTML = naCard('Period revenue') + naCard('Period orders') + naCard('Busiest day') + naCard('Top restaurant');
      return;
    }
    if (!rows.length) {
      statGrid.innerHTML =
        card('Period revenue', formatMoney(0), 'no orders in range') +
        card('Period orders', '0', 'no orders in range') +
        card('Busiest day', '—', 'no data') +
        (top !== null && top !== undefined
          ? card('Top restaurant', esc(top.name || '—'), `${top.orders} delivered orders`)
          : naCard('Top restaurant'));
      return;
    }
    const totalRevenue = rows.reduce((s, r) => s + (Number(r.revenue) || 0), 0);
    const totalOrders = rows.reduce((s, r) => s + (Number(r.orders) || 0), 0);
    const busiest = rows.reduce((a, b) => ((Number(b.orders) || 0) > (Number(a.orders) || 0) ? b : a), rows[0]);
    statGrid.innerHTML =
      card('Period revenue', formatMoney(totalRevenue), `sum of ${rows.length} daily values`) +
      card('Period orders', totalOrders.toLocaleString('en-IN'), `sum of ${rows.length} daily values`) +
      card('Busiest day', esc(busiest.date), `${busiest.orders} orders · ${formatMoney(busiest.revenue)}`) +
      (top !== null && top !== undefined
        ? card('Top restaurant', esc(top.name || '—'), `${top.orders} delivered orders · ${formatMoney(top.revenue)}`)
        : naCard('Top restaurant'));
  }

  function renderTop(topRows) {
    if (!topRows.length) {
      topWrap.innerHTML = `<div class="state-block"><h4>No delivered orders yet</h4><p>Restaurant performance appears after orders are delivered.</p></div>`;
      return;
    }
    topWrap.innerHTML = `<table class="data-table"><thead><tr>
        <th>#</th><th>Restaurant</th><th>Delivered orders</th><th>Revenue</th>
      </tr></thead><tbody>${topRows.map((r, i) => `
        <tr>
          <td class="mono">${i + 1}</td>
          <td class="row-name">${esc(r.name || '—')}</td>
          <td class="mono">${r.orders}</td>
          <td class="mono">${formatMoney(r.revenue)}</td>
        </tr>`).join('')}</tbody></table>`;
  }

  async function load() {
    const period = periodSelect?.value || '14d';
    chartWrap.innerHTML = '<div class="state-block"><div class="spinner-lg"></div></div>';
    topWrap.innerHTML = '<div class="state-block"><div class="spinner-lg"></div></div>';
    statGrid.innerHTML = naCard('Period revenue', 'loading…') + naCard('Period orders', 'loading…') +
      naCard('Busiest day', 'loading…') + naCard('Top restaurant', 'loading…');

    const [rev, top] = await Promise.allSettled([
      apiRequest('/admin/analytics/revenue', { query: { period } }),
      apiRequest('/admin/analytics/top-restaurants'),
    ]);

    const rows = rev.status === 'fulfilled' ? (rev.value.data || []) : null;
    const topRows = top.status === 'fulfilled' ? (top.value.data || []) : null;
    renderChart(rows || []);
    renderStats(rows, topRows ? topRows[0] : null);
    renderTop(topRows || []);

    if (rev.status === 'rejected') {
      chartWrap.innerHTML = `<div class="state-block"><h4>Could not load revenue analytics</h4>
        <p>${esc(rev.reason?.message || 'Request failed')}</p><button class="btn btn-ghost btn-sm" id="analytics-retry">Retry</button></div>`;
      rangeEl.textContent = '—';
    }
    if (top.status === 'rejected') {
      topWrap.innerHTML = `<div class="state-block"><h4>Could not load top restaurants</h4>
        <p>${esc(top.reason?.message || 'Request failed')}</p><button class="btn btn-ghost btn-sm" id="analytics-retry2">Retry</button></div>`;
    }
    document.getElementById('analytics-retry')?.addEventListener('click', load);
    document.getElementById('analytics-retry2')?.addEventListener('click', load);
  }

  periodSelect?.addEventListener('change', load);
  refreshBtn?.addEventListener('click', load);
  document.addEventListener('admin:view-changed', (e) => {
    if (e.detail.view === 'analytics') load();
  });
})();
