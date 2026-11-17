/* CTM Trust-Flow: seva ya malipo (Netlify Function). Njia:
   POST|GET /api/sms-in  (Forwarder; siri kwa header x-secret / Bearer / ?secret=) -> inahifadhi SMS halisi ya CTM
   POST /api/claim    (mteja, Bearer idToken)       -> {text, mode:'deposit'|'order'|'fee', orderIds:[]}  (fee = ada ya duka/deni la usajili)
   POST /api/admin    (admin, Bearer idToken)       -> {action:'approve'|'reject', txId}
   Env: FIREBASE_SERVICE_ACCOUNT (JSON), SMS_SECRET */
const admin=require('firebase-admin'),init=require('../lib/init');let db,inc,union;
const R=(c,o)=>({statusCode:c,headers:{'content-type':'application/json'},body:JSON.stringify(o)});
const rid=()=>Date.now()*1000+Math.floor(Math.random()*1000),P=u=>db.doc('private/'+u);

/* Msomaji wa SMS (mitandao yote). Kinachoshindikana kinaenda kwa admin. */
function parse(t){t=String(t||'').replace(/\s+/g,' ');
  const tok=(t.match(/\b[A-Za-z0-9][A-Za-z0-9.]{7,24}[A-Za-z0-9]\b/g)||[]).find(x=>/[A-Za-z]/.test(x)&&/\d/.test(x)&&!/^(\+?255|0)\d+$/.test(x));
  const LAB='(?:Transaction ID|Transaction No|Trans(?:action)? ?(?:ID|No)|Muamala ID|Muamala|Miamala|Reference(?: No)?|Kumbukumbu|Ref(?: No)?\\.?|TxnId|Txn ID|Trx ?ID|TID)';
  const id=(t.match(new RegExp(LAB+'[:.\\s#-]*(?:ID|No|namba|nambari|number)?[:.\\s#-]*([A-Za-z0-9][A-Za-z0-9.]{6,24}[A-Za-z0-9])','i'))||[])[1]||tok;
  const am=(t.match(/(?:TZS|Tshs?)\.?\s?([\d][\d,]*(?:\.\d+)?)/i)||t.match(/([\d][\d,]*(?:\.\d+)?)\s?(?:TZS|Tshs?)/i)||[])[1];
  const fr=(t.match(/(?:kutoka kwa|kutoka|from)\s+(.+?)(?=\s+(?:tarehe|mnamo|saa|on|at|Salio|Balance|New|Muamala|Kumbukumbu|Ref|Transaction|Trans|kwa|for|Lipa|malipo)\b|\s*\.\s|\s*\.\s*$|$)/i)||[])[1]||'';
  const src=(fr.split(/[:,-]/)[0]||'').trim().slice(0,30);
  const nm=fr.replace(/(?:\+?255|0)[67]\d{8}/g,' ').replace(/[^A-Za-z ]/g,' ').replace(/\s+/g,' ').trim().slice(0,40);
  const ph=(t.match(/(?:\+?255|0)[67]\d{8}/)||[])[0];
  const dt=(t.match(/\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4}(?:\s+(?:saa\s+|at\s+)?\d{1,2}[:.]\d{2})?/i)||[])[0];
  const fe=(t.match(/Ada\s+Jumla\s+(?:TZS|Tshs?)\.?\s?([\d,]+(?:\.\d+)?)/i)||[])[1];
  return{fee:fe?Math.round(parseFloat(fe.replace(/,/g,''))):0,txId:id&&id.toUpperCase(),amount:am?Math.round(parseFloat(am.replace(/,/g,''))):0,src,name:nm,phone:ph?ph.slice(-9):'',date:dt||''};}
/* Pesa iliyoingia au iliyotoka? Pesa iliyotoka (umetuma, withdraw, umelipa...) HAIKUBALIWI kamwe kama malipo. */
const IN_RE=/(received|umepokea|imepokelewa|umepokelewa|zimeingia|imeingia|umewekewa|credited|deposited|umetumiwa)/i,OUT_RE=/(\bsent to\b|umetuma|imetumwa kwa|umelipa|withdraw|umetoa|imetolewa|paid to|bill payment|airtime|umenunua)/i;
const direction=t=>{const i=IN_RE.test(t),o=OUT_RE.test(t);return i&&!o?'in':o&&!i?'out':i&&o?'mixed':'unknown';};
/* Mtumaji anayeruhusiwa: majina ya mitandao ya pesa/benki (mf. MPESA, TIGOPESA, AirtelMoney, HALOPESA). Namba za kawaida za simu ZINAKATALIWA
   (mtu angeweza kutuma SMS feki kwenye simu ya kupokea). Ongeza zaidi kwa env SMS_SENDERS="15200,JINA"; SMS_ALLOW_ANY=1 inazima ukaguzi (majaribio tu). */
const SENDERS=/mpesa|m-pesa|vodacom|tigo|mixx|yas|airtel|halo|ttcl|t-pesa|tpesa|azam|selcom|crdb|nmb|nbc|equity|stanbic|exim|dtb|absa/i;
const okSender=f=>{const x=String(f||'').replace(/\s/g,'');if(process.env.SMS_ALLOW_ANY==='1')return true;if(!x)return false;
  if((process.env.SMS_SENDERS||'').split(',').some(y=>y.trim()&&x.toLowerCase()===y.trim().toLowerCase().replace(/\s/g,'')))return true;
  if(/^\+?\d[\d-]{4,}$/.test(x))return false;return SENDERS.test(x);};
const pickF=(o,ks)=>{for(const k of ks){const v=o&&o[k];if(v!=null&&String(v).trim()!=='')return String(v);}return'';};
function readBody(ev){let raw=ev.body||'';if(ev.isBase64Encoded)raw=Buffer.from(raw,'base64').toString('utf8');raw=String(raw);
  try{const j=JSON.parse(raw);if(j&&typeof j==='object'&&!Array.isArray(j))return j;}catch(e){}
  if(/application\/x-www-form-urlencoded/i.test((ev.headers||{})['content-type']||'')||/^[\w.\[\]-]+=/.test(raw.trim())){try{return Object.fromEntries(new URLSearchParams(raw));}catch(e){}}
  const tx=raw.match(/"(?:text|message|body|content|msg|sms)"\s*:\s*"([\s\S]*?)"\s*(?:,\s*"|\}\s*$)/),fr=raw.match(/"(?:from|sender|address)"\s*:\s*"([\s\S]*?)"\s*(?:,|\})/); // JSON mbovu (mstari mpya ndani ya ujumbe)
  if(tx)return{text:tx[1],from:fr?fr[1]:''};return raw.trim()?{text:raw}:{};}
const safeEq=(a,b)=>{a=Buffer.from(String(a||''));b=Buffer.from(String(b||''));return a.length===b.length&&require('crypto').timingSafeEqual(a,b);};
/* Njia ya SMS Forwarder: POST au GET /api/sms-in (siri: header x-secret, Authorization: Bearer, au ?secret=). Inakubali JSON, form au maandishi matupu. */
async function smsIn(ev){
  const sec=process.env.SMS_SECRET;if(!sec)return R(500,{error:'SMS_SECRET haijawekwa kwenye Netlify'});
  const h=Object.fromEntries(Object.entries(ev.headers||{}).map(([k,v])=>[k.toLowerCase(),v])),q=ev.queryStringParameters||{},b=ev.httpMethod==='POST'?readBody(ev):{};
  const got=h['x-secret']||h['x-api-key']||String(h.authorization||'').replace(/^Bearer\s+/i,'')||q.secret||q.key||q.token||b.secret||b.key||'';
  if(!safeEq(got,sec))return R(403,{error:'no'});
  const st=db.doc('smsStatus/main');
  if(ev.httpMethod!=='POST'){await st.set({pingAt:Date.now()},{merge:true});return R(200,{ok:true,message:'CTM SMS endpoint tayari. Tuma SMS kwa POST.'});}
  const from=pickF(Object.assign({},q,b),['from','sender','address','number','originatingAddress','originating_address','source','sms_from','phone']).slice(0,40),
        text=pickF(Object.assign({},q,b),['text','message','msg','body','content','sms','sms_body','smsBody','messageBody']).slice(0,1000);
  if(!text.trim())return R(400,{error:'Hakuna maandishi ya SMS (text/message/body/content)'});
  const p=parse(text),dir=direction(text),now=Date.now();let reason=null;
  if(!okSender(from))reason='sender';else if(dir!=='in')reason=dir==='out'?'outgoing':dir==='mixed'?'ambiguous':'not-incoming';else if(!p.txId||!p.amount)reason='unparsed';
  const hid=require('crypto').createHash('sha1').update(from+'|'+text).digest('hex').slice(0,24),rr=db.doc('rawSms/'+hid);
  try{await rr.create({from,text:text.slice(0,600),parsed:p,dir,reason:reason||'',ts:now,n:1});}catch(e){await rr.update({n:inc(1),lastAt:now}).catch(()=>{});}
  await st.set({lastAt:now,lastFrom:from,lastReason:reason||'ok',lastTx:p.txId||'',total:inc(1),...(reason?{}:{okCount:inc(1),lastOkAt:now})},{merge:true}).catch(()=>{});
  if(reason){ // SMS inayoonekana ya pesa lakini imekataliwa: mwambie admin (kwa kiasi: 1 kwa dakika 10-30) ili asigundue muda mrefu baadaye kuwa forwarder haijaundwa sawa
    try{const money=/(?:TZS|Tsh)/i.test(text)&&/(received|umepokea|imepokelewa|umepokelewa)/i.test(text),k=reason==='unparsed'?'unparsedNotifAt':reason==='sender'?'senderNotifAt':'';
      if(k&&money){const sd=(await st.get()).data()||{};if(now-(sd[k]||0)>(reason==='unparsed'?10:30)*60000){await st.set({[k]:now},{merge:true});
        await notifyAdmins(reason==='unparsed'?'SMS ya Pesa Haikueleweka ⚠':'SMS ya Pesa Imekataliwa ⚠',reason==='unparsed'?`Imepokelewa SMS inayoonekana ya pesa kutoka "${from}" lakini kiasi au Transaction ID hakikusomeka. Hakiki: Akaunti > SMS Forwarder.`:`SMS inayoonekana ya pesa imetoka kwa "${from||'(haijulikani)'}" ambaye si mtandao wa pesa unaojulikana. Kama ni sahihi, ongeza jina lake kwenye SMS_SENDERS (Netlify), na hakikisha template ya forwarder ina %from%.`,'Malipo');}}}catch(e){}
    return R(200,{ok:true,parsed:false,reason});} // admin ataona pia kwenye SMS Forwarder / SMS & Madai ya Malipo
  const ref=db.doc('bankTx/'+p.txId);let isNew=false;
  if(!(await ref.get()).exists){await ref.create(Object.assign({},p,{text:text.slice(0,600),from,ts:now,usedBy:null}));isNew=true;}
  const c=await db.doc('claims/'+p.txId).get();let r=null;if(c.exists&&['pending','short','review'].includes(c.data().status))r=await settle(p.txId,null);
  if(isNew&&!(r&&r.status==='done'))try{await notifyAdmins('SMS ya Pesa Imeingia 💰',`TZS ${p.amount.toLocaleString()} kutoka ${p.name||p.phone||from||'?'} (Muamala ${p.txId}). ${c.exists?'Dai la mteja lipo ('+(r?r.status:c.data().status)+') - hakiki kwenye SMS & Madai ya Malipo.':'Bado hakuna dai la mteja; akibandika SMS litathibitishwa lenyewe.'}`,'Malipo');}catch(e){}
  return R(200,{ok:true,parsed:true,new:isNew,settled:r});}
const norm=s=>String(s||'').toLowerCase().replace(/[^a-z ]/g,'').split(' ').filter(x=>x.length>2);
const note=(t,a,title,details,cat)=>{const id=rid();t.set(db.doc('notifs/'+id),{id,toId:a.id,toUid:a.uid,title,category:cat||'Oda & Malipo',details,read:false,ts:Date.now()});};
const SHOP_FEE=10000,DAY=864e5,FEE_DAYS=90;
async function notifyAdmins(title,details,cat){const q=await db.collection('accounts').where('role','==','admin').get(),b=db.batch();
  q.forEach(d=>{const a=d.data(),id=rid();b.set(db.doc('notifs/'+id),{id,toId:a.id,toUid:a.uid,title,category:cat||'Usajili',details,read:false,ts:Date.now()});});await b.commit();}
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
      note(t,{id:acc.id,uid:cl.uid},'Malipo ya Ada Yamekubaliwa ✅',msgV.trim(),'Usajili');
      ads.forEach(d=>note(t,d.data(),'Malipo ya Ada ya Duka Yamekubaliwa',`${acc.shopName||acc.name} amelipa TZS ${use.toLocaleString()} (Muamala ${txId}).${pd?' Deni la mkopo limesalia TZS '+left.toLocaleString()+'.':''}${per?' Muda umeongezwa siku '+FEE_DAYS*per+'.':''}`,'Usajili'));
      held.fee=use;}
    if(ex>0){t.set(P(cl.uid),{walletBalance:inc(ex),tx:union({t:cl.mode==='order'?'Ziada ya oda':cl.mode==='fee'?'Ziada ya ada':'Deposit',a:ex,n:txId,ts:Date.now()})},{merge:true});led(t,'wallet_in',ex,txId,'Wallet '+cl.uid);}
    manualNew?t.set(bref,Object.assign({},bt,{txId,manual:true,ts:Date.now(),usedBy:cl.uid,usedAt:Date.now()})):t.update(bref,{usedBy:cl.uid,usedAt:Date.now()});t.set(cref,Object.assign({},cl,{status:'done',amount:amt,excess:ex}));
    return{status:'done',escrow:cl.mode==='order'?amt-ex:0,fee:held.fee||0,wallet:ex};});}

const handler0=async ev=>{
  try{init();}catch(e){return R(500,{error:'Seva: '+e.message});}db=admin.firestore();inc=admin.firestore.FieldValue.increment;union=admin.firestore.FieldValue.arrayUnion;
  const route=(ev.path||'').split('/').pop(),body=(()=>{try{return JSON.parse(ev.body||'{}')}catch(e){return{}}})();
  if(route==='sms-in'||route==='sms'){try{return await smsIn(ev);}catch(e){console.warn('sms-in',e);return R(500,{error:e.message});}}
  if(ev.httpMethod!=='POST')return R(405,{error:'POST tu'});
  let u;try{u=await admin.auth().verifyIdToken(String((ev.headers.authorization||'').replace('Bearer ','')));}catch(e){return R(401,{error:'Ingia kwanza'});}
  const me=(await db.doc('accounts/'+u.uid).get()).data();if(!me)return R(403,{error:'Akaunti haipo'});
  if(route==='sms-status'||route==='sms-test'){if(me.role!=='admin')return R(403,{error:'Admin tu'});
    if(route==='sms-test'){const tx=String(body.text||'').slice(0,1000),fr=String(body.from||'').slice(0,40),p=parse(tx),dir=direction(tx),sOk=okSender(fr);
      const reason=!sOk?'sender':dir!=='in'?(dir==='out'?'outgoing':dir==='mixed'?'ambiguous':'not-incoming'):(!p.txId||!p.amount)?'unparsed':'';return R(200,{parsed:p,dir,senderOk:sOk,accepted:!reason,reason});}
    const stt=(await db.doc('smsStatus/main').get()).data()||{},rs=await db.collection('rawSms').orderBy('ts','desc').limit(10).get();
    return R(200,{configured:!!process.env.SMS_SECRET,allowAny:process.env.SMS_ALLOW_ANY==='1',extraSenders:(process.env.SMS_SENDERS||'').split(',').filter(Boolean).length,status:stt,recent:rs.docs.map(d=>{const x=d.data();return{from:x.from,text:x.text,parsed:x.parsed,dir:x.dir,reason:x.reason,ts:x.ts,n:x.n||1};})});}
  if(route==='push-token'){const tk=String(body.token||'');if(tk.length<40||tk.length>4096)return R(400,{error:'Token si sahihi'});
    try{const ref=P(u.uid),ex=((await ref.get()).data()||{}).fcmTokens||[],all=[...new Set([...ex.filter(Boolean),tk])].slice(-5);await ref.set({fcmTokens:all},{merge:true});return R(200,{ok:true,count:all.length});}catch(e){return R(500,{error:e.message});}}
  if(route==='push-test'){try{const r=await require('../lib/push').sendTo(db,admin,u.uid,{title:'Jaribio la Arifa ✅',body:'Ukiona hii ukiwa nje ya app, arifa za nje zinafanya kazi.',kind:'mengine',tag:'ctm-test'});return R(200,r);}catch(e){return R(500,{error:e.message});}}
  if(route==='wd'){ // MAOMBI YA KUTOA PESA (admin tu): list | paid | reject (rudisha pesa kwenye wallet)
    if(me.role!=='admin')return R(403,{error:'Admin tu'});
    if(body.op==='list'){const q=await db.collection('withdrawals').orderBy('ts','desc').limit(60).get();return R(200,{items:q.docs.map(d=>d.data())});}
    const id=String(body.id||'').replace(/\W/g,''),ref=db.doc('withdrawals/'+id);
    if(body.op==='paid'||body.op==='reject')try{return R(200,await db.runTransaction(async t=>{const w=(await t.get(ref)).data();if(!w)throw new Error('Ombi halipo');if(w.status!=='pending')throw new Error('Ombi hili limeshashughulikiwa ('+w.status+')');
        const acc=(await t.get(db.doc('accounts/'+w.uid))).data()||{},pay=w.payout||{};
        if(body.op==='paid'){t.update(ref,{status:'paid',paidAt:Date.now(),paidBy:u.uid,ref:String(body.ref||'').slice(0,40)});
          note(t,{id:w.accountId,uid:w.uid},'Pesa Yako Imetumwa ✅',`TZS ${w.amount.toLocaleString()} imetumwa ${pay.network||''} ${pay.number||''}${body.ref?' (kumbukumbu '+String(body.ref).slice(0,40)+')':''}.`,'Malipo');return{ok:true,status:'paid'};}
        const back=w.amount+(w.fee||0);t.set(P(w.uid),{walletBalance:inc(back),tx:union({t:'Ombi la kutoa pesa limekataliwa (rudishiwa)',a:back,ts:Date.now()})},{merge:true});
        t.update(ref,{status:'rejected',rejectedAt:Date.now(),rejectedBy:u.uid,reason:String(body.reason||'').slice(0,120)});
        note(t,{id:w.accountId,uid:w.uid},'Ombi la Kutoa Pesa Limekataliwa',`TZS ${back.toLocaleString()} imerudishwa kwenye Wallet yako.${body.reason?' Sababu: '+String(body.reason).slice(0,120):''}`,'Malipo');return{ok:true,status:'rejected'};}));}catch(e){return R(409,{error:e.message});}
    return R(400,{error:'op?'});}
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
/* Baada ya kila POST iliyofanikiwa: tuma push za arifa/ujumbe mpya mara moja (si kusubiri dakika moja). */
exports.handler=async ev=>{const r=await handler0(ev);try{if(ev.httpMethod==='POST'&&r&&r.statusCode<400&&!/push/.test(ev.path||'')){init();await require('../lib/push').kick(admin.firestore(),admin);}}catch(e){}return r;};
