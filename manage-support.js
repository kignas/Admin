/* ==========================================================================
   MODULE 13 — Support Management
   Supports customer order-support tickets and vendor support tickets.
     GET  /api/admin/support/tickets?type=&status=&priority=&page=&limit=
          type ∈ customer|vendor; status includes waiting_customer
          priority ∈ low|normal|high|urgent
          → { data: Ticket[] (customer/vendor/restaurant/order populated,
             messages embedded), pagination }
     POST /api/admin/support/tickets/:id/reply
          body { message (required ≤2000), resolve?: boolean }
          → appends {senderRole:'admin'}, status becomes waiting_customer
            for customer tickets or waiting_vendor for vendor tickets;
            resolve:true marks resolved; closed tickets return 409.
   Status can only change through a reply (no standalone status endpoint),
   so "Reply" / "Reply & resolve" are the only actions offered here.
   ========================================================================== */
(function () {
  const wrap = document.getElementById('support-table-wrap');
  const footer = document.getElementById('support-footer');
  const pageInfo = document.getElementById('support-page-info');
  const paginationEl = document.getElementById('support-pagination');
  const countEl = document.getElementById('support-count');
  const searchInput = document.getElementById('support-search');
  const typeFilter = document.getElementById('support-type-filter');
  const statusFilter = document.getElementById('support-status-filter');
  const priorityFilter = document.getElementById('support-priority-filter');
  const refreshBtn = document.getElementById('support-refresh');

  const state = { page: 1, limit: 25, type: '', status: '', priority: '' };
  let tickets = [];
  let busy = false;

  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const STATUS_BADGE = {
    open: 'badge-warning', waiting_vendor: 'badge-info', waiting_admin: 'badge-warning',
    waiting_customer: 'badge-info', resolved: 'badge-success', closed: 'badge-muted',
  };
  const PRIORITY_BADGE = { urgent: 'badge-danger', high: 'badge-warning', normal: 'badge-muted', low: 'badge-muted' };
  const pretty = (s) => String(s || '').replace(/_/g, ' ');
  const safeHttpsUrl = (value) => { try { const u = new URL(String(value || ''), location.href); return u.protocol === 'https:' ? u.href : ''; } catch (_) { return ''; } };
  const mediaLinks = (values, label) => (Array.isArray(values) ? values : []).map((value, i) => { const url = safeHttpsUrl(value); return url ? `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(label)} ${i + 1}</a>` : ''; }).filter(Boolean).join(' · ');
  const photoStrip = (values, label) => {
    const links = (Array.isArray(values) ? values : []).map(safeHttpsUrl).filter(Boolean);
    if (!links.length) return `<div class="row-sub">${esc(label)}: none supplied</div>`;
    return `<div class="row-sub" style="margin-bottom:6px;">${esc(label)}</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;">${links.map((u, i) => `
        <a href="${esc(u)}" target="_blank" rel="noopener noreferrer" title="Open full size">
          <img src="${esc(u)}" alt="${esc(label)} ${i + 1}" style="width:84px;height:84px;object-fit:cover;border-radius:8px;border:1px solid var(--line);">
        </a>`).join('')}</div>`;
  };

  function searchMatch(t) {
    const q = (searchInput?.value || '').trim().toLowerCase();
    if (!q) return true;
    return [t.ticketNumber, t.subject, t.category, t.type,
      t.customer?.name, t.customer?.email, t.vendor?.name, t.vendor?.email,
      t.restaurant?.name, t.order?.orderNumber, t.order?.status]
      .some(v => String(v || '').toLowerCase().includes(q));
  }

  function render() {
    const rows = tickets.filter(t => {
      const isCustomer = !!t.customer;
      return (!state.type || (state.type === 'customer' ? isCustomer : !isCustomer)) && searchMatch(t);
    });
    countEl.textContent = rows.length === tickets.length
      ? `${tickets.length} ticket${tickets.length === 1 ? '' : 's'}`
      : `${rows.length} of ${tickets.length} tickets`;
    if (!rows.length) {
      wrap.innerHTML = `<div class="state-block"><h4>${tickets.length ? 'No tickets match your search' : 'No support tickets'}</h4>
        <p>${tickets.length ? 'Adjust the search, ticket type, status or priority filter.' : 'Customer and vendor support tickets appear here.'}</p></div>`;
      return;
    }
    wrap.innerHTML = `<table class="data-table"><thead><tr>
        <th>Ticket</th><th>Requester</th><th>Restaurant / Order</th><th>Priority</th><th>Status</th><th>Messages</th><th>Updated</th><th></th>
      </tr></thead><tbody>${rows.map(t => {
        const isCustomer = !!t.customer;
        const requester = isCustomer ? t.customer : t.vendor;
        const requesterType = isCustomer ? 'Customer' : 'Vendor';
        return `
        <tr data-id="${esc(t._id)}">
          <td>
            <div class="row-name">${esc(t.subject || (isCustomer ? 'Order support' : 'Vendor support'))}</div>
            <div class="row-sub mono">${esc(t.ticketNumber || t._id)} · ${esc(t.category || 'other')}</div>
            <div class="row-sub">${esc(requesterType)} ticket</div>
          </td>
          <td>
            <div>${esc(requester?.name || '—')}</div>
            <div class="row-sub">${esc(requester?.email || '')}</div>
          </td>
          <td>
            <div>${esc(t.restaurant?.name || '—')}</div>
            <div class="row-sub mono">${t.order ? esc(t.order.orderNumber || t.order.status || 'Order linked') : 'General issue'}</div>
          </td>
          <td><span class="badge ${PRIORITY_BADGE[t.priority] || 'badge-muted'}">${esc(t.priority || 'normal')}</span></td>
          <td><span class="badge ${STATUS_BADGE[t.status] || 'badge-muted'}">${esc(pretty(t.status))}</span></td>
          <td class="mono">${(t.messages || []).length}</td>
          <td class="mono">${formatDate(t.updatedAt || t.createdAt)}</td>
          <td style="white-space:nowrap;">
            <button class="btn btn-sm btn-ghost support-open" data-id="${esc(t._id)}">Open</button>
            ${isCustomer ? `<button class="btn btn-sm btn-ghost support-resolve" data-id="${esc(t._id)}">Resolve</button>` : ''}
          </td>
        </tr>`;
      }).join('')}</tbody></table>`;

    wrap.querySelectorAll('.support-open').forEach(btn =>
      btn.addEventListener('click', () => openTicket(btn.dataset.id)));
    wrap.querySelectorAll('.support-resolve').forEach(btn =>
      btn.addEventListener('click', () => openResolution(btn.dataset.id)));
  }


  /* ── Pillar 4: Production resolution console ──────────────────── */
  // Side-by-side evidence vs. rider handoff, plus 1-click refund and fault
  // attribution. Context comes from GET /admin/support/tickets/:id/resolution;
  // actions post to /resolve and /fault.
  const FAULT_OPTIONS = [
    { value: 'vendor', label: 'Deduct from Restaurant Ledger' },
    { value: 'rider', label: 'Deduct from Rider Ledger' },
    { value: 'platform', label: 'Absorb by Platform' },
    { value: 'none', label: 'No attribution' },
  ];

  function resolutionModal() {
    let m = document.getElementById('support-resolution-modal');
    if (m) return m;
    m = document.createElement('div');
    m.id = 'support-resolution-modal';
    m.className = 'modal-overlay';
    m.innerHTML = `<div class="modal-box" style="max-width:1040px;">
      <div class="modal-head"><h3 id="sr-title">Resolve ticket</h3><button class="modal-close" data-close-modal="support-resolution-modal" type="button">✕</button></div>
      <div class="modal-body" id="sr-body"></div>
      <div class="modal-foot">
        <div class="modal-result" id="sr-result"></div>
        <button type="button" class="btn btn-ghost" data-close-modal="support-resolution-modal">Close</button>
        <button type="button" class="btn btn-primary" id="sr-apply">Apply resolution</button>
      </div>
    </div>`;
    document.body.appendChild(m);
    m.querySelector('#sr-apply').addEventListener('click', applyResolution);
    return m;
  }

  function orderItemsTable(order) {
    const items = Array.isArray(order?.items) ? order.items : [];
    if (!items.length) return '<div class="row-sub">No item detail stored on the order.</div>';
    return `<table class="data-table" style="font-size:13px;"><thead><tr><th>Item</th><th>Qty</th><th>Price</th></tr></thead><tbody>
      ${items.map(i => `<tr><td>${esc(i.name || i.title || '—')}</td><td class="mono">${esc(i.quantity ?? i.qty ?? 1)}</td><td class="mono">${esc(formatMoney(i.price ?? i.unitPrice ?? 0))}</td></tr>`).join('')}
    </tbody></table>`;
  }

  function billRows(order) {
    const b = order?.bill;
    if (!b) return `<div class="row-sub">Total charged: <strong class="mono">${esc(formatMoney(order?.total ?? 0))}</strong></div>`;
    const rows = [
      ['Item subtotal', b.itemSubtotal], ['Packaging', b.packagingCharge], ['Delivery fee', b.deliveryFee],
      ['Platform handling', b.platformHandlingFee], ['Small-cart fee', b.smallCartFee], ['Rain surge', b.rainSurgeFee],
      ['Discount', b.discountAmount], ['Tax', b.taxAmount], ['Grand total', b.grandTotal],
    ].filter(([, v]) => v !== undefined && v !== null);
    return `<table class="data-table" style="font-size:13px;"><tbody>
      ${rows.map(([k, v]) => `<tr><td>${esc(k)}${k === 'Delivery fee' && b.isFreeDeliveryApplied ? ' <span class="badge badge-success">FREE</span>' : ''}</td><td class="mono" style="text-align:right;">${esc(formatMoney(v))}</td></tr>`).join('')}
    </tbody></table>`;
  }

  async function openResolution(id) {
    const m = resolutionModal();
    m.dataset.id = id;
    m.querySelector('#sr-title').textContent = 'Resolve support ticket';
    m.querySelector('#sr-result').className = 'modal-result';
    m.querySelector('#sr-result').textContent = '';
    const body = m.querySelector('#sr-body');
    body.innerHTML = '<div class="state-block"><div class="spinner-lg"></div></div>';
    openModal('support-resolution-modal');
    try {
      const res = await apiRequest(`/admin/support/tickets/${encodeURIComponent(id)}/resolution`);
      const d = res.data || {};
      const t = d.ticket || {};
      const order = d.order || {};
      const handoff = order.riderHandoff || {};
      const rider = order.rider || {};
      const evidence = d.evidencePhotos || t.photos || [];
      const isCod = d.codResolution === true;

      body.innerHTML = `
        <div class="detail-head">
          <div>
            <div class="detail-title">${esc(t.subject || 'Support ticket')}</div>
            <div class="detail-sub mono">${esc(t.ticketNumber || id)} · issue: ${esc(d.issueCategory || t.issueCategory || t.category || 'other')} · ${esc(isCod ? 'COD order' : 'Prepaid order')}</div>
          </div>
          <span class="badge ${STATUS_BADGE[t.status] || 'badge-muted'}">${esc(pretty(t.status))}</span>
        </div>

        <div class="dash-two-col" style="margin-top:12px;align-items:start;">
          <div class="card panel">
            <div class="panel-head"><h3>Customer evidence</h3></div>
            ${photoStrip(evidence, 'Complaint photos')}
            <div style="margin-top:10px;">${orderItemsTable(order)}</div>
            ${(Array.isArray(t.affectedItems) && t.affectedItems.length) ? `<div class="hint" style="margin-top:8px;">Reported items: ${esc(t.affectedItems.join(', '))}</div>` : ''}
          </div>
          <div class="card panel">
            <div class="panel-head"><h3>Rider handoff &amp; order truth</h3></div>
            ${photoStrip([handoff.pickupPhotoUrl], 'Rider pickup photo')}
            <div class="form-grid" style="margin-top:10px;">
              <div class="field"><label>Pickup code</label><div class="mono">${esc(handoff.pickupCode || '—')}</div></div>
              <div class="field"><label>KPT gaming flag</label><div>${handoff.kptGamingFlag ? '<span class="badge badge-danger">FLAGGED</span>' : '<span class="badge badge-muted">clean</span>'}${handoff.kptGamingNote ? ` <span class="row-sub">${esc(handoff.kptGamingNote)}</span>` : ''}</div></div>
              <div class="field"><label>Rider wait time</label><div class="mono">${Number(handoff.riderWaitTimeMinutes || 0)} min</div></div>
              <div class="field"><label>Rider</label><div>${esc(rider.name || '—')}${rider.phone ? ` · ${esc(rider.phone)}` : ''}</div></div>
              <div class="field"><label>Payment</label><div>${esc(order.paymentMethod || '—')} · ${esc(order.paymentStatus || '—')}</div></div>
              <div class="field"><label>Order status</label><div>${esc(order.status || '—')}</div></div>
            </div>
          </div>
        </div>

        <div class="card panel" style="margin-top:12px;">
          <div class="panel-head"><h3>Bill</h3></div>
          ${billRows(order)}
        </div>

        <div class="card panel" style="margin-top:12px;">
          <div class="panel-head"><h3>1-click resolution</h3></div>
          <div class="form-grid">
            <div class="field">
              <label>Resolution</label>
              <select id="sr-type">
                <option value="full_refund">Issue Full Refund${isCod ? ' (manual payout)' : ''}</option>
                <option value="partial_refund">Issue Partial Refund${isCod ? ' (manual payout)' : ''}</option>
                <option value="coupon_issued">Issue Coupon (no-min refund)</option>
                <option value="rejected">Reject claim</option>
              </select>
            </div>
            <div class="field">
              <label>Amount (₹) — for partial refund / coupon</label>
              <input id="sr-amount" type="number" min="0" step="1" value="">
            </div>
            <div class="field">
              <label>Fault attribution</label>
              <select id="sr-fault">${FAULT_OPTIONS.map(f => `<option value="${f.value}">${esc(f.label)}</option>`).join('')}</select>
            </div>
            <div class="field">
              <label>Note (optional)</label>
              <input id="sr-note" type="text" maxlength="500" placeholder="Reason for the resolution">
            </div>
          </div>
          <div class="hint" style="margin-top:8px;">
            Full refunds refund the order total; UPI orders go through Razorpay, COD orders record a manual payout.
            Fault attribution posts a deduction to the restaurant or rider ledger (audited).
          </div>
        </div>`;
      const typeSel = m.querySelector('#sr-type');
      const amountInput = m.querySelector('#sr-amount');
      typeSel?.addEventListener('change', () => {
        if (typeSel.value === 'full_refund' || typeSel.value === 'rejected') { amountInput.value = ''; amountInput.disabled = true; }
        else { amountInput.disabled = false; }
      });
      if (typeSel) typeSel.dispatchEvent(new Event('change'));
    } catch (err) {
      body.innerHTML = `<div class="state-block"><h4>Could not load resolution context</h4><p>${esc(err.message)}</p></div>`;
    }
  }

  async function applyResolution() {
    if (busy) return;
    const m = resolutionModal();
    const result = m.querySelector('#sr-result');
    const type = m.querySelector('#sr-type')?.value;
    const fault = m.querySelector('#sr-fault')?.value;
    const note = m.querySelector('#sr-note')?.value || '';
    const amount = m.querySelector('#sr-amount')?.value;
    const body = { resolutionType: type, faultAttribution: fault, note };
    if (type === 'partial_refund' || type === 'coupon_issued') {
      const n = Number(amount);
      if (!Number.isFinite(n) || n <= 0) { result.textContent = 'Enter an amount greater than zero.'; result.className = 'modal-result show error'; return; }
      body.refundAmount = n;
    }
    if (type === 'full_refund' && !confirm('Issue a full refund for this order?')) return;
    if (fault === 'vendor' && !confirm('Post the refund amount as a deduction to the restaurant ledger?')) return;
    if (fault === 'rider' && !confirm('Post the refund amount as a deduction to the rider ledger?')) return;

    busy = true;
    const btn = m.querySelector('#sr-apply');
    btn.disabled = true; btn.innerHTML = '<span class="btn-spinner"></span>';
    try {
      const res = await apiRequest(`/admin/support/tickets/${encodeURIComponent(m.dataset.id)}/resolve`, { method: 'POST', body });
      const outcome = res.data?.outcome || {};
      showToast(`Resolution applied (${outcome.method || type}).`, 'success');
      const idx = tickets.findIndex(x => String(x._id) === String(m.dataset.id));
      if (idx >= 0) { tickets[idx] = { ...tickets[idx], status: 'resolved', resolutionType: type }; render(); }
      closeModal('support-resolution-modal');
    } catch (err) {
      result.textContent = err.message || 'Could not apply the resolution.';
      result.className = 'modal-result show error';
    } finally { busy = false; btn.disabled = false; btn.textContent = 'Apply resolution'; }
  }

  /* ── Detail + reply modal ──────────────────────────────────── */
  function ticketModal() {
    let m = document.getElementById('support-ticket-modal');
    if (m) return m;
    m = document.createElement('div');
    m.id = 'support-ticket-modal';
    m.className = 'modal-overlay';
    m.innerHTML = `<div class="modal-box" style="max-width:720px;">
      <div class="modal-head"><h3 id="st-title">Support ticket</h3><button class="modal-close" data-close-modal="support-ticket-modal" type="button">✕</button></div>
      <div class="modal-body" id="st-body"></div>
      <div class="modal-foot">
        <div class="modal-result" id="st-result"></div>
        <button type="button" class="btn btn-ghost" data-close-modal="support-ticket-modal">Close</button>
        <button type="button" class="btn btn-ghost" id="st-resolve">Refund / Resolve…</button>
        <button type="button" class="btn btn-ghost" id="st-reply-resolve">Reply &amp; resolve</button>
        <button type="button" class="btn btn-primary" id="st-reply">Reply</button>
      </div>
    </div>`;
    document.body.appendChild(m);
    m.querySelector('#st-reply').addEventListener('click', () => reply(false));
    m.querySelector('#st-reply-resolve').addEventListener('click', () => reply(true));
    m.querySelector('#st-resolve').addEventListener('click', () => openResolution(m.dataset.id));
    return m;
  }

  function openTicket(id) {
    const t = tickets.find(x => String(x._id) === String(id));
    if (!t) return;
    const m = ticketModal();
    m.dataset.id = id;
    m.querySelector('#st-title').textContent = t.ticketNumber || 'Support ticket';
    m.querySelector('#st-result').className = 'modal-result';
    const closed = t.status === 'closed';

    m.querySelector('#st-body').innerHTML = `
      <div class="detail-head">
        <div>
          <div class="detail-title">${esc(t.subject)}</div>
          <div class="detail-sub">${esc(t.customer ? `Customer: ${t.customer.name || t.customer.email || '—'}` : `Vendor: ${t.vendor?.name || '—'}`)} · ${esc(t.restaurant?.name || (t.order ? 'Order support' : 'General support'))}${t.order ? ` · order ${esc(t.order.orderNumber || t.order.status || '')}` : ''}</div>
        </div>
        <span class="badge ${STATUS_BADGE[t.status] || 'badge-muted'}">${esc(pretty(t.status))}</span>
      </div>

      ${(Array.isArray(t.photos) && t.photos.length) ? `<section class="card" style="padding:12px;margin:12px 0;"><strong>Customer complaint photos</strong><div class="hint" style="margin-top:6px;">${mediaLinks(t.photos, 'Open photo')}</div></section>` : ''}
      <div class="chat">
        ${(t.messages || []).length
          ? t.messages.map(msg => `
            <div class="chat-msg chat-${msg.senderRole === 'admin' ? 'admin' : (msg.senderRole === 'vendor' || msg.senderRole === 'user' || msg.senderRole === 'customer') ? 'vendor' : 'system'}">
              <div class="chat-meta">
                <strong>${msg.senderRole === 'admin' ? 'Eatswada Support' : (msg.senderRole === 'vendor' || msg.senderRole === 'user' || msg.senderRole === 'customer') ? `${msg.senderRole === 'vendor' ? 'Vendor' : 'Customer'}${(msg.senderRole === 'vendor' ? t.vendor?.name : t.customer?.name) ? ' · ' + esc(msg.senderRole === 'vendor' ? t.vendor.name : t.customer.name) : ''}` : 'System'}</strong>
                <span class="mono">${msg.at ? formatDate(msg.at) : ''}</span>
              </div>
              <p>${esc(msg.message)}</p>
              ${(Array.isArray(msg.attachments) && msg.attachments.length) ? `<div class="row-sub">Attachments: ${mediaLinks(msg.attachments, 'Open attachment')}</div>` : ''}
            </div>`).join('')
          : '<div class="state-block" style="padding:24px;"><p>No messages yet.</p></div>'}
      </div>

      ${closed
        ? '<div class="callout callout-muted"><strong>Ticket closed</strong><span class="hint">The backend rejects replies on closed tickets (HTTP 409).</span></div>'
        : `<div class="field">
            <label for="st-reply-input">Your reply</label>
            <textarea id="st-reply-input" rows="3" maxlength="2000" placeholder="Type your reply to the customer or vendor…"></textarea>
            <div class="error-msg" id="st-reply-error"></div>
            <div class="hint">“Reply” sends your message and waits for the requester; “Reply &amp; resolve” marks the ticket resolved.</div>
          </div>`}
    `;

    m.querySelector('#st-reply').style.display = closed ? 'none' : '';
    m.querySelector('#st-reply-resolve').style.display = closed ? 'none' : '';
    m.querySelector('#st-resolve').style.display = closed ? 'none' : '';
    openModal('support-ticket-modal');
  }

  async function reply(resolve) {
    if (busy) return;
    const m = ticketModal();
    const input = m.querySelector('#st-reply-input');
    const errorEl = m.querySelector('#st-reply-error');
    const result = m.querySelector('#st-result');
    if (!input) return;
    const message = input.value.trim();
    if (!message) { errorEl.textContent = 'A message is required by the backend.'; return; }
    errorEl.textContent = '';
    result.className = 'modal-result';

    busy = true;
    const replyBtn = m.querySelector('#st-reply');
    const resolveBtn = m.querySelector('#st-reply-resolve');
    replyBtn.disabled = true; resolveBtn.disabled = true;
    try {
      const res = await apiRequest(`/admin/support/tickets/${m.dataset.id}/reply`, {
        method: 'POST',
        body: { message, resolve: resolve === true },
      });
      showToast(resolve ? 'Reply sent — ticket resolved.' : 'Reply sent.', 'success');
      // Refresh the cached row so the conversation/status stay accurate.
      const idx = tickets.findIndex(x => String(x._id) === String(m.dataset.id));
      if (idx >= 0 && res.data) {
        // Keep populated requester/restaurant/order objects from the inbox response.
        tickets[idx] = { ...tickets[idx], status: res.data.status, updatedAt: res.data.updatedAt, messages: res.data.messages || tickets[idx].messages };
      }
      render();
      openTicket(m.dataset.id);
    } catch (err) {
      result.textContent = err.message || 'Could not send the reply.';
      result.className = 'modal-result show error';
    } finally {
      busy = false;
      replyBtn.disabled = false; resolveBtn.disabled = false;
    }
  }

  /* ── Loading ───────────────────────────────────────────────── */
  async function load() {
    wrap.innerHTML = '<div class="state-block"><div class="spinner-lg"></div></div>';
    try {
      const query = { page: state.page, limit: state.limit };
      if (state.type) query.type = state.type;
      if (state.status) query.status = state.status;
      if (state.priority) query.priority = state.priority;
      const res = await apiRequest('/admin/support/tickets', { query });
      tickets = res.data || [];
      const pg = res.pagination || { page: state.page, limit: state.limit, total: tickets.length, pages: 1 };
      countEl.textContent = `${pg.total} ticket${pg.total === 1 ? '' : 's'}`;
      render();
      if (pg.pages > 1) {
        footer.style.display = 'flex';
        renderPagination(paginationEl, pageInfo, pg, (p) => { state.page = p; load(); });
      } else footer.style.display = 'none';
    } catch (err) {
      wrap.innerHTML = `<div class="state-block"><h4>Could not load support tickets</h4><p>${esc(err.message)}</p>
        <button class="btn btn-ghost btn-sm" id="support-retry">Retry</button></div>`;
      document.getElementById('support-retry')?.addEventListener('click', load);
    }
  }

  typeFilter?.addEventListener('change', () => { state.type = typeFilter.value; state.page = 1; load(); });
  statusFilter?.addEventListener('change', () => { state.status = statusFilter.value; state.page = 1; load(); });
  priorityFilter?.addEventListener('change', () => { state.priority = priorityFilter.value; state.page = 1; load(); });
  searchInput?.addEventListener('input', debounce(() => render(), 250));
  refreshBtn?.addEventListener('click', load);
  document.addEventListener('admin:view-changed', (e) => {
    if (e.detail.view === 'support') load();
  });
})();
