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
    body.innerHTML = '<div class="state-block"><div class="spinner-lg"></div></div>'; result.className='modal-result'; result.textContent='';
    openModal('vendor-application-modal');
    try {
      const res = await apiRequest(`/admin/vendor-applications/${id}`); const a=res.data;
      const applicant=a.applicant||{};
      body.innerHTML = `<div style="display:grid;gap:14px;"><div><div class="field-help">Status</div><span class="badge ${statusClass(a.status)}">${statusLabel(a.status)}</span></div><div class="form-grid"><div class="field"><label>Owner</label><div>${esc(a.ownerName||applicant.name)}</div></div><div class="field"><label>Restaurant</label><div>${esc(a.restaurantName)}</div></div><div class="field"><label>Email</label><div>${esc(a.email||applicant.email)}</div></div><div class="field"><label>Phone</label><div>${esc(a.phone||applicant.phone)}</div></div><div class="field"><label>Cuisine</label><div>${esc((a.cuisine||[]).join(', '))}</div></div><div class="field"><label>Address</label><div>${esc(a.address||'—')}</div></div></div><div class="field"><label>Description</label><div>${esc(a.description||'—')}</div></div>${a.location?.coordinates ? `<div class="field"><label>Coordinates</label><div class="mono">${esc(a.location.coordinates.join(', '))}</div></div>` : ''}${a.rejectionReason ? `<div class="field"><label>Rejection reason</label><div>${esc(a.rejectionReason)}</div></div>`:''}</div>`;
      const pending=a.status==='pending'; approve.style.display=pending?'inline-flex':'none'; reject.style.display=pending?'inline-flex':'none';
      approve.onclick=()=>process(id,'approve'); reject.onclick=()=>process(id,'reject');
    } catch(err) { body.innerHTML=`<div class="state-block"><h4>Could not load application</h4><p>${esc(err.message)}</p></div>`; approve.style.display=reject.style.display='none'; }
  }

  async function process(id, action) {
    const m=document.getElementById('vendor-application-modal'); const result=m.querySelector('#va-result');
    let body;
    if(action==='reject') { const reason=prompt('Enter the rejection reason:'); if(reason===null)return; if(!reason.trim()) { result.textContent='A rejection reason is required.'; result.className='modal-result show error'; return; } body={reason:reason.trim()}; }
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
