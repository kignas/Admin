/* ==========================================================================
   MODULE 11 — Settlements & Financial Management
   Confirmed backend contract (finance.manage permission; empty admin
   permissions = full access):
     GET   /api/settlements?page=&limit=&status=&restaurantId=
           → { data: LedgerEntry[], pagination } fields: orderNumber, foodSales
             (customer food amount), commissionRate, commissionAmount (platform
             commission), restaurantNetAmount (vendor earnings),
             netSettlementAmount (settlement amount), status
             (eligible | reserved | settled | void), source, settledAt
     GET   /api/settlements/integrity → { deliveredOrders, ledgerEntries,
           missing, mismatch, healthy }
     POST  /api/settlements/settle    body { ledgerIds: string[], reference? }
     POST  /api/settlements/rebuild   body {} — backfill from delivered+paid orders
     GET   /api/admin/payout-requests?status=&page=&limit=
           status ∈ requested | processing | paid | rejected | cancelled
     PATCH /api/admin/payout-requests/:id
           body { status: processing|paid|rejected|cancelled,
                  reference?, adminNote? }   (backend enforces transitions)
   No bank transfer is simulated: "paid" is a backend state change only.
   ========================================================================== */
(function () {
  const ledgerWrap = document.getElementById('ledger-table-wrap');
  const ledgerFooter = document.getElementById('ledger-footer');
  const ledgerPageInfo = document.getElementById('ledger-page-info');
  const ledgerPagination = document.getElementById('ledger-pagination');
  const ledgerCount = document.getElementById('ledger-count');
  const ledgerStatusFilter = document.getElementById('ledger-status-filter');
  const settleBtn = document.getElementById('ledger-settle-btn');
  const rebuildBtn = document.getElementById('ledger-rebuild-btn');
  const integWrap = document.getElementById('ledger-integrity');

  const payoutsWrap = document.getElementById('payouts-table-wrap');
  const payoutsFooter = document.getElementById('payouts-footer');
  const payoutsPageInfo = document.getElementById('payouts-page-info');
  const payoutsPagination = document.getElementById('payouts-pagination');
  const payoutsCount = document.getElementById('payouts-count');
  const payoutStatusFilter = document.getElementById('payout-status-filter');
  const refreshBtn = document.getElementById('settlements-refresh');

  const ledgerState = { page: 1, limit: 15, status: '' };
  const payoutState = { page: 1, limit: 15, status: '' };
  let activeTab = 'ledger';
  let busy = false;
  let ledgerRows = [];
  const selected = new Set();

  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const LEDGER_BADGE = { eligible: 'badge-success', reserved: 'badge-warning', settled: 'badge-muted', void: 'badge-danger' };
  const PAYOUT_BADGE = { requested: 'badge-warning', processing: 'badge-info', paid: 'badge-success', rejected: 'badge-danger', cancelled: 'badge-muted' };

  /* ── Generic prompt modal (optional note/reference input) ──── */
  function promptModal() {
    let m = document.getElementById('settlement-prompt-modal');
    if (m) return m;
    m = document.createElement('div');
    m.id = 'settlement-prompt-modal';
    m.className = 'modal-overlay';
    m.innerHTML = `<div class="modal-box">
      <div class="modal-head"><h3 id="sp-title">Confirm</h3><button class="modal-close" data-close-modal="settlement-prompt-modal" type="button">✕</button></div>
      <div class="modal-body">
        <p id="sp-desc" class="hint" style="font-size:13px;color:var(--text-muted);"></p>
        <div class="field">
          <label id="sp-label" for="sp-input">Note</label>
          <textarea id="sp-input" rows="3" maxlength="500"></textarea>
          <div class="error-msg" id="sp-error"></div>
        </div>
      </div>
      <div class="modal-foot">
        <div class="modal-result" id="sp-result"></div>
        <button type="button" class="btn btn-ghost" data-close-modal="settlement-prompt-modal">Cancel</button>
        <button type="button" class="btn btn-primary" id="sp-confirm">Confirm</button>
      </div>
    </div>`;
    document.body.appendChild(m);
    return m;
  }

  /** Returns a Promise<string|null> — null when cancelled. */
  function askConfirmation({ title, desc, label, placeholder, confirmText, danger, required, validate }) {
    return new Promise((resolve) => {
      const m = promptModal();
      m.querySelector('#sp-title').textContent = title;
      m.querySelector('#sp-desc').textContent = desc || '';
      m.querySelector('#sp-label').textContent = label || 'Note';
      const input = m.querySelector('#sp-input');
      input.value = '';
      input.placeholder = placeholder || '';
      m.querySelector('#sp-error').textContent = '';
      m.querySelector('#sp-result').className = 'modal-result';
      const confirmBtn = m.querySelector('#sp-confirm');
      confirmBtn.textContent = confirmText || 'Confirm';
      confirmBtn.className = `btn ${danger ? 'btn-danger' : 'btn-primary'}`;

      const finish = (value) => {
        confirmBtn.removeEventListener('click', onConfirm);
        m.querySelector('[data-close-modal="settlement-prompt-modal"]').removeEventListener('click', onCancel);
        closeModal('settlement-prompt-modal');
        resolve(value);
      };
      const onCancel = () => finish(null);
      const onConfirm = () => {
        const value = input.value.trim();
        if (required && !value) {
          m.querySelector('#sp-error').textContent = 'This field is required.';
          return;
        }
        if (validate) {
          const problem = validate(value);
          if (problem) { m.querySelector('#sp-error').textContent = problem; return; }
        }
        finish(value);
      };
      confirmBtn.addEventListener('click', onConfirm);
      m.querySelector('[data-close-modal="settlement-prompt-modal"]').addEventListener('click', onCancel);
      openModal('settlement-prompt-modal');
    });
  }

  /* ── Ledger integrity strip ────────────────────────────────── */
  async function loadIntegrity() {
    integWrap.innerHTML = '<div class="card state-block" style="padding:24px;"><div class="spinner-lg"></div></div>';
    try {
      const res = await apiRequest('/settlements/integrity');
      const d = res.data || {};
      integWrap.className = `card integ-card ${d.healthy ? 'integ-ok' : 'integ-warn'}`;
      integWrap.innerHTML = `
        <span class="integ-dot"></span>
        <div><strong>Ledger integrity: ${d.healthy ? 'healthy' : 'needs attention'}</strong>
        <div class="hint">${d.deliveredOrders ?? '—'} delivered paid orders · ${d.ledgerEntries ?? '—'} ledger entries · ${d.missing ?? '—'} missing · ${d.mismatch ?? '—'} mismatched</div></div>`;
    } catch (err) {
      integWrap.className = 'card integ-card integ-warn';
      integWrap.innerHTML = `<span class="integ-dot"></span>
        <div><strong>Integrity check unavailable</strong><div class="hint">${esc(err.message)}</div></div>`;
    }
  }

  /* ── Ledger table ──────────────────────────────────────────── */
  function renderLedger() {
    if (!ledgerRows.length) {
      ledgerWrap.innerHTML = `<div class="state-block"><h4>No ledger entries found</h4>
        <p>${ledgerState.status ? 'Try another status filter.' : 'Ledger entries are created for delivered, paid orders (use “Rebuild ledger” to backfill).'}</p></div>`;
      settleBtn.disabled = true;
      return;
    }
    ledgerWrap.innerHTML = `<table class="data-table"><thead><tr>
        <th></th><th>Order</th><th>Restaurant</th><th>Vendor</th>
        <th>Customer food amount</th><th>Commission</th><th>Vendor earnings</th>
        <th>Settlement amount</th><th>Status</th><th></th>
      </tr></thead><tbody>${ledgerRows.map(r => {
      const selectable = r.status === 'eligible';
      return `<tr data-id="${esc(r._id)}">
        <td>${selectable ? `<input type="checkbox" class="ledger-check" data-id="${esc(r._id)}" ${selected.has(r._id) ? 'checked' : ''} aria-label="Select entry" />` : ''}</td>
        <td class="mono row-name">${esc(r.orderNumber || '—')}</td>
        <td>${esc(r.restaurant?.name || '—')}</td>
        <td>${esc(r.vendor?.name || r.vendor?.email || '—')}</td>
        <td class="mono">${formatMoney(r.foodSales)}</td>
        <td class="mono">${Number(r.commissionRate ?? 0)}% = ${formatMoney(r.commissionAmount)}</td>
        <td class="mono">${formatMoney(r.restaurantNetAmount)}</td>
        <td class="mono row-name">${formatMoney(r.netSettlementAmount)}${r.source === 'refund_adjustment' ? '<div class="row-sub">refund adjustment</div>' : ''}</td>
        <td><span class="badge ${LEDGER_BADGE[r.status] || 'badge-muted'}">${esc(r.status)}</span></td>
        <td class="mono row-sub">${r.settledAt ? formatDate(r.settledAt) : formatDate(r.createdAt)}</td>
      </tr>`;
    }).join('')}</tbody></table>`;

    ledgerWrap.querySelectorAll('.ledger-check').forEach(cb => cb.addEventListener('change', () => {
      if (cb.checked) selected.add(cb.dataset.id); else selected.delete(cb.dataset.id);
      settleBtn.disabled = selected.size === 0;
      settleBtn.textContent = selected.size ? `Settle selected (${selected.size})` : 'Settle selected';
    }));
    settleBtn.disabled = selected.size === 0;
    settleBtn.textContent = selected.size ? `Settle selected (${selected.size})` : 'Settle selected';
  }

  async function loadLedger() {
    ledgerWrap.innerHTML = '<div class="state-block"><div class="spinner-lg"></div></div>';
    try {
      const query = { page: ledgerState.page, limit: ledgerState.limit };
      if (ledgerState.status) query.status = ledgerState.status;
      const res = await apiRequest('/settlements', { query });
      ledgerRows = res.data || [];
      const pg = res.pagination || { page: ledgerState.page, limit: ledgerState.limit, total: ledgerRows.length, pages: 1 };
      ledgerCount.textContent = `${pg.total} entr${pg.total === 1 ? 'y' : 'ies'}`;
      renderLedger();
      if (pg.pages > 1) {
        ledgerFooter.style.display = 'flex';
        renderPagination(ledgerPagination, ledgerPageInfo, pg, (p) => { ledgerState.page = p; loadLedger(); });
      } else ledgerFooter.style.display = 'none';
    } catch (err) {
      ledgerWrap.innerHTML = `<div class="state-block"><h4>Could not load the settlement ledger</h4>
        <p>${esc(err.message)}</p><button class="btn btn-ghost btn-sm" id="ledger-retry">Retry</button></div>`;
      document.getElementById('ledger-retry')?.addEventListener('click', () => { loadLedger(); loadIntegrity(); });
    }
  }

  settleBtn.addEventListener('click', async () => {
    if (busy || !selected.size) return;
    const ids = [...selected];
    const reference = await askConfirmation({
      title: `Settle ${ids.length} ledger entr${ids.length === 1 ? 'y' : 'ies'}?`,
      desc: 'Backend groups these entries per vendor and marks them settled in a transaction. This is a financial action and cannot be undone from this screen.',
      label: 'Payout reference (optional)',
      placeholder: 'e.g. UPI-batch-2026-10-02',
      confirmText: 'Settle now',
    });
    if (reference === null) return;
    busy = true;
    settleBtn.disabled = true;
    try {
      const res = await apiRequest('/settlements/settle', {
        method: 'POST',
        body: { ledgerIds: ids, ...(reference ? { reference } : {}) },
      });
      selected.clear();
      showToast(`Settled ${res.data?.batches?.length ?? 0} batch(es).`, 'success');
      await Promise.all([loadLedger(), loadIntegrity()]);
    } catch (err) {
      showToast(err.message || 'Could not settle the selected entries.', 'error');
    } finally {
      busy = false;
      settleBtn.disabled = selected.size === 0;
    }
  });

  rebuildBtn.addEventListener('click', async () => {
    if (busy) return;
    if (!confirm('Rebuild the ledger?\n\nThis backfills ledger entries for delivered, paid orders that are missing one. Existing entries are untouched.')) return;
    busy = true;
    rebuildBtn.disabled = true;
    try {
      const res = await apiRequest('/settlements/rebuild', { method: 'POST', body: {} });
      showToast(`Ledger rebuild finished — ${res.data?.created ?? 0} entries created.`, 'success');
      await Promise.all([loadLedger(), loadIntegrity()]);
    } catch (err) {
      showToast(err.message || 'Could not rebuild the ledger.', 'error');
    } finally {
      busy = false;
      rebuildBtn.disabled = false;
    }
  });

  /* ── Payout requests ───────────────────────────────────────── */
  function payoutActions(p) {
    const buttons = [];
    if (p.status === 'requested') {
      buttons.push(['processing', 'Mark processing', 'btn-ghost']);
      buttons.push(['rejected', 'Reject', 'btn-danger']);
      buttons.push(['cancelled', 'Cancel', 'btn-ghost']);
    } else if (p.status === 'processing') {
      buttons.push(['paid', 'Mark paid', 'btn-primary']);
      buttons.push(['rejected', 'Reject', 'btn-danger']);
      buttons.push(['cancelled', 'Cancel', 'btn-ghost']);
    }
    return buttons.map(([status, label, cls]) =>
      `<button class="btn btn-sm ${cls} payout-action" data-id="${esc(p._id)}" data-status="${status}" data-amount="${esc(p.amount)}">${label}</button>`).join('');
  }

  function renderPayouts(rows) {
    if (!rows.length) {
      payoutsWrap.innerHTML = `<div class="state-block"><h4>No payout requests</h4>
        <p>${payoutState.status ? 'Try another status filter.' : 'Vendor payout requests appear here once they are submitted from the Vendor frontend.'}</p></div>`;
      return;
    }
    payoutsWrap.innerHTML = `<table class="data-table"><thead><tr>
        <th>Restaurant</th><th>Vendor</th><th>Amount</th><th>Schedule</th><th>Requested</th><th>Status</th><th>Reference / note</th><th></th>
      </tr></thead><tbody>${rows.map(p => `
        <tr data-id="${esc(p._id)}">
          <td class="row-name">${esc(p.restaurant?.name || '—')}</td>
          <td>${esc(p.vendor?.name || p.vendor?.email || '—')}</td>
          <td class="mono row-name">${formatMoney(p.amount)}</td>
          <td>${esc(p.schedule || '—')}</td>
          <td class="mono">${formatDate(p.requestedAt || p.createdAt)}</td>
          <td>
            <span class="badge ${PAYOUT_BADGE[p.status] || 'badge-muted'}">${esc(p.status)}</span>
            ${p.paidAt ? `<div class="row-sub mono">paid ${formatDate(p.paidAt)}</div>` : ''}
          </td>
          <td class="row-sub">${esc(p.reference || p.adminNote || '—')}</td>
          <td><div class="row-actions">${payoutActions(p)}</div></td>
        </tr>`).join('')}</tbody></table>`;

    payoutsWrap.querySelectorAll('.payout-action').forEach(btn =>
      btn.addEventListener('click', () => payoutAction(btn.dataset.id, btn.dataset.status)));
  }

  async function payoutAction(id, next) {
    if (busy) return;
    const isPaid = next === 'paid';
    const isDrop = next === 'rejected' || next === 'cancelled';
    const input = await askConfirmation({
      title: next === 'processing' ? 'Move payout to processing?' : isPaid ? 'Mark payout as paid?' : `${next === 'rejected' ? 'Reject' : 'Cancel'} payout request?`,
      desc: isPaid
        ? 'Marks the payout as paid in the backend and settles its reserved ledger entries. No real bank transfer is performed by this action.'
        : isDrop
          ? 'Releases the reserved ledger entries back to eligible. The vendor can submit a new request.'
          : 'Updates the payout request status to processing.',
      label: isPaid ? 'Payment reference (optional)' : isDrop ? 'Admin note (optional)' : 'Reference (optional)',
      placeholder: isPaid ? 'e.g. UPI / bank transfer reference' : '',
      confirmText: 'Confirm',
      danger: isDrop,
    });
    if (input === null) return;

    busy = true;
    try {
      const body = { status: next };
      if (isPaid && input) body.reference = input;
      if (isDrop && input) body.adminNote = input;
      if (next === 'processing' && input) body.reference = input;
      await apiRequest(`/admin/payout-requests/${id}`, { method: 'PATCH', body });
      showToast(`Payout request updated to “${next}”.`, 'success');
      await Promise.all([loadPayouts(), loadLedger(), loadIntegrity()]);
    } catch (err) {
      showToast(err.message || 'Could not update the payout request.', 'error');
    } finally {
      busy = false;
    }
  }

  async function loadPayouts() {
    payoutsWrap.innerHTML = '<div class="state-block"><div class="spinner-lg"></div></div>';
    try {
      const query = { page: payoutState.page, limit: payoutState.limit };
      if (payoutState.status) query.status = payoutState.status;
      const res = await apiRequest('/admin/payout-requests', { query });
      const rows = res.data || [];
      const pg = res.pagination || { page: payoutState.page, limit: payoutState.limit, total: rows.length, pages: 1 };
      payoutsCount.textContent = `${pg.total} request${pg.total === 1 ? '' : 's'}`;
      renderPayouts(rows);
      if (pg.pages > 1) {
        payoutsFooter.style.display = 'flex';
        renderPagination(payoutsPagination, payoutsPageInfo, pg, (p) => { payoutState.page = p; loadPayouts(); });
      } else payoutsFooter.style.display = 'none';
    } catch (err) {
      payoutsWrap.innerHTML = `<div class="state-block"><h4>Could not load payout requests</h4>
        <p>${esc(err.message)}</p><button class="btn btn-ghost btn-sm" id="payouts-retry">Retry</button></div>`;
      document.getElementById('payouts-retry')?.addEventListener('click', loadPayouts);
    }
  }

  /* ── Tabs & filters ────────────────────────────────────────── */
  document.getElementById('settlements-tabs')?.addEventListener('click', (e) => {
    const tab = e.target.closest('.tab');
    if (!tab) return;
    activeTab = tab.dataset.tab;
    document.querySelectorAll('#settlements-tabs .tab').forEach(t => t.classList.toggle('active', t === tab));
    document.getElementById('settlements-panel-ledger').style.display = activeTab === 'ledger' ? '' : 'none';
    document.getElementById('settlements-panel-payouts').style.display = activeTab === 'payouts' ? '' : 'none';
    if (activeTab === 'payouts' && !payoutsWrap.dataset.loaded) {
      payoutsWrap.dataset.loaded = 'true';
      loadPayouts();
    }
  });

  ledgerStatusFilter?.addEventListener('change', () => {
    ledgerState.status = ledgerStatusFilter.value;
    ledgerState.page = 1;
    selected.clear();
    loadLedger();
  });
  payoutStatusFilter?.addEventListener('change', () => {
    payoutState.status = payoutStatusFilter.value;
    payoutState.page = 1;
    loadPayouts();
  });
  refreshBtn?.addEventListener('click', () => {
    loadIntegrity();
    loadLedger();
    if (payoutsWrap.dataset.loaded) loadPayouts();
  });

  document.addEventListener('admin:view-changed', (e) => {
    if (e.detail.view === 'settlements') {
      loadIntegrity();
      loadLedger();
      if (payoutsWrap.dataset.loaded) loadPayouts();
    }
  });
})();
