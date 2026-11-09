// Netlify Function: inatengeneza token za LiveKit upande wa SEVA (siri hazionekani kwa mtumiaji)
// Env vars (Netlify > Site settings > Environment variables):
//   LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET, FIREBASE_API_KEY
const { AccessToken, RoomServiceClient } = require('livekit-server-sdk');
const H = { 'Content-Type': 'application/json' };
const out = (c, b) => ({ statusCode: c, headers: H, body: JSON.stringify(b) });

async function verify(idToken) {
  if (!idToken) throw new Error('Hujaingia');
  const r = await fetch('https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=' + process.env.FIREBASE_API_KEY, {
    method: 'POST', headers: H, body: JSON.stringify({ idToken })
  });
  const j = await r.json();
  if (!r.ok || !j.users || !j.users[0]) throw new Error('Token ya akaunti si sahihi');
  return j.users[0].localId;
}

exports.handler = async (ev) => {
  if (ev.httpMethod !== 'POST') return out(405, { error: 'POST tu' });
  try {
    const uid = await verify((ev.headers.authorization || '').replace(/^Bearer /i, ''));
    const b = JSON.parse(ev.body || '{}');
    const { LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET } = process.env;
    const liveId = String(b.liveId || '').replace(/[^\w-]/g, '').slice(0, 30);
    const myRoom = `live-${uid}-${liveId}`;

    if (b.action === 'room') return out(200, { room: myRoom, identity: uid });

    if (b.action === 'token') {
      const host = !!b.host;
      const room = host ? myRoom : String(b.room || '');
      if (!/^live-[\w-]+-[\w-]+$/.test(room)) throw new Error('Jina la room si sahihi');
      if (host && !liveId) throw new Error('liveId inakosekana');
      const at = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
        identity: uid, name: String(b.name || '').slice(0, 20), ttl: '3h'
      });
      // Mwenyeji tu ndiye anaweza kutuma video/sauti; watazamaji husikiliza tu (hadi wapandishwe)
      at.addGrant({ room, roomJoin: true, canSubscribe: true, canPublish: host, canPublishData: false });
      return out(200, { token: await at.toJwt(), url: LIVEKIT_URL });
    }

    if (b.action === 'promote' || b.action === 'demote') {
      const room = String(b.room || '');
      if (!room.startsWith(`live-${uid}-`)) throw new Error('Si room yako');
      const svc = new RoomServiceClient(LIVEKIT_URL.replace(/^wss:/, 'https:'), LIVEKIT_API_KEY, LIVEKIT_API_SECRET);
      await svc.updateParticipant(room, String(b.identity), undefined, {
        canSubscribe: true, canPublish: b.action === 'promote', canPublishData: false
      });
      return out(200, { ok: true });
    }
    return out(400, { error: 'action haijulikani' });
  } catch (e) {
    return out(400, { error: e.message || 'Hitilafu' });
  }
};
