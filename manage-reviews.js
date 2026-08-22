(function(){
  const wrap=document.getElementById('reviews-admin-wrap'); const refresh=document.getElementById('reviews-refresh-btn'); if(!wrap)return;
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  async function load(){
    wrap.innerHTML='<div class="state-block"><div class="spinner-lg"></div></div>';
    try{const r=await apiRequest('/admin/reviews?limit=50');const rows=r.data||[];if(!rows.length){wrap.innerHTML='<div class="state-block"><h4>No reviews</h4><p>Verified reviews will appear here after delivered orders are reviewed.</p></div>';return;}
      wrap.innerHTML=`<table class="data-table"><thead><tr><th>Restaurant</th><th>Customer</th><th>Rating</th><th>Review</th><th>Date</th><th>Status</th><th></th></tr></thead><tbody>${rows.map(x=>`<tr><td>${esc(x.restaurant?.name||'—')}</td><td>${esc(x.user?.name||'Customer')}<div class="row-sub">${esc(x.user?.phone||'')}</div></td><td class="mono">${x.score} ★</td><td style="max-width:280px;white-space:normal">${esc(x.comment||'—')}</td><td>${x.createdAt?new Date(x.createdAt).toLocaleDateString('en-IN'):''}</td><td>${x.isVisible?'<span class="badge badge-success">Visible</span>':'<span class="badge badge-danger">Hidden</span>'}</td><td><button class="btn btn-sm btn-ghost review-toggle" data-id="${x._id}" data-visible="${x.isVisible}">${x.isVisible?'Hide':'Show'}</button></td></tr>`).join('')}</tbody></table>`;
      wrap.querySelectorAll('.review-toggle').forEach(b=>b.onclick=async()=>{try{await apiRequest(`/admin/reviews/${b.dataset.id}`,{method:'PATCH',body:{isVisible:b.dataset.visible!=='true'}});load();}catch(e){alert(e.message||'Could not update review');}});
    }catch(e){wrap.innerHTML=`<div class="state-block"><h4>Could not load reviews</h4><p>${esc(e.message||e)}</p></div>`;}
  }
  refresh?.addEventListener('click',load);document.addEventListener('admin:view-changed',e=>{if(e.detail.view==='manage-reviews')load();});
})();
