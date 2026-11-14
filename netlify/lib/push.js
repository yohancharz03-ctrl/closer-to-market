/* PUSH (FCM) kwa notifs mpya NA ujumbe wa chat. Ujumbe ni "data-only": service worker (firebase-messaging-sw.js) inaonyesha arifa moja
   yenye profile ya kategoria (📦 Oda, 💬 Ujumbe, 💰 Malipo...), sauti, na kufungua ukurasa husika hata app ikiwa imefungwa.
   - sweep(db,admin,windowMs): hutuma zisizotumwa bado (pushLog inazuia kurudia). Inaendeshwa kila dakika (push-sweep) na
     mara moja baada ya kila POST kwenye /api/* (kick) ili arifa zifike ndani ya sekunde chache.
   - sendTo(): hutuma kwa vifaa vyote vya mtumiaji na kufuta token zilizokufa. */
const cat=n=>{const x=(String(n.category||'')+' '+String(n.title||'')).toLowerCase();
  if(/ujumbe|chat/.test(x))return'ujumbe';if(/oda|order|mzigo|escrow/.test(x))return'oda';if(/usalama|tahadhari/.test(x))return'usalama';
  if(/ada |ada$|usajili|deni|vip|duka/.test(x))return'usajili';if(/malipo|wallet|commission|cashback|pesa|kutoa/.test(x))return'malipo';if(/huduma|maoni/.test(x))return'huduma';return'mengine';};
const strip=s=>String(s||'').replace(/<[^>]*>/g,'');
const str=o=>Object.fromEntries(Object.entries(o).filter(([,v])=>v!=null).map(([k,v])=>[k,String(v)]));
const done=new Set(); // kumbukumbu ya instance ya sasa: inapunguza usomaji wa mara kwa mara

async function sendTo(db,admin,uid,data){
  const ref=db.doc('private/'+uid),tokens=[...new Set((((await ref.get()).data()||{}).fcmTokens||[]).filter(Boolean))];
  if(!tokens.length)return{tokens:0,sent:0,failed:0,errors:[]};
  const r=await admin.messaging().sendEachForMulticast({tokens,data:str(data),android:{priority:'high'},webpush:{headers:{Urgency:'high',TTL:'86400'},fcmOptions:{link:'/'}}});
  const bad=[],errors=[];r.responses.forEach((x,i)=>{if(!x.success){const c=(x.error&&x.error.code)||'error';errors.push(c);if(/registration-token-not-registered|invalid-registration-token/.test(c))bad.push(tokens[i]);}});
  if(bad.length)await ref.update({fcmTokens:admin.firestore.FieldValue.arrayRemove(...bad)}).catch(()=>{});
  return{tokens:tokens.length,sent:r.successCount,failed:r.failureCount,errors};}

async function sweep(db,admin,windowMs){let sent=0;const since=Date.now()-(windowMs||15*60*1000),uidOf={},accs={};
  const claim=async id=>{if(done.has(id))return false;done.add(id);if(done.size>5000)done.clear();try{await db.doc('pushLog/'+id).create({ts:Date.now()});return true;}catch(e){return false;}};
  // 1) notifs
  const s=await db.collection('notifs').where('ts','>',since).orderBy('ts','desc').limit(60).get();
  for(const d of s.docs){const n=d.data();if(!n||n.id==null)continue;if(!(await claim(String(n.id))))continue;
    let uid=n.toUid;if(!uid){if(!(n.toId in uidOf)){const q=await db.collection('accounts').where('id','==',n.toId).limit(1).get();uidOf[n.toId]=q.empty?null:q.docs[0].id;}uid=uidOf[n.toId];}
    if(!uid)continue;
    try{const r=await sendTo(db,admin,uid,{title:String(n.title||'Closer Market').slice(0,80),body:strip(n.details).slice(0,160),kind:cat(n),tag:'ctm-'+cat(n)+'-'+n.id});sent+=r.sent;}catch(e){console.warn('fcm',e.message);}}
  // 2) ujumbe wa chat (ndani ya dakika chache; ujumbe mmoja kwa kila sekunde 10 kwa kila chat/mpokeaji)
  const ms=await db.collection('messages').where('ts','>',since).orderBy('ts','desc').limit(60).get();
  const acc=async uid=>accs[uid]||(accs[uid]=(await db.doc('accounts/'+uid).get()).data()||{});
  for(const d of ms.docs){const m=d.data(),mem=(m&&m.members)||[];if(mem.length!==2||m.from==null)continue;if(done.has('m'+d.id))continue;done.add('m'+d.id);
    const a0=await acc(mem[0]),a1=await acc(mem[1]),sender=a0.id===m.from?a0:a1.id===m.from?a1:null,rcv=sender===a0?mem[1]:mem[0];if(!sender||!rcv)continue;
    if(!(await claim('mb-'+m.chatId+'-'+rcv+'-'+Math.floor((m.ts||0)/10000))))continue;
    try{const r=await sendTo(db,admin,rcv,{title:String(sender.shopName||sender.name||'Ujumbe').slice(0,60),body:strip(m.text||'📎 Faili').slice(0,120),kind:'ujumbe',tag:'ctm-ujumbe-'+m.chatId,chatId:m.chatId});sent+=r.sent;}catch(e){console.warn('fcm msg',e.message);}}
  return sent;}

const kick=(db,admin)=>Promise.race([sweep(db,admin,3*60*1000).catch(e=>console.warn('kick',e.message)),new Promise(r=>setTimeout(r,2000))]);
module.exports=(db,admin)=>sweep(db,admin);
module.exports.sendTo=sendTo;module.exports.kick=kick;module.exports.sweep=sweep;module.exports.cat=cat;
