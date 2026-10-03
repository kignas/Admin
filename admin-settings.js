/* ==========================================================================
   MODULE 16 — Admin Settings, Roles and Audit
   Confirmed backend contract:
     GET  /admin/admins/:id/permissions   requirePermission('settings.manage')
          → { data: { name, email, role, permissions[], isActive } }
          (permissions[] empty = unrestricted admin — backend behaviour)
     PATCH /admin/admins/:id/permissions  body { permissions: string[] }
          — cannot change your own permissions (400); needs a target admin id,
            and there is no "list admins" endpoint, so editing other admins is
            marked backend-required rather than faked.
     GET  /platform/settings              requirePermission('settings.manage')
          → { data: { key: value } }
     PUT  /platform/settings              body { key, value } (upsert)
   Audit log: the backend writes AdminAuditLog entries but exposes no GET
   endpoint → viewing audit history is backend-required (no fake UI).
   ========================================================================== */
(function () {
  const accountWrap = document.getElementById('settings-account');
  const permissionsWrap = document.getElementById('settings-permissions');
  const platformWrap = document.getElementById('settings-platform');
  const refreshBtn = document.getElementById('admin-settings-refresh');

  let busy = false;

  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function renderAccount() {
    const admin = (window.AdminAuth && AdminAuth.getAdmin()) || {};
    let apiHost = CONFIG.API_BASE_URL;
    try { apiHost = new URL(CONFIG.API_BASE_URL).host; } catch (_) {}
    accountWrap.innerHTML = `
      <div class="detail-head" style="margin-bottom:4px;">
        <div>
          <div class="detail-title">${esc(admin.name || 'Admin')}</div>
          <div class="detail-sub">${esc(admin.email || '')}</div>
        </div>
        <span class="badge badge-info">${esc((admin.role || 'admin').toUpperCase())}</span>
      </div>
      <div class="form-grid" style="margin-top:12px;">
        <div class="field"><label>Admin ID</label><div class="mono">${esc(admin.id || '—')}</div></div>
        <div class="field"><label>Active API host</label><div class="mono">${esc(apiHost)}</div></div>
        <div class="field"><label>Session storage</label><div>Browser localStorage (JWT + profile)</div></div>
        <div class="field"><label>Environment</label><div>${esc(CONFIG.ENVIRONMENT || '—')}</div></div>
      </div>
      <div class="hint" style="margin-top:10px;">Permissions and roles are enforced by the backend — this screen never grants access on its own.</div>`;
  }

  async function loadPermissions() {
    permissionsWrap.innerHTML = '<div class="state-block"><div class="spinner-lg"></div></div>';
    const admin = (window.AdminAuth && AdminAuth.getAdmin()) || {};
    if (!admin.id) {
      permissionsWrap.innerHTML = '<div class="state-block"><p>No admin profile in this session — sign in again.</p></div>';
      return;
    }
    try {
      const res = await apiRequest(`/admin/admins/${admin.id}/permissions`);
      const u = res.data || {};
      const perms = Array.isArray(u.permissions) ? u.permissions : [];
      permissionsWrap.innerHTML = `
        ${perms.length
          ? `<div class="chip-row">${perms.map(p => `<span class="badge badge-success">${esc(p)}</span>`).join('')}</div>
             <div class="hint" style="margin-top:10px;">These permissions are enforced per request by the backend.</div>`
          : `<div class="callout callout-muted"><strong>Full admin access</strong>
               <span class="hint">The backend treats an empty permission list as unrestricted admin access.</span></div>`}
        <div class="field" style="margin-top:14px;">
          <label>Role management</label>
          <div class="row-sub">Editing another admin's permissions requires their admin ID (no list-admins endpoint is exposed), and you cannot change your own. Both restrictions come from the backend.</div>
        </div>`;
    } catch (err) {
      permissionsWrap.innerHTML = `<div class="callout callout-muted"><strong>Permissions unavailable</strong>
        <span class="hint">${esc(err.message)}</span></div>`;
    }
  }

  /* ── Platform settings key/value store ─────────────────────── */
  function editableControl(key, value) {
    if (value === null || value === undefined) return `<span class="row-sub">null</span>`;
    if (typeof value === 'object') {
      return `<code class="settings-json">${esc(JSON.stringify(value))}</code>`;
    }
    if (typeof value === 'boolean') {
      return `<select data-key="${esc(key)}" class="settings-input">
        <option value="true" ${value === true ? 'selected' : ''}>true</option>
        <option value="false" ${value === false ? 'selected' : ''}>false</option>
      </select>`;
    }
    if (typeof value === 'number') {
      return `<input type="number" step="any" data-key="${esc(key)}" class="settings-input" value="${esc(value)}" />`;
    }
    return `<input type="text" data-key="${esc(key)}" class="settings-input" value="${esc(value)}" />`;
  }

  async function loadPlatformSettings() {
    platformWrap.innerHTML = '<div class="state-block"><div class="spinner-lg"></div></div>';
    try {
      const res = await apiRequest('/platform/settings');
      const data = res.data && typeof res.data === 'object' ? res.data : {};
      const keys = Object.keys(data);
      if (!keys.length) {
        platformWrap.innerHTML = `<div class="state-block"><h4>No platform settings stored</h4>
          <p>The backend key/value store is empty. Keys are defined by the backend — this screen only shows and edits keys the backend already returns.</p></div>`;
        return;
      }
      platformWrap.innerHTML = `<div class="settings-table">${keys.map(key => `
        <div class="settings-row">
          <div class="settings-key mono">${esc(key)}</div>
          <div class="settings-value">${editableControl(key, data[key])}</div>
          <div class="settings-action">
            ${typeof data[key] === 'object'
              ? '<span class="row-sub">read-only</span>'
              : `<button class="btn btn-sm btn-ghost settings-save" data-key="${esc(key)}" data-type="${typeof data[key]}">Save</button>`}
          </div>
        </div>`).join('')}</div>
        <div class="hint" style="margin-top:10px;">Saved via <code>PUT /api/platform/settings { key, value }</code> — the backend upserts the key.</div>`;

      platformWrap.querySelectorAll('.settings-save').forEach(btn =>
        btn.addEventListener('click', () => saveSetting(btn)));
    } catch (err) {
      platformWrap.innerHTML = `<div class="state-block"><h4>Could not load platform settings</h4><p>${esc(err.message)}</p>
        <button class="btn btn-ghost btn-sm" id="settings-retry">Retry</button></div>`;
      document.getElementById('settings-retry')?.addEventListener('click', loadPlatformSettings);
    }
  }

  async function saveSetting(btn) {
    if (busy) return;
    const key = btn.dataset.key;
    const type = btn.dataset.type;
    const input = platformWrap.querySelector(`.settings-input[data-key="${CSS.escape(key)}"]`);
    if (!input) return;

    let value;
    if (type === 'number') {
      value = Number(input.value);
      if (!Number.isFinite(value)) { showToast('Enter a valid number.', 'error'); return; }
    } else if (type === 'boolean') {
      value = input.value === 'true';
    } else {
      value = input.value;
    }

    if (!confirm(`Update platform setting “${key}” to:\n\n${String(value)}\n\nThis value is read by backend consumers — continue?`)) return;

    busy = true;
    btn.disabled = true;
    const oldLabel = btn.textContent;
    btn.innerHTML = '<span class="btn-spinner"></span>';
    try {
      await apiRequest('/platform/settings', { method: 'PUT', body: { key, value } });
      showToast(`Setting “${key}” updated.`, 'success');
      await loadPlatformSettings();
    } catch (err) {
      showToast(err.message || 'Could not update the setting.', 'error');
      btn.disabled = false;
      btn.textContent = oldLabel;
    } finally {
      busy = false;
    }
  }

  function loadAll() {
    renderAccount();
    loadPermissions();
    loadPlatformSettings();
  }

  refreshBtn?.addEventListener('click', loadAll);
  document.addEventListener('admin:view-changed', (e) => {
    if (e.detail.view === 'admin-settings') loadAll();
  });
})();
