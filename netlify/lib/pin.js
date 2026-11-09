/* PIN ya wallet: hash (scrypt) + swali la kumbukumbu. PIN ya zamani haionyeshwi kamwe; mtu huweka mpya. */
const c=require('crypto'),H=(s,salt)=>c.scryptSync(String(s),salt,32).toString('hex'),nm=a=>String(a||'').toLowerCase().replace(/\s+/g,' ').trim();
const E=m=>{const e=new Error(m);e.status=403;return e;},ok4=p=>/^\d{4,6}$/.test(String(p||''));
module.exports=db=>{const R=u=>db.doc('walletPins/'+u);
  const chk=async(ref,d,good)=>{if(d.lockUntil>Date.now())throw E('Umekosea mara nyingi. Jaribu tena baada ya dakika '+Math.ceil((d.lockUntil-Date.now())/6e4));
    if(!good){const f=(d.fails||0)+1;await ref.update(f>=5?{fails:0,lockUntil:Date.now()+9e5}:{fails:f});throw E(f>=5?'Imefungwa kwa dakika 15.':'PIN au jibu si sahihi (jaribio '+f+'/5)');}
    if(d.fails)await ref.update({fails:0});};
  const api={
    async status(u){const d=(await R(u).get()).data();return{has:!!d,q:d?d.q:''};},
    async verify(u,pin){const ref=R(u),d=(await ref.get()).data();if(!d)throw E('Weka PIN ya wallet kwanza (Mipangilio > PIN ya Wallet).');await chk(ref,d,ok4(pin)&&H(pin,d.salt)===d.hash);return true;},
    async set(u,pin,q,a,old){const ref=R(u),d=(await ref.get()).data();if(d)await api.verify(u,old);
      if(!ok4(pin))throw E('PIN iwe namba 4 hadi 6.');q=String(q||'').trim();if(q.length<3||q.length>80||nm(a).length<2)throw E('Weka swali la kumbukumbu na jibu lake.');
      const salt=c.randomBytes(16).toString('hex');await ref.set({salt,hash:H(pin,salt),q,ah:H(nm(a),salt),fails:0,lockUntil:0,ts:Date.now()});},
    async reset(u,a,pin){const ref=R(u),d=(await ref.get()).data();if(!d)throw E('Hakuna PIN. Weka mpya.');if(!ok4(pin))throw E('PIN mpya iwe namba 4 hadi 6.');
      await chk(ref,d,H(nm(a),d.salt)===d.ah);await ref.update({hash:H(pin,d.salt)});}};
  return api;};
