/* Service worker moja: PWA (kuweka kama app) + push ya FCM */
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js','https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');
firebase.initializeApp({apiKey:"AIzaSyCMZ9q0QQU9v9ctyyTWjjkMCSZpvKt66Fs",authDomain:"closer-to-market.firebaseapp.com",projectId:"closer-to-market",storageBucket:"closer-to-market.firebasestorage.app",messagingSenderId:"919367487706",appId:"1:919367487706:web:aac9f57f40737a8a6ed5e3"});
/* Arifa za nyuma (app imefungwa): kila arifa ina profile ya kategoria (Oda, Ujumbe, Malipo, Usajili...), inatoa sauti/mtetemo,
   na ikibonyezwa inafungua ukurasa husika ndani ya app (si ujumbe wa kawaida wa browser). */
const CATS={oda:['📦','Oda','oda'],ujumbe:['💬','Ujumbe','ujumbe'],malipo:['💰','Malipo','akaunti'],usajili:['🏪','Usajili & Ada','akaunti'],huduma:['⭐','Huduma','akaunti'],usalama:['🛡','Usalama','akaunti'],mengine:['🔔','Taarifa','akaunti']};
function ctmShow(d){const k=CATS[d.kind]||CATS.mengine;
  return self.registration.showNotification(k[0]+' '+k[1]+' • '+(d.title||'Closer Market'),{body:d.body||'',icon:'icons/icon-192.png',badge:'icons/icon-192.png',tag:d.tag||('ctm-'+(d.kind||'x')),renotify:true,silent:false,requireInteraction:false,vibrate:[200,100,200,100,200],timestamp:Date.now(),data:{tab:k[2],kind:d.kind||'mengine',chatId:d.chatId||null}});}
firebase.messaging().onBackgroundMessage(p=>{const d=p.data||{},n=p.notification||{};if(!d.title&&!n.title)return;return ctmShow({title:d.title||n.title,body:d.body||n.body,kind:d.kind,tag:d.tag,chatId:d.chatId});});
self.addEventListener('notificationclick',e=>{e.notification.close();const d=e.notification.data||{};
  e.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(cs=>{const c=cs.find(x=>'focus' in x);
    if(c){c.postMessage({type:'ctm-open',tab:d.tab,kind:d.kind,chatId:d.chatId});return c.focus();}
    return self.clients.openWindow('./?open='+encodeURIComponent(d.tab||'akaunti')+(d.chatId?'&chat='+encodeURIComponent(d.chatId):''));}));});
const CACHE='ctm-v36',SHELL=['./','index.html','manifest.webmanifest','icons/icon-192.png','icons/icon-512.png'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting()).catch(()=>self.skipWaiting()));});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',e=>{const r=e.request,u=new URL(r.url);if(r.method!=='GET'||u.origin!==location.origin)return;
  if(r.mode==='navigate'){e.respondWith(fetch(r).then(res=>{const cp=res.clone();caches.open(CACHE).then(c=>c.put('index.html',cp));return res;}).catch(()=>caches.match('index.html')));return;}
  e.respondWith(caches.match(r).then(m=>m||fetch(r).then(res=>{const cp=res.clone();caches.open(CACHE).then(c=>c.put(r,cp));return res;})));});
