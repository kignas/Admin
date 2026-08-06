function openModal(id) {
  document.getElementById(id).classList.add('show');
}
function closeModal(id) {
  document.getElementById(id).classList.remove('show');
}

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('[data-close-modal]').forEach((btn) => {
    btn.addEventListener('click', () => closeModal(btn.dataset.closeModal));
  });
  document.querySelectorAll('.modal-overlay').forEach((overlay) => {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeModal(overlay.id);
    });
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
