/* Token ya LiveKit (HS256, bila maktaba). POST /api/lk  {room, publish:true|false}  + Bearer idToken
   Env: LIVEKIT_KEY, LIVEKIT_SECRET, LIVEKIT_URL (wss://closer-to-market-6f7j9wvm.livekit.cloud) */
const c=require('crypto'),admin=require('firebase-admin'),init=require('../lib/init');
const b=o=>Buffer.from(JSON.stringify(o)).toString('base64url'),R=(s,o)=>({statusCode:s,headers:{'content-type':'application/json'},body:JSON.stringify(o)});
exports.handler=async ev=>{if(ev.httpMethod!=='POST')return R(405,{error:'POST'});try{init();}catch(e){return R(500,{error:'Seva: '+e.message});}
  let u;try{u=await admin.auth().verifyIdToken(String(ev.headers.authorization||'').replace('Bearer ',''));}catch(e){return R(401,{error:'Ingia kwanza'});}
  if(!process.env.LIVEKIT_KEY||!process.env.LIVEKIT_SECRET)return R(500,{error:'LiveKit haijawekwa'});
  const d=JSON.parse(ev.body||'{}'),room=String(d.room||'').slice(0,80).replace(/[^\w-]/g,'');if(!room)return R(400,{error:'room?'});
  const db=admin.firestore(),acc=(await db.doc('accounts/'+u.uid).get()).data()||{},now=Math.floor(Date.now()/1000),m=room.match(/^live_(\d+)$/);let can=false;
  if(m&&d.publish){const lv=(await db.doc('lives/'+m[1]).get()).data();can=!!lv&&(lv.hostId===acc.id||(lv.guests||[]).some(g=>g.id===acc.id));}
  const p={iss:process.env.LIVEKIT_KEY,sub:u.uid,name:String(acc.shopName||acc.name||'Mgeni').slice(0,40),metadata:String(acc.id==null?'':acc.id),nbf:now-10,exp:now+6*3600,video:{room,roomJoin:true,canPublish:can,canSubscribe:true,canPublishData:false}},
  h=b({alg:'HS256',typ:'JWT'})+'.'+b(p);
  return R(200,{canPublish:can,token:h+'.'+c.createHmac('sha256',process.env.LIVEKIT_SECRET).update(h).digest('base64url'),url:process.env.LIVEKIT_URL||'wss://closer-to-market-6f7j9wvm.livekit.cloud'});};
