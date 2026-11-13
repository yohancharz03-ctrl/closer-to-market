/* CTM Trust-Flow: seva ya malipo (Netlify Function). Njia:
   POST /api/sms-in   (Forwarder, header x-secret)  -> inahifadhi SMS halisi ya CTM
   POST /api/claim    (mteja, Bearer idToken)       -> {text, mode:'deposit'|'order'|'fee', orderIds:[]}  (fee = ada ya duka/deni la usajili)
   POST /api/admin    (admin, Bearer idToken)       -> {action:'approve'|'reject', txId}
   Env: FIREBASE_SERVICE_ACCOUNT (JSON), SMS_SECRET */
const admin=require('firebase-admin'),init=require('../lib/init');let db,inc,union;
const R=(c,o)=>({statusCode:c,headers:{'content-type':'application/json'},body:JSON.stringify(o)});
const rid=()=>Date.now()*1000+Math.floor(Math.random()*1000),P=u=>db.doc('private/'+u);

/* Msomaji wa SMS (mitandao yote). Kinachoshindikana kinaenda kwa admin. */
function parse(t){t=String(t||'').replace(/\s+/g,' ');
  const tok=(t.match(/\b[A-Za-z0-9][A-Za-z0-9.]{7,24}[A-Za-z0-9]\b/g)||[]).find(x=>/[A-Za-z]/.test(x)&&/\d/.test(x)&&!/^(\+?255|0)\d+$/.test(x));
  const id=(t.match(/(?:Transaction ID|Muamala|Miamala|Trans(?:action)? ?(?:ID|No)|Reference|Kumbukumbu|Ref|TxnId|TID)[:.\s#-]*([A-Za-z0-9][A-Za-z0-9.]{6,24}[A-Za-z0-9])/i)||[])[1]||tok;
  const am=(t.match(/(?:TZS|Tshs?)\.?\s?([\d][\d,]*(?:\.\d+)?)/i)||t.match(/([\d][\d,]*(?:\.\d+)?)\s?(?:TZS|Tshs?)/i)||[])[1];
  const fr=(t.match(/(?:kutoka kwa|kutoka|from)\s+(.+?)(?=\s+(?:tarehe|mnamo|saa|on|at)\b|\s*\.\s*$|$)/i)||[])[1]||'';
  const src=(fr.split(/[:,-]/)[0]||'').trim().slice(0,30),nm=(fr.match(/(?:\s-\s*|Jina\s*:?\s*)([^*]*)$/i)||[])[1];
  const ph=(t.match(/(?:\+?255|0)[67]\d{8}/)||[])[0];
  const dt=(t.match(/\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4}(?:\s+(?:saa\s+|at\s+)?\d{1,2}[:.]\d{2})?/i)||[])[0];
  const fe=(t.match(/Ada\s+Jumla\s+(?:TZS|Tshs?)\.?\s?([\d,]+(?:\.\d+)?)/i)||[])[1];
  return{fee:fe?Math.round(parseFloat(fe.replace(/,/g,''))):0,txId:id&&id.toUpperCase(),amount:am?Math.round(parseFloat(am.replace(/,/g,''))):0,src,name:(nm||'').replace(/^Jina\s*/i,'').replace(/[.*]+/g,'').trim(),phone:ph?ph.slice(-9):'',date:dt||''};}
const norm=s=>String(s||'').toLowerCase().replace(/[^a-z ]/g,'').split(' ').filter(x=>x.length>2);
const note=(t,a,title,details)=>{const id=rid();t.set(db.doc('notifs/'+id),{id,toId:a.id,toUid:a.uid,title,category:'Oda & Malipo',details,read:false,ts:Date.now()});};
const SHOP_FEE=10000,DAY=864e5,FEE_DAYS=90;
async function notifyAdmins(title,details){const q=await db.collection('accounts').where('role','==','admin').get(),b=db.batch();
  q.forEach(d=>{const a=d.data(),id=rid();b.set(db.doc('notifs/'+id),{id,toId:a.id,toUid:a.uid,title,category:'Usajili',details,read:false,ts:Date.now()});});await b.commit();}
const feeLabel=async uid=>{const a=(await db.doc('accounts/'+uid).get()).data()||{};return (a.shopName||a.name||'Duka')+' ('+(a.name||'')+')';};
const led=(t,kind,amount,ref,n)=>{const id=rid();t.set(db.doc('ledger/'+id),{id,kind,amount,ref:String(ref||''),note:n||'',ts:Date.now()});};

/* Hesabu ya Ledger: tx ya kweli (bankTx) ndiyo chanzo cha kiasi, si maandishi ya mteja. */
async function settle(txId,claim,force){
  return db.runTransaction(async t=>{
    const bref=db.doc('bankTx/'+txId),cref=db.doc('claims/'+txId),b=await t.get(bref),c=await t.get(cref);
    const cl=c.exists?c.data():claim;if(!cl)return{status:'waiting'};if(!b.exists&&!force)return{status:'waiting'};
    const manualNew=!b.exists,bt=b.exists?b.data():{amount:cl.claimedAmount||0,phone:'',name:'',src:'mkono'};
    if(bt.usedBy||(c.exists&&cl.status==='done'))return{status:'duplicate'};
    const acc=(await t.get(db.doc('accounts/'+cl.uid))).data()||{};
    const hasId=bt.phone||norm(bt.name).length,ok=force||!hasId||(bt.phone&&acc.phone&&String(acc.phone).replace(/\D/g,'').slice(-9)===bt.phone)||norm(bt.name).some(w=>norm(acc.name).includes(w));
    if(!ok){t.set(cref,Object.assign({},cl,{status:'review',amount:bt.amount}));return{status:'review'};}
    const amt=bt.amount;let ex=amt,held=[];held.fee=0;
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
    if(cl.mode==='fee'){ // ADA YA DUKA: kwanza deni la mkopo (kama lipo), kisha ada ya miezi 3 (TZS 10,000 kila kipindi)
      const ads=await t.get(db.collection('accounts').where('role','==','admin')),debt=Math.max(0,acc.registrationDebt||0),aref=db.doc('accounts/'+cl.uid);
      const pd=Math.min(amt,debt),rest=amt-pd;let per=Math.floor(rest/SHOP_FEE);if(!per&&!pd){if(!force){t.set(cref,Object.assign({},cl,{status:'short',amount:amt,need:SHOP_FEE}));return{status:'short',need:SHOP_FEE,amount:amt};}per=1;}
      const use=pd+Math.min(rest,per*SHOP_FEE),left=debt-pd,upd={};
      if(pd){upd.registrationDebt=left;upd.totalPaidTowardDebt=inc(pd);}
      if(per){upd.paidUntil=Math.max(acc.paidUntil||0,Date.now())+FEE_DAYS*DAY*per;}
      if(acc.role==='vendor')upd.paymentStatus=left>0?'loan':'paid';
      ex=amt-use;t.update(aref,upd);const sn=acc.shopName||cl.uid;if(pd)led(t,'loan_repay',pd,txId,'Malipo ya mkopo - '+sn);if(use-pd>0)led(t,'shop_fee',use-pd,txId,'Ada ya duka - '+sn);
      const msgV=(pd?`Malipo ya mkopo TZS ${pd.toLocaleString()} yamekubaliwa. ${left>0?'Deni limesalia TZS '+left.toLocaleString()+'.':'Mkopo wako umekwisha.'} `:'')+(per?`Ada ya duka imekubaliwa: duka lako linaonekana sokoni kwa siku ${FEE_DAYS*per} zaidi.`:'');
      note(t,{id:acc.id,uid:cl.uid},'Malipo ya Ada Yamekubaliwa ✅',msgV.trim());
      ads.forEach(d=>note(t,d.data(),'Malipo ya Ada ya Duka Yamekubaliwa',`${acc.shopName||acc.name} amelipa TZS ${use.toLocaleString()} (Muamala ${txId}).${pd?' Deni la mkopo limesalia TZS '+left.toLocaleString()+'.':''}${per?' Muda umeongezwa siku '+FEE_DAYS*per+'.':''}`));
      held.fee=use;}
    if(ex>0){t.set(P(cl.uid),{walletBalance:inc(ex),tx:union({t:cl.mode==='order'?'Ziada ya oda':cl.mode==='fee'?'Ziada ya ada':'Deposit',a:ex,n:txId,ts:Date.now()})},{merge:true});led(t,'wallet_in',ex,txId,'Wallet '+cl.uid);}
    manualNew?t.set(bref,Object.assign({},bt,{txId,manual:true,ts:Date.now(),usedBy:cl.uid,usedAt:Date.now()})):t.update(bref,{usedBy:cl.uid,usedAt:Date.now()});t.set(cref,Object.assign({},cl,{status:'done',amount:amt,excess:ex}));
    return{status:'done',escrow:cl.mode==='order'?amt-ex:0,fee:held.fee||0,wallet:ex};});}

exports.handler=async ev=>{
  try{init();}catch(e){return R(500,{error:'Seva: '+e.message});}db=admin.firestore();inc=admin.firestore.FieldValue.increment;union=admin.firestore.FieldValue.arrayUnion;
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
  if(route==='push'){try{return R(200,{sent:await require('../lib/push')(db,admin)});}catch(e){return R(500,{error:e.message});}}
  if(route==='pin'){const Pn=require('../lib/pin')(db);try{
      if(body.op==='status')return R(200,await Pn.status(u.uid));
      if(body.op==='set'){await Pn.set(u.uid,body.pin,body.q,body.a,body.old);return R(200,{ok:true});}
      if(body.op==='check'){await Pn.verify(u.uid,body.pin);return R(200,{ok:true});}
      if(body.op==='reset'){await Pn.reset(u.uid,body.a,body.pin);return R(200,{ok:true});}
    }catch(e){return R(e.status||500,{error:e.message});}return R(400,{error:'op?'});}
  if((route==='loan'||route==='broker')&&u.email_verified!==true)return R(403,{error:'Thibitisha email yako kwanza.'});
  if(route==='loan'){try{const L=require('../lib/loan');
      if(body.op==='take')return R(200,await L.grantLoan(db,admin,u.uid));
    }catch(e){return R(e.status||500,{error:e.message});}return R(400,{error:'op?'});}
  if(route==='broker'){try{return R(200,await require('../lib/loan').inviteBroker(db,admin,u.uid,body));}catch(e){return R(e.status||500,{error:e.message});}}
  if(route==='pay-info'){let total=0;const ids=(body.orderIds||[]).map(String).slice(0,20);
    for(const id of ids){const o=(await db.doc('orders/'+id).get()).data();if(o&&o.customerUid===u.uid&&o.payStatus==='PENDING')total+=o.total;}
    const cfg=(await db.doc('config/app').get()).data()||{};return R(200,{total,pay:cfg.pay||process.env.CTM_PAY||'',help:cfg.help||process.env.CTM_HELP||''});}
  if(route==='claim'&&body.manual){const id=String(body.txId||'').toUpperCase().replace(/[^A-Z0-9.]/g,''),am=Math.round(+body.amount||0),mode=['order','fee'].includes(body.mode)?body.mode:'deposit';
    if(id.length<6||am<1)return R(400,{error:'Weka ID ya muamala na kiasi sahihi.'});const ref=db.doc('claims/'+id),ex=await ref.get();
    if(ex.exists&&(ex.data().uid!==u.uid||ex.data().status==='done'))return R(409,{error:'ID hii tayari imetumika.',status:'duplicate'});
    await ref.set({uid:u.uid,mode,orderIds:mode==='order'?(body.orderIds||[]).map(String).slice(0,20):[],claimedAmount:am,claimedName:'',fee:0,manual:true,status:'review',ts:Date.now()},{merge:true});
    if(mode==='fee')await notifyAdmins('Dai la Malipo ya Ada ya Duka',`${await feeLabel(u.uid)} anadai amelipa TZS ${am.toLocaleString()} (Muamala ${id}). Fungua Akaunti > SMS & Madai ya Malipo > Idhinisha.`);
    return R(200,{status:'review'});}
  if(route==='claim'){
    const p=parse(body.text);if(!p.txId||!p.amount)return R(400,{error:'Sijaelewa SMS. Bandika ujumbe mzima wa muamala.'});
    const mode=['order','fee'].includes(body.mode)?body.mode:'deposit',ref=db.doc('claims/'+p.txId);
    try{await ref.create({uid:u.uid,mode,orderIds:mode==='order'?(body.orderIds||[]).map(String).slice(0,20):[],claimedAmount:p.amount,claimedName:p.name,fee:p.fee||0,status:'pending',ts:Date.now()});}
    catch(e){const ex=(await ref.get()).data();if(!ex||ex.uid!==u.uid||ex.status==='done')return R(409,{error:'ID hii tayari imetumika.',status:'duplicate'});
      if(['pending','short'].includes(ex.status))await ref.update({orderIds:mode==='order'?(body.orderIds||[]).map(String).slice(0,20):[],mode});}
    const r=await settle(p.txId,null);
    if(mode==='fee'&&r&&r.status!=='done')await notifyAdmins('Dai la Malipo ya Ada ya Duka',`${await feeLabel(u.uid)} ametuma SMS ya muamala ${p.txId} (TZS ${p.amount.toLocaleString()}). Hali: ${r.status}. Hakiki kwenye SMS & Madai ya Malipo.`);
    return R(200,r);}
  if(route==='admin'){
    if(me.role!=='admin')return R(403,{error:'Admin tu'});const id=String(body.txId||'').toUpperCase();
    if(body.action==='trash'||body.action==='restore'){const id=String(body.id||'').replace(/\W/g,'');
      if(body.action==='trash'){const r=db.doc('rawSms/'+id),x=await r.get();if(!x.exists)return R(404,{error:'Haipo'});await db.doc('trash/'+id).set({col:'rawSms',data:x.data(),ts:Date.now()});await r.delete();return R(200,{ok:true});}
      const r=db.doc('trash/'+id),x=await r.get();if(!x.exists)return R(404,{error:'Haipo'});await db.doc('rawSms/'+id).set(x.data().data);await r.delete();return R(200,{ok:true});}
    if(body.action==='reject'){await db.doc('claims/'+id).set({status:'rejected'},{merge:true});return R(200,{ok:true});}
    const c=await db.doc('claims/'+id).get();if(!c.exists)return R(404,{error:'Dai halipo'});return R(200,await settle(id,null,true));}
  return R(404,{error:'?'});};
