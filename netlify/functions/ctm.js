/* CTM Trust-Flow: seva ya malipo (Netlify Function). Njia:
   POST /api/sms-in   (Forwarder, header x-secret)  -> inahifadhi SMS halisi ya CTM
   POST /api/claim    (mteja, Bearer idToken)       -> {text, mode:'deposit'|'order', orderIds:[]}
   POST /api/admin    (admin, Bearer idToken)       -> {action:'approve'|'reject', txId}
   Env: FIREBASE_SERVICE_ACCOUNT (JSON), SMS_SECRET */
const admin=require('firebase-admin');
if(!admin.apps.length)admin.initializeApp({credential:admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT))});
const db=admin.firestore(),inc=admin.firestore.FieldValue.increment,union=admin.firestore.FieldValue.arrayUnion;
const R=(c,o)=>({statusCode:c,headers:{'content-type':'application/json'},body:JSON.stringify(o)});
const rid=()=>Date.now()*1000+Math.floor(Math.random()*1000),P=u=>db.doc('private/'+u);

/* Msomaji wa SMS (mitandao yote). Kinachoshindikana kinaenda kwa admin. */
function parse(t){t=String(t||'').replace(/\s+/g,' ');
  const tok=(t.match(/\b[A-Za-z0-9][A-Za-z0-9.]{7,24}[A-Za-z0-9]\b/g)||[]).find(x=>/[A-Za-z]/.test(x)&&/\d/.test(x)&&!/^(\+?255|0)\d+$/.test(x));
  const id=(t.match(/(?:Transaction ID|Muamala|Miamala|Trans(?:action)? ?(?:ID|No)|Reference|Kumbukumbu|Ref|TxnId|TID)[:.\s#-]*([A-Za-z0-9][A-Za-z0-9.]{6,24}[A-Za-z0-9])/i)||[])[1]||tok;
  const am=(t.match(/(?:TZS|TSh|Tsh)\.?\s?([\d][\d,]*(?:\.\d+)?)/i)||t.match(/([\d][\d,]*(?:\.\d+)?)\s?(?:TZS|TSh|Tsh)/i)||[])[1];
  const nm=(t.match(/(?:kutoka kwa|kutoka|from)\s+([A-Za-z][A-Za-z .'-]{2,40}?)(?=\s+(?:\d|\+|on |tarehe|kwa |Salio|Bal|at )|[.,]|$)/i)||[])[1];
  const ph=(t.match(/(?:\+?255|0)[67]\d{8}/)||[])[0];
  const dt=(t.match(/\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4}(?:\s+(?:saa\s+|at\s+)?\d{1,2}[:.]\d{2})?/i)||[])[0];
  return{txId:id&&id.toUpperCase(),amount:am?Math.round(parseFloat(am.replace(/,/g,''))):0,name:(nm||'').trim(),phone:ph?ph.slice(-9):'',date:dt||''};}
const norm=s=>String(s||'').toLowerCase().replace(/[^a-z ]/g,'').split(' ').filter(x=>x.length>2);
const note=(t,a,title,details)=>{const id=rid();t.set(db.doc('notifs/'+id),{id,toId:a.id,toUid:a.uid,title,category:'Oda & Malipo',details,read:false,ts:Date.now()});};
const led=(t,kind,amount,ref,n)=>{const id=rid();t.set(db.doc('ledger/'+id),{id,kind,amount,ref:String(ref||''),note:n||'',ts:Date.now()});};

/* Hesabu ya Ledger: tx ya kweli (bankTx) ndiyo chanzo cha kiasi, si maandishi ya mteja. */
async function settle(txId,claim,force){
  return db.runTransaction(async t=>{
    const bref=db.doc('bankTx/'+txId),cref=db.doc('claims/'+txId),b=await t.get(bref),c=await t.get(cref);
    if(!b.exists)return{status:'waiting'};const bt=b.data();if(bt.usedBy)return{status:'duplicate'};
    const cl=c.exists?c.data():claim;if(!cl)return{status:'waiting'};if(c.exists&&cl.status==='done')return{status:'duplicate'};
    const acc=(await t.get(db.doc('accounts/'+cl.uid))).data()||{};
    const ok=force||(bt.phone&&acc.phone&&String(acc.phone).replace(/\D/g,'').slice(-9)===bt.phone)||norm(bt.name).some(w=>norm(acc.name).includes(w));
    if(!ok){t.set(cref,Object.assign({},cl,{status:'review',amount:bt.amount}));return{status:'review'};}
    const amt=bt.amount;let ex=amt,held=[];
    if(cl.mode==='order'){
      const os=await Promise.all((cl.orderIds||[]).slice(0,20).map(id=>t.get(db.doc('orders/'+id))));
      const list=os.filter(s=>s.exists&&s.data().customerUid===cl.uid&&s.data().payStatus==='PENDING');
      const need=list.reduce((s,x)=>s+x.data().total,0);
      if(!list.length)return{status:'no_order'};
      if(amt<need){t.set(cref,Object.assign({},cl,{status:'short',amount:amt,need}));return{status:'short',need,amount:amt};} // inabaki PENDING
      list.forEach(s=>{const o=s.data();t.update(s.ref,{payStatus:'HELD_IN_ESCROW',status:'Inaandaliwa',stage:2,escrow:o.total,txId,paidAt:Date.now()});
        note(t,{id:o.vendorId,uid:o.vendorUid},'Oda Imelipiwa Kikamilifu',`Oda ${o.id} imelipiwa na kuhakikiwa na Ledger. Tafadhali anza kuandaa mzigo!`);held.push(o.id);});
      ex=amt-need;led(t,'escrow_in',need,txId,'Escrow '+held.join(','));
    }
    if(ex>0){t.set(P(cl.uid),{walletBalance:inc(ex),tx:union({t:cl.mode==='order'?'Ziada ya oda':'Deposit',a:ex,n:txId,ts:Date.now()})},{merge:true});led(t,'wallet_in',ex,txId,'Wallet '+cl.uid);}
    t.update(bref,{usedBy:cl.uid,usedAt:Date.now()});t.set(cref,Object.assign({},cl,{status:'done',amount:amt,excess:ex}));
    return{status:'done',escrow:amt-ex,wallet:ex};});}

exports.handler=async ev=>{
  const route=(ev.path||'').split('/').pop(),body=(()=>{try{return JSON.parse(ev.body||'{}')}catch(e){return{}}})();
  if(ev.httpMethod!=='POST')return R(405,{error:'POST tu'});
  if(route==='sms-in'){
    if(!process.env.SMS_SECRET||ev.headers['x-secret']!==process.env.SMS_SECRET)return R(403,{error:'no'});
    const p=parse(body.text);await db.collection('rawSms').add({from:String(body.from||''),text:String(body.text||'').slice(0,600),parsed:p,ts:Date.now()});
    if(!p.txId||!p.amount)return R(200,{ok:true,parsed:false}); // admin ataona kwenye rawSms
    const ref=db.doc('bankTx/'+p.txId);
    if(!(await ref.get()).exists)await ref.create(Object.assign({},p,{text:String(body.text).slice(0,600),ts:Date.now(),usedBy:null}));
    const c=await db.doc('claims/'+p.txId).get();let r=null;if(c.exists&&['pending','short','review'].includes(c.data().status))r=await settle(p.txId,null);
    return R(200,{ok:true,parsed:true,settled:r});}
  let u;try{u=await admin.auth().verifyIdToken(String((ev.headers.authorization||'').replace('Bearer ','')));}catch(e){return R(401,{error:'Ingia kwanza'});}
  const me=(await db.doc('accounts/'+u.uid).get()).data();if(!me)return R(403,{error:'Akaunti haipo'});
  if(route==='claim'){
    const p=parse(body.text);if(!p.txId||!p.amount)return R(400,{error:'Sijaelewa SMS. Bandika ujumbe mzima wa muamala.'});
    const mode=body.mode==='order'?'order':'deposit',ref=db.doc('claims/'+p.txId);
    try{await ref.create({uid:u.uid,mode,orderIds:mode==='order'?(body.orderIds||[]).map(String).slice(0,20):[],claimedAmount:p.amount,claimedName:p.name,status:'pending',ts:Date.now()});}
    catch(e){const ex=(await ref.get()).data();if(!ex||ex.uid!==u.uid||ex.status==='done')return R(409,{error:'ID hii tayari imetumika.',status:'duplicate'});
      if(['pending','short'].includes(ex.status))await ref.update({orderIds:mode==='order'?(body.orderIds||[]).map(String).slice(0,20):[],mode});}
    const r=await settle(p.txId,null);return R(200,r);}
  if(route==='admin'){
    if(me.role!=='admin')return R(403,{error:'Admin tu'});const id=String(body.txId||'').toUpperCase();
    if(body.action==='reject'){await db.doc('claims/'+id).set({status:'rejected'},{merge:true});return R(200,{ok:true});}
    const c=await db.doc('claims/'+id).get();if(!c.exists)return R(404,{error:'Dai halipo'});return R(200,await settle(id,null,true));}
  return R(404,{error:'?'});};
