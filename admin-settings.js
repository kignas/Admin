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
  const controlsWrap = document.getElementById('settings-controls');
  const billingWrap = document.getElementById('settings-billing');
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
    loadCircuitBreakers();
    loadBillingController();
  }

  // ── Pillar 1: 1-tap toggle switches + message inputs ─────────────────
  // GET /api/platform/config returns the merged, validated configuration.
  // PUT /api/platform/config patches only the keys we send.
  const TOGGLES = [
    { key: 'isUnderMaintenance', label: 'Platform Maintenance Mode', hint: 'Blocks all new checkouts with a 503 maintenance notice.', inputs: [
      { key: 'maintenanceTitle', label: 'Maintenance title', type: 'text' },
      { key: 'maintenanceMessage', label: 'Maintenance message', type: 'text' },
      { key: 'maintenanceEta', label: 'ETA / back at', type: 'text' },
    ] },
    { key: 'isDeliveryPausedShortage', label: 'Delivery Partner Shortage Mode', hint: 'Manually pauses checkout while riders are scarce.', inputs: [
      { key: 'shortageBannerMessage', label: 'Shortage banner message', type: 'text' },
    ] },
    { key: 'autoShortageCircuitBreaker', label: 'Auto Shortage Circuit Breaker', hint: 'Pauses checkout automatically when capacity is breached.', inputs: [
      { key: 'maxActiveOrdersPerOnlineRider', label: 'Max active orders per online rider', type: 'number' },
    ] },
    { key: 'isRainSurgeActive', label: 'Rain Surge Mode', hint: 'Adds the rain surge fee and extra ETA to new orders.', inputs: [
      { key: 'rainSurgeFee', label: 'Rain surge fee (₹)', type: 'number' },
      { key: 'rainExtraEtaMinutes', label: 'Extra ETA (minutes)', type: 'number' },
    ] },
    { key: 'isUpiEnabled', label: 'Online (UPI) payments', hint: 'Allows prepaid Razorpay checkout.', inputs: [] },
    { key: 'isCodEnabled', label: 'Cash on Delivery (COD)', hint: 'Allows cash orders within the COD cap.', inputs: [
      { key: 'maxCodOrderAmount', label: 'Max COD order amount (₹)', type: 'number' },
    ] },
  ];

  const BILL_FIELDS = [
    { key: 'baseDeliveryFee', label: 'Base delivery fee (₹)', type: 'number' },
    { key: 'baseDistanceKm', label: 'Base distance covered (km)', type: 'number' },
    { key: 'perKmExtraFee', label: 'Per extra km fee (₹)', type: 'number' },
    { key: 'platformHandlingFee', label: 'Platform handling fee (₹)', type: 'number' },
    { key: 'smallCartThreshold', label: 'Small-cart threshold (₹)', type: 'number' },
    { key: 'smallCartFee', label: 'Small-cart fee (₹)', type: 'number' },
    { key: 'packagingChargePerItem', label: 'Packaging charge per item (₹)', type: 'number' },
    { key: 'taxPercent', label: 'Tax / GST (%)', type: 'number' },
    { key: 'freeDeliveryMinSubtotal', label: 'Free delivery above subtotal (₹, 0 = any)', type: 'number' },
  ];
  const BILL_TOGGLES = [
    { key: 'isGlobalFreeDelivery', label: 'Global free delivery', hint: 'Waives the delivery fee above the configured subtotal.' },
    { key: 'isFirstOrderFreeDelivery', label: 'First-order free delivery', hint: 'Waives delivery on a customer\'s first order.' },
  ];

  let circuitState = {};

  async function loadCircuitBreakers() {
    if (!controlsWrap) return;
    controlsWrap.innerHTML = '<div class="state-block"><div class="spinner-lg"></div></div>';
    try {
      const res = await apiRequest('/platform/config');
      circuitState = res.data || {};
      controlsWrap.innerHTML = TOGGLES.map(t => `
        <div class="settings-row" style="align-items:flex-start;gap:14px;padding:12px 0;border-bottom:1px solid var(--line);">
          <div style="flex:1;min-width:220px;">
            <div style="font-weight:600;">${esc(t.label)}</div>
            <div class="row-sub">${esc(t.hint)}</div>
          </div>
          <label class="switch" style="display:flex;align-items:center;gap:8px;">
            <input type="checkbox" class="toggle-input" data-key="${esc(t.key)}" ${circuitState[t.key] === true ? 'checked' : ''}>
            <span class="mono">${circuitState[t.key] === true ? 'ON' : 'OFF'}</span>
          </label>
          <div style="display:flex;flex-wrap:wrap;gap:8px;flex:2;min-width:280px;">
            ${t.inputs.map(i => `
              <label style="display:flex;flex-direction:column;font-size:12px;gap:2px;">
                ${esc(i.label)}
                <input class="settings-input" data-key="${esc(i.key)}" data-type="${i.type}"
                       type="${i.type}" value="${esc(circuitState[i.key] ?? '')}" style="min-width:140px;">
              </label>`).join('')}
          </div>
        </div>`).join('') + `
        <div style="margin-top:12px;display:flex;gap:8px;">
          <button class="btn btn-primary btn-sm" id="settings-controls-save">Save all toggles &amp; messages</button>
          <span class="hint">Saved via <code>PUT /api/platform/config</code>. Changes apply to new checkouts immediately.</span>
        </div>`;

      controlsWrap.querySelectorAll('.toggle-input').forEach(cb =>
        cb.addEventListener('change', () => {
          const label = cb.closest('label')?.querySelector('.mono');
          if (label) label.textContent = cb.checked ? 'ON' : 'OFF';
        }));
      document.getElementById('settings-controls-save')?.addEventListener('click', saveCircuitBreakers);
    } catch (err) {
      controlsWrap.innerHTML = `<div class="state-block"><h4>Could not load platform controls</h4><p>${esc(err.message)}</p>
        <button class="btn btn-ghost btn-sm" id="settings-controls-retry">Retry</button></div>`;
      document.getElementById('settings-controls-retry')?.addEventListener('click', loadCircuitBreakers);
    }
  }

  function collectPatch(scope, keys) {
    const patch = {};
    keys.forEach(k => {
      const el = scope.querySelector(`[data-key="${CSS.escape(k)}"]`);
      if (!el) return;
      if (el.type === 'checkbox') patch[k] = el.checked;
      else if (el.dataset.type === 'number') patch[k] = Number(el.value);
      else patch[k] = el.value;
    });
    return patch;
  }

  async function saveCircuitBreakers() {
    if (busy) return;
    const keys = TOGGLES.flatMap(t => [t.key, ...t.inputs.map(i => i.key)]);
    const patch = collectPatch(controlsWrap, keys);
    if (!confirm('Apply these platform maintenance / shortage / rain-surge settings now?\n\nThey take effect for new checkouts immediately.')) return;
    const btn = document.getElementById('settings-controls-save');
    busy = true; if (btn) btn.disabled = true;
    try {
      await apiRequest('/platform/config', { method: 'PUT', body: { settings: patch } });
      showToast('Platform controls updated.', 'success');
      await loadCircuitBreakers();
    } catch (err) {
      showToast(err.message || 'Could not update platform controls.', 'error');
    } finally { busy = false; if (btn) btn.disabled = false; }
  }

  async function loadBillingController() {
    if (!billingWrap) return;
    billingWrap.innerHTML = '<div class="state-block"><div class="spinner-lg"></div></div>';
    try {
      const res = await apiRequest('/platform/bill-policy');
      const s = (res.data && res.data.settings) || {};
      billingWrap.innerHTML = `
        <div class="form-grid">
          ${BILL_FIELDS.map(f => `
            <div class="field">
              <label>${esc(f.label)}</label>
              <input class="settings-input" data-key="${esc(f.key)}" data-type="number" type="number" min="0" value="${esc(s[f.key] ?? '')}">
            </div>`).join('')}
        </div>
        <div style="margin-top:12px;display:flex;flex-direction:column;gap:8px;">
          ${BILL_TOGGLES.map(t => `
            <label style="display:flex;align-items:center;gap:10px;">
              <input type="checkbox" class="toggle-input" data-key="${esc(t.key)}" ${s[t.key] === true ? 'checked' : ''}>
              <span><strong>${esc(t.label)}</strong> <span class="row-sub">${esc(t.hint)}</span></span>
            </label>`).join('')}
        </div>
        <div style="margin-top:12px;display:flex;gap:8px;align-items:center;">
          <button class="btn btn-primary btn-sm" id="settings-billing-save">Save pricing parameters</button>
          <span class="hint">Applied server-side at checkout — the customer bill is recalculated from these values.</span>
        </div>`;
      document.getElementById('settings-billing-save')?.addEventListener('click', saveBillingController);
    } catch (err) {
      billingWrap.innerHTML = `<div class="state-block"><h4>Could not load billing policy</h4><p>${esc(err.message)}</p>
        <button class="btn btn-ghost btn-sm" id="settings-billing-retry">Retry</button></div>`;
      document.getElementById('settings-billing-retry')?.addEventListener('click', loadBillingController);
    }
  }

  async function saveBillingController() {
    if (busy) return;
    const keys = [...BILL_FIELDS.map(f => f.key), ...BILL_TOGGLES.map(t => t.key)];
    const patch = collectPatch(billingWrap, keys);
    if (!confirm('Update checkout bill & delivery pricing?\n\nThese values drive the itemized customer bill immediately.')) return;
    const btn = document.getElementById('settings-billing-save');
    busy = true; if (btn) btn.disabled = true;
    try {
      await apiRequest('/platform/config', { method: 'PUT', body: { settings: patch } });
      showToast('Billing parameters updated.', 'success');
      await loadBillingController();
    } catch (err) {
      showToast(err.message || 'Could not update billing parameters.', 'error');
    } finally { busy = false; if (btn) btn.disabled = false; }
  }

  refreshBtn?.addEventListener('click', loadAll);
  document.addEventListener('admin:view-changed', (e) => {
    if (e.detail.view === 'admin-settings') loadAll();
  });
})();
