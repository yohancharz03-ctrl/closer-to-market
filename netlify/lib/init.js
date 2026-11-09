const admin=require('firebase-admin');
module.exports=()=>{if(!admin.apps.length){let raw=String(process.env.FIREBASE_SERVICE_ACCOUNT||'').trim();if(!raw)throw new Error('FIREBASE_SERVICE_ACCOUNT haijawekwa kwenye Netlify');
  if(raw[0]!=='{')raw=Buffer.from(raw,'base64').toString('utf8');const j=JSON.parse(raw);if(j.private_key)j.private_key=j.private_key.split('\\n').join('\n');admin.initializeApp({credential:admin.credential.cert(j)});}return admin;};
