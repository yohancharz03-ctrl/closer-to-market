const {onCall,onRequest,HttpsError}=require('firebase-functions/v2/https');
const {onDocumentCreated}=require('firebase-functions/v2/firestore');
const {onSchedule}=require('firebase-functions/v2/scheduler');
const admin=require('firebase-admin');(process.env.FIREBASE_SERVICE_ACCOUNT?require('../netlify/lib/init')():(admin.apps.length||admin.initializeApp()));
const db=admin.firestore(),F=admin.firestore.FieldValue,inc=F.increment,union=F.arrayUnion,DAY=864e5;
const FEE=.05,CASHBACK=.01,SHOP_FEE=10000,WD_MIN=50000,FREE_WD=2,selcom=a=>Math.max(500,Math.round(a*.015)); // makadirio ya Selcom
const err=(c,m)=>new HttpsError(c,m),uidOf=r=>{if(!r.auth)throw err('unauthenticated','Ingia kwanza');const em=String(r.auth.token.email||'').toLowerCase();if(process.env.REQUIRE_VERIFIED_EMAIL!=='false'&&!r.auth.token.email_verified&&em!=='ctm2026@gmail.com')throw err('failed-precondition','Thibitisha email yako kwanza.');return r.auth.uid;};
const rid=()=>Date.now()*1000+Math.floor(Math.random()*1000),P=uid=>db.doc('private/'+uid),mk=()=>new Date().toISOString().slice(0,7);
const byId=(t,id)=>t.get(db.collection('accounts').where('id','==',+id).limit(1)).then(q=>{if(q.empty)throw err('not-found','Akaunti haipo');return q.docs[0];});
const note=(t,a,title,details,cat)=>{const id=rid();t.set(db.doc('notifs/'+id),{id,toId:a.id,toUid:a.uid,title,category:cat||'Oda & Malipo',details,read:false,ts:Date.now()});};
const led=(t,kind,amount,ref,n)=>{const id=rid();t.set(db.doc('ledger/'+id),{id,kind,amount,ref:String(ref||''),note:n||'',ts:Date.now()});};
const tx=(n,a)=>({t:n,a,n,ts:Date.now()});
const me=async(t,uid)=>{const s=await t.get(db.doc('accounts/'+uid));if(!s.exists)throw err('not-found','Akaunti haipo');return s;};
const wallet=async(t,uid)=>{const s=await t.get(P(uid));return s.exists?s.data():{walletBalance:0};};

exports.placeOrder=onCall(async req=>{const uid=uidOf(req),d=req.data||{},items=(d.items||[]).slice(0,50),f=d.fulfillment==='Pickup'?'Pickup':'Delivery',
  loc=d.loc&&isFinite(d.loc.lat)&&isFinite(d.loc.lng)?{lat:+d.loc.lat,lng:+d.loc.lng}:null,note0=String(d.note||'').replace(/[<>"'`]/g,'').slice(0,300);
  if(!items.length)throw err('invalid-argument','Kikapu ni tupu');
  return db.runTransaction(async t=>{const m=(await me(t,uid)).data(),qty={},offs=[];
    items.forEach(i=>{if(i.offerId){if(!/^\d+$/.test(String(i.offerId)))throw err('invalid-argument','Offer si sahihi');offs.push(String(i.offerId));}
      else{if(!/^\d+$/.test(String(i.id)))throw err('invalid-argument','Bidhaa si sahihi');qty[i.id]=(qty[i.id]||0)+Math.min(99,Math.max(1,Math.floor(i.qty||1)));}});
    const ps=await Promise.all(Object.keys(qty).map(id=>t.get(db.doc('products/'+id)))),os=await Promise.all(offs.map(id=>t.get(db.doc('offers/'+id)))),lines=[];
    for(const s of ps){if(!s.exists)throw err('not-found','Bidhaa haipo tena');const p=s.data(),q=qty[s.id];if(p.stock<q)throw err('failed-precondition',`${p.name}: stock haitoshi`);lines.push({p,q,ref:s.ref});}
    for(const s of os){if(!s.exists)throw err('not-found','Offer haipo');const o=s.data();if(o.endsAt<Date.now())throw err('failed-precondition','Offer imeisha muda');
      const pr=await t.get(db.doc('products/'+o.productId));if(!pr.exists||pr.data().stock<1)throw err('failed-precondition','Bidhaa ya offer imeisha');
      lines.push({p:{name:o.name+' (Live Offer)',price:o.price,image:o.image||'',vendorId:o.vendorId},q:1,ref:pr.ref,offer:true});}
    const groups={};for(const l of lines){if(l.p.vendorId===m.id)throw err('failed-precondition','Huwezi kununua bidhaa za duka lako');(groups[l.p.vendorId]=groups[l.p.vendorId]||[]).push(l);}
    const shops={};for(const vid of Object.keys(groups)){const v=(await byId(t,vid)).data();
      if(!(v.isApproved||(!v.suspended&&v.autoApproveAt<=Date.now()))||v.suspended||v.paidUntil<Date.now())throw err('failed-precondition',`${v.shopName} halipatikani kwa sasa`);
      shops[vid]={v,parent:v.role==='dalali'?(await byId(t,v.parentId)).data():null};}
    const ids=[];
    for(const [vid,g] of Object.entries(groups)){const {v,parent}=shops[vid],boss=parent||v,total=g.reduce((s,x)=>s+x.p.price*x.q,0),id='ORD-'+Math.floor(10000+Math.random()*90000),otp=String(Math.floor(1000+Math.random()*9000));
      const o={id,customerId:m.id,customerUid:uid,customerName:m.name,vendorId:boss.id,vendorUid:boss.uid,vendor:boss.shopName,date:new Date().toLocaleDateString('en-GB'),ts:Date.now(),items:g.map(x=>x.p.name+(x.q>1?' x'+x.q:'')).join(', '),productImg:g[0].p.image||'',total,status:'Inasubiri Malipo',stage:1,payStatus:'PENDING',fulfillment:f,isConfirmedByOtp:false,loc,note:note0,isOffer:g.some(x=>x.offer)};
      if(parent){o.brokerId=v.id;o.brokerUid=v.uid;o.brokerName=v.name;o.commission=Math.round(total*v.pct/100);}
      t.set(db.doc('orders/'+id),o);t.set(db.doc('orderSecrets/'+id),{customerUid:uid,otp});
      g.forEach(x=>t.update(x.ref,{stock:inc(-x.q)}));
      note(t,m,'Oda Mpya Imethibitishwa',`Oda ${id} kutoka ${boss.shopName}. OTP yako: [ ${otp} ]. Mpe muuzaji mzigo ukifika.`);
      if(parent)note(t,v,'Oda kupitia Duka Lako',`Oda ${id}: commission TZS ${o.commission.toLocaleString()} baada ya mzigo kufika.`);ids.push(id);}
    return {orders:ids};});});

exports.shipOrder=onCall(async req=>{const uid=uidOf(req),ref=db.doc('orders/'+req.data.orderId);
  return db.runTransaction(async t=>{const o=(await t.get(ref)).data();if(!o||o.vendorUid!==uid||o.stage!==2)throw err('failed-precondition','Oda haiwezi kutumwa');
    const c=await byId(t,o.customerId);t.update(ref,{stage:3,status:'Njiani (Imetumwa)'});note(t,c.data(),'Mzigo Wako Uko Njiani',`${o.vendor} ametuma oda ${o.id}. Mpe OTP yako mzigo ukifika.`);return {ok:true};});});

exports.confirmDelivery=onCall(async req=>{const uid=uidOf(req),{orderId,otp}=req.data||{},ref=db.doc('orders/'+orderId);
  return db.runTransaction(async t=>{const o=(await t.get(ref)).data(),sec=(await t.get(db.doc('orderSecrets/'+orderId))).data();
    if(!o||o.vendorUid!==uid||o.stage!==3||o.credited)throw err('failed-precondition','Oda haiko tayari kuthibitishwa');
    if(!sec||String(otp).trim()!==sec.otp)throw err('permission-denied','OTP si sahihi');
    const v=(await t.get(db.doc('accounts/'+uid))).data(),b=o.brokerId?await byId(t,o.brokerId):null,c=(await byId(t,o.customerId)).data(),ad=await t.get(db.collection('accounts').where('role','==','admin').limit(1));
    const fee=Math.round(o.total*FEE),com=Math.min(o.commission||0,o.total-fee),net=o.total-fee-com;
    t.update(ref,{stage:4,status:'Imekamilika (Delivered)',isConfirmedByOtp:true,credited:true,fee,netToShop:net});
    t.set(P(uid),{walletBalance:inc(net),tx:union(tx('Mauzo '+o.id,net))},{merge:true});
    if(b){t.set(P(b.data().uid),{walletBalance:inc(com),tx:union(tx('Commission '+o.id,com))},{merge:true});note(t,b.data(),'Commission Imeingia',`TZS ${com.toLocaleString()} kutoka oda ${o.id}`);}
    if(!ad.empty&&fee>0)t.set(P(ad.docs[0].id),{walletBalance:inc(fee),tx:union(tx('Mapato 5% '+o.id,fee))},{merge:true});
    led(t,'order_fee',fee,o.id,'Makato 5% oda '+o.id);
    note(t,v,'Oda Imekamilika',`Oda ${o.id}: TZS ${o.total.toLocaleString()} - makato 5% (TZS ${fee.toLocaleString()})${com?' - commission TZS '+com.toLocaleString():''} = TZS ${net.toLocaleString()} imeingia wallet.`);
    note(t,c,'Asante kwa Kununua',`Oda ${o.id} imekamilika.`);return {ok:true};});});

exports.withdraw=onCall(async req=>{const uid=uidOf(req),a=Math.floor(+req.data.amount);
  return db.runTransaction(async t=>{const m=(await me(t,uid)).data(),w=await wallet(t,uid);
    if(!['vendor','dalali','admin'].includes(m.role))throw err('permission-denied','Akaunti hii haiwezi kutoa pesa');
    const fee=0;
    if(!(a>=1000)||a+fee>(w.walletBalance||0))throw err('failed-precondition','Kiasi si sahihi au salio halitoshi (makato: TZS '+fee+')');
    t.set(P(uid),{walletBalance:inc(-a),tx:union(tx('Withdraw',-a))},{merge:true});
    t.set(db.doc('withdrawals/'+rid()),{uid,accountId:m.id,phone:m.phone,amount:a,fee,status:'pending',ts:Date.now()});return {ok:true,fee};});});

exports.payFee=onCall(async req=>{const uid=uidOf(req);
  return db.runTransaction(async t=>{const s=await me(t,uid),m=s.data(),w=await wallet(t,uid);if(!['vendor','dalali'].includes(m.role)||(w.walletBalance||0)<SHOP_FEE)throw err('failed-precondition','Wallet haina TZS 10,000');
    const ad=await t.get(db.collection('accounts').where('role','==','admin').limit(1));if(!ad.empty)t.set(P(ad.docs[0].id),{walletBalance:inc(SHOP_FEE),tx:union(tx('Ada ya duka '+(m.shopName||''),SHOP_FEE))},{merge:true});
    t.set(P(uid),{walletBalance:inc(-SHOP_FEE),tx:union(tx('Ada ya duka',-SHOP_FEE))},{merge:true});t.update(s.ref,{paidUntil:Math.max(m.paidUntil||0,Date.now())+30*DAY});led(t,'shop_fee',SHOP_FEE,m.shopName,'Ada ya duka');return {ok:true};});});

exports.setVendorApproval=onCall(async req=>{const uid=uidOf(req);
  return db.runTransaction(async t=>{if((await me(t,uid)).data().role!=='admin')throw err('permission-denied','Admin tu');
    const v=await byId(t,req.data.id);t.update(v.ref,{isApproved:!!req.data.approved,suspended:!req.data.approved});return {ok:true};});});

exports.approveBroker=onCall(async req=>{const uid=uidOf(req);
  return db.runTransaction(async t=>{const m=(await me(t,uid)).data(),b=await byId(t,req.data.id);if(b.data().parentId!==m.id)throw err('permission-denied','Si dalali wako');
    t.update(b.ref,{isApproved:true});note(t,b.data(),'Akaunti ya Dalali Imefunguliwa',`${m.shopName} amekubali.`);return {ok:true};});});

exports.acceptRequest=onCall(async req=>{const uid=uidOf(req),rr=db.doc('requests/'+req.data.requestId);
  return db.runTransaction(async t=>{const m=(await me(t,uid)).data(),r=(await t.get(rr)).data();if(!r||r.vendorId!==m.id||r.status!=='pending')throw err('failed-precondition','Ombi si sahihi');
    const ps=await t.get(db.doc('products/'+r.productId)),p=ps.data(),bd=(await byId(t,r.brokerId)).data();if(bd.suspended)throw err('failed-precondition','Dalali amesimamishwa');
    const ex=await t.get(db.collection('products').where('vendorId','==',bd.id).where('parentProductId','==',r.productId).limit(1));
    if(!req.data.accept){t.update(rr,{status:'rejected'});note(t,bd,'Ombi la Bidhaa Limekataliwa',p.name);return {ok:true};}
    if(!p||p.stock<r.qty)throw err('failed-precondition','Stock haitoshi');
    t.update(ps.ref,{stock:inc(-r.qty)});
    if(ex.empty){const id=rid();t.set(db.doc('products/'+id),Object.assign({},p,{id,stock:r.qty,vendorId:bd.id,shopName:bd.shopName,parentProductId:r.productId,isWishlisted:false}));}else t.update(ex.docs[0].ref,{stock:inc(r.qty)});
    t.update(rr,{status:'accepted'});note(t,bd,'Ombi la Bidhaa Limekubaliwa',`${p.name} x${r.qty}`);return {ok:true};});});

/* Webhook ya mobile money. Secret: firebase functions:secrets:set WEBHOOK_SECRET */
exports.depositWebhook=onRequest({secrets:['WEBHOOK_SECRET']},async(q,s)=>{
  if(q.get('x-secret')!==process.env.WEBHOOK_SECRET)return s.status(403).send('no');
  const {uid,amount,ref}=q.body||{};if(!uid||!(amount>0)||!ref)return s.status(400).send('bad');
  await db.runTransaction(async t=>{const d=db.doc('deposits/'+ref);if((await t.get(d)).exists)return;t.set(d,{uid,amount,ts:Date.now()});t.set(P(uid),{walletBalance:inc(+amount),tx:union(tx('Deposit',+amount))},{merge:true});});
  s.send('ok');});

/* Cashback 4% - tarehe 1 ya kila mwezi, kwa manunuzi yaliyokamilika ya mwezi uliopita */
exports.monthlyCashback=onSchedule({schedule:'0 3 1 * *',timeZone:'Africa/Dar_es_Salaam'},async()=>{
  const n=new Date(),a=new Date(n.getFullYear(),n.getMonth()-1,1),b=new Date(n.getFullYear(),n.getMonth(),1),key=a.toISOString().slice(0,7),sums={};
  (await db.collection('orders').where('ts','>=',a.getTime()).where('ts','<',b.getTime()).get()).forEach(d=>{const o=d.data();if(o.credited)sums[o.customerUid]=(sums[o.customerUid]||0)+o.total;});
  for(const [uid,tot] of Object.entries(sums)){const amt=Math.round(tot*CASHBACK);if(amt<=0)continue;
    await db.runTransaction(async t=>{const d=db.doc('cashback/'+key+'_'+uid);if((await t.get(d)).exists)return;const s=await t.get(db.doc('accounts/'+uid));if(!s.exists)return;
      t.set(d,{uid,amt,key});t.set(P(uid),{walletBalance:inc(amt),tx:union(tx('Cashback 4% ya '+key,amt))},{merge:true});led(t,'cashback',-amt,uid,'Cashback 4% ya '+key);note(t,s.data(),'Cashback Yako',`Umerudishiwa TZS ${amt.toLocaleString()} (4% ya manunuzi ya ${key}).`,'Malipo');});}});

exports.pushOnNotif=onDocumentCreated('notifs/{id}',async ev=>{const n=ev.data.data();if(!n.toUid)return;
  const a=(await P(n.toUid).get()).data(),tokens=(a&&a.fcmTokens)||[];if(!tokens.length)return;
  await admin.messaging().sendEachForMulticast({tokens,notification:{title:n.title,body:String(n.details||'').replace(/<[^>]*>/g,'').slice(0,160)}});});

/* Tukio la usalama -> notification kwa kila admin (na push) */
exports.securityAlert=onDocumentCreated('security/{id}',async ev=>{const s=ev.data.data(),ads=await db.collection('accounts').where('role','==','admin').get();
  const b=db.batch();ads.forEach(d=>{const a=d.data(),id=rid();b.set(db.doc('notifs/'+id),{id,toId:a.id,toUid:a.uid,title:'⚠ Tahadhari ya Usalama',category:'Usalama',details:`${s.kind} - ${s.email||'?'} (${String(s.ref||'').slice(0,60)})`,read:false,ts:Date.now()});});await b.commit();});

/* Pesa za majaribio (si halisi). Zima kwa SIMULATE_MONEY=false kwenye functions/.env ukiunganisha malipo halisi */
exports.testDeposit=onCall(async req=>{if(process.env.SIMULATE_MONEY==='false')throw err('failed-precondition','Malipo ya majaribio yamezimwa');const uid=uidOf(req),a=Math.floor(+req.data.amount);if(!(a>=1000&&a<=500000))throw err('invalid-argument','Kiasi kiwe 1,000 hadi 500,000');
  return db.runTransaction(async t=>{await me(t,uid);const w=await wallet(t,uid),key='td_'+new Date().toISOString().slice(0,10).replace(/-/g,'_'),used=w[key]||0;if(used+a>1000000)throw err('resource-exhausted','Kikomo cha siku kimefika');
    t.set(P(uid),{walletBalance:inc(a),[key]:used+a,tx:union(tx('Deposit ya majaribio',a))},{merge:true});return {ok:true};});});

/* Maoni/nyota: mnunuzi aliyekamilisha oda pekee */
exports.submitReview=onCall(async req=>{const uid=uidOf(req),{vendorId,stars,text}=req.data||{},n=Math.floor(+stars);if(!(n>=1&&n<=5))throw err('invalid-argument','Nyota 1-5');
  const m=(await db.doc('accounts/'+uid).get()).data();if(!m)throw err('not-found','Akaunti haipo');if(+vendorId===m.id)throw err('failed-precondition','Huwezi kukadiria duka lako');
  const os=await db.collection('orders').where('customerUid','==',uid).where('credited','==',true).get();
  if(!os.docs.some(d=>{const o=d.data();return o.vendorId===+vendorId||o.brokerId===+vendorId;}))throw err('failed-precondition','Nunua na mzigo uthibitishwe kwanza ili utoe maoni');
  const v=await db.collection('accounts').where('id','==',+vendorId).limit(1).get();if(v.empty)throw err('not-found','Duka halipo');const va=v.docs[0].data(),id=vendorId+'_'+m.id,nid=rid(),b=db.batch();
  b.set(db.doc('reviews/'+id),{id,vendorId:+vendorId,userId:m.id,userName:m.name,stars:n,text:String(text||'').replace(/[<>"'`]/g,'').slice(0,300),ts:Date.now()});
  b.set(db.doc('notifs/'+nid),{id:nid,toId:va.id,toUid:va.uid,title:'Maoni Mapya',category:'Huduma',details:`${m.name} ameacha nyota ${n}.`,read:false,ts:Date.now()});await b.commit();return {ok:true};});

/* Admin anaidhinisha/anakataa uthibitisho wa duka (Trusted) */
exports.reviewVerification=onCall(async req=>{const uid=uidOf(req),ad=(await db.doc('accounts/'+uid).get()).data();if(!ad||ad.role!=='admin')throw err('permission-denied','Admin tu');
  const {vendorId,approve}=req.data||{},v=await db.collection('accounts').where('id','==',+vendorId).limit(1).get();if(v.empty)throw err('not-found','Duka halipo');
  const va=v.docs[0].data(),nid=rid(),b=db.batch();b.update(v.docs[0].ref,{verified:!!approve});b.set(db.doc('verifications/'+vendorId),{status:approve?'approved':'rejected',reviewedAt:Date.now()},{merge:true});
  b.set(db.doc('notifs/'+nid),{id:nid,toId:va.id,toUid:va.uid,title:approve?'Duka Limethibitishwa ✅':'Uthibitisho Umekataliwa',category:'Usajili',details:approve?'Duka lako sasa lina alama ya Trusted.':'Rekebisha taarifa zako na utume tena.',read:false,ts:Date.now()});await b.commit();return {ok:true};});

/* Mwenye duka anasimamisha/anarudisha dalali wake */
exports.setBrokerSuspended=onCall(async req=>{const uid=uidOf(req);
  return db.runTransaction(async t=>{const m=(await me(t,uid)).data(),b=await byId(t,req.data.id);if(b.data().parentId!==m.id)throw err('permission-denied','Si dalali wako');
    const on=!!req.data.suspended;t.update(b.ref,{suspended:on});note(t,b.data(),on?'Umesimamishwa':'Umerudishwa',on?`${m.shopName} amekusimamisha. Duka lako halionekani.`:'Duka lako linaonekana tena.','Usajili');return {ok:true};});});

/* Ukaguzi wa kiotomatiki: HAPA ndipo API rasmi (NIDA, BRELA, TRA) itaunganishwa ukishapata ufikiaji. Kwa sasa admin anakagua kwa mkono. */
exports.autoVerify=onDocumentCreated('verifications/{id}',async ev=>{const d=ev.data.data();
  // TODO: const ok = await checkNIDA(d.nida) && await checkBRELA(d.license) && await checkTRA(d.tin); if(ok) { approve otomatiki }
  return null;});
