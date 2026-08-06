(function () {
  const tableWrap = document.getElementById('customers-table-wrap');
  const footer = document.getElementById('customers-footer');
  const pageInfo = document.getElementById('customers-page-info');
  const paginationEl = document.getElementById('customers-pagination');
  const countEl = document.getElementById('customers-count');
  const searchInput = document.getElementById('customers-search');

  const state = { page: 1, limit: 15, search: '' };
  let loadedOnce = false;

  function renderTable(customers) {
    if (!customers.length) {
      tableWrap.innerHTML = `<div class="state-block">
        <h4>No customers found</h4>
        <p>${state.search ? 'Try a different search.' : 'Customers appear here once they sign up via OTP.'}</p>
      </div>`;
      return;
    }

    tableWrap.innerHTML = `
      <table class="data-table">
        <thead>
          <tr><th>Customer</th><th>Contact</th><th>Orders</th><th>Total spent</th><th>Joined</th></tr>
        </thead>
        <tbody>
          ${customers.map(c => `
            <tr>
              <td class="row-name">${escapeHtml(c.name || 'Unnamed')}</td>
              <td>
                <div class="mono">${escapeHtml(c.phone)}</div>
                <div class="row-sub">${escapeHtml(c.email || '—')}</div>
              </td>
              <td class="mono">${c.totalOrders}</td>
              <td class="mono">${formatMoney(c.totalSpent)}</td>
              <td class="mono">${formatDate(c.createdAt)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  }

  async function loadCustomers() {
    tableWrap.innerHTML = `<div class="state-block"><div class="spinner-lg"></div></div>`;
    try {
      const res = await apiRequest('/admin/customers', {
        query: { search: state.search, page: state.page, limit: state.limit },
      });
      const { customers, total, page, pages } = res.data;
      countEl.textContent = `${total} customer${total === 1 ? '' : 's'}`;
      renderTable(customers);
      if (total > state.limit) {
        footer.style.display = 'flex';
        renderPagination(paginationEl, pageInfo, { page, pages, total }, (p) => { state.page = p; loadCustomers(); });
      } else {
        footer.style.display = 'none';
      }
    } catch (err) {
      tableWrap.innerHTML = `<div class="state-block"><h4>Could not load customers</h4><p>${escapeHtml(err.message)}</p></div>`;
    }
  }

  searchInput.addEventListener('input', debounce(() => {
    state.search = searchInput.value.trim();
    state.page = 1;
    loadCustomers();
  }, 350));

  document.addEventListener('admin:view-changed', (e) => {
    if (e.detail.view === 'manage-customers' && !loadedOnce) {
      loadedOnce = true;
      loadCustomers();
    }
  });
})();
