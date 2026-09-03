(function () {
  const tableWrap = document.getElementById('vendors-table-wrap');
  const footer = document.getElementById('vendors-footer');
  const pageInfo = document.getElementById('vendors-page-info');
  const paginationEl = document.getElementById('vendors-pagination');
  const countEl = document.getElementById('vendors-count');
  const searchInput = document.getElementById('vendors-search');
  const statusFilter = document.getElementById('vendors-status-filter');

  const state = { page: 1, limit: 10, search: '', status: '' };
  let loadedOnce = false;

  function renderTable(vendors) {
    if (!vendors.length) {
      tableWrap.innerHTML = `<div class="state-block">
        <h4>No vendors found</h4>
        <p>${state.search || state.status ? 'Try a different search or filter.' : 'Create your first vendor from the Create Vendor tab.'}</p>
      </div>`;
      return;
    }

    tableWrap.innerHTML = `
      <table class="data-table">
        <thead>
          <tr>
            <th>Vendor</th><th>Contact</th><th>Restaurant</th><th>Joined</th><th>Status</th><th></th>
          </tr>
        </thead>
        <tbody>
          ${vendors.map(v => `
            <tr data-id="${v.id}">
              <td>
                <div class="row-name">${escapeHtml(v.name)}</div>
                <div class="row-sub">Last login: ${v.lastLogin ? formatDate(v.lastLogin) : 'Never'}</div>
              </td>
              <td>
                <div>${escapeHtml(v.email)}</div>
                <div class="row-sub mono">${escapeHtml(v.phone)}</div>
              </td>
              <td>
                ${v.restaurant
                  ? `<div class="row-name">${escapeHtml(v.restaurant.name)}</div>
                     <span class="badge ${v.restaurant.isOpen ? 'badge-success' : 'badge-muted'}">${v.restaurant.isOpen ? 'Open' : 'Closed'}</span>`
                  : `<span class="row-sub">No restaurant linked</span>`}
              </td>
              <td class="mono">${formatDate(v.createdAt)}</td>
              <td>
                <label class="switch" title="${v.isActive ? 'Deactivate vendor' : 'Activate vendor'}">
                  <input type="checkbox" class="vendor-toggle" data-id="${v.id}" ${v.isActive ? 'checked' : ''} />
                  <span class="track"></span>
                </label>
              </td>
              <td>
                <div class="row-actions">
                  <button class="icon-btn vendor-edit-btn" data-id="${v.id}" title="Edit vendor">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
                  </button>
                </div>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;

    tableWrap.querySelectorAll('.vendor-toggle').forEach(input => {
      input.addEventListener('change', () => toggleVendor(input));
    });
    tableWrap.querySelectorAll('.vendor-edit-btn').forEach(btn => {
      btn.addEventListener('click', () => openEditModal(vendors.find(v => v.id === btn.dataset.id)));
    });
  }

  async function loadVendors() {
    tableWrap.innerHTML = `<div class="state-block"><div class="spinner-lg"></div></div>`;
    try {
      const res = await apiRequest('/admin/vendors', {
        query: { search: state.search, status: state.status, page: state.page, limit: state.limit },
      });
      const { vendors, total, page, pages } = res.data;
      countEl.textContent = `${total} vendor${total === 1 ? '' : 's'}`;
      renderTable(vendors);
      if (total > state.limit) {
        footer.style.display = 'flex';
        renderPagination(paginationEl, pageInfo, { page, pages, total }, (p) => { state.page = p; loadVendors(); });
      } else {
        footer.style.display = 'none';
      }
    } catch (err) {
      tableWrap.innerHTML = `<div class="state-block"><h4>Could not load vendors</h4><p>${escapeHtml(err.message)}</p></div>`;
    }
  }

  async function toggleVendor(input) {
    input.disabled = true;
    try {
      const res = await apiRequest(`/admin/vendors/${input.dataset.id}/toggle`, { method: 'PATCH' });
      showToast(res.message || 'Vendor status updated.', 'success');
      loadVendors();
    } catch (err) {
      input.checked = !input.checked; // revert
      showToast(err.message || 'Could not update vendor status.', 'error');
    } finally {
      input.disabled = false;
    }
  }

  // ── Edit modal ──────────────────────────────────────────────
  const editForm = document.getElementById('vendor-edit-form');
  const saveBtn = document.getElementById('vendor-modal-save');
  const saveText = document.getElementById('vendor-modal-save-text');
  const resultBox = document.getElementById('vendor-modal-result');
  let saving = false;

  function openEditModal(vendor) {
    if (!vendor) return;
    editForm.reset();
    editForm.querySelectorAll('[data-error-for]').forEach(el => el.textContent = '');
    editForm.querySelectorAll('input.invalid').forEach(el => el.classList.remove('invalid'));
    resultBox.className = 'modal-result';
    document.getElementById('vm-id').value = vendor.id;
    document.getElementById('vm-name').value = vendor.name || '';
    document.getElementById('vm-email').value = vendor.email || '';
    document.getElementById('vm-phone').value = vendor.phone || '';
    document.getElementById('vm-password').value = '';
    openModal('vendor-modal');
  }

  function setFieldError(id, msg) {
    const el = document.querySelector(`[data-error-for="${id}"]`);
    const input = document.getElementById(id);
    if (el) el.textContent = msg || '';
    if (input) input.classList.toggle('invalid', !!msg);
  }

  editForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (saving) return;

    let valid = true;
    setFieldError('vm-name', ''); setFieldError('vm-email', ''); setFieldError('vm-phone', ''); setFieldError('vm-password', '');

    const email = document.getElementById('vm-email').value.trim();
    if (!email || !/^\S+@\S+\.\S+$/.test(email)) { setFieldError('vm-email', 'Enter a valid email.'); valid = false; }

    const phone = document.getElementById('vm-phone').value.trim();
    if (!phone || !/^\+?[1-9]\d{9,14}$/.test(phone)) { setFieldError('vm-phone', 'Enter a valid phone number.'); valid = false; }

    const password = document.getElementById('vm-password').value;
    if (password && password.length < 10) { setFieldError('vm-password', 'At least 10 characters.'); valid = false; }

    if (!valid) return;

    saving = true;
    saveBtn.disabled = true;
    saveText.innerHTML = '<span class="btn-spinner"></span> Saving…';

    try {
      const body = {
        name: document.getElementById('vm-name').value.trim(),
        email,
        phone,
      };
      if (password) body.password = password;

      await apiRequest(`/admin/vendors/${document.getElementById('vm-id').value}`, { method: 'PUT', body });
      resultBox.textContent = 'Vendor updated.';
      resultBox.className = 'modal-result show success';
      showToast('Vendor updated.', 'success');
      loadVendors();
      setTimeout(() => closeModal('vendor-modal'), 700);
    } catch (err) {
      resultBox.textContent = err.message || 'Could not update vendor.';
      resultBox.className = 'modal-result show error';
    } finally {
      saving = false;
      saveBtn.disabled = false;
      saveText.textContent = 'Save changes';
    }
  });

  // ── Filters ─────────────────────────────────────────────────
  searchInput.addEventListener('input', debounce(() => {
    state.search = searchInput.value.trim();
    state.page = 1;
    loadVendors();
  }, 350));

  statusFilter.addEventListener('change', () => {
    state.status = statusFilter.value;
    state.page = 1;
    loadVendors();
  });

  document.addEventListener('admin:view-changed', (e) => {
    if (e.detail.view === 'manage-vendors' && !loadedOnce) {
      loadedOnce = true;
      loadVendors();
    }
  });
})();
