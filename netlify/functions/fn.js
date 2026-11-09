/* Adapter: /api/fn/<jina> inaendesha onCall zilizopo kwenye functions/index.js bila Blaze. */
const admin=require('firebase-admin'),fns=require('../../functions/index.js');
exports.handler=async ev=>{const R=(c,o)=>({statusCode:c,headers:{'content-type':'application/json'},body:JSON.stringify(o)});
  const name=(ev.path||'').split('/').pop(),f=fns[name];if(ev.httpMethod!=='POST'||!f||typeof f.run!=='function')return R(404,{error:'Haipo'});
  let tok;try{tok=await admin.auth().verifyIdToken(String(ev.headers.authorization||'').replace('Bearer ',''));}catch(e){return R(401,{error:'Ingia kwanza'});}
  if(name==='withdraw'){try{await require('../lib/pin')(admin.firestore()).verify(tok.uid,(JSON.parse(ev.body||'{}')).pin);}catch(e){return R(e.status||500,{error:e.message});}}
  try{const data=JSON.parse(ev.body||'{}'),r=await f.run({auth:{uid:tok.uid,token:tok},data,rawRequest:{}});return R(200,{data:r});}
  catch(e){return R(e.httpErrorCode?e.httpErrorCode.status:500,{error:e.message||'Hitilafu'});}};
