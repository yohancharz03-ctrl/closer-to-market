/* Hutumika kila dakika (netlify.toml schedule): push za notifs mpya + mkopo wa kiotomatiki + ofa za mkopo. */
const admin=require('firebase-admin'),init=require('../lib/init');
exports.handler=async()=>{try{init();const db=admin.firestore(),n=await require('../lib/push')(db,admin);let l=0;try{l=await require('../lib/loan').sweep(db);}catch(e){console.warn('loan sweep',e.message);}return{statusCode:200,body:String(n)+'/'+l};}catch(e){console.warn('sweep',e.message);return{statusCode:500,body:e.message};}};
