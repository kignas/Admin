function openModal(id) {
  document.getElementById(id).classList.add('show');
}
function closeModal(id) {
  document.getElementById(id).classList.remove('show');
}

document.addEventListener('DOMContentLoaded', () => {
  // Delegate close handling so it also works for modals created after page load.
  // Vendor application review creates its modal dynamically, so binding only
  // to elements present at DOMContentLoaded misses both its X and Close buttons.
  document.addEventListener('click', (e) => {
    const closeButton = e.target.closest('[data-close-modal]');
    if (closeButton) {
      closeModal(closeButton.dataset.closeModal);
      return;
    }

    const overlay = e.target.closest('.modal-overlay');
    if (overlay && e.target === overlay) closeModal(overlay.id);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      document.querySelectorAll('.modal-overlay.show').forEach((o) => closeModal(o.id));
    }
  });
});

function debounce(fn, ms) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

/**
 * Renders simple Prev/Next pagination + "Page X of Y (N total)" text.
 * onGoToPage(pageNumber) is called on click.
 */
function renderPagination(paginationEl, infoEl, meta, onGoToPage) {
  const { page, pages, total } = meta;
  infoEl.textContent = `Page ${page} of ${Math.max(pages, 1)} · ${total} total`;

  paginationEl.innerHTML = '';
  const prev = document.createElement('button');
  prev.textContent = '‹';
  prev.disabled = page <= 1;
  prev.addEventListener('click', () => onGoToPage(page - 1));
  paginationEl.appendChild(prev);

  const label = document.createElement('button');
  label.textContent = String(page);
  label.className = 'active';
  label.disabled = true;
  paginationEl.appendChild(label);

  const next = document.createElement('button');
  next.textContent = '›';
  next.disabled = page >= pages;
  next.addEventListener('click', () => onGoToPage(page + 1));
  paginationEl.appendChild(next);
}
