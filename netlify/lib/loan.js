/* MKOPO WA ADA (TZS 10,000 = miezi 3) + DALALI (kikomo 2 kwa duka)
   - Duka jipya (baada ya maduka 15 ya zawadi) AU duka lililopo linakubali mkopo: duka linaonekana sokoni siku 90 papo hapo, bila kuthibitisha malipo.
   - Mkopo unalipwa na makato: 5% ya CTM (kawaida) + 5% ya mkopo = 10% ya kila mauzo hadi registrationDebt iwe 0 (hesabu iko functions/index.js > confirmDelivery).
   - Mwenye duka anapata notification ya "Hongera" kutoka kwa server; Admin anapata notification na anaona deni lililosalia kwenye kila duka.
   - Dalali: kila duka linaweza kuwa na dalali 2 tu. Kuongeza dalali = TZS 10,000 (wallet) AU mkopo (unaingia kwenye deni lile lile). */
const SHOP_FEE=10000,CAP=30000,DAY=864e5,FEE_DAYS=90,BROKER_MAX=2,BROKER_FEE=10000;
const E=(s,m)=>Object.assign(new Error(m),{status:s}),rid=()=>Date.now()*1000+Math.floor(Math.random()*1000);
const note=(db,t,a,title,details)=>{const id=rid();t.set(db.doc('notifs/'+id),{id,toId:a.id,toUid:a.uid,title,category:'Usajili',details,read:false,ts:Date.now()});};

async function grantLoan(db,admin,uid){const inc=admin.firestore.FieldValue.increment;
  return db.runTransaction(async t=>{const ar=db.doc('accounts/'+uid),s=await t.get(ar);if(!s.exists)throw E(404,'Akaunti haipo');const m=s.data();
    if(m.role!=='vendor')throw E(403,'Mkopo wa ada ni kwa wenye maduka tu');
    const rem=(m.paidUntil||0)-Date.now();if(m.paymentStatus!=='pending'&&rem>7*DAY)throw E(409,'Unaweza kuchukua mkopo wa ada ndani ya siku 7 kabla ya muda wa duka kuisha (zimebaki siku '+Math.ceil(rem/DAY)+').');
    const cur=m.registrationDebt||0;if(cur+SHOP_FEE>CAP)throw E(409,'Umefika kikomo cha mkopo (TZS '+CAP.toLocaleString()+'). Deni lako litalipwa na makato ya mauzo; unaweza pia kulipa kwa namba ya malipo.');
    const ads=await t.get(db.collection('accounts').where('role','==','admin')),left=cur+SHOP_FEE,until=Math.max(m.paidUntil||0,Date.now())+FEE_DAYS*DAY;
    t.update(ar,{registrationDebt:left,paymentStatus:'loan',loanAt:Date.now(),paidUntil:until});
    const lid=rid();t.set(db.doc('ledger/'+lid),{id:lid,kind:'loan_fee',amount:0,ref:String(m.shopName||uid),note:'Mkopo wa ada TZS '+SHOP_FEE.toLocaleString()+' umetolewa (miezi 3) - si pesa iliyoingia',ts:Date.now()});
    const days=Math.ceil((until-Date.now())/DAY);
    note(db,t,m,'Hongera! Umepata Mkopo wa Ada ✅',`Hongera kwa kupata mkopo wa ada TZS ${SHOP_FEE.toLocaleString()}. Duka lako sasa linaonekana sokoni kwa siku ${days}. Kila mauzo yatakatwa 5% ya CTM + 5% ya mkopo (jumla 10%) hadi deni la TZS ${left.toLocaleString()} liishe. Utaona ujumbe kila mauzo yanapokatwa.`);
    ads.forEach(d=>note(db,t,d.data(),'Duka Limejiunga kwa Mkopo',`${m.shopName||m.name} (${m.name}) amepokea mkopo wa ada TZS ${SHOP_FEE.toLocaleString()}. Deni la mkopo: TZS ${left.toLocaleString()}. Duka limeongezewa siku ${FEE_DAYS}.`));
    return {ok:true,debt:left,paidUntil:until,days};});}

async function inviteBroker(db,admin,uid,b){const inc=admin.firestore.FieldValue.increment,un=admin.firestore.FieldValue.arrayUnion;
  const clean=x=>String(x||'').replace(/[<>"'`]/g,'').trim(),name=clean(b.name).slice(0,60),phone=clean(b.phone).slice(0,20),email=String(b.email||'').toLowerCase().trim().slice(0,100),pct=+b.pct,pay=b.pay==='loan'?'loan':'wallet';
  if(!name||!phone||!/^\S+@\S+\.\S+$/.test(email))throw E(400,'Jaza jina, email sahihi na simu.');if(!(pct>0&&pct<=50))throw E(400,'Commission iwe kati ya 1 na 50.');
  return db.runTransaction(async t=>{const ar=db.doc('accounts/'+uid),s=await t.get(ar);if(!s.exists)throw E(404,'Akaunti haipo');const m=s.data();if(m.role!=='vendor')throw E(403,'Ni kwa wenye maduka tu');
    const pr=db.doc('private/'+uid),w=((await t.get(pr)).data()||{}),bal=w.walletBalance||0,
      bs=await t.get(db.collection('accounts').where('parentId','==',m.id)),iv=await t.get(db.collection('invites').where('vendorUid','==',uid)),ads=await t.get(db.collection('accounts').where('role','==','admin'));
    let n=0;bs.forEach(d=>{if(d.data().role==='dalali')n++;});iv.forEach(d=>{if(d.data().status==='invited')n++;});
    if(n>=BROKER_MAX)throw E(409,'Kikomo: kila duka lina dalali '+BROKER_MAX+' tu.');
    const debt=m.registrationDebt||0;
    if(pay==='loan'){if(debt+BROKER_FEE>CAP)throw E(409,'Mkopo umefika kikomo (TZS '+CAP.toLocaleString()+'). Lipa kwa wallet au lipa deni kwanza.');
      t.update(ar,{registrationDebt:debt+BROKER_FEE,paymentStatus:'loan'});}
    else{if(bal<BROKER_FEE)throw E(402,'Wallet haina TZS '+BROKER_FEE.toLocaleString()+'. Weka pesa, au chagua kulipia kwa mkopo.');
      t.set(pr,{walletBalance:inc(-BROKER_FEE),tx:un({t:'Ada ya dalali',a:-BROKER_FEE,ts:Date.now()})},{merge:true});
      const a0=ads.docs[0];if(a0)t.set(db.doc('private/'+a0.id),{walletBalance:inc(BROKER_FEE),tx:un({t:'Ada ya dalali '+(m.shopName||''),a:BROKER_FEE,ts:Date.now()})},{merge:true});}
    const lid=rid(),code=Math.random().toString(36).slice(2,8).toUpperCase();
    t.set(db.doc('ledger/'+lid),{id:lid,kind:pay==='loan'?'loan_fee':'shop_fee',amount:pay==='loan'?0:BROKER_FEE,ref:String(m.shopName||uid),note:'Ada ya dalali '+name+(pay==='loan'?' TZS '+BROKER_FEE.toLocaleString()+' kwa mkopo - si pesa iliyoingia':''),ts:Date.now()});
    t.set(db.doc('invites/'+code),{code,vendorId:m.id,vendorUid:uid,name,email,phone,pct,status:'invited',members:[uid],paid:pay,ts:Date.now()});
    const left=pay==='loan'?debt+BROKER_FEE:debt;
    note(db,t,m,'Dalali Ameongezwa ✅',pay==='loan'?`Dalali ${name} ameongezwa kwa mkopo wa TZS ${BROKER_FEE.toLocaleString()}. Deni la mkopo: TZS ${left.toLocaleString()} (makato 5%+5% ya mauzo).`:`Dalali ${name} ameongezwa; TZS ${BROKER_FEE.toLocaleString()} imekatwa kutoka wallet.`);
    ads.forEach(d=>note(db,t,d.data(),'Dalali Mpya',`${m.shopName||m.name} ameongeza dalali ${name} (${n+1}/${BROKER_MAX}) - ${pay==='loan'?'kwa mkopo (deni: TZS '+left.toLocaleString()+')':'kwa pesa (wallet)'}.`));
    return {ok:true,code,debt:left};});}

/* Sweep (kila dakika kupitia push-sweep): ofa ya mkopo kwa duka linalokaribia kuisha muda (siku 3) au lililoisha, mara moja kwa siku 20 */
async function sweep(db){let n=0;const now=Date.now(),gate=db.doc('config/loanSweep'),g=(await gate.get()).data()||{};if(now-(g.ts||0)<5*60*1000)return 0;await gate.set({ts:now},{merge:true});
  const vs=await db.collection('accounts').where('role','==','vendor').get();
  for(const d of vs.docs){const a=d.data();if(a.paymentStatus==='pending'&&!a.loanOfferAt){}else if((a.paidUntil||0)-now>3*DAY)continue;if((a.loanOfferAt||0)>now-20*DAY||(a.registrationDebt||0)+SHOP_FEE>CAP)continue;
    const id=rid(),left=Math.ceil(((a.paidUntil||0)-now)/DAY);
    await db.doc('notifs/'+id).set({id,toId:a.id,toUid:a.uid,title:'Ofa ya Mkopo wa Ada 🎁',category:'Usajili',details:(left>0?`Muda wa duka lako unaisha baada ya siku ${left}.`:'Duka lako halionekani sokoni (muda umeisha).')+' Pokea mkopo wa ada TZS 10,000 bila kulipa sasa: duka linaonekana siku 90, na 5% ya mauzo inalipa mkopo (pamoja na 5% ya CTM). Kichupo cha Oda > Pokea Mkopo.',read:false,ts:now});
    await d.ref.update({loanOfferAt:now});n++;}
  return n;}
module.exports={grantLoan,inviteBroker,sweep,SHOP_FEE,CAP};
