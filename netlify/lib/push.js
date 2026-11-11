/* Hutuma FCM kwa notifs mpya (zisizotumwa bado). pushLog/{id} inazuia kurudia. */
module.exports=async(db,admin)=>{const since=Date.now()-15*60*1000,s=await db.collection('notifs').where('ts','>',since).orderBy('ts','desc').limit(60).get(),uidOf={};let sent=0;
  for(const d of s.docs){const n=d.data();if(!n||n.id==null)continue;
    try{await db.doc('pushLog/'+n.id).create({ts:Date.now()});}catch(e){continue;}
    let uid=n.toUid;if(!uid){if(!(n.toId in uidOf)){const q=await db.collection('accounts').where('id','==',n.toId).limit(1).get();uidOf[n.toId]=q.empty?null:q.docs[0].id;}uid=uidOf[n.toId];}
    if(!uid)continue;const tokens=(((await db.doc('private/'+uid).get()).data()||{}).fcmTokens||[]).filter(Boolean);if(!tokens.length)continue;
    try{await admin.messaging().sendEachForMulticast({tokens,notification:{title:String(n.title||'Closer Market').slice(0,80),body:String(n.details||'').replace(/<[^>]*>/g,'').slice(0,160)},webpush:{fcmOptions:{link:'/'}}});sent++;}catch(e){console.warn('fcm',e.message);}}
  return sent;};
