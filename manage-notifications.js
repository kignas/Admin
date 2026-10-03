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
        ${n.readAt ? '<span class="badge badge-muted">Read</span>'
          : `<button class="btn btn-sm btn-ghost notif-mark-read" data-id="${esc(n._id)}">Mark read</button>`}
      </div>`).join('')}</div>`;

    wrap.querySelectorAll('.notif-mark-read').forEach(btn =>
      btn.addEventListener('click', () => markRead(btn)));
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

  async function load() {
    wrap.innerHTML = '<div class="state-block"><div class="spinner-lg"></div></div>';
    try {
      const res = await apiRequest('/notifications');
      notifications = Array.isArray(res.data) ? res.data : [];
      render();
    } catch (err) {
      wrap.innerHTML = `<div class="state-block"><h4>Could not load notifications</h4><p>${esc(err.message)}</p>
        <button class="btn btn-ghost btn-sm" id="notifications-retry">Retry</button></div>`;
      document.getElementById('notifications-retry')?.addEventListener('click', load);
    }
  }

  filterSelect?.addEventListener('change', render);
  refreshBtn?.addEventListener('click', load);
  document.addEventListener('admin:view-changed', (e) => {
    if (e.detail.view === 'notifications') load();
  });
})();
