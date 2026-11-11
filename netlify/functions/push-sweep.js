/* Hutumika kila dakika (netlify.toml schedule): inatuma push za notifs mpya hata app ikiwa imefungwa. */
const admin=require('firebase-admin'),init=require('../lib/init');
exports.handler=async()=>{try{init();const n=await require('../lib/push')(admin.firestore(),admin);return{statusCode:200,body:String(n)};}catch(e){console.warn('sweep',e.message);return{statusCode:500,body:e.message};}};
