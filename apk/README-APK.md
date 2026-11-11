# Kutengeneza APK ya Closer Market (TWA - Trusted Web Activity)
APK hii ni "kifungashio" cha tovuti yako: kila ukisasisha Netlify, app inasasishwa yenyewe. Arifa zinakuja hata app ikiwa imefungwa (Chrome inazipokea).

## Mahitaji (kompyuta)
Node.js 18+, Java JDK 17, Android SDK (Bubblewrap inaweza kukusakinishia).

## Hatua
1. `npm i -g @bubblewrap/cli`
2. `cd apk` kisha `bubblewrap init --manifest https://closer-to-market.netlify.app/manifest.webmanifest`
   (inatumia mipangilio ya `twa-manifest.json`; jibu maswali ya keystore, weka password na uihifadhi!)
3. `bubblewrap build` -> inatoa `app-release-signed.apk` (jaribio) na `.aab` (Play Store).
4. `bubblewrap fingerprint` au `keytool -list -v -keystore android.keystore` -> nakili **SHA256**.
5. Weka SHA256 hiyo kwenye `public/.well-known/assetlinks.json` (badala ya WEKA:SHA256...), deploy Netlify. Hii inaondoa upau wa anwani juu ya app.
6. Simu: sakinisha APK (ruhusu "install unknown apps").

## Arifa za nyuma
- Firebase Console > Project settings > Cloud Messaging > **Web Push certificates** > Generate key pair. Nakili Key.
- Ingia kama admin > Malipo & Msaada > Namba za Malipo & Help > bandika **Web Push key (VAPID)** > Hifadhi.
- Mtumiaji afungue app, ruhusu Notifications. Server (Netlify) inatuma push kila dakika kwa notifs mpya.
- Netlify: Functions zihusishwe na `FIREBASE_SERVICE_ACCOUNT` (tayari).

## Play Store
Tumia faili la `.aab`; weka assetlinks sahihi (fingerprint ya Play App Signing pia).
