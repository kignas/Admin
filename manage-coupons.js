/* ==========================================================================
   MODULE 9 — Offers, Coupons and Promotions
   Confirmed backend contract (coupons.manage permission; empty admin
   permissions = full access):
     GET   /api/coupons                    → { data: Coupon[] }
     POST  /api/coupons                    → 201 { data }
           body: code (A-Z0-9_-, 3-40), type: 'percent'|'fixed', value,
                 maxDiscount?, minSubtotal?, usageLimit?, perUserLimit?,
                 firstOrderOnly?, restaurant?, startsAt?, expiresAt?, isActive?
     PATCH /api/coupons/:id/toggle         body { isActive: boolean }
     POST  /api/coupons/validate           (customer-facing — not used here)
   There is no update or delete endpoint: edits are backend-required; only
   create + activate/pause are wired here.
   ========================================================================== */
(function () {
  const wrap = document.getElementById('coupons-table-wrap');
  const countEl = document.getElementById('coupons-count');
  const searchInput = document.getElementById('coupons-search');
  const statusFilter = document.getElementById('coupons-status-filter');
  const addBtn = document.getElementById('coupon-add-btn');
  const refreshBtn = document.getElementById('coupons-refresh');

  let coupons = [];
  let restaurants = [];
  let busy = false;

  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function discountLabel(c) {
    return c.type === 'percent' ? `${Number(c.value)}% off` : `${formatMoney(c.value)} off`;
  }

  function filtered() {
    const q = (searchInput?.value || '').trim().toLowerCase();
    const st = statusFilter?.value || '';
    return coupons.filter(c => {
      if (st === 'active' && !c.isActive) return false;
      if (st === 'inactive' && c.isActive) return false;
      if (q && !String(c.code || '').toLowerCase().includes(q)) return false;
      return true;
    });
  }

  function periodLabel(c) {
    const start = c.startsAt ? new Date(c.startsAt).toLocaleDateString('en-IN') : '—';
    const end = c.expiresAt ? new Date(c.expiresAt).toLocaleDateString('en-IN') : 'no expiry';
    return `${start} → ${end}`;
  }

  function render() {
    const rows = filtered();
    countEl.textContent = `${rows.length} of ${coupons.length} coupon${coupons.length === 1 ? '' : 's'}`;
    if (!rows.length) {
      wrap.innerHTML = `<div class="state-block"><h4>${coupons.length ? 'No coupons match the filter' : 'No coupons yet'}</h4>
        <p>${coupons.length ? 'Adjust the search or status filter.' : 'Create the first discount code for your customers.'}</p></div>`;
      return;
    }
    wrap.innerHTML = `<table class="data-table"><thead><tr>
        <th>Code</th><th>Discount</th><th>Conditions</th><th>Usage</th><th>Validity</th><th>Scope</th><th>Status</th><th></th>
      </tr></thead><tbody>${rows.map(c => `
        <tr data-id="${esc(c._id)}">
          <td class="mono row-name">${esc(c.code)}</td>
          <td>${discountLabel(c)}${c.maxDiscount != null ? `<div class="row-sub">max ${formatMoney(c.maxDiscount)}</div>` : ''}</td>
          <td class="row-sub">Min subtotal ${formatMoney(c.minSubtotal || 0)}<br/>${c.firstOrderOnly ? 'First order only' : 'Any order'}</td>
          <td class="mono">${c.usedCount ?? 0}${c.usageLimit != null ? ` / ${c.usageLimit}` : ''} uses<div class="row-sub">per user: ${c.perUserLimit ?? 1}</div></td>
          <td class="mono">${periodLabel(c)}</td>
          <td class="row-sub">${c.restaurant ? 'Single restaurant' : 'All restaurants'}</td>
          <td><span class="badge ${c.isActive ? 'badge-success' : 'badge-muted'}">${c.isActive ? 'Active' : 'Paused'}</span></td>
          <td><div class="row-actions">
            <button class="btn btn-sm btn-ghost coupon-toggle" data-id="${esc(c._id)}" data-active="${c.isActive ? 'true' : 'false'}">
              ${c.isActive ? 'Pause' : 'Activate'}
            </button>
          </div></td>
        </tr>`).join('')}</tbody></table>`;

    wrap.querySelectorAll('.coupon-toggle').forEach(btn =>
      btn.addEventListener('click', () => toggle(btn)));
  }

  async function toggle(btn) {
    if (busy) return;
    const next = btn.dataset.active !== 'true';
    busy = true;
    btn.disabled = true;
    try {
      await apiRequest(`/coupons/${btn.dataset.id}/toggle`, { method: 'PATCH', body: { isActive: next } });
      showToast(next ? 'Coupon activated.' : 'Coupon paused.', 'success');
      await load();
    } catch (err) {
      showToast(err.message || 'Could not update the coupon.', 'error');
    } finally {
      busy = false;
      btn.disabled = false;
    }
  }

  async function load() {
    wrap.innerHTML = '<div class="state-block"><div class="spinner-lg"></div></div>';
    try {
      const res = await apiRequest('/coupons');
      coupons = Array.isArray(res.data) ? res.data : [];
      render();
    } catch (err) {
      wrap.innerHTML = `<div class="state-block"><h4>Could not load coupons</h4><p>${esc(err.message)}</p>
        <button class="btn btn-ghost btn-sm" id="coupons-retry">Retry</button></div>`;
      document.getElementById('coupons-retry')?.addEventListener('click', load);
    }
  }

  async function loadRestaurants() {
    if (restaurants.length) return;
    try {
      const res = await apiRequest('/admin/restaurants', { query: { status: 'active' } });
      restaurants = res.data || [];
    } catch (_) { restaurants = []; }
  }

  /* ── Create modal (dynamic) ────────────────────────────────── */
  function createModal() {
    let m = document.getElementById('coupon-modal');
    if (m) return m;
    m = document.createElement('div');
    m.id = 'coupon-modal';
    m.className = 'modal-overlay';
    m.innerHTML = `<div class="modal-box">
      <div class="modal-head"><h3>Create coupon</h3><button class="modal-close" data-close-modal="coupon-modal" type="button">✕</button></div>
      <div class="modal-body">
        <div class="form-grid">
          <div class="field">
            <label for="cp-code">Code *</label>
            <input id="cp-code" maxlength="40" placeholder="WELCOME50" style="text-transform:uppercase;" />
            <div class="hint">3–40 chars: A–Z, 0–9, _ or -</div>
            <div class="error-msg" id="cp-code-error"></div>
          </div>
          <div class="field">
            <label for="cp-type">Discount type *</label>
            <select id="cp-type"><option value="percent">Percent (%)</option><option value="fixed">Fixed (₹)</option></select>
          </div>
          <div class="field">
            <label for="cp-value">Value *</label>
            <input id="cp-value" type="number" min="0" step="0.01" placeholder="10 or 50" />
            <div class="error-msg" id="cp-value-error"></div>
          </div>
          <div class="field">
            <label for="cp-maxDiscount">Max discount (₹)</label>
            <input id="cp-maxDiscount" type="number" min="0" step="1" placeholder="optional" />
          </div>
          <div class="field">
            <label for="cp-minSubtotal">Min subtotal (₹)</label>
            <input id="cp-minSubtotal" type="number" min="0" step="1" value="0" />
          </div>
          <div class="field">
            <label for="cp-usageLimit">Total usage limit</label>
            <input id="cp-usageLimit" type="number" min="1" step="1" placeholder="unlimited" />
          </div>
          <div class="field">
            <label for="cp-perUserLimit">Per-user limit</label>
            <input id="cp-perUserLimit" type="number" min="1" step="1" value="1" />
          </div>
          <div class="field">
            <label for="cp-restaurant">Restaurant scope</label>
            <select id="cp-restaurant"><option value="">All restaurants</option></select>
          </div>
          <div class="field">
            <label for="cp-startsAt">Starts</label>
            <input id="cp-startsAt" type="datetime-local" />
          </div>
          <div class="field">
            <label for="cp-expiresAt">Expires</label>
            <input id="cp-expiresAt" type="datetime-local" />
            <div class="error-msg" id="cp-dates-error"></div>
          </div>
          <div class="field span-2">
            <label class="check-row"><input id="cp-firstOrderOnly" type="checkbox" /> <span>First order only</span></label>
          </div>
          <div class="field span-2">
            <label class="check-row"><input id="cp-isActive" type="checkbox" checked /> <span>Active immediately</span></label>
          </div>
        </div>
      </div>
      <div class="modal-foot">
        <div class="modal-result" id="coupon-modal-result"></div>
        <button type="button" class="btn btn-ghost" data-close-modal="coupon-modal">Cancel</button>
        <button type="button" class="btn btn-primary" id="coupon-save">Create coupon</button>
      </div>
    </div>`;
    document.body.appendChild(m);
    m.querySelector('#coupon-save').addEventListener('click', save);
    return m;
  }

  function toIso(localValue) {
    if (!localValue) return undefined;
    const d = new Date(localValue);
    return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
  }

  async function save() {
    if (busy) return;
    const m = createModal();
    const codeEl = m.querySelector('#cp-code');
    const valueEl = m.querySelector('#cp-value');
    const codeError = m.querySelector('#cp-code-error');
    const valueError = m.querySelector('#cp-value-error');
    const datesError = m.querySelector('#cp-dates-error');
    const result = m.querySelector('#coupon-modal-result');
    codeError.textContent = ''; valueError.textContent = ''; datesError.textContent = '';
    result.className = 'modal-result';

    const code = codeEl.value.trim().toUpperCase();
    const type = m.querySelector('#cp-type').value;
    const value = Number(m.querySelector('#cp-value').value);
    let valid = true;
    if (!/^[A-Z0-9_-]{3,40}$/.test(code)) { codeError.textContent = 'Use 3–40 characters: A–Z, 0–9, _ or -.'; valid = false; }
    if (!Number.isFinite(value) || value < 0) { valueError.textContent = 'Enter a value of 0 or more.'; valid = false; }
    if (type === 'percent' && value > 100) { valueError.textContent = 'Percent cannot exceed 100.'; valid = false; }

    const startsAt = toIso(m.querySelector('#cp-startsAt').value);
    const expiresAt = toIso(m.querySelector('#cp-expiresAt').value);
    if (startsAt && expiresAt && new Date(expiresAt) <= new Date(startsAt)) {
      datesError.textContent = 'Expiry must be after the start date.';
      valid = false;
    }
    if (!valid) return;

    const usageLimitRaw = m.querySelector('#cp-usageLimit').value;
    const body = {
      code,
      type,
      value,
      minSubtotal: Number(m.querySelector('#cp-minSubtotal').value || 0),
      perUserLimit: Math.max(1, Number(m.querySelector('#cp-perUserLimit').value || 1)),
      firstOrderOnly: m.querySelector('#cp-firstOrderOnly').checked,
      isActive: m.querySelector('#cp-isActive').checked,
      maxDiscount: m.querySelector('#cp-maxDiscount').value === '' ? null : Number(m.querySelector('#cp-maxDiscount').value),
      usageLimit: usageLimitRaw === '' ? null : Math.max(1, Number(usageLimitRaw)),
    };
    if (startsAt) body.startsAt = startsAt;
    if (expiresAt) body.expiresAt = expiresAt;
    const restaurantId = m.querySelector('#cp-restaurant').value;
    if (restaurantId) body.restaurant = restaurantId;

    busy = true;
    const saveBtn = m.querySelector('#coupon-save');
    saveBtn.disabled = true;
    saveBtn.innerHTML = '<span class="btn-spinner"></span> Creating…';
    try {
      await apiRequest('/coupons', { method: 'POST', body });
      showToast(`Coupon ${code} created.`, 'success');
      closeModal('coupon-modal');
      await load();
    } catch (err) {
      result.textContent = err.message || 'Could not create the coupon.';
      result.className = 'modal-result show error';
    } finally {
      busy = false;
      saveBtn.disabled = false;
      saveBtn.textContent = 'Create coupon';
    }
  }

  async function openCreate() {
    const m = createModal();
    await loadRestaurants();
    const select = m.querySelector('#cp-restaurant');
    select.innerHTML = `<option value="">All restaurants</option>` +
      restaurants.map(r => `<option value="${esc(r.id)}">${esc(r.name)}</option>`).join('');
    m.querySelector('#coupon-modal-result').className = 'modal-result';
    openModal('coupon-modal');
  }

  addBtn?.addEventListener('click', openCreate);
  refreshBtn?.addEventListener('click', load);
  searchInput?.addEventListener('input', debounce(render, 250));
  statusFilter?.addEventListener('change', render);
  document.addEventListener('admin:view-changed', (e) => {
    if (e.detail.view === 'coupons') load();
  });
})();
