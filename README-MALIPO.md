# CTM v28 – Hatua za kuweka (GitHub + Netlify)
1. Weka folda hii kwenye GitHub; Netlify > Add site > Import from Git (publish `public`, functions `netlify/functions`).
2. Netlify > Environment variables:
   - FIREBASE_SERVICE_ACCOUNT = JSON nzima ya service account (Firebase > Project settings > Service accounts)
   - SMS_SECRET = neno refu la siri unalotunga
   - LIVEKIT_KEY, LIVEKIT_SECRET (kutoka LiveKit Cloud); LIVEKIT_URL = wss://closer-to-market-6f7j9wvm.livekit.cloud
   - (hiari) CTM_PAY, CTM_HELP – zinatumika kama admin hajaweka ndani ya app
3. Firebase Console > Firestore > Rules: bandika `firestore.production.rules` > Publish.
4. SMS Forwarder (simu ya Android ya CTM): URL `https://SITE.netlify.app/api/sms-in`, header `x-secret: SMS_SECRET`,
   JSON `{"from":"%from%","text":"%text%"}`, chuja SMS za M-PESA/Vodacom pekee, ruhusu kufanya kazi nyuma.
5. Ingia kama admin > Akaunti > Mipangilio: "Namba za Malipo & Help", "SMS & Madai ya Malipo", "Weka Story ya CTM".
