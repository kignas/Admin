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

  // ── Active API environment chip (informational only) ────────
  const envChip = document.getElementById('env-chip');
  if (envChip && window.CONFIG) {
    const host = (() => { try { return new URL(CONFIG.API_BASE_URL).host; } catch (_) { return CONFIG.API_BASE_URL; } })();
    envChip.textContent = CONFIG.ENVIRONMENT === 'render' ? 'Render API' : host;
    envChip.title = `Active API host: ${CONFIG.API_BASE_URL}`;
  }

  // ── Sidebar routing ─────────────────────────────────────────
  const PAGE_META = {
    dashboard:            { title: 'Dashboard',            sub: 'Live operational snapshot from the Eatswada backend' },
    'home-banners':      { title: 'Header & Banners',     sub: 'Control the customer homepage hero and promotions' },
    'create-vendor':      { title: 'Create Vendor',        sub: 'Onboard a new restaurant partner' },
    'vendor-applications': { title: 'Vendor Applications', sub: 'Review, request changes, approve or reject restaurant applications' },
    'menu-approvals':     { title: 'Menu Approvals',       sub: 'Approve or reject vendor-submitted menu items' },
    'manage-vendors':     { title: 'Manage Vendors',       sub: 'Vendor accounts and their restaurants' },
    'manage-restaurants': { title: 'Manage Restaurants',   sub: 'Every restaurant live on Eatswada' },
    'manage-reviews':      { title: 'Manage Reviews',       sub: 'Verified customer feedback and moderation' },
    'platform-ratings':   { title: 'Rate Us Feedback',    sub: 'Customer feedback about the Eatswada platform' },
    'manage-orders':      { title: 'Manage Orders',        sub: 'Track orders, advance status and assign riders' },
    'manage-riders':      { title: 'Manage Riders',        sub: 'Delivery riders and their live status' },
    'manage-customers':   { title: 'Manage Customers',     sub: 'Customers ordering on Eatswada' },
    'manage-categories':  { title: 'Manage Categories',    sub: '"What\'s on your mind?" homepage categories' },
    'manage-menu':        { title: 'Manage Menu',          sub: 'Menu items across every restaurant on Eatswada' },
    settlements:          { title: 'Settlements & Payouts', sub: 'Ledger, commission and vendor payout requests' },
    coupons:              { title: 'Offers & Coupons',     sub: 'Platform discount codes and usage limits' },
    support:              { title: 'Support Tickets',      sub: 'Vendor support conversations and replies' },
    analytics:            { title: 'Analytics & Reports',  sub: 'Revenue trends and restaurant performance' },
    notifications:        { title: 'Notifications',        sub: 'Notifications delivered to this admin account' },
    'admin-settings':     { title: 'Admin Settings',       sub: 'Account, permissions and platform configuration' },
  };

  const navItems = document.querySelectorAll('.nav-item[data-view]');
  const views = document.querySelectorAll('.view');
  const pageTitle = document.getElementById('page-title');
  const pageSub = document.getElementById('page-sub');

  // ── Mobile drawer ───────────────────────────────────────────
  const sidebar = document.querySelector('.sidebar');
  const backdrop = document.getElementById('sidebar-backdrop');
  const sidebarToggle = document.getElementById('sidebar-toggle');

  function setDrawer(open) {
    if (!sidebar) return;
    document.body.classList.toggle('nav-open', open);
    if (backdrop) backdrop.classList.toggle('show', open);
    if (sidebarToggle) sidebarToggle.setAttribute('aria-expanded', String(open));
  }

  sidebarToggle?.addEventListener('click', () => {
    setDrawer(!document.body.classList.contains('nav-open'));
  });
  backdrop?.addEventListener('click', () => setDrawer(false));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') setDrawer(false);
  });

  function goToView(name) {
    if (!PAGE_META[name]) return;

    navItems.forEach(btn => btn.classList.toggle('active', btn.dataset.view === name));
    views.forEach(v => v.classList.toggle('active', v.id === `view-${name}`));

    pageTitle.textContent = PAGE_META[name].title;
    pageSub.textContent = PAGE_META[name].sub;

    window.location.hash = name;
    setDrawer(false);
    document.dispatchEvent(new CustomEvent('admin:view-changed', { detail: { view: name } }));
  }

  // Exposed so dashboard quick actions / "View all" buttons can navigate.
  window.adminGoToView = goToView;

  navItems.forEach(btn => {
    btn.addEventListener('click', () => goToView(btn.dataset.view));
  });

  // Delegated navigation for any element with data-goto="view-name".
  document.addEventListener('click', (e) => {
    const trigger = e.target.closest('[data-goto]');
    if (trigger && PAGE_META[trigger.dataset.goto]) goToView(trigger.dataset.goto);
  });

  const initial = (window.location.hash || '').replace('#', '');
  const initialView = PAGE_META[initial] ? initial : 'dashboard';

  // Defer the first navigation so every module script (loaded after this one)
  // has registered its `admin:view-changed` listener before it fires —
  // including modules that initialise their listeners inside DOMContentLoaded.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(() => goToView(initialView), 0), { once: true });
  } else {
    setTimeout(() => goToView(initialView), 0);
  }
})();
