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
  const isApplication = d.type === 'admin_new_application';
  if (!isApplication && d.type !== 'admin_new_order') return;
  self.registration.showNotification(d.title||(isApplication?'New restaurant application':'New order received'),{
    body:d.body||(isApplication?'A restaurant application needs review.':'A new order needs attention.'), icon:'../icon-192.png', badge:'../icon-192.png',
    tag:isApplication?'admin-application-'+(d.applicationId||'new'):(d.orderId?'admin-order-'+d.orderId:'admin-order'),
    renotify:true, requireInteraction:true, data:d, vibrate:[400,200,400,200,400]
  });
});
self.addEventListener('notificationclick',function(event){
  event.notification.close();
  const data=event.notification.data||{};
  const isApplication=data.type==='admin_new_application';
  const id=isApplication?(data.applicationId||''):(data.orderId||'');
  const target=isApplication?'vendor-applications':'orders';
  event.waitUntil(clients.matchAll({type:'window',includeUncontrolled:true}).then(function(list){
    for(const c of list){ if('focus' in c){ c.postMessage({type:isApplication?'admin-application-notification-click':'admin-order-notification-click',applicationId:isApplication?id:'',orderId:isApplication?'':id}); return c.focus(); } }
    return clients.openWindow('../index.html#'+target);
  }));
});
