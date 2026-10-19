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
          <td><button class="btn btn-sm btn-ghost support-open" data-id="${esc(t._id)}">Open</button></td>
        </tr>`;
      }).join('')}</tbody></table>`;

    wrap.querySelectorAll('.support-open').forEach(btn =>
      btn.addEventListener('click', () => openTicket(btn.dataset.id)));
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
        <button type="button" class="btn btn-ghost" id="st-reply-resolve">Reply &amp; resolve</button>
        <button type="button" class="btn btn-primary" id="st-reply">Reply</button>
      </div>
    </div>`;
    document.body.appendChild(m);
    m.querySelector('#st-reply').addEventListener('click', () => reply(false));
    m.querySelector('#st-reply-resolve').addEventListener('click', () => reply(true));
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

      <div class="chat">
        ${(t.messages || []).length
          ? t.messages.map(msg => `
            <div class="chat-msg chat-${msg.senderRole === 'admin' ? 'admin' : (msg.senderRole === 'vendor' || msg.senderRole === 'user' || msg.senderRole === 'customer') ? 'vendor' : 'system'}">
              <div class="chat-meta">
                <strong>${msg.senderRole === 'admin' ? 'Eatswada Support' : (msg.senderRole === 'vendor' || msg.senderRole === 'user' || msg.senderRole === 'customer') ? `${msg.senderRole === 'vendor' ? 'Vendor' : 'Customer'}${(msg.senderRole === 'vendor' ? t.vendor?.name : t.customer?.name) ? ' · ' + esc(msg.senderRole === 'vendor' ? t.vendor.name : t.customer.name) : ''}` : 'System'}</strong>
                <span class="mono">${msg.at ? formatDate(msg.at) : ''}</span>
              </div>
              <p>${esc(msg.message)}</p>
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
