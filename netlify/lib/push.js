/* Hutuma FCM kwa notifs mpya (zisizotumwa bado). pushLog/{id} inazuia kurudia.
   Ujumbe ni "data-only": service worker (firebase-messaging-sw.js) ndiyo inaonyesha arifa moja yenye
   profile ya kategoria (Oda / Ujumbe / Malipo / Usajili...), sauti na kitufe cha kufungua ukurasa husika. */
const cat=n=>{const x=(String(n.category||'')+' '+String(n.title||'')).toLowerCase();
  if(/ujumbe|chat/.test(x))return'ujumbe';if(/oda|order|mzigo|escrow/.test(x))return'oda';if(/usalama|tahadhari/.test(x))return'usalama';
  if(/ada |ada$|usajili|deni|vip|duka/.test(x))return'usajili';if(/malipo|wallet|commission|cashback|pesa/.test(x))return'malipo';if(/huduma|maoni/.test(x))return'huduma';return'mengine';};
const payload=(n,tokens)=>({tokens,
  data:{title:String(n.title||'Closer Market').slice(0,80),body:String(n.details||'').replace(/<[^>]*>/g,'').slice(0,160),kind:cat(n),tag:'ctm-'+cat(n)+'-'+String(n.id||'')},
  android:{priority:'high'},webpush:{headers:{Urgency:'high',TTL:'86400'},fcmOptions:{link:'/'}}});
module.exports=async(db,admin)=>{const since=Date.now()-15*60*1000,s=await db.collection('notifs').where('ts','>',since).orderBy('ts','desc').limit(60).get(),uidOf={};let sent=0;
  for(const d of s.docs){const n=d.data();if(!n||n.id==null)continue;
    try{await db.doc('pushLog/'+n.id).create({ts:Date.now()});}catch(e){continue;}
    let uid=n.toUid;if(!uid){if(!(n.toId in uidOf)){const q=await db.collection('accounts').where('id','==',n.toId).limit(1).get();uidOf[n.toId]=q.empty?null:q.docs[0].id;}uid=uidOf[n.toId];}
    if(!uid)continue;const tokens=(((await db.doc('private/'+uid).get()).data()||{}).fcmTokens||[]).filter(Boolean);if(!tokens.length)continue;
    try{await admin.messaging().sendEachForMulticast(payload(n,tokens));sent++;}catch(e){console.warn('fcm',e.message);}}
  return sent;};
module.exports.payload=payload;
