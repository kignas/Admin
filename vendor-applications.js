/* ==========================================================================
   MODULE 2 — Vendor Application Management
   Confirmed backend contract (Render + kignas/Eatswada- routes):
     GET   /admin/vendor-applications?status=&page=&limit=
           status ∈ pending | needs_changes | approved | rejected (omit = all)
           → { data: application[], pagination:{page,limit,total,pages} }
     GET   /admin/vendor-applications/:id
     PATCH /admin/vendor-applications/:id/approve        body { images?: string[] }
     PATCH /admin/vendor-applications/:id/reject         body { reason }  (required, ≤1000)
     PATCH /admin/vendor-applications/:id/request-changes body { message } (required, ≤1000)

   Lifecycle (backend-confirmed):
     pending → (approve | reject | request-changes → needs_changes)
     needs_changes → applicant re-POSTs /vendor-applications (same application id,
       status resets to pending, changeRequest cleared, updatedAt bumped)
     → admin reviews the updated application again.

   There is no application-history endpoint (GET …/:id/history → 404 on Render),
   so no history UI is shown. Review metadata comes from reviewedBy/reviewedAt.
   ========================================================================== */
(function () {
  const wrap = document.getElementById('applications-table-wrap');
  const footer = document.getElementById('applications-footer');
  const pageInfo = document.getElementById('applications-page-info');
  const pagination = document.getElementById('applications-pagination');
  const countEl = document.getElementById('applications-count');
  const filter = document.getElementById('applications-status-filter');
  const searchInput = document.getElementById('applications-search');
  const refresh = document.getElementById('applications-refresh');

  const state = { page: 1, limit: 10, status: 'pending', search: '' };
  let currentItems = [];
  let reviewImageUrls = [];
  let busy = false;

  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const statusLabel = (s) => ({ pending: 'Pending', needs_changes: 'Changes requested', approved: 'Approved', rejected: 'Rejected' }[s] || s || '—');
  const statusClass = (s) => ({ pending: 'badge-warning', needs_changes: 'badge-info', approved: 'badge-success', rejected: 'badge-danger' }[s] || 'badge-muted');
  const DELIVERY_LABEL = { eatswada_rider: 'Eatswada delivery', self_delivery: 'Self delivery' };
  const BUSINESS_LABEL = { restaurant: 'Restaurant', cloud_kitchen: 'Cloud kitchen' };

  function wasResubmitted(a) {
    if (!a.updatedAt || !a.createdAt) return false;
    return new Date(a.updatedAt).getTime() - new Date(a.createdAt).getTime() > 1000;
  }

  /* ── Table ─────────────────────────────────────────────────── */
  function matchesSearch(a) {
    const q = state.search.toLowerCase();
    if (!q) return true;
    return [a.restaurantName, a.ownerName, a.email, a.phone, a.fssaiLicenseNumber]
      .some(v => String(v || '').toLowerCase().includes(q));
  }

  function render() {
    const items = currentItems.filter(matchesSearch);
    if (!items.length) {
      wrap.innerHTML = `<div class="state-block"><h4>No applications found</h4><p>${
        state.search ? 'Nothing on this page matches your search.'
        : state.status === 'pending' ? 'New seller applications will appear here.'
        : 'Try another status filter.'
      }</p></div>`;
      return;
    }
    wrap.innerHTML = `<table class="data-table"><thead><tr>
        <th>Restaurant</th><th>Owner</th><th>Contact</th><th>Delivery</th>
        <th>Submitted</th><th>Status</th><th></th>
      </tr></thead><tbody>${items.map(a => {
      const applicant = a.applicant || {};
      const resub = wasResubmitted(a);
      return `<tr data-id="${esc(a.id || a._id)}">
        <td>
          <div class="row-name">${esc(a.restaurantName)}</div>
          <div class="row-sub">${esc((a.cuisine || []).join(', '))}${resub ? ' · updated after review' : ''}</div>
        </td>
        <td>${esc(a.ownerName || applicant.name || '—')}</td>
        <td><div>${esc(a.email || applicant.email || '—')}</div><div class="row-sub mono">${esc(a.phone || applicant.phone || '—')}</div></td>
        <td><span class="badge badge-muted">${esc(DELIVERY_LABEL[a.deliveryMode] || a.deliveryMode || '—')}</span></td>
        <td class="mono">${formatDate(a.createdAt)}${resub ? `<div class="row-sub mono">updated ${formatDate(a.updatedAt)}</div>` : ''}</td>
        <td><span class="badge ${statusClass(a.status)}">${statusLabel(a.status)}</span></td>
        <td><button class="btn btn-sm btn-ghost application-view-btn" data-id="${esc(a.id || a._id)}">Review</button></td>
      </tr>`;
    }).join('')}</tbody></table>`;
    wrap.querySelectorAll('.application-view-btn').forEach(btn =>
      btn.addEventListener('click', () => openReview(btn.dataset.id)));
  }

  /* ── Detail modal (created once, reused) ───────────────────── */
  function detailModal() {
    let m = document.getElementById('vendor-application-modal');
    if (m) return m;
    m = document.createElement('div'); m.id = 'vendor-application-modal'; m.className = 'modal-overlay';
    m.innerHTML = `<div class="modal-box" style="max-width:760px;">
      <div class="modal-head"><h3>Vendor application</h3><button class="modal-close" data-close-modal="vendor-application-modal" type="button">✕</button></div>
      <div class="modal-body" id="va-body"><div class="state-block"><div class="spinner-lg"></div></div></div>
      <div class="modal-foot" id="va-foot">
        <div class="modal-result" id="va-result"></div>
        <button type="button" class="btn btn-ghost" data-close-modal="vendor-application-modal">Close</button>
        <button type="button" class="btn btn-danger" id="va-reject" style="display:none;">Reject</button>
        <button type="button" class="btn btn-ghost" id="va-request-changes" style="display:none;">Request changes</button>
        <button type="button" class="btn btn-primary" id="va-approve" style="display:none;">Approve</button>
      </div>
    </div>`;
    document.body.appendChild(m);
    m.querySelector('#va-approve').addEventListener('click', () => process(currentReviewId, 'approve'));
    m.querySelector('#va-reject').addEventListener('click', () => openActionForm('reject'));
    m.querySelector('#va-request-changes').addEventListener('click', () => openActionForm('request-changes'));
    return m;
  }

  /* ── Rejection / request-changes message form (inline panel) ── */
  function openActionForm(mode) {
    const m = detailModal();
    const body = m.querySelector('#va-body');
    const isReject = mode === 'reject';
    body.innerHTML = `
      <div class="action-form">
        <h4>${isReject ? 'Reject application' : 'Request changes'}</h4>
        <p class="hint">${isReject
          ? 'The applicant will see this rejection reason in the Vendor frontend. Rejection is final unless the applicant submits a new application.'
          : 'Your message is sent to the applicant (backend field: <code>changeRequest</code>). The applicant edits the same application and resubmits it with the same ID for your re-review.'}</p>
        <div class="field">
          <label for="va-action-message">${isReject ? 'Rejection reason' : 'Instructions for the applicant'} *</label>
          <textarea id="va-action-message" rows="4" maxlength="1000"
            placeholder="${isReject ? 'e.g. FSSAI number could not be verified…' : 'e.g. Upload a clearer FSSAI certificate and re-check your address…'}"></textarea>
          <div class="error-msg" id="va-action-error"></div>
        </div>
        <div class="modal-foot" style="padding-left:0;padding-right:0;border-top:none;">
          <button type="button" class="btn btn-ghost" id="va-action-back">Back</button>
          <button type="button" class="btn ${isReject ? 'btn-danger' : 'btn-primary'}" id="va-action-send">
            ${isReject ? 'Reject application' : 'Send change request'}
          </button>
        </div>
      </div>`;
    m.querySelector('#va-action-back').addEventListener('click', () => openReview(currentReviewId));
    m.querySelector('#va-action-send').addEventListener('click', () => {
      const msg = m.querySelector('#va-action-message').value.trim();
      if (!msg) {
        m.querySelector('#va-action-error').textContent = isReject
          ? 'A rejection reason is required by the backend.'
          : 'A change request message is required by the backend.';
        return;
      }
      process(currentReviewId, mode, msg);
    });
  }

  /* ── Detail rendering ──────────────────────────────────────── */
  let currentReviewId = null;

  function hoursHtml(a) {
    const h = a.openingHours || {};
    const days = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'];
    return days.map(day => {
      const d = h[day] || {};
      return `<div class="field"><label>${day[0].toUpperCase() + day.slice(1)}</label><div>${d.closed ? 'Closed' : `${esc(d.opensAt || '10:00')} – ${esc(d.closesAt || '22:00')}`}</div></div>`;
    }).join('');
  }

  function imagesGrid(a) {
    const existing = reviewImageUrls;
    return `<div id="va-images-preview" class="va-images">${[0,1,2,3].map(i => `
      <div class="va-img-slot">${existing[i]
        ? `<img src="${esc(existing[i])}" alt="Restaurant image ${i + 1}" />`
        : `Image ${i + 1}`}</div>`).join('')}</div>`;
  }

  async function openReview(id) {
    currentReviewId = id;
    const m = detailModal();
    const body = m.querySelector('#va-body');
    const result = m.querySelector('#va-result');
    const approve = m.querySelector('#va-approve');
    const reject = m.querySelector('#va-reject');
    const requestChanges = m.querySelector('#va-request-changes');
    body.innerHTML = '<div class="state-block"><div class="spinner-lg"></div></div>';
    result.className = 'modal-result'; result.textContent = '';
    [approve, reject, requestChanges].forEach(b => { b.style.display = 'none'; b.disabled = false; });
    openModal('vendor-application-modal');

    try {
      const res = await apiRequest(`/admin/vendor-applications/${id}`);
      const a = res.data;
      const applicant = a.applicant || {};
      const reviewer = a.reviewedBy;
      reviewImageUrls = a.image ? [a.image] : [];
      const pending = a.status === 'pending';
      const resubmitted = wasResubmitted(a);

      body.innerHTML = `
        <div class="detail-head">
          <div>
            <div class="detail-title">${esc(a.restaurantName)}</div>
            <div class="detail-sub">Application <span class="mono">${esc(a.id || a._id)}</span></div>
          </div>
          <span class="badge ${statusClass(a.status)}">${statusLabel(a.status)}</span>
        </div>

        ${a.status === 'needs_changes' && a.changeRequest ? `
          <div class="callout callout-info">
            <strong>Change request sent to the applicant</strong>
            <p>${esc(a.changeRequest)}</p>
            <span class="hint">The applicant edits this same application and resubmits it — the ID is preserved and the status returns to “Pending”.</span>
          </div>` : ''}

        ${a.status === 'rejected' && a.rejectionReason ? `
          <div class="callout callout-danger">
            <strong>Rejection reason</strong><p>${esc(a.rejectionReason)}</p>
          </div>` : ''}

        ${resubmitted ? `
          <div class="callout callout-muted">
            <strong>Updated application</strong>
            <span class="hint">Submitted ${formatDate(a.createdAt)} · last updated ${formatDate(a.updatedAt)}${pending ? ' — the data below reflects the applicant’s latest submission.' : ''}</span>
          </div>` : ''}

        <div class="form-grid">
          <div class="field"><label>Owner</label><div>${esc(a.ownerName || applicant.name || '—')}</div></div>
          <div class="field"><label>Restaurant</label><div>${esc(a.restaurantName)}</div></div>
          <div class="field"><label>Email</label><div>${esc(a.email || applicant.email || '—')}</div></div>
          <div class="field"><label>Phone</label><div class="mono">${esc(a.phone || applicant.phone || '—')}</div></div>
          <div class="field"><label>Cuisine</label><div>${esc((a.cuisine || []).join(', ') || '—')}</div></div>
          <div class="field"><label>Business type</label><div>${esc(BUSINESS_LABEL[a.businessType] || a.businessType || '—')}</div></div>
          <div class="field"><label>Delivery method</label><div>${esc(DELIVERY_LABEL[a.deliveryMode] || a.deliveryMode || '—')}</div></div>
          <div class="field"><label>FSSAI license / registration</label><div class="mono">${esc(a.fssaiLicenseNumber || '—')}</div></div>
          <div class="field span-2"><label>Address</label><div>${esc(a.address || '—')}</div></div>
          <div class="field"><label>Submitted</label><div class="mono">${formatDate(a.createdAt)}</div></div>
          <div class="field"><label>Reviewed</label><div class="mono">${a.reviewedAt ? `${formatDate(a.reviewedAt)}${reviewer ? ` · ${esc(reviewer.name || reviewer.email || '')}` : ''}` : 'Not reviewed yet'}</div></div>
          <div class="field"><label>Applicant account</label><div>${applicant.isActive === true ? 'Active' : applicant.name ? 'Inactive (activated on approval)' : '—'}</div></div>
          <div class="field"><label>Linked restaurant</label><div>${a.restaurantId ? esc(a.restaurantId.name || 'Created on approval') : (a.status === 'approved' ? 'Created' : 'Not created yet')}</div></div>
        </div>

        <div class="field"><label>Description</label><div>${esc(a.description || '—')}</div></div>
        <div class="field"><label>Opening hours</label><div class="form-grid">${hoursHtml(a)}</div></div>
        <div class="field"><label>Coordinates</label><div class="mono">${a.location?.coordinates ? esc(a.location.coordinates.join(', ')) : 'Missing — required before approval'}</div></div>

        <div class="field">
          <label>Restaurant images ${pending ? '*' : ''}</label>
          ${imagesGrid(a)}
          ${pending ? `
            <div class="va-upload-row">
              <label class="btn btn-ghost btn-sm">Upload images
                <input id="va-image-files" type="file" accept="image/jpeg,image/png,image/webp,image/avif" multiple hidden />
              </label>
              <span class="hint" id="va-image-count">${reviewImageUrls.length} / 4 uploaded</span>
            </div>
            <div class="hint" id="va-image-status">Upload up to 4 restaurant images. The first image becomes the cover. Images are required before approval.</div>
          ` : '<div class="hint">Images were finalised when the application was reviewed.</div>'}
        </div>

        ${!pending ? `
          <div class="callout callout-muted">
            <strong>Review actions are locked</strong>
            <span class="hint">The backend only accepts approve / reject / request-changes while an application is <em>pending</em>. This application is <em>${esc(a.status)}</em>.</span>
          </div>` : ''}

        ${a.adminNotes ? `<div class="field"><label>Admin notes (internal)</label><div>${esc(a.adminNotes)}</div></div>` : ''}
      `;

      if (pending) {
        approve.style.display = 'inline-flex';
        reject.style.display = 'inline-flex';
        requestChanges.style.display = 'inline-flex';
      }

      const imageFiles = m.querySelector('#va-image-files');
      if (imageFiles) imageFiles.addEventListener('change', async () => {
        const files = Array.from(imageFiles.files || []).slice(0, 4);
        if (!files.length) return;
        const status = m.querySelector('#va-image-status');
        const count = m.querySelector('#va-image-count');
        imageFiles.disabled = true;
        if (status) status.textContent = 'Uploading restaurant images…';
        try {
          const uploaded = await Promise.all(files.map(file => uploadImage(file, 'restaurants')));
          reviewImageUrls = uploaded.filter(Boolean).slice(0, 4);
          const preview = m.querySelector('#va-images-preview');
          if (preview) preview.innerHTML = [0,1,2,3].map(i => `
            <div class="va-img-slot">${reviewImageUrls[i]
              ? `<img src="${esc(reviewImageUrls[i])}" alt="Restaurant image ${i + 1}" />`
              : `Image ${i + 1}`}</div>`).join('');
          if (count) count.textContent = `${reviewImageUrls.length} / 4 uploaded`;
          if (status) status.textContent = `${reviewImageUrls.length} restaurant image${reviewImageUrls.length === 1 ? '' : 's'} uploaded. The first image is the cover.`;
        } catch (err) {
          if (status) status.textContent = err.message || 'Image upload failed.';
        } finally {
          imageFiles.disabled = false; imageFiles.value = '';
        }
      });
    } catch (err) {
      body.innerHTML = `<div class="state-block"><h4>Could not load application</h4><p>${esc(err.message)}</p>
        <button class="btn btn-ghost btn-sm" id="va-reload">Retry</button></div>`;
      m.querySelector('#va-reload')?.addEventListener('click', () => openReview(id));
    }
  }

  /* ── Actions ───────────────────────────────────────────────── */
  async function process(id, action, message) {
    if (busy) return; // guard against duplicate actions
    const m = detailModal();
    const result = m.querySelector('#va-result');
    const btn = action === 'approve' ? m.querySelector('#va-approve')
      : action === 'reject' ? m.querySelector('#va-reject')
      : m.querySelector('#va-request-changes');

    let body;
    if (action === 'approve') {
      if (!reviewImageUrls.length) {
        result.textContent = 'Upload at least one restaurant image before approval (backend expects images on approve).';
        result.className = 'modal-result show error';
        return;
      }
      if (!confirm('Approve this vendor application and create the restaurant? This activates the vendor account.')) return;
      body = { images: reviewImageUrls.slice(0, 4) };
    } else {
      const text = String(message || '').trim();
      if (!text) return;
      if (action === 'reject' && !confirm(`Reject this application?\n\nReason: ${text}`)) return;
      if (action === 'request-changes' && !confirm(`Send these instructions to the applicant?\n\n${text}`)) return;
      body = action === 'reject' ? { reason: text } : { message: text };
    }

    busy = true;
    [m.querySelector('#va-approve'), m.querySelector('#va-reject'), m.querySelector('#va-request-changes')]
      .forEach(b => { if (b) b.disabled = true; });
    if (btn) btn.disabled = true;

    try {
      const res = await apiRequest(`/admin/vendor-applications/${id}/${action}`, { method: 'PATCH', body });
      result.textContent = res.message || 'Application updated.';
      result.className = 'modal-result show success';
      showToast(res.message || 'Application updated.', 'success');
      await load();                                   // refresh the list
      setTimeout(() => { closeModal('vendor-application-modal'); }, 800);
    } catch (err) {
      result.textContent = err.message || 'Could not update application.';
      result.className = 'modal-result show error';
      showToast(err.message || 'Could not update application.', 'error');
    } finally {
      busy = false;
      [m.querySelector('#va-approve'), m.querySelector('#va-reject'), m.querySelector('#va-request-changes')]
        .forEach(b => { if (b) b.disabled = false; });
    }
  }

  /* ── List loading ──────────────────────────────────────────── */
  async function load() {
    wrap.innerHTML = '<div class="state-block"><div class="spinner-lg"></div></div>';
    try {
      const query = { page: state.page, limit: state.limit };
      if (state.status && state.status !== 'all') query.status = state.status;
      const res = await apiRequest('/admin/vendor-applications', { query });
      const items = res.data || [];
      const pg = res.pagination || { page: state.page, limit: state.limit, total: items.length, pages: 1 };
      currentItems = items;
      countEl.textContent = `${pg.total} application${pg.total === 1 ? '' : 's'}${state.search ? ' · filtered by search' : ''}`;
      render();
      if (pg.pages > 1) {
        footer.style.display = 'flex';
        renderPagination(pagination, pageInfo, { page: pg.page, pages: pg.pages, total: pg.total },
          p => { state.page = p; load(); });
      } else {
        footer.style.display = 'none';
      }
    } catch (err) {
      wrap.innerHTML = `<div class="state-block"><h4>Could not load applications</h4><p>${esc(err.message)}</p>
        <button class="btn btn-ghost btn-sm" id="applications-retry">Retry</button></div>`;
      document.getElementById('applications-retry')?.addEventListener('click', load);
    }
  }

  window.refreshVendorApplications = () => load();

  filter?.addEventListener('change', () => { state.status = filter.value; state.page = 1; load(); });
  searchInput?.addEventListener('input', debounce(() => {
    state.search = searchInput.value.trim();
    render();
  }, 250));
  refresh?.addEventListener('click', load);
  document.addEventListener('admin:view-changed', e => { if (e.detail.view === 'vendor-applications') load(); });
})();
