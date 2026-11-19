/* MIPANGILIO YA FIREBASE (njia mbadala).
   Inatumika TU kama Netlify haijawekewa FIREBASE_* variables (au umeburuta folda 'public' pekee, bila functions).
   Jaza thamani zako kutoka: Firebase Console > Project settings (gia) > Your apps > Web app > SDK setup and configuration > Config.
   Hizi ni taarifa za UMMA za app ya web (si siri). USIWEKE service account hapa. */
(function () {
  var c = {
     apiKey: "AIzaSyCMZ9q0QQU9v9ctyyTWjjkMCSZpvKt66Fs",
  authDomain: "closer-to-market.firebaseapp.com",
  projectId: "closer-to-market",
  storageBucket: "closer-to-market.firebasestorage.app",
  messagingSenderId: "919367487706",
  appId: "1:919367487706:web:aac9f57f40737a8a6ed5e3",
  };
  if (!window.CTM_FIREBASE_CONFIG && c.apiKey && c.projectId && c.appId) window.CTM_FIREBASE_CONFIG = c;
})();
