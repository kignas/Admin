(function () {
  const wrap = document.getElementById('applications-table-wrap');
  const footer = document.getElementById('applications-footer');
  const pageInfo = document.getElementById('applications-page-info');
  const pagination = document.getElementById('applications-pagination');
  const countEl = document.getElementById('applications-count');
  const filter = document.getElementById('applications-status-filter');
  const refresh = document.getElementById('applications-refresh');
  let state = { page: 1, limit: 10, status: 'pending' };
  let loaded = false;
  let reviewImageUrl = '';
  let reviewImageUrls = [];

  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const statusLabel = s => ({pending:'Pending', approved:'Approved', rejected:'Rejected'}[s] || s);
  const statusClass = s => ({pending:'badge-warning', approved:'badge-success', rejected:'badge-danger'}[s] || 'badge-muted');

  function render(items) {
    if (!items.length) {
      wrap.innerHTML = `<div class="state-block"><h4>No applications found</h4><p>${state.status === 'pending' ? 'New seller applications will appear here.' : 'Try another status filter.'}</p></div>`;
      footer.style.display = 'none';
      return;
    }
    wrap.innerHTML = `<table class="data-table"><thead><tr><th>Restaurant</th><th>Owner</th><th>Contact</th><th>Submitted</th><th>Status</th><th></th></tr></thead><tbody>${items.map(a => {
      const owner = a.ownerName || a.applicant?.name || '—';
      const email = a.email || a.applicant?.email || '—';
      const phone = a.phone || a.applicant?.phone || '—';
      return `<tr data-id="${esc(a._id)}"><td><div class="row-name">${esc(a.restaurantName)}</div><div class="row-sub">${esc((a.cuisine || []).join(', '))}</div></td><td>${esc(owner)}</td><td><div>${esc(email)}</div><div class="row-sub mono">${esc(phone)}</div></td><td class="mono">${formatDate(a.createdAt)}</td><td><span class="badge ${statusClass(a.status)}">${statusLabel(a.status)}</span></td><td><button class="btn btn-sm btn-ghost application-view-btn" data-id="${esc(a._id)}">Review</button></td></tr>`;
    }).join('')}</tbody></table>`;
    wrap.querySelectorAll('.application-view-btn').forEach(btn => btn.addEventListener('click', () => openReview(btn.dataset.id)));
  }

  function detailModal() {
    let m = document.getElementById('vendor-application-modal');
    if (m) return m;
    m = document.createElement('div'); m.id='vendor-application-modal'; m.className='modal-overlay';
    m.innerHTML = `<div class="modal-box" style="max-width:680px;"><div class="modal-head"><h3>Vendor application</h3><button class="modal-close" id="va-close">✕</button></div><div class="modal-body" id="va-body"><div class="state-block"><div class="spinner-lg"></div></div></div><div class="modal-foot" id="va-foot"><div class="modal-result" id="va-result"></div><button type="button" class="btn btn-ghost" id="va-cancel">Close</button><button type="button" class="btn btn-danger" id="va-reject">Reject</button><button type="button" class="btn btn-primary" id="va-approve">Approve</button></div></div>`;
    document.body.appendChild(m);
    m.querySelector('#va-close').onclick = () => closeModal('vendor-application-modal');
    m.querySelector('#va-cancel').onclick = () => closeModal('vendor-application-modal');
    return m;
  }

  async function openReview(id) {
    const m = detailModal();
    const body = m.querySelector('#va-body'); const result = m.querySelector('#va-result');
    const approve = m.querySelector('#va-approve'); const reject = m.querySelector('#va-reject');
    body.innerHTML = '<div class="state-block"><div class="spinner-lg"></div></div>'; result.className='modal-result'; result.textContent=''; reviewImageUrl = ''; reviewImageUrls = [];
    openModal('vendor-application-modal');
    try {
      const res = await apiRequest(`/admin/vendor-applications/${id}`); const a=res.data;
      const applicant=a.applicant||{};
      reviewImageUrls = Array.isArray(a.images) ? a.images.filter(Boolean).slice(0, 4) : (a.image ? [a.image] : []);
      reviewImageUrl = reviewImageUrls[0] || '';
      const pending = a.status === 'pending';
      const h = a.openingHours || {};
      const hoursHtml = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'].map(day => { const d=h[day]||{}; return `<div class="field"><label>${day[0].toUpperCase()+day.slice(1)}</label><div>${d.closed ? 'Closed' : `${esc(d.opensAt||'10:00')} – ${esc(d.closesAt||'22:00')}`}</div></div>`; }).join('');
      body.innerHTML = `<div style="display:grid;gap:14px;"><div><div class="field-help">Status</div><span class="badge ${statusClass(a.status)}">${statusLabel(a.status)}</span></div><div class="form-grid"><div class="field"><label>Owner</label><div>${esc(a.ownerName||applicant.name)}</div></div><div class="field"><label>Restaurant</label><div>${esc(a.restaurantName)}</div></div><div class="field"><label>Email</label><div>${esc(a.email||applicant.email)}</div></div><div class="field"><label>Phone</label><div>${esc(a.phone||applicant.phone)}</div></div><div class="field"><label>Cuisine</label><div>${esc((a.cuisine||[]).join(', '))}</div></div><div class="field"><label>FSSAI license / registration</label><div>${esc(a.fssaiLicenseNumber||'—')}</div></div><div class="field"><label>Address</label><div>${esc(a.address||'—')}</div></div><div class="field"><label>Minimum order</label><div>₹${Number(a.minOrder??0).toFixed(0)}</div></div><div class="field"><label>Delivery fee</label><div>₹${Number(a.deliveryFee??40).toFixed(0)}</div></div><div class="field"><label>Free delivery</label><div>${a.freeDeliveryEnabled === false ? 'Disabled' : `Above ₹${Number(a.freeDeliveryAbove??200).toFixed(0)}`}</div></div><div class="field"><label>Joining date</label><div>${a.status==='approved' && a.restaurantId?.createdAt ? formatDate(a.restaurantId.createdAt) : 'Set automatically when approved'}</div></div></div><div class="field"><label>Description</label><div>${esc(a.description||'—')}</div></div><div class="field"><label>Opening hours</label><div class="form-grid">${hoursHtml}</div></div>${a.location?.coordinates ? `<div class="field"><label>Coordinates</label><div class="mono">${esc(a.location.coordinates.join(', '))}</div></div>` : '<div class="field"><label>Coordinates</label><div>Missing</div></div>'}<div class="field"><label>Restaurant images ${pending ? '*' : ''}</label><div id="va-images-preview" style="display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px">${[0,1,2,3].map(i => `<div data-va-image-slot="${i}" style="height:90px;border:1px solid #e3e5ea;border-radius:10px;overflow:hidden;background:#f7f8fa;display:flex;align-items:center;justify-content:center;color:#667085;font-size:12px">${reviewImageUrls[i] ? `<img src="${esc(reviewImageUrls[i])}" alt="Restaurant image ${i+1}" style="width:100%;height:100%;object-fit:cover">` : `Image ${i+1}`}</div>`).join('')}</div>${pending ? '<div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-top:10px"><label class="btn btn-ghost btn-sm">Upload images<input id="va-image-files" type="file" accept="image/jpeg,image/png,image/webp,image/avif" multiple hidden></label><span class="hint" id="va-image-count">0 / 4 uploaded</span></div><div class="hint" id="va-image-status">Upload up to 4 restaurant images. The first image is the cover.</div>' : ''}</div>${a.rejectionReason ? `<div class="field"><label>Rejection reason</label><div>${esc(a.rejectionReason)}</div></div>`:''}</div>`;
      approve.style.display=pending?'inline-flex':'none'; reject.style.display=pending?'inline-flex':'none';
      const imageFiles = m.querySelector('#va-image-files');
      if (imageFiles) imageFiles.addEventListener('change', async () => {
        const files = Array.from(imageFiles.files || []).slice(0, 4);
        if (!files.length) return;
        const status=m.querySelector('#va-image-status'); const count=m.querySelector('#va-image-count');
        imageFiles.disabled=true; if(status) status.textContent='Uploading restaurant images…';
        try {
          const uploaded = await Promise.all(files.map(file => uploadImage(file, 'restaurants')));
          reviewImageUrls = uploaded.filter(Boolean).slice(0, 4);
          reviewImageUrl = reviewImageUrls[0] || '';
          const preview=m.querySelector('#va-images-preview');
          if(preview) preview.innerHTML=[0,1,2,3].map(i => `<div data-va-image-slot="${i}" style="height:90px;border:1px solid #e3e5ea;border-radius:10px;overflow:hidden;background:#f7f8fa;display:flex;align-items:center;justify-content:center;color:#667085;font-size:12px">${reviewImageUrls[i] ? `<img src="${esc(reviewImageUrls[i])}" alt="Restaurant image ${i+1}" style="width:100%;height:100%;object-fit:cover">` : `Image ${i+1}`}</div>`).join('');
          if(count) count.textContent=`${reviewImageUrls.length} / 4 uploaded`;
          if(status) status.textContent=`${reviewImageUrls.length} restaurant image${reviewImageUrls.length===1?'':'s'} uploaded. The first image is the cover.`;
        } catch(err){ if(status) status.textContent=err.message||'Image upload failed.'; }
        finally{ imageFiles.disabled=false; imageFiles.value=''; }
      });
      approve.onclick=()=>process(id,'approve'); reject.onclick=()=>process(id,'reject');
    } catch(err) { body.innerHTML=`<div class="state-block"><h4>Could not load application</h4><p>${esc(err.message)}</p></div>`; approve.style.display=reject.style.display='none'; }
  }

  async function process(id, action) {
    const m=document.getElementById('vendor-application-modal'); const result=m.querySelector('#va-result');
    let body = action==='approve' ? { images: reviewImageUrls.slice(0, 4) } : undefined;
    if(action==='reject') { const reason=prompt('Enter the rejection reason:'); if(reason===null)return; if(!reason.trim()) { result.textContent='A rejection reason is required.'; result.className='modal-result show error'; return; } body={reason:reason.trim()}; }
    if(action==='approve' && !reviewImageUrls.length) { result.textContent='Upload at least one restaurant image before approval.'; result.className='modal-result show error'; return; }
    if(action==='approve' && !confirm('Approve this vendor application and create the restaurant?')) return;
    const btn=m.querySelector(action==='approve'?'#va-approve':'#va-reject'); btn.disabled=true;
    try { const res=await apiRequest(`/admin/vendor-applications/${id}/${action}`,{method:'PATCH',body}); result.textContent=res.message||'Application updated.'; result.className='modal-result show success'; showToast(res.message||'Application updated.','success'); load(); setTimeout(()=>closeModal('vendor-application-modal'),700); }
    catch(err){ result.textContent=err.message||'Could not update application.'; result.className='modal-result show error'; }
    finally{btn.disabled=false;}
  }

  async function load() {
    wrap.innerHTML='<div class="state-block"><div class="spinner-lg"></div></div>';
    try {
      const res=await apiRequest('/admin/vendor-applications',{query:{status:state.status,page:state.page,limit:state.limit}});
      const items=res.data||[]; const pg=res.pagination||{page:state.page,limit:state.limit,total:items.length,pages:1};
      countEl.textContent=`${pg.total} application${pg.total===1?'':'s'}`; render(items);
      if(pg.pages>1){footer.style.display='flex';renderPagination(pagination,pageInfo,{page:pg.page,pages:pg.pages,total:pg.total},p=>{state.page=p;load();});} else footer.style.display='none';
    } catch(err){wrap.innerHTML=`<div class="state-block"><h4>Could not load applications</h4><p>${esc(err.message)}</p></div>`;}
  }
  filter.addEventListener('change',()=>{state.status=filter.value;state.page=1;load();});
  refresh.addEventListener('click',load);
  document.addEventListener('admin:view-changed',e=>{if(e.detail.view==='vendor-applications'){if(!loaded){loaded=true;load();}else load();}});
})();
