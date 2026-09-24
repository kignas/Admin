/* Eatswada Admin FCM worker. Data-only messages are rendered here once. */
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');
firebase.initializeApp({
  apiKey:'AIzaSyA0bqVE3RCmiJORcufx-v6Gew16GMCfFp0', authDomain:'eatswada.firebaseapp.com',
  projectId:'eatswada', storageBucket:'eatswada.firebasestorage.app', messagingSenderId:'644274579271',
  appId:'1:644274579271:web:ba72c4cd4f81c568fa0e62'
});
const messaging=firebase.messaging();
messaging.onBackgroundMessage(function(payload){
  const d=payload?.data||{};
  self.registration.showNotification(d.title||'New order received',{
    body:d.body||'A new order needs attention.', icon:'../icon-192.png', badge:'../icon-192.png',
    tag:d.orderId?'admin-order-'+d.orderId:'admin-order', renotify:true, requireInteraction:true, data:d,
    vibrate:[400,200,400,200,400]
  });
});
self.addEventListener('notificationclick',function(event){
  event.notification.close();
  const id=(event.notification.data||{}).orderId||'';
  event.waitUntil(clients.matchAll({type:'window',includeUncontrolled:true}).then(function(list){
    for(const c of list){ if('focus' in c){ c.postMessage({type:'admin-order-notification-click',orderId:id}); return c.focus(); } }
    return clients.openWindow('../index.html#manage-orders');
  }));
});
