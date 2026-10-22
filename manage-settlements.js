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
    const reconcile = `<button class="btn btn-sm btn-ghost payout-reconcile" data-id="${esc(p._id)}">Reconcile</button>`;
    return reconcile + buttons.map(([status, label, cls]) =>
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
    payoutsWrap.querySelectorAll('.payout-reconcile').forEach(btn =>
      btn.addEventListener('click', () => showPayoutReconciliation(btn.dataset.id)));
  }

  function reconciliationModal() {
    let m = document.getElementById('payout-reconciliation-modal');
    if (m) return m;
    m = document.createElement('div'); m.id = 'payout-reconciliation-modal'; m.className = 'modal-overlay';
    m.innerHTML = `<div class="modal-box" style="max-width:760px;">
      <div class="modal-head"><h3>Payout reconciliation</h3><button class="modal-close" data-close-modal="payout-reconciliation-modal" type="button">✕</button></div>
      <div class="modal-body" id="payout-reconciliation-body"><div class="state-block"><div class="spinner-lg"></div></div></div>
      <div class="modal-foot"><button type="button" class="btn btn-ghost" data-close-modal="payout-reconciliation-modal">Close</button></div>
    </div>`;
    document.body.appendChild(m); return m;
  }

  async function showPayoutReconciliation(id) {
    const m = reconciliationModal();
    const body = m.querySelector('#payout-reconciliation-body');
    body.innerHTML = '<div class="state-block"><div class="spinner-lg"></div><p>Checking linked ledger entries…</p></div>';
    openModal('payout-reconciliation-modal');
    try {
      const res = await apiRequest(`/admin/payout-requests/${encodeURIComponent(id)}/reconciliation`);
      const d = res.data || {}, r = d.reconciliation || {}, req = d.request || {};
      const good = r.allEntriesLinked === true && r.amountMatches === true;
      const entries = Array.isArray(d.entries) ? d.entries : [];
      body.innerHTML = `<div class="detail-head"><div><div class="detail-title">${esc(req.restaurant?.name || 'Payout request')}</div><div class="detail-sub mono">${esc(req._id || id)} · ${esc(req.status || 'unknown status')}</div></div><span class="badge ${good ? 'badge-success' : 'badge-danger'}">${good ? 'Reconciled' : 'Mismatch / incomplete'}</span></div>
        <div class="stats-grid" style="grid-template-columns:repeat(auto-fit,minmax(140px,1fr));margin:14px 0;">
          <div class="stat-card"><div class="stat-label">Requested</div><div class="stat-value">${formatMoney(r.requestAmount)}</div></div>
          <div class="stat-card"><div class="stat-label">Ledger total</div><div class="stat-value">${formatMoney(r.ledgerAmount)}</div></div>
          <div class="stat-card"><div class="stat-label">Difference</div><div class="stat-value">${formatMoney(r.difference)}</div></div>
          <div class="stat-card"><div class="stat-label">Linked entries</div><div class="stat-value">${Number(r.entryCountFound)||0} / ${Number(r.entryCountExpected)||0}</div></div>
        </div>
        <p class="hint">${r.canMarkPaid === true ? 'Ledger entries reconcile. If the real bank/UPI transfer has already happened, you can record its UTR in the payout action.' : 'Do not mark this payout paid until the ledger is reconciled and its status is eligible for payment. This screen does not transfer money.'}</p>
        ${entries.length ? `<div class="table-wrap"><table class="data-table"><thead><tr><th>Order</th><th>Ledger status</th><th>Net amount</th><th>Created</th><th>Linked</th></tr></thead><tbody>${entries.map(e => { const linked = String(e.payoutRequest || '') === String(req._id || id); return `<tr><td class="mono">${esc(e.orderNumber || e.order || '—')}</td><td>${esc(e.status || '—')}</td><td class="mono">${formatMoney(e.netSettlementAmount)}</td><td>${formatDate(e.createdAt)}</td><td><span class="badge ${linked ? 'badge-success' : 'badge-danger'}">${linked ? 'Yes' : 'No'}</span></td></tr>`; }).join('')}</tbody></table></div>` : '<div class="state-block"><p>No ledger entries were returned for this payout.</p></div>'}`;
    } catch (err) {
      body.innerHTML = `<div class="state-block"><h4>Could not reconcile payout</h4><p>${esc(err.message || 'Request failed')}</p><button class="btn btn-ghost btn-sm" id="payout-reconcile-retry">Retry</button></div>`;
      body.querySelector('#payout-reconcile-retry')?.addEventListener('click', () => showPayoutReconciliation(id));
    }
  }

  async function payoutAction(id, next) {
    if (busy) return;
    const isPaid = next === 'paid';
    const isDrop = next === 'rejected' || next === 'cancelled';
    if (isPaid) {
      try {
        const check = await apiRequest(`/admin/payout-requests/${encodeURIComponent(id)}/reconciliation`);
        if (check.data?.reconciliation?.canMarkPaid !== true) {
          showToast('Payout cannot be marked paid: its ledger does not reconcile or its status is not eligible. Open Reconcile for details.', 'error');
          await showPayoutReconciliation(id);
          return;
        }
      } catch (err) {
        showToast(err.message || 'Could not verify payout reconciliation. Payment status was not changed.', 'error');
        return;
      }
    }
    const input = await askConfirmation({
      title: next === 'processing' ? 'Move payout to processing?' : isPaid ? 'Mark payout as paid?' : `${next === 'rejected' ? 'Reject' : 'Cancel'} payout request?`,
      desc: isPaid
        ? 'First confirm that the real bank/UPI transfer has already occurred. This records the bank UTR and settles matching ledger entries; it does not transfer money.'
        : isDrop
          ? 'Releases the reserved ledger entries back to eligible. The vendor can submit a new request.'
          : 'Updates the payout request status to processing.',
      label: isPaid ? 'Bank UTR / transfer reference (required)' : isDrop ? 'Admin note (optional)' : 'Reference (optional)',
      placeholder: isPaid ? 'Enter the actual bank/UPI UTR or transfer reference' : '',
      required: isPaid,
      validate: isPaid ? (value) => value.length > 120 ? 'Reference must be 120 characters or fewer.' : '' : undefined,
      confirmText: isPaid ? 'Confirm transfer recorded' : 'Confirm',
      danger: isDrop,
    });
    if (input === null) return;

    busy = true;
    try {
      const body = { status: next };
      if (isPaid) { body.bankUtr = input; body.reference = input; }
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

  /* ── Pillar 5: Restaurant Settlements tab ───────────────────── */
  const restWrap = document.getElementById('rest-settle-table-wrap');
  const restCount = document.getElementById('rest-settle-count');
  let restRows = [];

  async function loadRestaurantSettlements() {
    if (!restWrap) return;
    restWrap.innerHTML = '<div class="state-block"><div class="spinner-lg"></div></div>';
    try {
      const res = await apiRequest('/settlements/restaurants');
      restRows = res.data || [];
      restCount.textContent = `${restRows.length} restaurant${restRows.length === 1 ? '' : 's'} with unsettled balance`;
      if (!restRows.length) {
        restWrap.innerHTML = '<div class="state-block"><h4>No unsettled vendor balances</h4><p>Delivered orders create a transparent vendor ledger entry per order.</p></div>';
        return;
      }
      restWrap.innerHTML = `<table class="data-table"><thead><tr>
          <th>Restaurant</th><th>Unsettled balance</th><th>Gross food bill</th><th>Commission</th>
          <th>Vendor discount share</th><th>Penalty adj.</th><th>Orders</th><th></th>
        </tr></thead><tbody>${restRows.map(r => `
          <tr data-id="${esc(r.restaurantId)}">
            <td class="row-name">${esc(r.name)}${r.commissionRate != null ? `<div class="row-sub">commission ${esc(r.commissionRate)}%</div>` : ''}</td>
            <td class="mono row-name">${formatMoney(r.unsettledBalance)}</td>
            <td class="mono">${formatMoney(r.grossFoodBill)}</td>
            <td class="mono">${formatMoney(r.commissionAmount)}</td>
            <td class="mono">${formatMoney(r.vendorDiscountShare)}</td>
            <td class="mono">${formatMoney(r.penaltyAdjustment)}</td>
            <td class="mono">${Number(r.orderCount) || 0}</td>
            <td><div class="row-actions">
              <button class="btn btn-sm btn-ghost rest-statement" data-id="${esc(r.restaurantId)}" data-name="${esc(r.name)}">Statement</button>
              <button class="btn btn-sm btn-ghost rest-adjust" data-id="${esc(r.restaurantId)}" data-name="${esc(r.name)}">Adjust</button>
            </div></td>
          </tr>`).join('')}</tbody></table>`;
      restWrap.querySelectorAll('.rest-statement').forEach(b => b.addEventListener('click', () => openRestaurantStatement(b.dataset.id, b.dataset.name)));
      restWrap.querySelectorAll('.rest-adjust').forEach(b => b.addEventListener('click', () => openRestaurantAdjustment(b.dataset.id, b.dataset.name)));
    } catch (err) {
      restWrap.innerHTML = `<div class="state-block"><h4>Could not load restaurant settlements</h4><p>${esc(err.message)}</p>
        <button class="btn btn-ghost btn-sm" id="rest-settle-retry">Retry</button></div>`;
      document.getElementById('rest-settle-retry')?.addEventListener('click', loadRestaurantSettlements);
    }
  }

  function statementModal() {
    let m = document.getElementById('rest-statement-modal');
    if (m) return m;
    m = document.createElement('div'); m.id = 'rest-statement-modal'; m.className = 'modal-overlay';
    m.innerHTML = `<div class="modal-box" style="max-width:900px;">
      <div class="modal-head"><h3 id="rs-title">Restaurant statement</h3><button class="modal-close" data-close-modal="rest-statement-modal" type="button">✕</button></div>
      <div class="modal-body" id="rs-body"><div class="state-block"><div class="spinner-lg"></div></div></div>
      <div class="modal-foot">
        <div class="modal-result" id="rs-result"></div>
        <button type="button" class="btn btn-ghost" data-close-modal="rest-statement-modal">Close</button>
        <button type="button" class="btn btn-primary" id="rs-batch">Create settlement batch / Mark paid</button>
      </div>
    </div>`;
    document.body.appendChild(m);
    m.querySelector('#rs-batch').addEventListener('click', () => createBatchFromStatement(m));
    return m;
  }

  let currentStatement = null;

  async function openRestaurantStatement(id, name) {
    const m = statementModal();
    m.dataset.id = id;
    m.querySelector('#rs-title').textContent = `Statement — ${name || id}`;
    m.querySelector('#rs-result').className = 'modal-result';
    const body = m.querySelector('#rs-body');
    body.innerHTML = '<div class="state-block"><div class="spinner-lg"></div></div>';
    openModal('rest-statement-modal');
    try {
      const res = await apiRequest(`/settlements/restaurants/${encodeURIComponent(id)}/statement`);
      currentStatement = res.data || {};
      const t = currentStatement.totals || {};
      const orders = currentStatement.orders || [];
      body.innerHTML = `
        <div class="stats-grid" style="grid-template-columns:repeat(auto-fit,minmax(140px,1fr));margin-bottom:14px;">
          <div class="stat-card"><div class="stat-label">Unsettled balance</div><div class="stat-value mono">${formatMoney(currentStatement.unsettledBalance)}</div></div>
          <div class="stat-card"><div class="stat-label">Gross food bill</div><div class="stat-value mono">${formatMoney(t.grossFoodBill)}</div></div>
          <div class="stat-card"><div class="stat-label">Commission</div><div class="stat-value mono">${formatMoney(t.commissionAmount)}</div></div>
          <div class="stat-card"><div class="stat-label">Penalty adj.</div><div class="stat-value mono">${formatMoney(t.penaltyAdjustment)}</div></div>
        </div>
        <div class="hint" style="margin-bottom:8px;">Select the eligible entries below to settle. Only entries marked <span class="badge badge-success">eligible</span> can be batched.</div>
        <div class="table-wrap"><table class="data-table"><thead><tr>
          <th></th><th>Order</th><th>Gross food bill</th><th>Commission</th><th>Discount share</th><th>Penalty</th><th>Net payable</th><th>Status</th>
        </tr></thead><tbody>${orders.map(o => `
          <tr>
            <td>${o.status === 'eligible' ? `<input type="checkbox" class="rs-check" data-id="${esc(o._id)}" checked>` : ''}</td>
            <td class="mono">${esc(o.orderNumber || '—')}</td>
            <td class="mono">${formatMoney(o.grossFoodBill ?? o.foodSales)}</td>
            <td class="mono">${formatMoney(o.commissionAmount)}</td>
            <td class="mono">${formatMoney(o.vendorDiscountShare)}</td>
            <td class="mono">${formatMoney(o.penaltyAdjustment)}</td>
            <td class="mono row-name">${formatMoney(o.netVendorPayable ?? o.netSettlementAmount)}</td>
            <td><span class="badge ${LEDGER_BADGE[o.status] || 'badge-muted'}">${esc(o.status)}</span></td>
          </tr>`).join('')}</tbody></table></div>`;
    } catch (err) {
      body.innerHTML = `<div class="state-block"><h4>Could not load statement</h4><p>${esc(err.message)}</p></div>`;
    }
  }

  async function createBatchFromStatement(m) {
    const ids = [...m.querySelectorAll('.rs-check:checked')].map(cb => cb.dataset.id);
    if (!ids.length) { showToast('Select at least one eligible entry.', 'error'); return; }
    const reference = await askConfirmation({
      title: `Mark ${ids.length} entr${ids.length === 1 ? 'y' : 'ies'} paid?`,
      desc: 'Confirm the real bank/UPI transfer has happened. This records the bank UTR and marks the selected ledger entries settled.',
      label: 'Bank UTR / transfer reference (required)',
      placeholder: 'Enter the actual bank/UPI UTR',
      required: true,
      confirmText: 'Record batch',
    });
    if (reference === null) return;
    busy = true;
    const btn = m.querySelector('#rs-batch');
    btn.disabled = true;
    try {
      const res = await apiRequest('/settlements/batches', { method: 'POST', body: { ledgerIds: ids, reference, bankUtr: reference } });
      showToast(`Settlement batch created — ${formatMoney(res.data?.amount)} for ${res.data?.count} entries.`, 'success');
      await Promise.all([loadRestaurantSettlements(), loadLedger(), loadIntegrity()]);
      await openRestaurantStatement(m.dataset.id, m.querySelector('#rs-title').textContent.replace('Statement — ', ''));
    } catch (err) {
      const result = m.querySelector('#rs-result');
      result.textContent = err.message || 'Could not create the batch.';
      result.className = 'modal-result show error';
    } finally { busy = false; btn.disabled = false; }
  }

  async function openRestaurantAdjustment(id, name) {
    const amount = prompt(`Manual adjustment for ${name}.\n\nEnter the amount in ₹ (positive number):`);
    if (amount === null) return;
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) { showToast('Enter a valid amount greater than zero.', 'error'); return; }
    const direction = confirm('OK = CREDIT the vendor (add to balance).\nCancel = DEBIT the vendor (subtract from balance).') ? 'credit' : 'debit';
    const note = prompt('Note / reason for this adjustment (optional):') || '';
    busy = true;
    try {
      await apiRequest(`/settlements/restaurants/${encodeURIComponent(id)}/adjustment`, { method: 'POST', body: { amount: value, direction, note } });
      showToast(`Adjustment recorded (${direction} ${formatMoney(value)}).`, 'success');
      await Promise.all([loadRestaurantSettlements(), loadLedger(), loadIntegrity()]);
    } catch (err) {
      showToast(err.message || 'Could not record the adjustment.', 'error');
    } finally { busy = false; }
  }

  function exportSettlementsCsv() {
    const token = AdminAuth.getToken();
    // CSV is a plain GET; fetch with the auth header then trigger a download so
    // the JWT is never placed in the URL.
    fetch(`${CONFIG.API_BASE_URL}/settlements/export.csv`, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      .then(async (res) => {
        if (!res.ok) throw new Error(`Export failed (${res.status}).`);
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = `settlements-${Date.now()}.csv`;
        document.body.appendChild(a); a.click(); a.remove();
        URL.revokeObjectURL(url);
        showToast('CSV export downloaded.', 'success');
      })
      .catch(err => showToast(err.message || 'Could not export CSV.', 'error'));
  }

  /* ── Pillar 6: Rider COD & payouts tab ──────────────────────── */
  const riderWrap = document.getElementById('rider-settle-table-wrap');
  const riderCount = document.getElementById('rider-settle-count');

  async function loadRiderSettlements() {
    if (!riderWrap) return;
    riderWrap.innerHTML = '<div class="state-block"><div class="spinner-lg"></div></div>';
    try {
      const res = await apiRequest('/settlements/riders');
      const rows = res.data || [];
      riderCount.textContent = `${rows.length} rider${rows.length === 1 ? '' : 's'}`;
      if (!rows.length) {
        riderWrap.innerHTML = '<div class="state-block"><h4>No riders yet</h4><p>Rider earnings and COD cash appear here after deliveries.</p></div>';
        return;
      }
      riderWrap.innerHTML = `<table class="data-table"><thead><tr>
          <th>Rider</th><th>Total earnings</th><th>COD cash held</th><th>Cash limit</th><th>Net payable</th><th></th>
        </tr></thead><tbody>${rows.map(r => {
        const overLimit = r.codCashLimit > 0 && r.codCashHeld >= r.codCashLimit;
        return `<tr data-id="${esc(r.riderId)}">
          <td class="row-name">${esc(r.name || '—')}<div class="row-sub">${esc(r.phone || '')}${r.isActive ? '' : ' · disabled'}</div></td>
          <td class="mono">${formatMoney(r.totalEarnings)}</td>
          <td class="mono ${overLimit ? 'text-danger' : ''}">${formatMoney(r.codCashHeld)}${overLimit ? ' <span class="badge badge-danger">at limit</span>' : ''}</td>
          <td class="mono">${formatMoney(r.codCashLimit)}</td>
          <td class="mono row-name">${formatMoney(r.netPayable)}</td>
          <td><div class="row-actions">
            <button class="btn btn-sm btn-ghost rider-deposit" data-id="${esc(r.riderId)}" data-name="${esc(r.name)}" ${r.codCashHeld <= 0 ? 'disabled' : ''}>Record COD deposit</button>
            <button class="btn btn-sm btn-ghost rider-payout" data-id="${esc(r.riderId)}" data-name="${esc(r.name)}" data-payable="${esc(r.netPayable)}" ${r.netPayable <= 0 ? 'disabled' : ''}>Settle payout</button>
            <button class="btn btn-sm btn-ghost rider-ledger" data-id="${esc(r.riderId)}" data-name="${esc(r.name)}">Ledger</button>
          </div></td>
        </tr>`;
      }).join('')}</tbody></table>`;
      riderWrap.querySelectorAll('.rider-deposit').forEach(b => b.addEventListener('click', () => recordCodDeposit(b.dataset.id, b.dataset.name)));
      riderWrap.querySelectorAll('.rider-payout').forEach(b => b.addEventListener('click', () => settleRiderPayout(b.dataset.id, b.dataset.name, b.dataset.payable)));
      riderWrap.querySelectorAll('.rider-ledger').forEach(b => b.addEventListener('click', () => openRiderLedger(b.dataset.id, b.dataset.name)));
    } catch (err) {
      riderWrap.innerHTML = `<div class="state-block"><h4>Could not load rider settlements</h4><p>${esc(err.message)}</p>
        <button class="btn btn-ghost btn-sm" id="rider-settle-retry">Retry</button></div>`;
      document.getElementById('rider-settle-retry')?.addEventListener('click', loadRiderSettlements);
    }
  }

  async function recordCodDeposit(riderId, name) {
    const amount = prompt(`Record COD cash deposit from ${name}.\n\nEnter the amount of cash handed to Admin (₹):`);
    if (amount === null) return;
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) { showToast('Enter a valid amount greater than zero.', 'error'); return; }
    const reference = prompt('Deposit reference / receipt no. (optional):') || '';
    busy = true;
    try {
      await apiRequest(`/settlements/riders/${encodeURIComponent(riderId)}/cod-deposit`, { method: 'POST', body: { amount: value, reference } });
      showToast('COD cash deposit recorded.', 'success');
      await loadRiderSettlements();
    } catch (err) {
      showToast(err.message || 'Could not record the COD deposit.', 'error');
    } finally { busy = false; }
  }

  async function settleRiderPayout(riderId, name, payable) {
    const reference = await askConfirmation({
      title: `Settle payout for ${name}?`,
      desc: `Net payable is ${formatMoney(payable)}. Confirm the real bank/UPI transfer has happened — this records the UTR and the payout.`,
      label: 'Bank/UPI UTR reference (required)',
      placeholder: 'Enter the UTR / transfer reference',
      required: true,
      confirmText: 'Record payout',
    });
    if (reference === null) return;
    busy = true;
    try {
      await apiRequest(`/settlements/riders/${encodeURIComponent(riderId)}/payout`, { method: 'POST', body: { reference, utr: reference } });
      showToast('Rider payout recorded.', 'success');
      await loadRiderSettlements();
    } catch (err) {
      showToast(err.message || 'Could not record the rider payout.', 'error');
    } finally { busy = false; }
  }

  function riderLedgerModal() {
    let m = document.getElementById('rider-ledger-modal');
    if (m) return m;
    m = document.createElement('div'); m.id = 'rider-ledger-modal'; m.className = 'modal-overlay';
    m.innerHTML = `<div class="modal-box" style="max-width:840px;">
      <div class="modal-head"><h3 id="rl-title">Rider ledger</h3><button class="modal-close" data-close-modal="rider-ledger-modal" type="button">✕</button></div>
      <div class="modal-body" id="rl-body"><div class="state-block"><div class="spinner-lg"></div></div></div>
      <div class="modal-foot"><button type="button" class="btn btn-ghost" data-close-modal="rider-ledger-modal">Close</button></div>
    </div>`;
    document.body.appendChild(m); return m;
  }

  async function openRiderLedger(riderId, name) {
    const m = riderLedgerModal();
    m.querySelector('#rl-title').textContent = `Ledger — ${name || riderId}`;
    const body = m.querySelector('#rl-body');
    body.innerHTML = '<div class="state-block"><div class="spinner-lg"></div></div>';
    openModal('rider-ledger-modal');
    try {
      const res = await apiRequest(`/settlements/riders/${encodeURIComponent(riderId)}/ledger`);
      const b = res.data?.balance || {};
      const entries = res.data?.entries || [];
      body.innerHTML = `
        <div class="stats-grid" style="grid-template-columns:repeat(auto-fit,minmax(130px,1fr));margin-bottom:14px;">
          <div class="stat-card"><div class="stat-label">Total earnings</div><div class="stat-value mono">${formatMoney(b.totalEarnings)}</div></div>
          <div class="stat-card"><div class="stat-label">COD cash held</div><div class="stat-value mono">${formatMoney(b.codCashHeld)}</div></div>
          <div class="stat-card"><div class="stat-label">Payouts</div><div class="stat-value mono">${formatMoney(b.totalPayouts)}</div></div>
          <div class="stat-card"><div class="stat-label">Net payable</div><div class="stat-value mono">${formatMoney(b.netPayable)}</div></div>
        </div>
        ${entries.length ? `<div class="table-wrap"><table class="data-table"><thead><tr><th>Type</th><th>Order</th><th>Amount</th><th>Reference</th><th>When</th></tr></thead><tbody>${entries.map(e => `
          <tr><td>${esc(String(e.entryType || '').replace(/_/g, ' '))}</td><td class="mono">${esc(e.orderNumber || '—')}</td>
          <td class="mono">${formatMoney(e.amount)}</td><td class="row-sub">${esc(e.reference || e.note || '—')}</td>
          <td class="mono row-sub">${formatDate(e.createdAt)}</td></tr>`).join('')}</tbody></table></div>`
          : '<div class="state-block"><p>No ledger entries yet.</p></div>'}`;
    } catch (err) {
      body.innerHTML = `<div class="state-block"><h4>Could not load rider ledger</h4><p>${esc(err.message)}</p></div>`;
    }
  }

  /* ── Tabs & filters ────────────────────────────────────────── */
  document.getElementById('settlements-tabs')?.addEventListener('click', (e) => {
    const tab = e.target.closest('.tab');
    if (!tab) return;
    activeTab = tab.dataset.tab;
    document.querySelectorAll('#settlements-tabs .tab').forEach(t => t.classList.toggle('active', t === tab));
    const panels = { ledger: 'settlements-panel-ledger', payouts: 'settlements-panel-payouts', restaurants: 'settlements-panel-restaurants', riders: 'settlements-panel-riders' };
    Object.entries(panels).forEach(([key, elId]) => {
      const el = document.getElementById(elId);
      if (el) el.style.display = activeTab === key ? '' : 'none';
    });
    if (activeTab === 'payouts' && !payoutsWrap.dataset.loaded) {
      payoutsWrap.dataset.loaded = 'true';
      loadPayouts();
    }
    if (activeTab === 'restaurants' && !restWrap.dataset.loaded) {
      restWrap.dataset.loaded = 'true';
      loadRestaurantSettlements();
    }
    if (activeTab === 'riders' && !riderWrap.dataset.loaded) {
      riderWrap.dataset.loaded = 'true';
      loadRiderSettlements();
    }
  });

  document.getElementById('rest-settle-refresh')?.addEventListener('click', loadRestaurantSettlements);
  document.getElementById('rest-settle-export')?.addEventListener('click', exportSettlementsCsv);
  document.getElementById('rider-settle-refresh')?.addEventListener('click', loadRiderSettlements);

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
    if (restWrap.dataset.loaded) loadRestaurantSettlements();
    if (riderWrap.dataset.loaded) loadRiderSettlements();
  });

  document.addEventListener('admin:view-changed', (e) => {
    if (e.detail.view === 'settlements') {
      loadIntegrity();
      loadLedger();
      if (payoutsWrap.dataset.loaded) loadPayouts();
      if (restWrap.dataset.loaded) loadRestaurantSettlements();
      if (riderWrap.dataset.loaded) loadRiderSettlements();
    }
  });
})();
