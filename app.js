(function () {
  // ── Auth guard ──────────────────────────────────────────────
  if (!AdminAuth.isLoggedIn()) {
    window.location.href = 'login.html';
    return;
  }

  const admin = AdminAuth.getAdmin();
  if (admin) {
    document.getElementById('admin-name').textContent = admin.name || 'Admin';
    document.getElementById('admin-role').textContent = (admin.role || 'admin').toUpperCase();
    document.getElementById('admin-avatar').textContent = initials(admin.name);
  }

  document.getElementById('logout-btn').addEventListener('click', () => {
    AdminAuth.logout();
  });

  // ── Sidebar routing ─────────────────────────────────────────
  const PAGE_META = {
    dashboard:            { title: 'Dashboard',            sub: 'Live snapshot of the Nearbite ops today' },
    'create-vendor':      { title: 'Create Vendor',        sub: 'Onboard a new restaurant partner' },
    'manage-vendors':     { title: 'Manage Vendors',       sub: 'Vendor accounts and their restaurants' },
    'manage-restaurants': { title: 'Manage Restaurants',   sub: 'Every restaurant live on Nearbite' },
    'manage-reviews':      { title: 'Manage Reviews',       sub: 'Verified customer feedback and moderation' },
    'manage-orders':      { title: 'Manage Orders',        sub: 'Track and update order status' },
    'manage-riders':      { title: 'Manage Riders',        sub: 'Delivery riders and their live status' },
    'manage-customers':   { title: 'Manage Customers',     sub: 'Customers ordering on Nearbite' },
    'manage-categories':  { title: 'Manage Categories',    sub: '"What\'s on your mind?" homepage categories' },
    'manage-menu':        { title: 'Manage Menu',          sub: 'Menu items across every restaurant on Nearbite' },
  };

  const navItems = document.querySelectorAll('.nav-item[data-view]');
  const views = document.querySelectorAll('.view');
  const pageTitle = document.getElementById('page-title');
  const pageSub = document.getElementById('page-sub');

  function goToView(name) {
    if (!PAGE_META[name]) return;

    navItems.forEach(btn => btn.classList.toggle('active', btn.dataset.view === name));
    views.forEach(v => v.classList.toggle('active', v.id === `view-${name}`));

    pageTitle.textContent = PAGE_META[name].title;
    pageSub.textContent = PAGE_META[name].sub;

    window.location.hash = name;
    document.dispatchEvent(new CustomEvent('admin:view-changed', { detail: { view: name } }));
  }

  navItems.forEach(btn => {
    btn.addEventListener('click', () => goToView(btn.dataset.view));
  });

  const initial = (window.location.hash || '').replace('#', '');
  goToView(PAGE_META[initial] ? initial : 'dashboard');
})();
