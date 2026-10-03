/* ==========================================================================
   MODULE 14 — Notifications and Announcements
   Confirmed backend contract:
     GET   /api/notifications          → { data: Notification[] } (this admin's
           own notifications, newest first, max 100)
           fields: title, message, type, data, readAt, createdAt
     PATCH /api/notifications/:id/read → marks one notification read
   There is NO endpoint to create announcements or broadcast to audiences
   (POST /api/notifications* → 404 on Render), so no compose UI is shown here.
   Existing FCM push registration lives in admin-push.js and is preserved.
   ========================================================================== */
(function () {
  const wrap = document.getElementById('notifications-list-wrap');
  const countEl = document.getElementById('notifications-count');
  const filterSelect = document.getElementById('notifications-filter');
  const refreshBtn = document.getElementById('notifications-refresh');

  let notifications = [];
  let busy = false;
  const navItem = document.querySelector('.nav-item[data-view="notifications"]');
  let navBadge = navItem?.querySelector('.notification-nav-badge');
  if (navItem && !navBadge) { navBadge = document.createElement('span'); navBadge.className = 'notification-nav-badge'; navItem.appendChild(navBadge); }

  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function filtered() {
    const f = filterSelect?.value || '';
    if (f === 'unread') return notifications.filter(n => !n.readAt);
    if (f === 'read') return notifications.filter(n => n.readAt);
    return notifications;
  }

  function render() {
    const rows = filtered();
    const unread = notifications.filter(n => !n.readAt).length;
    countEl.textContent = `${notifications.length} notification${notifications.length === 1 ? '' : 's'}${unread ? ` · ${unread} unread` : ''}`;
    if (navBadge) { navBadge.textContent = unread > 99 ? '99+' : String(unread); navBadge.hidden = unread === 0; }

    if (!rows.length) {
      wrap.innerHTML = `<div class="state-block"><h4>${notifications.length ? 'Nothing matches this filter' : 'No notifications yet'}</h4>
        <p>${notifications.length ? 'Switch the filter to see the other notifications.' : 'New-order alerts and backend events for this admin account will appear here.'}</p></div>`;
      return;
    }

    wrap.innerHTML = `<div class="notif-list">${rows.map(n => `
      <div class="notif-row${n.readAt ? '' : ' unread'}">
        <span class="notif-dot"></span>
        <div class="notif-body">
          <div class="notif-title">${esc(n.title)}</div>
          <div class="notif-message">${esc(n.message)}</div>
          <div class="notif-meta mono">${formatDate(n.createdAt)} · ${esc(n.type || '—')}${n.readAt ? ` · read ${formatDate(n.readAt)}` : ''}</div>
        </div>
        ${n.data?.kind === 'admin_new_application' ? `<button class="btn btn-sm btn-ghost notif-open" data-view="vendor-applications">View applications</button>` : ''}
        ${n.data?.kind === 'admin_new_order' ? `<button class="btn btn-sm btn-ghost notif-open" data-view="orders">View orders</button>` : ''}
        ${n.readAt ? '<span class="badge badge-muted">Read</span>'
          : `<button class="btn btn-sm btn-ghost notif-mark-read" data-id="${esc(n._id)}">Mark read</button>`}
      </div>`).join('')}</div>`;

    wrap.querySelectorAll('.notif-mark-read').forEach(btn =>
      btn.addEventListener('click', () => markRead(btn)));
    wrap.querySelectorAll('.notif-open').forEach(btn => btn.addEventListener('click', () => {
      window.location.hash = btn.dataset.view;
      if (btn.dataset.view === 'vendor-applications') window.refreshVendorApplications?.();
      if (btn.dataset.view === 'orders') window.refreshAdminOrders?.();
    }));
  }

  async function markRead(btn) {
    if (busy) return;
    busy = true;
    btn.disabled = true;
    try {
      const res = await apiRequest(`/notifications/${btn.dataset.id}/read`, { method: 'PATCH' });
      const idx = notifications.findIndex(n => String(n._id) === String(btn.dataset.id));
      if (idx >= 0 && res.data) notifications[idx] = { ...notifications[idx], ...res.data };
      render();
    } catch (err) {
      showToast(err.message || 'Could not mark the notification as read.', 'error');
      btn.disabled = false;
    } finally {
      busy = false;
    }
  }

  async function load(silent = false) {
    if (!silent) wrap.innerHTML = '<div class="state-block"><div class="spinner-lg"></div></div>';
    try {
      const res = await apiRequest('/notifications');
      notifications = Array.isArray(res.data) ? res.data : [];
      render();
    } catch (err) {
      if (silent) return;
      wrap.innerHTML = `<div class="state-block"><h4>Could not load notifications</h4><p>${esc(err.message)}</p>
        <button class="btn btn-ghost btn-sm" id="notifications-retry">Retry</button></div>`;
      document.getElementById('notifications-retry')?.addEventListener('click', load);
    }
  }

  window.refreshAdminNotifications = () => load(true);
  filterSelect?.addEventListener('change', render);
  refreshBtn?.addEventListener('click', load);
  document.addEventListener('admin:view-changed', (e) => {
    if (e.detail.view === 'notifications') load();
  });
  // Keep the in-page notification center and sidebar unread badge current.
  window.setInterval(() => {
    if (window.AdminAuth?.isLoggedIn?.()) load(true);
  }, 30000);
  if (window.AdminAuth?.isLoggedIn?.()) load(true);
})();
