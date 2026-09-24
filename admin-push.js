/* Eatswada Admin — production FCM registration + foreground notifications. */
(function () {
  'use strict';
  const VAPID_KEY = 'BKad9s8WW_Bfl0CZxH4tSRHyYJZOou5kIOcKBZ40xNmtqHPTVvntKB93BF1DGPQt9U_aQuv5iM1Ui_vNz5Ll-NA';
  const FIREBASE_CONFIG = {
    apiKey: 'AIzaSyA0bqVE3RCmiJORcufx-v6Gew16GMCfFp0',
    authDomain: 'eatswada.firebaseapp.com', projectId: 'eatswada',
    storageBucket: 'eatswada.firebasestorage.app', messagingSenderId: '644274579271',
    appId: '1:644274579271:web:ba72c4cd4f81c568fa0e62'
  };
  let started = false;
  let acknowledged = false;

  async function acknowledgeAdminNewOrders() {
    if (acknowledged || !window.AdminAuth?.isLoggedIn || !AdminAuth.isLoggedIn()) return;
    try {
      const res = await fetch(CONFIG.API_BASE_URL + '/notifications/admin-new-orders/acknowledge', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + AdminAuth.getToken(), 'Content-Type': 'application/json' }
      });
      if (res.ok) acknowledged = true;
    } catch (_) {}
  }

  async function initAdminPush() {
    if (started || !window.AdminAuth?.isLoggedIn || !AdminAuth.isLoggedIn()) return;
    // Opening the admin portal acknowledges all pending admin new-order alerts.
    // This is the server-side stop signal for the repeating admin ring.
    await acknowledgeAdminNewOrders();
    if (!('serviceWorker' in navigator) || !('Notification' in window) || !window.firebase?.messaging) return;
    try {
      if (!firebase.apps.length) firebase.initializeApp(FIREBASE_CONFIG);
      const reg = await navigator.serviceWorker.register('./fcm/firebase-messaging-sw.js', { scope: './fcm/' });
      if (Notification.permission === 'default') {
        // Permission is requested only from a user gesture; otherwise the
        // browser may reject it silently.
        return;
      }
      if (Notification.permission !== 'granted') return;
      const messaging = firebase.messaging();
      const token = await messaging.getToken({ vapidKey: VAPID_KEY, serviceWorkerRegistration: reg });
      if (!token) return;
      const res = await fetch(CONFIG.API_BASE_URL + '/notifications/register-token', {
        method: 'POST', headers: { Authorization: 'Bearer ' + AdminAuth.getToken(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ token })
      });
      if (!res.ok) throw new Error('Admin notification token registration failed.');
      started = true;
      messaging.onMessage(function (payload) {
        const d = payload?.data || {};
        if (d.type !== 'admin_new_order') return;
        // The admin portal is open and has received the alert, so stop the
        // server-side repeat ring for this admin.
        acknowledgeAdminNewOrders();
        try {
          if (Notification.permission === 'granted') {
            new Notification(d.title || 'New order received', {
              body: d.body || 'A new order needs attention.',
              icon: './icon-192.png', tag: d.orderId ? 'admin-order-' + d.orderId : 'admin-order',
              renotify: true, requireInteraction: true
            });
          }
        } catch (_) {}
        try { if (typeof window.refreshAdminOrders === 'function') window.refreshAdminOrders(); } catch (_) {}
      });
    } catch (err) { console.warn('[ADMIN PUSH]', err?.message || err); }
  }
  // Browser permission must be requested after a gesture.
  document.addEventListener('pointerdown', function () { initAdminPush(); }, { once: true });
  // If permission was already granted, initialize immediately.
  if (typeof Notification !== 'undefined' && Notification.permission === 'granted') initAdminPush();
})();
