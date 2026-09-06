(function(){
  const wrap=document.getElementById('platform-ratings-admin-wrap');
  const summaryEl=document.getElementById('platform-rating-summary');
  const refresh=document.getElementById('platform-ratings-refresh-btn');
  if(!wrap)return;
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const stars=n=>'★★★★★'.split('').map((_,i)=>`<span style="opacity:${i<Number(n)?1:.18}">★</span>`).join('');
  function card(label,value){return `<div style="background:#fff;border:1px solid var(--line,#e5e7eb);border-radius:14px;padding:14px 16px"><div style="font-size:11px;color:#6b7280;font-weight:700;text-transform:uppercase;letter-spacing:.06em">${label}</div><div style="font-size:22px;font-weight:800;margin-top:4px">${value}</div></div>`}
  async function load(){
    wrap.innerHTML='<div class="state-block"><div class="spinner-lg"></div></div>';
    try{
      const r=await apiRequest('/admin/platform-ratings?limit=100');
      const rows=r.data||[], s=r.summary||{};
      summaryEl.innerHTML=card('Average rating',s.count?`${Number(s.average||0).toFixed(1)} ★`:'—')+card('Total submissions',Number(s.count||0))+card('5-star ratings',Number(s.distribution?.['5']||0));
      if(!rows.length){wrap.innerHTML='<div class="state-block"><h4>No Rate Us feedback yet</h4><p>Customer platform ratings will appear here when submitted.</p></div>';return;}
      wrap.innerHTML=`<table class="data-table"><thead><tr><th>Customer</th><th>Rating</th><th>Feedback</th><th>Date</th></tr></thead><tbody>${rows.map(x=>`<tr><td>${esc(x.user?.name||'Customer')}<div class="row-sub">${esc(x.user?.phone||x.user?.email||'')}</div></td><td class="mono">${stars(x.score)}<div style="font-size:10px;margin-top:3px">${Number(x.score)}/5</div></td><td style="max-width:420px;white-space:normal">${esc(x.comment||'—')}</td><td>${x.createdAt?new Date(x.createdAt).toLocaleString('en-IN',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}):'—'}</td></tr>`).join('')}</tbody></table>`;
    }catch(e){wrap.innerHTML=`<div class="state-block"><h4>Could not load Rate Us feedback</h4><p>${esc(e.message||e)}</p></div>`;summaryEl.innerHTML='';}
  }
  refresh?.addEventListener('click',load);
  document.addEventListener('admin:view-changed',e=>{if(e.detail.view==='platform-ratings')load()});
})();
