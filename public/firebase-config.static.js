/* MIPANGILIO YA FIREBASE (njia mbadala).
   Inatumika TU kama Netlify haijawekewa FIREBASE_* variables (au umeburuta folda 'public' pekee, bila functions).
   Jaza thamani zako kutoka: Firebase Console > Project settings (gia) > Your apps > Web app > SDK setup and configuration > Config.
   Hizi ni taarifa za UMMA za app ya web (si siri). USIWEKE service account hapa. */
(function () {
  var c = {
    apiKey: "",
    authDomain: "",
    projectId: "",
    storageBucket: "",
    messagingSenderId: "",
    appId: ""
  };
  if (!window.CTM_FIREBASE_CONFIG && c.apiKey && c.projectId && c.appId) window.CTM_FIREBASE_CONFIG = c;
})();
