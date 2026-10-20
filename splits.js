/* Split-system decode + cross (Carrier & Trane → current Rheem R-454B splits).
   Same rules as the packaged engine: decode only printed codes (form + page cited per field), never drop voltage,
   never offer a lower efficiency tier, flag every mismatch. Split efficiency is an outdoor+indoor AHRI matchup property:
   this module never presents an outdoor-only number as the system rating. */
(function (root) {
  'use strict';
  function fT(t) { if (t == null || t === '') return ''; var x = +t; return isNaN(x) ? String(t) : String(Math.round(x * 10) / 10); } /* tonnage display: at most 1 decimal */

  var D = null, SP = null;
  function init(d) { D = d; SP = d.splits; }
  var VT = { '1PH': '208/230 V 1-ph', '3PH': '208/230 V 3-ph', '460': '460 V 3-ph', '575': '575 V 3-ph' };
  var STG = { single: 'single-stage', two: 'two-stage', variable: 'variable-speed / inverter' };
  var RVL = { '1PH': 'J', '3PH': 'C', '460': 'D' }, CVL = { '3PH': 'C', '460': 'D', '575': 'Y' };
  function fld(pos, code, meaning, src, page) { return { pos: pos, code: code, meaning: meaning, src: src, page: page || null }; }
  function fail(input, reason, extra) { return Object.assign({ ok: false, input: input, reason: reason }, extra || {}); }
  function tonsOf(sz) { return { '18': 1.5, '19': 1.5, '24': 2, '25': 2, '30': 2.5, '31': 2.5, '36': 3, '37': 3, '42': 3.5, '43': 3.5, '48': 4, '49': 4, '60': 5, '61': 5 }[sz]; }
  function rSize(t) { return { 1.5: '18', 2: '24', 2.5: '30', 3: '36', 3.5: '42', 4: '48', 5: '60' }[t]; }

  /* ---------------- Carrier residential (catalog ordering numbers only) ---------------- */
  function decCarrierRes(raw) {
    var m = /^(2[4-7])([STV])([CPN])(A)(\d)(\d{2})([A-Z])(\d)(\d)(\d)(\d?)$/.exec(raw);
    if (!m) return null;
    var famKey = raw.slice(0, 6), F = SP.carrier[famKey];
    if (!F) return fail(raw, 'Carrier split family ' + famKey + ' is not in the loaded literature (loaded: ' + Object.keys(SP.carrier).join(', ') + '). Nothing is guessed.');
    var cat = raw.slice(0, 12), vna = /VN/.test(famKey);
    if (m[11] && !vna) return fail(raw, 'Position 13 does not exist in the ' + famKey + ' nomenclature (' + D.sources[F.src].form + ' p.2).');
    if (F.models.indexOf(cat) < 0) return fail(raw, cat + ' is not a catalog ordering number printed in ' + D.sources[F.src].form + ' (p.' + F.catPage + '). Positions are not decoded piecemeal for residential splits.', { suggestions: F.models });
    var s = F.src, sz = m[6], t = tonsOf(sz);
    var volt = { '3': '1PH', '5': '3PH', '6': '460', '1': '575' }[m[10]];
    var f = [fld('1–2', m[1], { '24': 'R-410A (Puron) AC', '25': 'R-410A (Puron) heat pump', '26': 'Puron Advance R-454B AC', '27': 'Puron Advance R-454B heat pump' }[m[1]], s, 2),
      fld('3', m[2], F.stagingTxt, s, 2), fld('4', m[3], { C: 'Comfort', P: 'Performance', N: 'Infinity' }[m[3]] + ' tier', s, 2), fld('5', m[4], 'Initial (major) series', s, 2),
      fld('6', m[5], F.nominalTxt + ' (nominal)', s, 2), fld('7–8', sz, sz + ',000 Btu/h nominal (' + t + ' T)', s, 2),
      fld('9', m[7], (vna ? 'Variations: ' : 'Region: ') + F.region, s, 2), fld('10', m[8], 'Feature: standard', s, 2),
      fld('11', m[9], vna ? 'Open: not defined' : { '0': 'Special feature: standard', '1': 'Special feature: compressor electrical rating change', '2': 'Special feature: coil optimization' }[m[9]], s, 2),
      fld('12', m[10], 'Voltage: ' + VT[volt], s, 2)];
    if (m[11]) f.push(fld('13', m[11], 'Minor series', s, 2));
    var eff = { kind: 'range', text: 'Spec-sheet headline (outdoor unit, all indoor combinations): ' + F.head, page: 1, src: s };
    if (F.perSize && F.perSize[sz]) eff.perSize = { label: F.perSizeLabel, value: F.perSize[sz], page: F.perSizePage };
    var w = []; if (F.legacy) w.push('Legacy R-410A product — the cross is to current R-454B Rheem equipment.'); (F.flags || []).forEach(function (x) { w.push(x); });
    return { ok: true, input: raw, brand: 'Carrier', family: famKey, model: cat, cls: 'residential', type: F.type, refrigerant: F.refrigerant, legacy: F.legacy,
      attrs: { tons: t, size: sz, volt: volt, nominal: F.nominal, staging: F.staging, tier: F.tier }, fields: f, eff: eff, warnings: w, sources: [s] };
  }
  /* ---------------- Trane residential ---------------- */
  function decTraneRes(raw) {
    var m = /^5T([TWC])([A-Z])(\d)([05X])(\d{2})([A-Z])([1-9A-Z])?(\d{3})?([A-Z])?([A-Z])?$/.exec(raw);
    if (!m) return null;
    var fam = '5T' + m[1] + m[2] + m[3], F = SP.trane[fam];
    if (!F) return fail(raw, 'Trane split family ' + fam + ' is not in the loaded literature (loaded: ' + Object.keys(SP.trane).join(', ') + ').');
    var s = F.src, form = D.sources[s].form, p = F.nomPage;
    if (m[4] !== F.digit6) return fail(raw, 'Digit 6 = ' + m[4] + ' is not printed for ' + fam + ' (' + form + ' lists digit 6 = ' + F.digit6 + ').');
    if (F.sizes.indexOf(m[5]) < 0) return fail(raw, 'Tonnage digits ' + m[5] + ' are not a printed ' + fam + ' size (' + form + ': ' + F.sizes.join(', ') + ').');
    if (m[8] && m[8] !== '000') return fail(raw, 'Digits 11–13 = ' + m[8] + ' are not printed for ' + fam + ' (only 000).');
    var w = [], vd = m[7];
    if (!vd) {
      if (F.volts.length === 1) { vd = F.volts[0]; w.push('Voltage digit 10 not entered: every ' + fam + ' model printed in ' + form + ' is 208/230 V 1-ph (Power Conns. row), so 1-ph is used.'); }
      else return fail(raw, 'Enter the voltage digit (digit 10): ' + fam + ' is printed in 3 = 200-230/3/60 and 4 = 460/3/60 (' + form + ' p.' + p + ').');
    }
    if (F.volts.indexOf(vd) < 0) return fail(raw, 'Voltage digit ' + vd + ' is not printed for ' + fam + ' (' + form + ': ' + F.volts.join(', ') + ').');
    var volt = { '1': '1PH', '3': '3PH', '4': '460' }[vd], t = tonsOf(m[5]);
    var nw = F.style === 'new';
    var f = [fld('1', '5', 'Refrigerant: R-454B', s, p), fld('2', 'T', nw ? 'Brand: Trane' : 'TRANE', s, p),
      fld('3', m[1], nw ? { T: 'System type: AC', W: 'System type: HP', C: 'Cold climate heat pump' }[m[1]] : { T: 'Product type: split cooling', W: 'Product type: split heat pump' }[m[1]], s, p),
      fld('4', m[2], (nw ? { A: 'Light Commercial', B: 'XB', R: 'Wire Top Grille', V: 'VSPD', X: 'WeatherGuard Top' } : { V: 'Variable Speed', Z: 'Leadership – Two Stage', X: 'Leadership', R: 'Replacement/Retail', M: 'Basic', B: 'Basic', A: 'Light Commercial' })[m[2]] || '?', s, p),
      fld('5', m[3], (nw ? 'Nominal rated SEER2: ' : 'Family SEER: ') + F.nominal, s, p),
      fld('6', m[4], { '0': 'Brazed', '5': 'Mechanical', X: 'Link™' }[m[4]] + ' field connection', s, p),
      fld('7–8', m[5], 'Nominal tonnage ' + t + ' T', s, p), fld('9', m[6], 'Major design change', s, p),
      fld('10', vd + (m[7] ? '' : ' (not entered)'), 'Power supply: ' + VT[volt], s, p)];
    if (m[8]) f.push(fld('11–13', m[8], nw ? 'Other functions: 000 = typical, no meaning' : 'Secondary function', s, p));
    if (m[9]) f.push(fld('14', m[9], 'Minor design change', s, p));
    if (m[10]) f.push(fld('15', m[10], 'Service digit / unit parts identifier (not orderable)', s, p));
    if (F.note) w.push(F.note);
    return { ok: true, input: raw, brand: 'Trane', family: fam, model: raw, cls: 'residential', type: F.type, refrigerant: 'R-454B', legacy: false,
      attrs: { tons: t, size: m[5], volt: volt, nominal: F.nominal, staging: F.staging }, fields: f,
      eff: { kind: 'nominal', text: 'Trane prints no SEER2/EER2/HSPF2 in ' + form + ' — only the nominal SEER2 class in digit 5 (' + F.nominal + '). Compressor: ' + F.stagingTxt + '.', page: p, src: s }, warnings: w, sources: [s] };
  }
  /* ---------------- Carrier 38AX commercial ---------------- */
  function decCarrier38(raw) {
    if (!/^38AX/.test(raw)) return null;
    var C = SP.comm.c38AX, s = C.src, p = C.nomPage;
    var m = /^38AX([ZD])([MNTU])(\d{2})A0([ABCEMNPR])([156])(.*)$/.exec(raw);
    if (!m) return fail(raw, 'Not a complete 38AX model through position 12 (coil type, refrigerant option, tonnage, A0, coil option, voltage) per ' + D.sources[s].form + ' p.' + p + ', e.g. 38AXZM08A0A6. Voltage is required — it is never assumed.');
    if ((m[1] === 'Z') !== /[MN]/.test(m[2])) return fail(raw, 'Refrigerant option ' + m[2] + ' is not valid with coil type ' + m[1] + ' (M/N = single circuit Z only; T/U = dual circuit D only; p.' + p + ').');
    var R = C.rows[m[1] + m[3]];
    if (!R) return fail(raw, 'Tonnage code ' + m[3] + ' is not printed for 38AX' + m[1] + ' (Z: 07, 08, 12, 14, 16, 25; D: 12, 14, 16, 25, 28 — p.' + p + ').');
    var volt = { '5': '3PH', '6': '460', '1': '575' }[m[5]];
    var f = [fld('1–4', '38AX', 'Carrier condensing unit, Puron Advance R-454B', s, p), fld('5', m[1], m[1] === 'Z' ? 'Single circuit' : 'Dual circuit', s, p),
      fld('6', m[2], { M: 'Single circuit / two-stage cooling', N: 'Single circuit / two-stage cooling with low ambient', T: 'Dual circuit / three-stage cooling', U: 'Dual circuit / three-stage cooling with low ambient' }[m[2]], s, p),
      fld('7–8', m[3], R.t + ' T nominal', s, p), fld('9–10', 'A0', 'Not used', s, p),
      fld('11', m[4], 'Coil option: ' + { A: 'Cu/Al', B: 'Precoat Cu/Al', C: 'E-coat Cu/Al', E: 'Cu/Cu', M: 'Cu/Al + louvered hail guard', N: 'Precoat + hail guard', P: 'E-coat + hail guard', R: 'Cu/Cu + hail guard' }[m[4]] + ' (position per printed example 38AXDT12A0A6-0A0A0)', s, p),
      fld('12', m[5], 'Voltage: ' + VT[volt], s, p)];
    if (m[6]) f.push(fld('13+', m[6], 'Design rev / controls / service / electrical / packaging options — not used for the cross', s, p));
    return { ok: true, input: raw, brand: 'Carrier', family: '38AX' + m[1], model: raw, cls: 'commercial', type: 'AC', refrigerant: 'R-454B', legacy: false,
      attrs: { tons: R.t, volt: volt, staging: R.stages === 3 ? 'three-stage, dual circuit' : 'two-stage, single circuit', stages: R.stages }, fields: f,
      eff: { kind: 'system', text: 'AHRI 340/360 rating with matched ' + R.ah + ' fan coil: EER ' + R.eer + ' / IEER ' + R.ieer, page: C.ratingPage, src: s, eer: R.eer, ieer: R.ieer, ah: R.ah }, warnings: [], sources: [s] };
  }
  /* ---------------- Trane Odyssey commercial ---------------- */
  function decOdyssey(raw) {
    var m = /^(TTA|TWA)(\d{3})K?([34W])?([ACD])?(.*)$/.exec(raw);
    if (!m) return null;
    var C = SP.comm[m[1]], s = C.src, p = C.nomPage, form = D.sources[s].form;
    if (!/^(TTA|TWA)\d{3}K[34W][ACD]/.test(raw)) return fail(raw, 'Enter ' + m[1] + ' through digit 9 (tonnage, K = R-454B, voltage 3/4/W, circuit/stage A/C/D), e.g. ' + m[1] + '120K4D — ' + form + ' p.' + p + '. Voltage is never assumed.');
    var R = C.rows[m[2] + m[4]];
    if (!R) return fail(raw, m[1] + m[2] + ' with digit 9 = ' + m[4] + ' is not a combination printed in the ' + form + ' general data tables (' + Object.keys(C.rows).join(', ') + ').');
    var volt = { '3': '3PH', '4': '460', W: '575' }[m[3]], hp = m[1] === 'TWA';
    var f = [fld('1–3', m[1], hp ? 'Split system heat pump' : 'Split system cooling', s, p), fld('4–6', m[2], R.t + ' T (60 Hz)', s, p), fld('7', 'K', 'R-454B', s, p),
      fld('8', m[3], 'Voltage: ' + VT[volt], s, p), fld('9', m[4], { A: '1 compressor / 1 line (single)', C: '2 compressors / 1 line / 2 stage (manifold)', D: '2 compressors / 2 line / 2 stage (dual)' }[m[4]], s, p)];
    if (m[5]) f.push(fld('10+', m[5], 'Design sequence / service / efficiency generation / controls / coil / communication options — not used for the cross', s, p));
    var txt = 'With matched ' + R.ah + ' air handler (general data p.' + R.p + '): EER ' + R.eer + ' / system IEER ' + R.ieer + (R.cop47 ? ' / COP 47°F ' + R.cop47 + ' / COP 17°F ' + R.cop17 : '');
    return { ok: true, input: raw, brand: 'Trane', family: 'Odyssey ' + m[1], model: raw, cls: 'commercial', type: hp ? 'HP' : 'AC', refrigerant: 'R-454B', legacy: false,
      attrs: { tons: R.t, volt: volt, staging: R.stg, stages: /1 stage/.test(R.stg) ? 1 : 2 }, fields: f,
      eff: { kind: 'system', text: txt, page: R.p, src: s, eer: R.eer, ieer: R.ieer, cop47: R.cop47, ah: R.ah }, warnings: [], sources: [s] };
  }
  function decode(input) {
    var raw = String(input || '').toUpperCase().replace(/\s+/g, '').replace(/\/[A-Z]$/, '');
    if (!raw) return fail(raw, 'Empty input');
    if (/^(R[APD]\d{2}[AN]Y|W[S]?[AP]\d{2}|RACY|RPCY|RHCY|RH[12M][A-Z]Y|RCFY|RF[12]|RB2)/.test(raw)) return fail(raw, 'This is already a Rheem/WeatherKing split model — see the Rheem split lineup.');
    if (/^(40RL|TWE|TAM|TEM|TUE|FE4|FV4|FX4|FY4|FB4|CNPV|CAPV|CSPH|4TXC|5TXC)/.test(raw)) return fail(raw, 'This looks like an indoor unit (air handler / fan coil / coil). Split crosses are made on the outdoor unit; enter the condensing unit or heat pump model, then choose the Rheem indoor unit from the AHRI matchup.');
    var r = decCarrierRes(raw) || decTraneRes(raw) || decCarrier38(raw) || decOdyssey(raw);
    return r || fail(raw, 'Not recognised as a Carrier or Trane split outdoor unit in the loaded literature (Carrier 24/25/26/27xxx catalog numbers, 38AXZ/38AXD; Trane 5TTx/5TWx, TTA/TWA).');
  }

  /* ---------------- cross ---------------- */
  function pickModel(R, size, volt) {
    var pre = R.id + size + 'A' + RVL[volt];
    var ms = R.models.filter(function (x) { return x.indexOf(pre) === 0; });
    if (!ms.length) return null;
    ms.sort(function (a, b) { return b.length - a.length; });
    return ms[0];
  }
  function crossRes(d) {
    var a = d.attrs, size = rSize(a.tons), ok = [], rej = [], method = [];
    method.push('Match rules: same type (' + (d.type === 'AC' ? 'air conditioner' : 'heat pump') + '), residential, same nominal size (' + fT(a.tons) + ' T), same voltage (' + VT[a.volt] + '), and a Rheem nominal SEER2 class at or above the basis of design (' + a.nominal + '). Lower tiers are never offered.');
    method.push('Efficiency: split SEER2/EER2/HSPF2 belongs to the outdoor + indoor (+ furnace) AHRI matchup. Rheem rows below are the spec sheet’s printed DTC (designated tested combination) only — confirm the exact matchup at ahridirectory.org.');
    SP.rheemRes.filter(function (R) { return R.type === d.type; }).forEach(function (R) {
      if (!R.sizes[size]) return rej.push({ series: R.id, reason: R.id + ': no ' + fT(a.tons) + ' T size (printed sizes ' + Object.keys(R.sizes).join('/') + ').' });
      if (R.sizes[size].indexOf(a.volt) < 0) return rej.push({ series: R.id, reason: R.id + ': no ' + VT[a.volt] + ' model at ' + fT(a.tons) + ' T (printed: ' + R.sizes[size].map(function (v) { return VT[v]; }).join(', ') + '). Voltage is never dropped.' });
      if (R.nominal < a.nominal) return rej.push({ series: R.id, reason: R.id + ': nominal SEER2 class ' + R.nominal + ' is below the basis of design (' + a.nominal + ') — lower tier not offered.' });
      ok.push(R);
    });
    ok.sort(function (x, y) {
      var dx = (x.discharge === 'side') - (y.discharge === 'side'); if (dx) return dx;
      var sx = (x.staging !== a.staging) - (y.staging !== a.staging); if (sx) return sx;
      return x.nominal - y.nominal;
    });
    function cand(R, primary) {
      var model = pickModel(R, size, a.volt), fl = [], notes = [];
      if (R.staging !== a.staging) fl.push('Staging differs: basis of design is ' + STG[a.staging] + '; ' + R.id + ' is ' + STG[R.staging] + (R.id === 'RP14AY' ? ' (18 size is 1-stage)' : '') + '.');
      if (R.discharge === 'side') fl.push(R.id + ' is a SIDE-discharge heat pump — the basis of design is top-discharge; check clearances and layout.');
      if (R.nominal - a.nominal >= 1) fl.push('Higher tier than the basis of design (' + R.nominal + ' vs ' + a.nominal + ' nominal SEER2 class).');
      if (R.id === 'RA13NY') fl.push('RA13NY region code N = North (A11-345 p.4). Confirm the installation region allows a 13.4 SEER2 split AC.');
      (R.flags || []).forEach(function (x) { fl.push(x); });
      if (R.id === 'RA19AY' || R.id === 'RP19AY' || R.id === 'RP17AY' || R.id === 'RD16AY' || R.id === 'RD18AY') notes.push('Communicating outdoor unit (controls code C) — pair with the communicating indoor unit shown in the DTC.');
      var dtc = R.dtc.filter(function (r) { return r[0].indexOf(R.id + size) === 0 && (r[0].length < 10 || r[0][9] === RVL[a.volt]); });
      var low = dtc.filter(function (r) { return parseFloat(r[2]) < a.nominal; });
      if (low.length) fl.push('Printed DTC SEER2 at this size/voltage (' + low.map(function (r) { return r[2]; }).join(', ') + ') is below the basis-of-design nominal ' + a.nominal + ' — find an AHRI matchup that meets the specified SEER2 before quoting.');
      return { series: R.id, line: R.line, nominal: R.nominal, staging: STG[R.staging], model: model, src: R.src, mni: R.mni, dtcPage: R.dtcPage, dtc: dtc, flags: fl, notes: notes,
        reason: primary ? 'Same type, size and voltage; lowest Rheem SEER2 class at or above the basis of design' + (R.staging === a.staging ? ', same staging.' : '.') : 'Also at or above the basis-of-design tier.' };
    }
    var flags = [];
    if (d.legacy) flags.push('Basis of design is a legacy R-410A unit; Rheem answers are current R-454B only.');
    if (!ok.length) {
      var top = SP.rheemRes.filter(function (R) { return R.type === d.type; }).sort(function (x, y) { return y.nominal - x.nominal; })[0];
      flags.push('No current Rheem R-454B ' + (d.type === 'AC' ? 'split AC' : 'split heat pump') + ' at or above ' + a.nominal + ' SEER2 class in ' + fT(a.tons) + ' T ' + VT[a.volt] + '. ' + (top.nominal < a.nominal ? 'Rheem’s highest ' + d.type + ' class is ' + top.nominal + ' (' + top.id + ') — not offered as an alternate because it is a lower tier than the basis of design.' : 'See excluded series for the reason.'));
    }
    return { method: method, flags: flags, recommended: ok.length ? cand(ok[0], true) : null, alternates: ok.slice(1, 3).map(function (R) { return cand(R, false); }), rejected: rej, ahri: SP.ahri };
  }
  function crossComm(d) {
    var a = d.attrs, method = [], flags = [], rej = [];
    method.push('Match rules: same type, commercial split, same nominal tonnage (±0.5 T flagged), same voltage. Ratings are AHRI 340/360 EER/IEER for each manufacturer’s printed matched air handler (commercial ≥65k Btu/h splits are not SEER2-rated).');
    var R = SP.rheemComm.filter(function (x) { return x.type === d.type; })[0], best = null;
    R.caps.forEach(function (c) { var dt = Math.abs(c.t - a.tons); if (dt <= 0.5 && (!best || dt < Math.abs(best.t - a.tons))) best = c; });
    if (!best) {
      rej.push({ series: R.id, reason: R.id + ': printed sizes ' + R.caps.map(function (c) { return c.t; }).join('/') + ' T — none within 0.5 T of ' + fT(a.tons) + ' T.' });
      flags.push('No current Rheem R-454B commercial split ' + (d.type === 'AC' ? 'AC' : 'heat pump') + ' at ' + fT(a.tons) + ' T.');
      return { method: method, flags: flags, recommended: null, alternates: [], rejected: rej, ahri: SP.ahri };
    }
    if (best.volts.indexOf(a.volt) < 0) { rej.push({ series: R.id, reason: R.id + ' ' + best.cap + ': no ' + VT[a.volt] + '.' }); return { method: method, flags: ['No Rheem commercial split in ' + VT[a.volt] + ' at this size.'], recommended: null, alternates: [], rejected: rej, ahri: SP.ahri }; }
    var vl = CVL[a.volt], fl = [], notes = [];
    if (best.t !== a.tons) fl.push('Size differs: ' + fT(best.t) + ' T Rheem vs ' + fT(a.tons) + ' T basis of design — check capacity at design conditions.');
    if (a.stages !== 2) fl.push('Staging/circuits differ: basis of design is ' + a.staging + '; ' + R.id + ' is 2-stage scroll.');
    var e = d.eff;
    if (best.eer < e.eer || best.ieer < e.ieer) fl.push('Rheem matched-system EER ' + best.eer + ' / IEER ' + best.ieer + ' is below the basis of design (EER ' + e.eer + ' / IEER ' + e.ieer + '). Both are each brand’s only R-454B commercial split tier — confirm the specified minimum efficiency before substituting.');
    if (d.type === 'HP' && e.cop47 && best.cop47 < e.cop47) fl.push('COP 47°F ' + best.cop47 + ' below basis of design ' + e.cop47 + '.');
    if (best.note) notes.push(best.note);
    notes.push('Matched air handler per ' + D.sources[R.src].form + ' p.5: ' + best.ah + vl + 'A? — last digit = drive R/S/T (belt VFD low/medium/high static, ' + D.sources[R.ahSrc].form + ' p.5); pick it from the external static.');
    var rec = { series: R.id, line: R.line, model: R.id + '2' + best.cap + vl + 'AZ', ah: best.ah + vl + 'A?', src: R.src, ahSrc: R.ahSrc, mni: R.mni, staging: 'two-stage scroll', flags: fl, notes: notes,
      ratings: { eer: best.eer, ieer: best.ieer, cop47: best.cop47, cop17: best.cop17, p: best.p }, reason: 'Same type and voltage; ' + (best.t === a.tons ? 'same' : 'nearest') + ' tonnage. Rheem has one commercial split tier.' };
    return { method: method, flags: flags, recommended: rec, alternates: [], rejected: rej, ahri: SP.ahri };
  }
  function cross(d) {
    if (!d || !d.ok) return { method: [], flags: [], recommended: null, alternates: [], rejected: [] };
    return d.cls === 'commercial' ? crossComm(d) : crossRes(d);
  }
  var api = { init: init, decode: decode, cross: cross, VT: VT, STG: STG };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.SplitEngine = api;
})(this);
