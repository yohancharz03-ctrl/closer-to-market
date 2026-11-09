/* Service worker moja: PWA (kuweka kama app) + push ya FCM */
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js','https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');
firebase.initializeApp({apiKey:"AIzaSyCMZ9q0QQU9v9ctyyTWjjkMCSZpvKt66Fs",authDomain:"closer-to-market.firebaseapp.com",projectId:"closer-to-market",storageBucket:"closer-to-market.firebasestorage.app",messagingSenderId:"919367487706",appId:"1:919367487706:web:aac9f57f40737a8a6ed5e3"});
firebase.messaging().onBackgroundMessage(p=>self.registration.showNotification(p.notification.title,{body:p.notification.body,icon:'icons/icon-192.png'}));
const CACHE='ctm-v23',SHELL=['./','index.html','manifest.webmanifest','icons/icon-192.png','icons/icon-512.png'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting()).catch(()=>self.skipWaiting()));});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',e=>{const r=e.request,u=new URL(r.url);if(r.method!=='GET'||u.origin!==location.origin)return;
  if(r.mode==='navigate'){e.respondWith(fetch(r).then(res=>{const cp=res.clone();caches.open(CACHE).then(c=>c.put('index.html',cp));return res;}).catch(()=>caches.match('index.html')));return;}
  e.respondWith(caches.match(r).then(m=>m||fetch(r).then(res=>{const cp=res.clone();caches.open(CACHE).then(c=>c.put(r,cp));return res;})));});
