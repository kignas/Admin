(function () {
  'use strict';

  const list = document.getElementById('home-banners-list');
  const count = document.getElementById('home-banner-count');
  const addBtn = document.getElementById('home-banner-add-btn');
  const refreshBtn = document.getElementById('home-banner-refresh-btn');
  const form = document.getElementById('home-banner-form');
  const modalTitle = document.getElementById('home-banner-modal-title');
  const saveBtn = document.getElementById('home-banner-save-btn');
  const saveText = document.getElementById('home-banner-save-text');
  const resultBox = document.getElementById('home-banner-modal-result');
  const preview = document.getElementById('hb-preview');
  const previewBadge = document.getElementById('hb-preview-badge');
  const previewTitle = document.getElementById('hb-preview-title');
  const previewSubtitle = document.getElementById('hb-preview-subtitle');
  const placementInput = document.getElementById('hb-placement');

  if (!list || !form) return;

  let banners = [];
  let draggedId = null;
  let saving = false;

  const esc = (value) => String(value ?? '').replace(/[&<>'"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[ch]));
  const moneySafe = (value) => esc(value);

  function formatDate(value) {
    if (!value) return 'No schedule';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return 'Invalid date';
    return d.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  function statusLabel(banner) {
    const now = Date.now();
    if (!banner.active) return ['Paused', 'paused'];
    if (banner.startAt && new Date(banner.startAt).getTime() > now) return ['Scheduled', 'scheduled'];
    if (banner.endAt && new Date(banner.endAt).getTime() < now) return ['Expired', 'expired'];
    return ['Live', 'live'];
  }

  function setField(id, value) {
    const el = document.getElementById(id);
    if (el) el.value = value ?? '';
  }

  function toDatetimeLocal(value) {
    if (!value) return '';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '';
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  function fromDatetimeLocal(value) {
    if (!value) return null;
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }

  function clearErrors() {
    form.querySelectorAll('[data-error-for]').forEach(el => el.textContent = '');
    form.querySelectorAll('.invalid').forEach(el => el.classList.remove('invalid'));
    resultBox.className = 'modal-result';
    resultBox.textContent = '';
  }

  function errorFor(id, message) {
    const box = form.querySelector(`[data-error-for="${id}"]`);
    const input = document.getElementById(id);
    if (box) box.textContent = message || '';
    if (input) input.classList.toggle('invalid', !!message);
  }

  function updatePreview() {
    const title = document.getElementById('hb-title').value.trim() || 'Your banner preview';
    const subtitle = document.getElementById('hb-subtitle').value.trim() || 'Upload an image and enter your offer.';
    const badge = document.getElementById('hb-badgeText').value.trim() || 'EATSWADA';
    const bg = document.getElementById('hb-background').value.trim() || '#0B6B46';
    const textColor = document.getElementById('hb-textColor').value === 'dark' ? '#0F172A' : '#FFFFFF';
    const image = document.getElementById('hb-image').value.trim();
    preview.style.background = bg;
    preview.style.color = textColor;
    previewBadge.textContent = badge;
    previewTitle.textContent = title;
    previewSubtitle.textContent = subtitle;
    if (image) preview.style.backgroundImage = `linear-gradient(90deg, ${bg} 0%, rgba(0,0,0,0.05) 45%, rgba(0,0,0,0.04) 100%), url("${image.replace(/"/g, '%22')}")`;
    else preview.style.backgroundImage = '';
  }

  ['hb-title','hb-subtitle','hb-badgeText','hb-background','hb-image','hb-textColor'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', updatePreview);
    if (el) el.addEventListener('change', updatePreview);
  });

  function render() {
    count.textContent = `${banners.length} banner${banners.length === 1 ? '' : 's'}`;
    if (!banners.length) {
      list.innerHTML = `<div class="card state-block home-banner-empty"><div class="home-banner-empty-icon">＋</div><h4>No banners yet</h4><p>Create your first promotional hero. Choose Homepage or 99 Store as the placement.</p><button class="btn btn-primary" id="home-banner-empty-add">Add first banner</button></div>`;
      document.getElementById('home-banner-empty-add')?.addEventListener('click', openAdd);
      return;
    }

    const sorted = [...banners].sort((a, b) => Number(b.priority || 0) - Number(a.priority || 0));
    list.innerHTML = sorted.map((b) => {
      const [status, cls] = statusLabel(b);
      const image = b.mobileImage || b.image;
      return `
        <article class="home-banner-card card" draggable="true" data-id="${esc(b._id)}">
          <div class="home-banner-drag" title="Drag to reorder">⋮⋮</div>
          <div class="home-banner-thumb" style="background:${esc(b.background || '#0B6B46')};">
            ${image ? `<img src="${esc(image)}" alt="" loading="lazy">` : ''}
            <div class="home-banner-thumb-overlay"></div>
            <div class="home-banner-thumb-copy ${b.textColor === 'dark' ? 'dark' : ''}">
              ${b.badgeText ? `<span>${esc(b.badgeText)}</span>` : ''}
              <strong>${esc(b.title)}</strong>
              ${b.offerText ? `<small>${esc(b.offerText)}</small>` : ''}
            </div>
          </div>
          <div class="home-banner-card-body">
            <div class="home-banner-card-top">
              <div>
                <h3>${esc(b.title)}</h3>
                <p>${esc(b.subtitle || 'No subtitle')}</p>
              </div>
              <span class="home-banner-status ${cls}"><i></i>${status}</span>
            </div>
            <div class="home-banner-meta">
              <span>${b.placement === 'under99' ? '99 Store' : 'Homepage'}</span><span>Priority ${Number(b.priority || 0)}</span>
              <span>${esc(b.animation || 'fade')} entrance</span>
              <span>${b.startAt || b.endAt ? `${formatDate(b.startAt)} → ${formatDate(b.endAt)}` : 'Always on when active'}</span>
            </div>
            <div class="home-banner-actions">
              <button class="btn btn-ghost btn-sm hb-edit" data-id="${esc(b._id)}">Edit</button>
              <button class="btn btn-ghost btn-sm hb-toggle" data-id="${esc(b._id)}">${b.active ? 'Pause' : 'Publish'}</button>
              <button class="btn btn-danger-soft btn-sm hb-delete" data-id="${esc(b._id)}" data-title="${esc(b.title)}">Delete</button>
            </div>
          </div>
        </article>`;
    }).join('');

    list.querySelectorAll('.hb-edit').forEach(btn => btn.addEventListener('click', () => openEdit(btn.dataset.id)));
    list.querySelectorAll('.hb-toggle').forEach(btn => btn.addEventListener('click', () => toggleBanner(btn.dataset.id)));
    list.querySelectorAll('.hb-delete').forEach(btn => btn.addEventListener('click', () => deleteBanner(btn.dataset.id, btn.dataset.title)));
    attachDrag();
  }

  function attachDrag() {
    list.querySelectorAll('.home-banner-card').forEach(card => {
      card.addEventListener('dragstart', () => { draggedId = card.dataset.id; card.classList.add('dragging'); });
      card.addEventListener('dragend', () => { card.classList.remove('dragging'); draggedId = null; });
      card.addEventListener('dragover', e => {
        e.preventDefault();
        const dragging = list.querySelector('.home-banner-card.dragging');
        if (!dragging || dragging === card) return;
        const rect = card.getBoundingClientRect();
        const before = e.clientY < rect.top + rect.height / 2;
        list.insertBefore(dragging, before ? card : card.nextSibling);
      });
      card.addEventListener('drop', async e => {
        e.preventDefault();
        await persistOrder();
      });
    });
  }

  async function persistOrder() {
    const cards = [...list.querySelectorAll('.home-banner-card')];
    if (!cards.length) return;
    const items = cards.map((card, index) => ({ id: card.dataset.id, priority: cards.length - index }));
    try {
      const res = await apiRequest('/home-banners/reorder', { method: 'PUT', body: { items } });
      banners = res.data || banners;
      render();
      showToast('Banner order updated.', 'success');
    } catch (err) {
      showToast(err.message || 'Could not update banner order.', 'error');
      render();
    }
  }

  async function load() {
    list.innerHTML = `<div class="card state-block"><div class="spinner-lg"></div></div>`;
    try {
      const res = await apiRequest('/home-banners/all');
      banners = Array.isArray(res.data) ? res.data : [];
      render();
    } catch (err) {
      list.innerHTML = `<div class="card state-block"><h4>Could not load banners</h4><p>${esc(err.message)}</p></div>`;
    }
  }

  function resetForm() {
    form.reset();
    document.getElementById('hb-id').value = '';
    if (placementInput) placementInput.value = 'home';
    document.getElementById('hb-background').value = '#0B6B46';
    document.getElementById('hb-textColor').value = 'light';
    document.getElementById('hb-animation').value = 'fade';
    document.getElementById('hb-priority').value = '0';
    document.getElementById('hb-active').checked = true;
    document.getElementById('hb-image').value = '';
    document.getElementById('hb-mobileImage').value = '';
    document.getElementById('hb-image').dispatchEvent(new Event('change'));
    document.getElementById('hb-mobileImage').dispatchEvent(new Event('change'));
    updatePreview();
  }

  function openAdd() {
    resetForm();
    clearErrors();
    modalTitle.textContent = 'Add banner';
    saveText.textContent = 'Create banner';
    openModal('home-banner-modal');
  }

  function openEdit(id) {
    const b = banners.find(x => String(x._id) === String(id));
    if (!b) return;
    resetForm();
    clearErrors();
    document.getElementById('hb-id').value = b._id;
    if (placementInput) placementInput.value = b.placement || 'home';
    setField('hb-title', b.title);
    setField('hb-subtitle', b.subtitle);
    setField('hb-offerText', b.offerText);
    setField('hb-badgeText', b.badgeText);
    setField('hb-ctaText', b.ctaText || 'Order now');
    setField('hb-ctaUrl', b.ctaUrl);
    setField('hb-image', b.image);
    setField('hb-mobileImage', b.mobileImage);
    setField('hb-background', b.background || '#0B6B46');
    setField('hb-textColor', b.textColor || 'light');
    setField('hb-animation', b.animation || 'fade');
    setField('hb-priority', b.priority ?? 0);
    setField('hb-startAt', toDatetimeLocal(b.startAt));
    setField('hb-endAt', toDatetimeLocal(b.endAt));
    document.getElementById('hb-active').checked = b.active !== false;
    document.getElementById('hb-image').dispatchEvent(new Event('change'));
    document.getElementById('hb-mobileImage').dispatchEvent(new Event('change'));
    updatePreview();
    modalTitle.textContent = 'Edit banner';
    saveText.textContent = 'Save changes';
    openModal('home-banner-modal');
  }

  async function toggleBanner(id) {
    try {
      const res = await apiRequest(`/home-banners/${encodeURIComponent(id)}/toggle`, { method: 'PATCH' });
      const b = banners.find(x => String(x._id) === String(id));
      if (b) b.active = res.data.active;
      render();
      showToast(res.data.active ? 'Banner published.' : 'Banner paused.', 'success');
    } catch (err) {
      showToast(err.message || 'Could not update banner status.', 'error');
    }
  }

  async function deleteBanner(id, title) {
    if (!confirm(`Delete "${title}"? It will disappear from the customer homepage.`)) return;
    try {
      await apiRequest(`/home-banners/${encodeURIComponent(id)}`, { method: 'DELETE' });
      banners = banners.filter(x => String(x._id) !== String(id));
      render();
      showToast('Banner deleted.', 'success');
    } catch (err) {
      showToast(err.message || 'Could not delete banner.', 'error');
    }
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (saving) return;
    clearErrors();

    const body = {
      placement: placementInput?.value || 'home',
      title: document.getElementById('hb-title').value.trim(),
      subtitle: document.getElementById('hb-subtitle').value.trim(),
      offerText: document.getElementById('hb-offerText').value.trim(),
      badgeText: document.getElementById('hb-badgeText').value.trim(),
      ctaText: document.getElementById('hb-ctaText').value.trim() || 'Order now',
      ctaUrl: document.getElementById('hb-ctaUrl').value.trim(),
      image: document.getElementById('hb-image').value.trim(),
      mobileImage: document.getElementById('hb-mobileImage').value.trim(),
      background: document.getElementById('hb-background').value.trim() || '#0B6B46',
      textColor: document.getElementById('hb-textColor').value,
      animation: document.getElementById('hb-animation').value,
      priority: Number(document.getElementById('hb-priority').value || 0),
      startAt: fromDatetimeLocal(document.getElementById('hb-startAt').value),
      endAt: fromDatetimeLocal(document.getElementById('hb-endAt').value),
      active: document.getElementById('hb-active').checked,
    };

    let valid = true;
    if (!body.title) { errorFor('hb-title', 'Title is required.'); valid = false; }
    if (!body.image) { errorFor('hb-image', 'Desktop image is required.'); valid = false; }
    if (body.ctaUrl && !(body.ctaUrl.startsWith('/') || /^https:\/\//i.test(body.ctaUrl))) { errorFor('hb-ctaUrl', 'Use a relative path or HTTPS URL.'); valid = false; }
    if (!valid) return;

    saving = true;
    saveBtn.disabled = true;
    saveText.innerHTML = '<span class="btn-spinner"></span> Saving…';

    try {
      const id = document.getElementById('hb-id').value;
      const res = await apiRequest(id ? `/home-banners/${encodeURIComponent(id)}` : '/home-banners', { method: id ? 'PUT' : 'POST', body });
      if (id) {
        const index = banners.findIndex(x => String(x._id) === String(id));
        if (index >= 0) banners[index] = res.data;
      } else {
        banners.push(res.data);
      }
      render();
      closeModal('home-banner-modal');
      showToast(id ? 'Banner updated.' : 'Banner created.', 'success');
    } catch (err) {
      resultBox.className = 'modal-result error';
      resultBox.textContent = err.message || 'Could not save banner.';
    } finally {
      saving = false;
      saveBtn.disabled = false;
      saveText.textContent = document.getElementById('hb-id').value ? 'Save changes' : 'Create banner';
    }
  });

  addBtn?.addEventListener('click', openAdd);
  refreshBtn?.addEventListener('click', load);

  document.addEventListener('admin:view-changed', (event) => {
    if (event.detail?.view === 'home-banners') load();
  });

  // If the page opens directly on this hash, the app event above has already fired.
  if (window.location.hash === '#home-banners') load();
})();
