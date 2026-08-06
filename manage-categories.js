(function () {
  function init() {
    const tableWrap = document.getElementById('categories-list-wrap');
    const addBtn = document.getElementById('category-add-btn');

    let loadedOnce = false;
    let categoriesCache = []; // full list from the last load — also used to populate the edit modal without a second fetch
    let draggedRow = null;

    // ── Diagnostics — logs the exact missing ID instead of silently dying ──
    if (!tableWrap) console.error('[manageCategories.js] #categories-list-wrap not found in the DOM — category list cannot render.');
    if (!addBtn) console.error('[manageCategories.js] #category-add-btn not found in the DOM — Add Category button will not work.');

    function renderTable(categories) {
      if (!tableWrap) return;

      if (!categories.length) {
        tableWrap.innerHTML = `<div class="state-block">
          <h4>No categories found</h4>
          <p>Add the first "What's on your mind?" category to get started.</p>
        </div>`;
        return;
      }

      // Lowest order first so the table mirrors what customers see on the homepage rail.
      const sorted = [...categories].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

      tableWrap.innerHTML = `
        <table class="data-table">
          <thead>
            <tr>
              <th></th><th>Image</th><th>Name</th><th>Order</th><th>Status</th><th></th>
            </tr>
          </thead>
          <tbody>
            ${sorted.map(c => `
              <tr data-id="${c._id}" draggable="true">
                <td style="cursor:grab; color:#999;" title="Drag to reorder">⠿</td>
                <td>
                  ${c.image
                    ? `<img class="thumb-sm" src="${c.image}" alt="${escapeHtml(c.name)}" />`
                    : `<div class="thumb-sm thumb-empty"></div>`}
                </td>
                <td>
                  <div class="row-name">${escapeHtml(c.name)}</div>
                </td>
                <td class="mono">${c.order ?? '—'}</td>
                <td>
                  <label class="switch" title="${c.isActive ? 'Deactivate category' : 'Activate category'}">
                    <input type="checkbox" class="category-toggle" data-id="${c._id}" ${c.isActive ? 'checked' : ''} />
                    <span class="track"></span>
                  </label>
                </td>
                <td>
                  <div class="row-actions">
                    <button class="icon-btn category-edit-btn" data-id="${c._id}" title="Edit category">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
                    </button>
                    <button class="icon-btn category-delete-btn" data-id="${c._id}" data-name="${escapeHtml(c.name)}" title="Delete category">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 6h18"/><path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2"/><path d="M19 6l-1 14a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1L5 6"/></svg>
                    </button>
                  </div>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;

      tableWrap.querySelectorAll('.category-toggle').forEach(input => {
        input.addEventListener('change', () => toggleActive(input));
      });
      tableWrap.querySelectorAll('.category-edit-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          try {
            openEditModal(btn.dataset.id);
          } catch (err) {
            console.error('[manageCategories.js] openEditModal() failed:', err);
            showToast(err.message || 'Could not open the Edit Category form.', 'error');
          }
        });
      });
      tableWrap.querySelectorAll('.category-delete-btn').forEach(btn => {
        btn.addEventListener('click', () => deleteCategory(btn.dataset.id, btn.dataset.name));
      });
      attachDragHandlers();
    }

    // ── Drag-to-reorder ──────────────────────────────────────────
    function attachDragHandlers() {
      if (!tableWrap) return;
      tableWrap.querySelectorAll('tbody tr[draggable="true"]').forEach(row => {
        row.addEventListener('dragstart', () => {
          draggedRow = row;
          row.style.opacity = '0.4';
        });
        row.addEventListener('dragend', () => {
          row.style.opacity = '';
          draggedRow = null;
        });
        row.addEventListener('dragover', (e) => {
          e.preventDefault();
          if (!draggedRow || draggedRow === row) return;
          const rect = row.getBoundingClientRect();
          const before = (e.clientY - rect.top) < rect.height / 2;
          row.parentElement.insertBefore(draggedRow, before ? row : row.nextSibling);
        });
        row.addEventListener('drop', (e) => {
          e.preventDefault();
          persistNewOrder();
        });
      });
    }

    async function persistNewOrder() {
      if (!tableWrap) return;
      const rows = [...tableWrap.querySelectorAll('tbody tr[data-id]')];
      const items = rows.map((row, idx) => ({ id: row.dataset.id, order: idx }));

      // Reflect the new order column immediately so it doesn't flicker back on next render.
      rows.forEach((row, idx) => {
        const orderCell = row.children[3];
        if (orderCell) orderCell.textContent = idx;
      });

      try {
        await apiRequest('/categories/reorder', { method: 'PUT', body: { items } });
        items.forEach(({ id, order }) => {
          const cat = categoriesCache.find(c => c._id === id);
          if (cat) cat.order = order;
        });
        showToast('Order updated.', 'success');
      } catch (err) {
        showToast(err.message || 'Could not save new order.', 'error');
        loadCategories(); // re-sync from server since the DOM order and DB order now disagree
      }
    }

    // ── List loading ─────────────────────────────────────────────
    async function loadCategories() {
      if (!tableWrap) {
        console.error('[manageCategories.js] loadCategories() aborted — #categories-list-wrap is missing.');
        return;
      }
      tableWrap.innerHTML = `<div class="state-block"><div class="spinner-lg"></div></div>`;
      try {
        // /all (not the public /categories) so hidden categories still show up here and can be re-activated.
        const res = await apiRequest('/categories/all');
        categoriesCache = res.data;
        renderTable(categoriesCache);
      } catch (err) {
        tableWrap.innerHTML = `<div class="state-block"><h4>Could not load categories</h4><p>${escapeHtml(err.message)}</p></div>`;
      }
    }

    async function toggleActive(input) {
      input.disabled = true;
      try {
        // Dedicated toggle endpoint — flips isActive server-side and is the only
        // route that actually persists this (PUT /:id silently ignores isActive).
        const res = await apiRequest(`/categories/${input.dataset.id}/toggle`, { method: 'PATCH' });
        input.checked = res.data.isActive;
        const cat = categoriesCache.find(c => c._id === input.dataset.id);
        if (cat) cat.isActive = res.data.isActive;
        showToast(input.checked ? 'Category activated.' : 'Category deactivated.', 'success');
      } catch (err) {
        input.checked = !input.checked;
        showToast(err.message || 'Could not update category status.', 'error');
      } finally {
        input.disabled = false;
      }
    }

    async function deleteCategory(id, name) {
      if (!confirm(`Delete "${name}"? It will immediately disappear from the homepage "What's on your mind?" row.`)) return;
      try {
        await apiRequest(`/categories/${id}`, { method: 'DELETE' });
        showToast('Category deleted.', 'success');
        loadCategories();
      } catch (err) {
        showToast(err.message || 'Could not delete category.', 'error');
      }
    }

    // ── Add / Edit modal ────────────────────────────────────────
    const form = document.getElementById('category-form');
    const modalTitle = document.getElementById('category-modal-title');
    const saveBtn = document.getElementById('category-modal-save');
    const saveText = document.getElementById('category-modal-save-text');
    const resultBox = document.getElementById('category-modal-result');
    let saving = false;

    if (!form) console.error('[manageCategories.js] #category-form not found in the DOM — Add/Edit modal will not work.');

    function setFieldError(id, msg) {
      const el = document.querySelector(`[data-error-for="${id}"]`);
      const input = document.getElementById(id);
      if (el) el.textContent = msg || '';
      if (input) input.classList.toggle('invalid', !!msg);
    }

    function openAddModal() {
      if (!form) return;
      form.reset();
      form.querySelectorAll('[data-error-for]').forEach(el => el.textContent = '');
      form.querySelectorAll('input.invalid').forEach(el => el.classList.remove('invalid'));
      resultBox.className = 'modal-result';
      document.getElementById('cat-id').value = '';
      modalTitle.textContent = 'Add category';
      saveText.textContent = 'Create category';
      document.getElementById('cat-image').dispatchEvent(new Event('change'));
      openModal('category-modal');
    }

    function openEditModal(id) {
      // Populate straight from the row cache — there is no GET /categories/:id
      // endpoint (confirmed against categoryRoutes.js), so fetching here would 404.
      const c = categoriesCache.find(cat => cat._id === id);
      if (!c || !form) return;

      form.reset();
      form.querySelectorAll('[data-error-for]').forEach(el => el.textContent = '');
      form.querySelectorAll('input.invalid').forEach(el => el.classList.remove('invalid'));
      resultBox.className = 'modal-result';
      document.getElementById('cat-id').value = c._id;
      modalTitle.textContent = 'Edit category';
      saveText.textContent = 'Save changes';
      document.getElementById('cat-name').value = c.name || '';
      document.getElementById('cat-image').value = c.image || '';
      document.getElementById('cat-image').dispatchEvent(new Event('change'));
      openModal('category-modal');
    }

    if (form) {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (saving) return;

        let valid = true;
        setFieldError('cat-name', '');

        const name = document.getElementById('cat-name').value.trim();
        if (!name) { setFieldError('cat-name', 'Name is required.'); valid = false; }

        if (!valid) return;

        const id = document.getElementById('cat-id').value;
        const body = {
          name,
          image: document.getElementById('cat-image').value.trim(),
        };

        saving = true;
        saveBtn.disabled = true;
        const savingLabel = id ? 'Saving…' : 'Creating…';
        saveText.innerHTML = `<span class="btn-spinner"></span> ${savingLabel}`;

        try {
          if (id) {
            await apiRequest(`/categories/${id}`, { method: 'PUT', body });
            resultBox.textContent = 'Category updated.';
          } else {
            await apiRequest('/categories', { method: 'POST', body });
            resultBox.textContent = 'Category created.';
          }
          resultBox.className = 'modal-result show success';
          showToast(id ? 'Category updated.' : 'Category created.', 'success');
          loadCategories();
          setTimeout(() => closeModal('category-modal'), 700);
        } catch (err) {
          resultBox.textContent = err.message || 'Could not save category.';
          resultBox.className = 'modal-result show error';
        } finally {
          saving = false;
          saveBtn.disabled = false;
          saveText.textContent = id ? 'Save changes' : 'Create category';
        }
      });
    }

    if (addBtn) {
      addBtn.addEventListener('click', () => {
        try {
          openAddModal();
        } catch (err) {
          // Surfaces the real failure on-screen (via toast) instead of
          // silently doing nothing — useful on mobile where DevTools isn't handy.
          console.error('[manageCategories.js] openAddModal() failed:', err);
          showToast(err.message || 'Could not open the Add Category form.', 'error');
        }
      });
    }

    document.addEventListener('admin:view-changed', (e) => {
      if (e.detail.view === 'manage-categories' && !loadedOnce) {
        loadedOnce = true;
        loadCategories();
      }
    });
  }

  // Run now if the DOM is already parsed (script loaded at end of body),
  // otherwise wait — this is what actually prevents the "elements not found yet" crash.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
