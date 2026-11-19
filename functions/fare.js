/* CTM - Hesabu ya nauli ya usafirishaji (umbali -> piki piki / gari / basi).
   Faili hii inatumika na browser (public/fare.js) na seva (functions/fare.js).
   MUHIMU: faili mbili ziwe NAKALA SAWA, ili bei anayoona mteja ndiyo inayotozwa na seva.
   Ukibadilisha hapa, nakili kwenda functions/fare.js (cp public/fare.js functions/fare.js). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.CTMFare = factory();
})(this, function () {
  /* Katikati ya kila mkoa (lat,lng) - kwa makadirio ya umbali kati ya mikoa */
  const RG = {'Arusha':[-3.39,36.68],'Dar es Salaam':[-6.79,39.21],'Dodoma':[-6.16,35.75],'Mwanza':[-2.52,32.9],'Mbeya':[-8.9,33.46],'Kilimanjaro':[-3.35,37.34],'Tanga':[-5.07,39.1],'Morogoro':[-6.82,37.66],'Zanzibar':[-6.16,39.19],'Manyara':[-4.21,35.75],'Iringa':[-7.77,35.69],'Kagera':[-1.33,31.81],'Kigoma':[-4.88,29.63],'Mtwara':[-10.27,40.18],'Singida':[-4.82,34.74],'Tabora':[-5.02,32.8],'Ruvuma':[-10.68,35.65],'Shinyanga':[-3.66,33.42],'Lindi':[-9.99,39.71],'Pwani':[-6.77,38.92],'Geita':[-2.87,32.23],'Simiyu':[-2.8,33.98],'Katavi':[-6.34,31.07],'Njombe':[-9.34,34.77],'Songwe':[-9.17,32.93],'Rukwa':[-7.96,31.62],'Mara':[-1.5,33.8]};
  const NAMES = Object.keys(RG);

  /* Stendi ya basi ambako mzigo unatua (mkoa usioorodheshwa unapata jina la kawaida). Badilisha hapa ukitaka majina kamili zaidi. */
  const STANDS = {
    'Dar es Salaam': 'Magufuli Bus Terminal (Mbezi Luis)',
    'Dodoma': 'Dodoma Bus Terminal (Nzuguni)',
    'Arusha': 'Kituo Kikuu cha Mabasi Arusha'
  };
  const standOf = r => STANDS[r] || ('Stendi Kuu ya Mabasi - ' + r);

  /* Bei za kawaida: [nauli ya kuanzia, kwa kila km] kwa TZS. Muuzaji anaweza kuzibadilisha kwenye akaunti yake (account.fare). */
  const DEF = { boda: [1000, 500], car: [3000, 1200], bus: [3000, 35] };
  /* Mipaka: piki piki hadi km 30, gari hadi km 120, basi kuanzia km 20 */
  const LIM = { bodaMax: 30, carMax: 120, busMin: 20 };
  const SPEED = { boda: 25, car: 35, bus: 50 }; /* km/h kwa makadirio ya muda */
  const ROAD_CITY = 1.3, ROAD_HWY = 1.25;       /* umbali wa barabara ukilinganisha na umbali wa moja kwa moja */

  const num = v => typeof v === 'number' && isFinite(v);
  const hav = (a, b, c, d) => {
    const r = x => x * Math.PI / 180;
    const k = Math.sin(r(c - a) / 2) ** 2 + Math.cos(r(a)) * Math.cos(r(c)) * Math.sin(r(d - b) / 2) ** 2;
    return 12742 * Math.asin(Math.sqrt(k));
  };
  const nearest = (la, ln) => NAMES.reduce((b, n) => hav(la, ln, RG[n][0], RG[n][1]) < hav(la, ln, RG[b][0], RG[b][1]) ? n : b, NAMES[0]);
  const round = (x, s) => Math.max(s, Math.round(x / s) * s);
  const pair = (v, d) => (Array.isArray(v) && num(+v[0]) && num(+v[1]) && +v[0] >= 0 && +v[1] >= 0) ? [+v[0], +v[1]] : d;

  function cfg(a) {
    const f = (a && a.fare) || {};
    return {
      boda: pair(f.boda, DEF.boda), car: pair(f.car, DEF.car), bus: pair(f.bus, DEF.bus),
      freeOver: Math.max(0, +f.freeOver || 0), off: f.off || {}
    };
  }

  /* shop: {lat,lng,locMarked,region,distanceKm,fare}   cust: {lat,lng,region}   goods: jumla ya bei ya bidhaa za duka hilo */
  function quote(shop, cust, goods) {
    shop = shop || {}; cust = cust || {};
    const c = cfg(shop);
    const sReg = (RG[shop.region] ? shop.region : null) || (num(+shop.lat) && shop.lat != null && shop.lng != null ? nearest(+shop.lat, +shop.lng) : 'Arusha');
    const marked = shop.locMarked !== false && shop.lat != null && shop.lng != null && num(+shop.lat) && num(+shop.lng);
    const sPos = marked ? [+shop.lat, +shop.lng] : RG[sReg];
    const gps = cust.lat != null && cust.lng != null && num(+cust.lat) && num(+cust.lng);
    const cLat = gps ? +cust.lat : null, cLng = gps ? +cust.lng : null;
    const cReg = gps ? nearest(cLat, cLng) : ((RG[cust.region] ? cust.region : null) || sReg);

    let crow;
    if (gps) crow = hav(sPos[0], sPos[1], cLat, cLng);
    else if (cReg !== sReg) crow = hav(sPos[0], sPos[1], RG[cReg][0], RG[cReg][1]);
    else crow = Math.max(0.7, (+shop.distanceKm || 2) / ROAD_CITY);
    const est = !(gps && marked); /* true = makadirio (eneo la mteja au la duka halijawekwa) */
    const city = Math.max(0.5, Math.round(crow * ROAD_CITY * 10) / 10);
    const hwy = Math.max(0.5, Math.round(crow * ROAD_HWY * 10) / 10);

    /* gari: baada ya km 30 bei kwa km inapungua nusu (safari ndefu) */
    const price = (k, km) => round(c[k][0] + c[k][1] * (k === 'car' ? Math.min(km, 30) + 0.5 * Math.max(0, km - 30) : km), 500);
    const modes = {
      boda: { id: 'boda', ok: city <= LIM.bodaMax && !c.off.boda, km: city, fee: price('boda', city), eta: Math.round(city / SPEED.boda * 60 + 10) },
      car: { id: 'car', ok: city <= LIM.carMax && !c.off.car, km: city, fee: price('car', city), eta: Math.round(city / SPEED.car * 60 + 10) },
      bus: { id: 'bus', ok: hwy >= LIM.busMin && !c.off.bus, km: hwy, fee: price('bus', hwy), eta: Math.round(hwy / SPEED.bus * 60 + 60), stand: standOf(cReg), region: cReg }
    };
    modes.boda.why = c.off.boda ? 'Muuzaji hatumii piki piki' : (city > LIM.bodaMax ? 'Umbali ni mkubwa kwa piki piki (zaidi ya ' + LIM.bodaMax + ' km)' : '');
    modes.car.why = c.off.car ? 'Muuzaji hatumii gari' : (city > LIM.carMax ? 'Umbali ni mkubwa kwa gari - tumia basi' : '');
    modes.bus.why = c.off.bus ? 'Muuzaji hatumii basi' : (hwy < LIM.busMin ? 'Umbali ni mfupi - tumia piki piki au gari' : '');

    const free = c.freeOver > 0 && num(goods) && goods >= c.freeOver;
    if (free) Object.keys(modes).forEach(k => { modes[k].fee = 0; modes[k].free = true; });
    const def = modes.boda.ok ? 'boda' : modes.car.ok ? 'car' : modes.bus.ok ? 'bus' : null;
    return { modes, def, km: city, crow, sReg, cReg, est, free, freeOver: c.freeOver };
  }

  return { RG, NAMES, STANDS, DEF, LIM, hav, nearest, quote, standOf, cfg };
});
