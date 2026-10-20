/* RTU cross-reference engine. Pure functions; all tables come from data.json (window.RTU_DATA).
   Rule: decode only codes printed in the cited manufacturer document; otherwise report "cannot decode". */
(function (root) {
  'use strict';
  var DATA = null;
  function init(d) { DATA = d; }
  var VOLT_TEXT = { J: '208/230 V 1-ph', C: '208/230 V 3-ph', D: '460 V 3-ph', Y: '575 V 3-ph' };
  function src(id, page) { return { id: id, page: page || null }; }
  function fld(pos, code, meaning, s, page) { return { pos: pos, code: code, meaning: meaning, src: s, page: page || null }; }
  function fail(input, reason, extra) { return Object.assign({ ok: false, input: input, reason: reason }, extra || {}); }
  function fmtT(t) { if (t == null || t === '') return '?'; var x = +t; if (isNaN(x)) return String(t); return String(Math.round(x * 10) / 10); }
  function tonsLabel(t) { return t == null ? '?' : (fmtT(t) + ' T'); }

  /* ------------------------- CARRIER COMMERCIAL ------------------------- */
  var C_VOLT = { '1': ['Y', '575-3-60'], '3': ['J', '208/230-1-60'], '5': ['C', '208/230-3-60'], '6': ['D', '460-3-60'] };
  var C_HEAT48 = { D: ['L', 'Low gas heat'], E: ['M', 'Medium gas heat'], F: ['H', 'High gas heat'], S: ['L', 'Low heat, stainless steel exchanger', 1], R: ['M', 'Medium heat, stainless steel exchanger', 1], T: ['H', 'High heat, stainless steel exchanger', 1] };
  var C_ULN = { G: ['ULN', 'Ultra Low NOx, low gas heat (14 ng/J)', 60], H: ['ULN', 'Ultra Low NOx, medium/high gas heat (14 ng/J)', 82], L: ['LNOX', 'Low NOx, low heat', null] };
  var C_FAN = { '2': 'Standard/medium static EcoBlue vane axial fan', '3': 'High static EcoBlue vane axial fan', '5': 'Std/med static fan + filter status switch', '6': 'High static fan + filter status switch', J: 'High static, horizontal supply', L: 'High static, horizontal supply + filter status switch' };
  var C_FAN_LEG = { '1': 'Direct drive EcoBlue standard static', '2': 'Direct drive EcoBlue medium static', '3': 'Direct drive EcoBlue high static' };
  function carrierDocFor(fam, tcode) {
    var docs = fam.docs, k;
    for (k in docs) { var a = k.split('-'); if (+tcode >= +a[0] && +tcode <= +a[1]) return docs[k]; }
    return null;
  }
  function decodeCarrierComm(raw) {
    var s = raw.replace(/\s+/g, '').toUpperCase();
    var m = /^(48|50)(FE|GE|FC|GC)([A-Z\-])?([A-Z])?(\d{2})?(.*)$/.exec(s);
    if (!m) return null;
    var pre = m[1], ser = m[2], p5 = m[3], p6 = m[4], tc = m[5], rest = m[6] || '';
    var isQ = p5 === 'Q', famId = ser + (isQ ? 'Q' : '');
    var fam = DATA.carrierFamilies.filter(function (f) { return f.fam === famId; })[0];
    if (!fam) return fail(raw, 'Carrier ' + pre + famId + ' is not a family covered by the loaded Carrier literature.');
    if (isQ && pre !== '50') return fail(raw, 'Position 5 "Q" (heat pump) only exists on 50-series units; "' + pre + '" + Q is not a valid Carrier string.');
    var fields = [], warn = [], sources = [];
    var hp = !!fam.hp;
    var type = hp ? 'HP' : (pre === '48' ? 'GE' : 'AC');
    fields.push(fld('1–2', pre, pre === '48' ? 'Gas heat packaged rooftop' : 'Electric heat / cooling packaged rooftop'));
    fields.push(fld('3–4', ser, fam.tierLabel + ' — ' + fam.refrig));
    var res = { ok: true, input: raw, brand: 'Carrier', family: pre + famId, refrigerant: fam.refrig, generation: fam.refrig === 'R-410A' ? 'legacy' : 'current', fields: fields, warnings: warn, sources: sources,
      attrs: { type: type, cls: 'commercial', tier: fam.tier, tons: null, volt: null, heat: { kind: 'unknown' }, stage: null, highStatic: false } };
    if (!p5) { res.partial = true; res.familyOnly = true; res.tonsRange = Object.keys(fam.tons).map(function (k) { return fam.tons[k]; }).sort(function (x, y) { return x - y; }); sources.push(src(Object.values(fam.docs)[0])); return res; }
    // position 5: heat
    var heat = { kind: 'unknown' };
    if (isQ) { fields.push(fld('5', 'Q', 'Heat pump')); heat = { kind: 'electric', note: 'Heat pump; auxiliary electric heat not encoded at this position' }; }
    else if (pre === '48') {
      if (C_HEAT48[p5]) { heat = { kind: 'gas', level: C_HEAT48[p5][0], stainless: !!C_HEAT48[p5][2] }; fields.push(fld('5', p5, C_HEAT48[p5][1])); }
      else if (C_ULN[p5] && ((ser === 'FE' && +tc <= 7) || (ser === 'GE' && +tc <= 6))) { heat = { kind: 'gas', nox: C_ULN[p5][0], mbh: C_ULN[p5][2], level: p5 === 'G' ? 'L' : (p5 === 'H' ? 'M' : 'L') }; fields.push(fld('5', p5, C_ULN[p5][1])); }
      else return fail(raw, 'Position 5 "' + p5 + '" is not a heat code printed for 48' + ser + (tc ? ' size ' + tc : '') + '.');
    } else {
      if (p5 === '-') { heat = { kind: 'none' }; fields.push(fld('5', '-', 'No heat')); }
      else if ((ser === 'GE' || ser === 'GC') && /[ABC]/.test(p5)) { heat = { kind: 'electric', level: { A: 'L', B: 'M', C: 'H' }[p5] }; fields.push(fld('5', p5, { A: 'Low', B: 'Medium', C: 'High' }[p5] + ' electric heat (kW not encoded in model; see doc)')); }
      else return fail(raw, 'Position 5 "' + p5 + '" is not a heat code printed for 50' + ser + '.');
    }
    // position 6: refrigeration system
    var p6ok = { FE: 'ABMN', GE: 'MNP', FEQ: 'AM', GEQ: 'MN', FC: 'ABMN', GC: 'MNP', FCQ: 'M' }[famId];
    if (!p6) { res.partial = true; }
    else {
      if (p6ok.indexOf(p6) < 0) return fail(raw, 'Position 6 "' + p6 + '" is not a refrigeration-system code printed for ' + pre + famId + ' (valid: ' + p6ok.split('').join('/') + ').');
      var p6m = { A: 'One-stage cooling', B: 'One-stage cooling with Humidi-MiZer', M: 'Two-stage cooling, single circuit', N: 'Two-stage cooling, single circuit, with Humidi-MiZer', P: 'Two-stage cooling, single circuit, with low-ambient/head-pressure control' }[p6];
      fields.push(fld('6', p6, p6m)); res.attrs.stage = /[AB]/.test(p6) ? '1' : '2';
    }
    if (!tc) { res.partial = true; res.familyOnly = true; res.tonsRange = Object.keys(fam.tons).map(function (k) { return fam.tons[k]; }).sort(function (x, y) { return x - y; }); sources.push(src(Object.values(fam.docs)[0])); return res; }
    if (!(tc in fam.tons)) return fail(raw, 'Positions 7–8 "' + tc + '" are not a tonnage code printed for ' + pre + famId + ' (valid: ' + Object.keys(fam.tons).sort().join(', ') + ').');
    var docId = carrierDocFor(fam, tc), doc = DATA.sources[docId];
    sources.push(src(docId, (doc.nomPages || []).join('–')));
    res.attrs.tons = fam.tons[tc];
    fields.push(fld('7–8', tc, fam.tons[tc] + ' tons', docId));
    if (p6 && /[AB]/.test(p6) && +tc > 6) return fail(raw, 'Position 6 "' + p6 + '" (one-stage) is only printed for sizes 04–06; size ' + tc + ' must be M/N.');
    // remaining positions
    var r = rest.split('');
    if (r[0]) fields.push(fld('9', r[0], 'Sensor options (see doc)', docId));
    if (r[1]) { var fm = fam.legacyFan ? C_FAN_LEG : C_FAN; fields.push(fld('10', r[1], fm[r[1]] || 'Fan option (not in captured table — see doc)', docId)); if (!fam.legacyFan && /[36JL]/.test(r[1])) res.attrs.highStatic = true; if (fam.legacyFan && r[1] === '3') res.attrs.highStatic = true; }
    if (r[2]) fields.push(fld('11', r[2], 'Coil option (see doc)', docId));
    if (r[3]) {
      if (!C_VOLT[r[3]]) return fail(raw, 'Position 12 "' + r[3] + '" is not a voltage code printed in ' + doc.form + '.');
      if (r[3] === '3' && fam.v1ph.indexOf(tc) < 0) return fail(raw, 'Voltage code 3 (208/230-1-60) is not offered for ' + pre + famId + ' size ' + tc + ' in ' + doc.form + '.');
      res.attrs.volt = C_VOLT[r[3]][0]; fields.push(fld('12', r[3], C_VOLT[r[3]][1], docId));
    } else { res.partial = true; warn.push('Voltage (position 12) not given — Rheem model cannot be finalized without it.'); }
    if (r.length > 4) fields.push(fld('13–18', r.slice(4).join(''), 'Design revision / controls / intake / service / electrical / packaging options (not used for the cross)', docId));
    // gas input
    if (heat.kind === 'gas' && !heat.mbh && heat.level && res.attrs.volt) {
      var g = DATA.carrierGas[ser], ph = res.attrs.volt === 'J' ? '1ph' : '3ph';
      var v = g && g[ph] && g[ph][tc] && g[ph][tc][heat.level];
      if (v) { heat.mbh = v; heat.mbhSrc = g.src[tc]; }
      else if (g && g[ph] && g[ph][tc]) return fail(raw, 'Heat size "' + p5 + '" is not offered for ' + pre + ser + ' size ' + tc + ' (' + ph + ') per the heat rating table.');
    }
    if (heat.kind === 'gas' && heat.mbh) fields.push(fld('heat', p5, 'Gas input ' + heat.mbh + ' MBH (max stage, heat rating table)', heat.mbhSrc || docId));
    res.attrs.heat = heat;
    var rt = fam.ratings[pre] || fam.ratings['50'] || {};
    res.rating = rt[tc] || null; res.ratingSrc = docId;
    if (fam.refrig === 'R-410A') warn.push('Legacy R-410A unit — crossed to current R-454B Rheem equipment.');
    return res;
  }

  /* ------------------------- CARRIER RESIDENTIAL ------------------------- */
  function decodeCarrierRes(raw) {
    var s = raw.replace(/\s+/g, '').toUpperCase();
    var m = /^(48|50)(N[LGRT])/.exec(s); if (!m) return null;
    var famId = m[1] + m[2], fam = DATA.carrierRes[famId];
    if (!fam) return fail(raw, 'Carrier ' + famId + ' literature is not loaded (only 50NR, 50NT, 50NL, 48NL, 48NG, 48NR).');
    var norm = function (x) { return x.replace(/-/g, ''); };
    var sn = norm(s);
    var hit = fam.models.filter(function (x) { return sn.indexOf(norm(x)) === 0; })[0];
    var doc = DATA.sources[fam.src];
    var res = { ok: true, input: raw, brand: 'Carrier', family: famId, refrigerant: 'R-454B', generation: 'current', fields: [], warnings: [], sources: [src(fam.src, (doc.nomPages || []).join(','))],
      attrs: { type: fam.type, cls: 'residential', tier: fam.tier, tons: null, volt: null, heat: { kind: fam.type === 'GE' || fam.type === 'DF' ? 'gas' : (fam.type === 'HP' ? 'electric' : 'none') }, stage: fam.staging === 'two-stage' ? '2' : '1' } };
    res.fields.push(fld('1–4', famId, fam.line, fam.src));
    if (!hit) {
      if (sn.length <= 4) { res.partial = true; res.familyOnly = true; res.tonsRange = Array.from(new Set(fam.models.map(function (x) { return +x.substr(6, 2) / 12; }))).sort(function (x, y) { return x - y; }); /* raw ordering number: digits 7–8 = cap (norm() strips dashes and shifts the offset) */ return res; }
      var pm = fam.models.filter(function (x) { return norm(x).indexOf(sn) === 0; });
      if (pm.length) return fail(raw, 'Incomplete model — matches ' + pm.length + ' printed ordering numbers: ' + pm.slice(0, 12).join(', ') + (pm.length > 12 ? ' …' : '') + '. Enter one of them.', { family: famId, suggestions: pm });
      return fail(raw, 'String is not one of the ' + fam.models.length + ' ordering numbers printed in ' + doc.form + ' for ' + famId + '. Not decoded (no guessing).', { family: famId });
    }
    var h = norm(hit); // e.g. 48NLNB240603 / 50NRB36---5 -> after norm: 50NRB365
    var nox = hit.charAt(4), cap = hit.substr(6, 2), heatc = hit.substr(8, 3), vc = hit.charAt(11);
    res.fields.push(fld('5', nox, nox === '-' ? 'Standard NOx' : (nox === 'N' ? 'Low NOx' : 'Ultra-low NOx'), fam.src));
    res.fields.push(fld('6', 'B', 'Series/design', fam.src));
    res.attrs.tons = +cap / 12; res.fields.push(fld('7–8', cap, cap + ',000 Btuh nominal = ' + fmtT(+cap / 12) + ' tons', fam.src));
    if (heatc !== '---') { res.attrs.heat = { kind: 'gas', mbh: +heatc, nox: nox === 'N' ? 'LNOX' : (nox === 'U' ? 'ULN' : null) }; res.fields.push(fld('9–11', heatc, 'Gas heat input ' + (+heatc) + ',000 Btuh', fam.src)); }
    else res.fields.push(fld('9–11', '---', fam.type === 'HP' ? 'No gas heat (heat pump)' : 'No gas heat', fam.src));
    var V = { '3': ['J', '208/230-1-60'], '5': ['C', '208/230-3-60'], '6': ['D', '460-3-60'] }[vc];
    res.attrs.volt = V[0]; res.fields.push(fld('12', vc, V[1], fam.src));
    res.matched = hit; res.rating = fam.ratings[cap] || fam.ratings['*']; res.ratingSrc = fam.src;
    return res;
  }

  /* ------------------------- TRANE ------------------------- */
  var T_CAP = { '036': 3, '048': 4, '060': 5, '072': 6, '074': 6, '090': 7.5, '092': 7.5, '102': 8.5, '120': 10, '150': 12.5, '180': 15, '210': 17.5, '240': 20, '300': 25 };
  var T_KW = { B: 6, C: 9, E: 12, G: 18, J: 23, K: 27, N: 36, P: 54, R: 72 };
  var T_VOLT = { '3': ['C', '208–230/60/3'], '4': ['D', '460/60/3'], 'W': ['Y', '575/60/3'] };
  /* ---------------- Trane Voyager 3 (27.5–50 T, 60 Hz) — RT-PRC123C-EN (R-454B) / RT-PRC033Q-EN (R-410A legacy) ---------------- */
  function decodeVoyager(raw) {
    var s = raw.replace(/[\s\-]+/g, '').toUpperCase();
    var m = /^(TC|TE|YC)([DHFR])?(\d{3})?(.*)$/.exec(s);
    if (!m || !DATA.traneVoyager) return null;
    var V = DATA.traneVoyager, C = V.common, fn = m[1], af = m[2], cap = m[3], rest = m[4] || '';
    if (!af && (cap || rest)) return fail(raw, 'Digit 3 "' + s.charAt(2) + '" is not an airflow code in RT-PRC123C-EN p.24 (D/H/F/R).');
    var gen = rest.charAt(0) || null;
    if (gen && !V[gen]) return fail(raw, 'Digit 7 "' + gen + '" is not a development sequence in the loaded Voyager catalogs (D = R-454B + Symbio 700, RT-PRC123C-EN p.24; C = R-410A + Symbio 700, RT-PRC033Q-EN p.24).');
    var G = V[gen || 'D'], docId = G.doc, doc = DATA.sources[docId], pg = '24', pg2 = '25';
    var type = fn === 'YC' ? 'GE' : 'AC';
    var res = { ok: true, input: raw, brand: 'Trane', family: 'Voyager 3 ' + fn + (af || ''), refrigerant: gen ? G.refrigerant : 'R-454B (assumed current — digit 7 not given)', generation: G.legacy ? 'legacy' : 'current', fields: [], warnings: [], sources: [src(docId, pg)], noLowerTier: true,
      attrs: { type: type, cls: 'commercial', tier: 'standard', tons: null, volt: null, heat: { kind: fn === 'TC' ? 'none' : (fn === 'TE' ? 'electric' : 'gas') }, stage: 'multi' } };
    var F = res.fields, a = res.attrs;
    F.push(fld('1–2', fn, C.fn[fn], docId, pg));
    if (af) F.push(fld('3', af, C.airflow[af], docId, pg));
    if (!cap) {
      res.partial = true; res.familyOnly = true; res.tonsRange = Object.keys(C.sizes).map(function (k) { return C.sizes[k]; });
      res.warnings.push('Efficiency (digit 29) not given — family view assumes the standard-efficiency (eStage) unit; a high-efficiency Voyager (digit 29 K/L) has no same-tier Rheem match.');
      return res;
    }
    if (C.hz50[cap]) return fail(raw, 'Digits 4–6 "' + cap + '" = ' + C.hz50[cap] + ' T is a 50 Hz Voyager capacity (RT-PRC123C-EN p.26). Only 60 Hz units are crossed — Rheem packaged units in this tool are 60 Hz.');
    if (!C.sizes[cap]) return fail(raw, 'Digits 4–6 "' + cap + '" are not a 60 Hz Voyager capacity in ' + doc.form + ' p.24 (330 = 27.5 T, 360 = 30 T, 420 = 35 T, 480 = 40 T, 600 = 50 T).');
    a.tons = C.sizes[cap]; F.push(fld('4–6', cap, a.tons + ' tons (nominal cooling capacity)', docId, pg));
    var grp = a.tons <= 35 ? 'small' : 'large';
    if (gen) F.push(fld('7', gen, gen === 'D' ? 'R-454B refrigerant + Symbio 700' : 'R-410A refrigerant + Symbio 700 (legacy catalog)', docId, pg));
    else { res.partial = true; res.warnings.push('Digit 7 (development sequence) not given — decoded against the current R-454B catalog RT-PRC123C-EN; ratings shown are from that catalog.'); }
    if (G.legacy) res.warnings.push('Legacy R-410A Voyager 3 (RT-PRC033Q-EN, March 2023). Crossed to current R-454B Rheem equipment.');
    var d = function (n) { return rest.charAt(n - 7) || null; };   // digit n (1-based) from rest
    var d8 = d(8), d9 = d(9), d10 = d(10);
    if (d8) {
      if (d8 === 'C' || d8 === 'D') return fail(raw, 'Digit 8 "' + d8 + '" is a 50 Hz power supply (' + (d8 === 'C' ? '380' : '415') + '/50/3, RT-PRC123C-EN p.26). Only 60 Hz units are crossed.');
      if (!C.volt[d8]) return fail(raw, 'Digit 8 "' + d8 + '" is not a 60 Hz power-supply code in ' + doc.form + ' p.24 (E = 208/60/3, F = 230/60/3, 4 = 460/60/3, 5 = 575/60/3).');
      a.volt = C.volt[d8][0]; F.push(fld('8', d8, C.volt[d8][1], docId, pg));
    } else { res.partial = true; res.warnings.push('Voltage (digit 8) not given — Rheem model cannot be finalized without it.'); }
    var heatKey = fn === 'TC' ? 'cool' : (fn === 'TE' ? 'elec' : null);
    if (d9) {
      if (fn === 'TC') { if (d9 !== '0') return fail(raw, 'Digit 9 "' + d9 + '": a TC (no heat) unit must have 0 (' + doc.form + ' p.24).'); F.push(fld('9', '0', 'No heat (TC only)', docId, pg)); }
      else if (fn === 'YC') {
        var g = C.gas[d9];
        if (!g) return fail(raw, 'Digit 9 "' + d9 + '" is not a gas heating-capacity code for YC units in ' + doc.form + ' p.24 (L/H/J/K/M/P/R/T).');
        if (g[2] && g[2] !== grp) return fail(raw, 'Digit 9 "' + d9 + '" (modulating) is printed for ' + (g[2] === 'small' ? '27.5–35' : '40–50') + ' T only (' + doc.form + ' p.24); this unit is ' + fmtT(a.tons) + ' T.');
        var mbh = C.gasInput[grp][g[0]];
        a.heat = { kind: 'gas', level: g[0] === 'low' ? 'L' : 'H', stainless: g[1], mbh: mbh, mbhSrc: docId, modulating: !!g[2] };
        F.push(fld('9', d9, C.gasTxt[d9] + ' — ' + mbh + ' MBH input (General Data p.' + (grp === 'small' ? 28 : 30) + ')', docId, pg));
        if (g[2]) res.warnings.push('Modulating gas heat (10:1 turndown, General Data p.' + (grp === 'small' ? 28 : 30) + '). Rheem RGEHYB360 MNI prints 2-stage heat configurations only — verify.');
        heatKey = g[0] === 'low' ? 'gasLow' : 'gasHigh';
      } else {
        var k = C.kw[d9];
        if (!k) return fail(raw, 'Digit 9 "' + d9 + '" is not an electric-heat code for TE units in ' + doc.form + ' p.24 (A = 36, B = 54, C = 72, D = 90, E = 108 kW).');
        if (d8) {
          var rv = C.volt[d8][2], av = C.kwAvail[grp][rv];
          if (av.indexOf(d9) < 0) return fail(raw, 'Electric heater "' + d9 + '" is not offered at ' + fmtT(a.tons) + ' T / ' + rv + ' V per Table 2 (' + doc.form + ' p.25: ' + av.split('').join('/') + ').');
          var kw = rv === '208' && k[1] ? k[1] : k[0];
          a.heat = { kind: 'electric', kw: kw };
          F.push(fld('9', d9, kw + ' kW electric heat' + (rv === '208' && k[1] ? ' (' + k[0] + ' kW heater derated at 208 V)' : ''), docId, pg));
        } else { a.heat = { kind: 'electric', kw: k[0] }; F.push(fld('9', d9, k[0] + ' kW electric heat (rated; voltage not given)', docId, pg)); }
      }
    } else { res.partial = true; if (fn !== 'TC') res.warnings.push('Heating capacity (digit 9) not given.'); }
    if (d10) {
      if (G.legacy ? d10 !== 'A' : !/[A-Z1-9]/.test(d10)) return fail(raw, 'Digit 10 "' + d10 + '" is not a design sequence in ' + doc.form + ' p.24 (' + (G.legacy ? 'A = First' : 'any letter A–Z or digit 1–9') + ').');
      F.push(fld('10', d10, 'Design sequence', docId, pg));
    }
    var names = { '11': 'Exhaust', '12': 'Filter', '13': 'Supply fan motor HP', '14': 'Supply air fan drive', '15': 'Outside air selection', '16': 'System control', '17': 'Service valves', '18': 'Through-the-base electrical', '19': 'Non-fused disconnect', '20': 'Factory-powered GFI outlet', '21': 'Field-powered GFI outlet', '22': 'Unused', '23': 'Ventilation override', '24': 'Hinged service access', '25': 'Condenser hail guards / coil guards', '26': 'Communications', '27': 'SCCR', '28': 'Drain pan', '29': 'Efficiency / condenser coil', '30': 'Not used', '31': 'Misc. options', '32': 'Modulating hot gas reheat', '33': 'Control expansion modules', '34': 'Energy recovery wheel' };
    if (rest.length + 6 > G.digits) return fail(raw, 'String has ' + (rest.length + 6) + ' characters; ' + doc.form + ' model numbers have ' + G.digits + ' digits (p.' + pg2 + ').');
    var zeroOpt = [];
    for (var n = 11; n <= 6 + rest.length; n++) {
      var ch = d(n), key = String(n);
      if (n === 29) {
        var e = C.eff[ch];
        if (!e) return fail(raw, 'Digit 29 "' + ch + '" is not an efficiency code in ' + doc.form + ' p.25 (0/J = standard eStage, K/L = high efficiency eStage).');
        a.tier = e[0]; F.push(fld('29', ch, e[1], docId, pg2)); continue;
      }
      var set = C.opt[key] + (key === '26' && G.opt26extra ? G.opt26extra : '');
      if (set === '*') { if (ch !== '*' && ch !== '0') return fail(raw, 'Digit ' + key + ' is printed as an unused digit in ' + doc.form + ' p.25 — “' + ch + '” is not expected there.'); F.push(fld(key, ch, 'Unused digit', docId, pg2)); continue; }
      if (set.indexOf(ch) >= 0) { F.push(fld(key, ch, names[key] + ' — printed code', docId, n <= 16 ? pg : pg2)); continue; }
      if (n >= 17 && ch === '0' && set.length <= 2 && set.indexOf('0') < 0) { F.push(fld(key, '0', names[key] + ' — read as “not selected” (the catalog prints only ' + set.split('').join('/') + ' for this digit)', docId, pg2)); zeroOpt.push(key); continue; }
      return fail(raw, 'Digit ' + key + ' "' + ch + '" (' + names[key] + ') is not a code printed in ' + doc.form + ' p.' + (n <= 16 ? pg : pg2) + ' (printed: ' + set.split('').join('/') + ').');
    }
    if (zeroOpt.length) res.warnings.push('Option digit(s) ' + zeroOpt.join(', ') + ' = “0”: ' + doc.form + ' p.25 prints only the selected-option letter for these digits, so “0” is read as option not selected (no effect on the cross).');
    if (rest.length + 6 < 29) res.tierAssumed = true;   // flagged by cross()
    var R = G.ratings[a.tier][cap], rk = heatKey || 'cool', rr = R[rk];
    if (fn === 'YC' && !heatKey) rr = R.gasLow;
    res.rating = 'Net ' + rr.net.toLocaleString('en-US') + ' Btu/h · EER ' + rr.eer + ' · IEER ' + rr.ieer + ' (multi-speed) / ' + rr.ieerVav + ' (VAV) — ' + (a.tier === 'high' ? 'high' : 'standard') + ' efficiency, ' + { cool: 'cooling only', elec: 'electric heat', gasLow: 'low gas heat', gasHigh: 'high gas heat' }[heatKey || (fn === 'YC' ? 'gasLow' : 'cool')];
    res.ratingSrc = docId; a.netCap = rr.net; a.netCapSrc = doc.form + ' p.' + (grp === 'small' ? 28 : 30);
    return res;
  }
  function decodeTrane(raw) {
    var s = raw.replace(/\s+/g, '').toUpperCase();
    var m = /^([TYWD])([SHZ])([KC])(\d{3})?(.)?(.)?(.)?(.)?(.)?(.*)$/.exec(s);
    if (!m) return null;
    var f1 = m[1], f2 = m[2], f3 = m[3], cap = m[4], d7 = m[5], d8 = m[6], d9 = m[7], d10 = m[8], d11 = m[9];
    var legacy = f3 === 'C';
    var docId;
    if (!legacy) {
      if (f2 === 'Z') { if (!/[TY]/.test(f1)) return fail(raw, 'Ultra-high-efficiency "Z" is printed only for T/Y units (RT-PRC117D).'); docId = 'T-PRC117'; }
      else docId = /[TY]/.test(f1) ? 'T-PRC115' : 'T-PRC023F';
    } else {
      if (f2 === 'Z') return fail(raw, 'Digit 2 "Z" with digit 3 "C" is not in any loaded Trane catalog.');
      docId = /[TY]/.test(f1) ? 'T-PRC023AY' : 'T-PRC013AA';
    }
    var doc = DATA.sources[docId], pg = (doc.nomPages || []).join(',');
    var type = { T: 'AC', Y: 'GE', W: 'HP', D: 'DF' }[f1];
    var fields = [fld('1', f1, { T: 'DX cooling', Y: 'DX cooling, gas heat', W: 'Packaged heat pump', D: 'Dual fuel heat pump' }[f1], docId, pg),
      fld('2', f2, { S: 'Standard efficiency', H: 'High efficiency', Z: 'Ultra high efficiency (eFlex variable-speed)' }[f2], docId, pg),
      fld('3', f3, legacy ? 'Convertible airflow (legacy R-410A catalog)' : 'R-454B refrigerant', docId, pg)];
    var res = { ok: true, input: raw, brand: 'Trane', family: f1 + f2 + f3, refrigerant: legacy ? 'R-410A' : 'R-454B', generation: legacy ? 'legacy' : 'current', fields: fields, warnings: [], sources: [src(docId, pg)],
      attrs: { type: type, cls: 'commercial', tier: f2 === 'S' ? 'standard' : (f2 === 'H' ? 'high' : 'ultra'), tons: null, volt: null, heat: { kind: type === 'GE' || type === 'DF' ? 'gas' : (type === 'HP' ? 'electric' : 'unknown') }, stage: null } };
    var caps = legacy ? (/[TY]/.test(f1) ? ['036', '048', '060', '072', '074', '090', '092', '102', '120'] : ['036', '048', '060', '074', '092', '102', '120']) : ['036', '048', '060', '072', '090', '102', '120', '150', '180', '210', '240', '300'];
    if (!cap) { res.partial = true; res.familyOnly = true; res.tonsRange = caps.map(function (c) { return T_CAP[c]; }).filter(function (v, i, a) { return a.indexOf(v) === i; }); return res; }
    if (caps.indexOf(cap) < 0) return fail(raw, 'Digits 4–6 "' + cap + '" are not a capacity printed in ' + doc.form + ' (valid: ' + caps.join(', ') + ').');
    res.attrs.tons = T_CAP[cap];
    fields.push(fld('4–6', cap, T_CAP[cap] + ' tons' + (cap === '074' || cap === '092' ? ' (dual compressor)' : (legacy && cap === '090' ? ' (single compressor)' : '')), docId, pg));
    // staging (as printed in the catalogs)
    if (f2 === 'Z') res.attrs.stage = 'var';
    else if (!legacy) res.attrs.stage = res.attrs.tons <= 5 ? (f2 === 'S' ? '1' : '2') : 'multi';
    else res.attrs.stage = (cap === '074' || cap === '092') ? 'multi' : null;
    if (d7) fields.push(fld('7', d7, 'Design sequence', docId, pg));
    if (d8) {
      if (!T_VOLT[d8]) return fail(raw, 'Digit 8 "' + d8 + '" is not a voltage code in ' + doc.form + ' (3 = 208–230/60/3, 4 = 460/60/3, W = 575/60/3; no single-phase).');
      res.attrs.volt = T_VOLT[d8][0]; fields.push(fld('8', d8, T_VOLT[d8][1], docId, pg));
    } else { res.partial = true; res.warnings.push('Voltage (digit 8) not given — Rheem model cannot be finalized without it.'); }
    if (d9) {
      var ctl = legacy ? { E: 'Electromechanical', R: 'ReliaTel microprocessor' } : { S: 'Symbio 700' };
      if (!ctl[d9]) return fail(raw, 'Digit 9 "' + d9 + '" is not a unit-controls code in ' + doc.form + '.');
      fields.push(fld('9', d9, ctl[d9], docId, pg));
    }
    var heat = res.attrs.heat;
    if (!legacy) {
      if (d10) {
        var ht = { '0': 'Base model', A: 'Stainless steel gas heat', B: 'Modulating gas heat', E: 'SCR modulating electric heat', F: 'Hot water coil control (hydronic)' };
        if (docId === 'T-PRC023F') ht.C = 'Ultra-low NOx gas heat';
        if (!ht[d10]) return fail(raw, 'Digit 10 "' + d10 + '" is not a heat-type code in ' + doc.form + '.');
        fields.push(fld('10', d10, ht[d10], docId, pg));
        if (d10 === 'A') heat.stainless = true; if (d10 === 'C') heat.nox = 'ULN'; if (d10 === 'B') heat.modulating = true;
        if (d10 === 'F') heat = res.attrs.heat = { kind: 'hydronic' };
      }
      if (d11) {
        if (T_KW[d11]) { heat = res.attrs.heat = Object.assign(heat, { kind: type === 'GE' ? heat.kind : 'electric', kw: T_KW[d11] }); fields.push(fld('11', d11, T_KW[d11] + ' kW electric heat', docId, pg)); }
        else if (/[LMH]/.test(d11)) { heat.kind = 'gas'; heat.level = d11; fields.push(fld('11', d11, { L: 'Low', M: 'Medium', H: 'High' }[d11] + ' gas heat (MBH not captured — see heating table in ' + doc.form + ')', docId, pg)); }
        else if (d11 === '0') { if (type === 'AC') heat = res.attrs.heat = { kind: 'none' }; fields.push(fld('11', '0', 'No heat', docId, pg)); }
        else return fail(raw, 'Digit 11 "' + d11 + '" is not a heating-capacity code in ' + doc.form + '.');
      }
      if (m[10]) fields.push(fld('12+', m[10], 'Remaining option digits — not used for the cross (not decoded)', docId, pg));
    } else {
      if (d10) {
        if (f1 === 'T' || f1 === 'W') {
          if (d10 === '0') { if (f1 === 'T') heat = res.attrs.heat = { kind: 'none' }; fields.push(fld('10', '0', 'No electric heat', docId, pg)); }
          else if (T_KW[d10] && d10 !== 'R') { heat = res.attrs.heat = { kind: 'electric', kw: T_KW[d10] }; fields.push(fld('10', d10, T_KW[d10] + ' kW electric heat', docId, pg)); }
          else return fail(raw, 'Digit 10 "' + d10 + '" is not a heating code in ' + doc.form + '.');
        } else {
          var lg = { L: ['L', 'Low heat'], M: ['M', 'Medium heat'], H: ['H', 'High heat'], X: ['L', 'Low heat, stainless HX', 1], Y: ['M', 'Medium heat, stainless HX', 1], Z: ['H', 'High heat, stainless HX', 1] }[d10];
          if (!lg) return fail(raw, 'Digit 10 "' + d10 + '" is not a gas heating code in ' + doc.form + '.');
          heat = res.attrs.heat = { kind: 'gas', level: lg[0], stainless: !!lg[2] }; fields.push(fld('10', d10, lg[1] + ' (MBH not captured — see doc)', docId, pg));
        }
      }
      if (d11) fields.push(fld('11+', d11 + (m[10] || ''), 'Remaining digits — not used for the cross (not decoded)', docId, pg));
    }
    var tbl = legacy ? ((DATA.traneLegacy[f1] || {})[f2] || {}) : ((DATA.traneK[f2] || {})[f1] || {});
    res.rating = tbl[cap] || null; res.ratingSrc = docId;
    if (!res.rating) res.warnings.push('Competitor rating not captured for this size — see ' + doc.form + ' general data.');
    if (legacy) res.warnings.push('Legacy R-410A unit — crossed to current R-454B Rheem equipment.');
    return res;
  }
  function decodeTraneRes(raw) {
    var s = raw.replace(/\s+/g, '').toUpperCase();
    var m = /^(5[TY]C[CZ][45])(\d{3})?/.exec(s); if (!m) return null;
    var fam = DATA.traneRes[m[1]];
    if (!fam) return fail(raw, 'Trane residential family ' + m[1] + ' literature not loaded.');
    var doc = DATA.sources[fam.src];
    var res = { ok: true, input: raw, brand: 'Trane', family: m[1], refrigerant: 'R-454B', generation: 'current', fields: [fld('1–5', m[1], fam.line, fam.src, '1')], warnings: [], sources: [src(fam.src, '1')],
      attrs: { type: fam.type, cls: 'residential', tier: fam.tier, tons: null, volt: null, heat: { kind: fam.type === 'GE' ? 'gas' : 'none' }, stage: /two-stage/.test(fam.staging) ? '2' : '1' } };
    var models = Object.keys(fam.models);
    var hit = models.filter(function (x) { return s.indexOf(x) === 0; })[0];
    if (!hit) {
      if (!m[2]) { res.partial = true; res.familyOnly = true; res.tonsRange = [2, 2.5, 3, 3.5, 4, 5]; return res; }
      var pm = models.filter(function (x) { return x.indexOf(s) === 0; });
      if (pm.length) return fail(raw, 'Incomplete model — matches ' + pm.length + ' printed models: ' + pm.join(', ') + '. Enter one of them.', { family: m[1], suggestions: pm });
      return fail(raw, 'Not one of the ' + models.length + ' model numbers printed in ' + doc.form + '. Not decoded (no guessing).', { family: m[1] });
    }
    var info = fam.models[hit], cap = hit.substr(5, 3);
    var tons = { '024': 2, '030': 2.5, '036': 3, '042': 3.5, '048': 4, '060': 5 }[cap];
    res.attrs.tons = tons; res.fields.push(fld('6–8', cap, cap + ',000 Btuh nominal = ' + fmtT(tons) + ' tons (doc title: 2 to 5 Ton)', fam.src, '1'));
    var vt = info.volts || '';
    res.attrs.volt = /460/.test(vt) ? 'D' : (/\/3\//.test(vt) ? 'C' : (/\/1\//.test(vt) ? 'J' : null));
    res.fields.push(fld('10', hit.charAt(9), vt ? vt + ' (from the Rated Volts row for this model)' : 'Voltage not captured from tables (unverified)', fam.src, info.vp));
    if (!res.attrs.volt) res.warnings.push('Voltage for this model was not captured from the doc tables — unverified.');
    var hc = hit.substr(10, 3);
    if (fam.type === 'GE') { res.attrs.heat = { kind: 'gas', mbh: +hc, unverified: true }; res.fields.push(fld('11–13', hc, 'Gas heat size code ' + hc + ' (read as ~' + (+hc) + 'k Btuh nominal — unverified; see heating table)', fam.src)); }
    else res.fields.push(fld('11–13', hc, 'No factory heat', fam.src));
    res.matched = hit; res.rating = info.eerseer2 ? 'EER2/SEER2 ' + info.eerseer2 : null; res.ratingSrc = fam.src;
    return res;
  }

  function decode(input) {
    if (!DATA) throw new Error('engine not initialised');
    var s = (input || '').trim();
    if (!s) return fail(input, 'Empty input.');
    var u = s.toUpperCase().replace(/\s+/g, '');
    if (/^R(AC|GE|HP|DF)/.test(u)) return fail(input, 'This is already a Rheem model — use the Rheem lineup page.', { rheem: true });
    var out = decodeCarrierComm(u) || decodeCarrierRes(u) || decodeTraneRes(u) || decodeVoyager(u) || decodeTrane(u);
    if (out) return out;
    return fail(input, 'Model string not recognised against any loaded Carrier or Trane nomenclature. Not decoded — no guess made. (Lennox, York and others are not loaded yet.)');
  }

  /* ------------------------- CROSS ------------------------- */
  function seriesById(id) { return DATA.rheem.filter(function (r) { return r.id === id; })[0]; }
  /* exact nominal size first; else a row whose printed capacity class (matchT, e.g. Rheem 360 = 27.5 T class per PTS) equals t */
  function tonRow(s, t) { return s.tons.filter(function (x) { return x.t === t; })[0] || s.tons.filter(function (x) { return x.matchT === t; })[0]; }
  function rheemStage(s, t) {
    var id = s.id;
    if (/^(RACCYB|RGECYB|RHPCYB|RACSYB|RHPBYB|RHPSYB)$/.test(id)) return '1';
    if (/^(RACCYC|RGECYC|RHPCYC|RHPDYB|RACAXYC|RGEAXYC|RDFXYC|RHPXYC|RHPBYC)$/.test(id)) return '2';
    if (/^(RACDYB|RGEDYB)$/.test(id)) return t >= 12.5 ? 'multi' : '1';
    if (/^(RACGYB|RACHYB|RACHYB360|RGEGYB|RGEHYB|RGEHYB360)$/.test(id)) return 'multi';
    return 'unk';
  }
  var STAGE_TXT = { '1': 'single-stage', '2': 'two-stage', multi: 'multiple compressors/stages', 'var': 'variable-speed (eFlex)', unk: 'staging not verified' };
  function nearestCode(codes, mbh, limits, tons) {
    var best = null;
    Object.keys(codes).forEach(function (c) {
      if (limits && limits[c] && limits[c].indexOf(tons) < 0) return;
      var d = Math.abs(codes[c] - mbh);
      if (!best || d < best.d || (d === best.d && codes[c] > codes[best.c])) best = { c: c, d: d, v: codes[c] };
    });
    return best;
  }
  function buildCommercial(s, a, notes) {
    var row = tonRow(s, a.tons), t = s.id.substr(1, 2);
    var drive = s.drive;
    if (a.highStatic) {
      if (s.drives.U && a.volt !== 'J') { drive = 'U'; notes.push('Competitor has a high-static fan → Rheem drive U (direct drive high static).'); }
      else if (s.drives.L && a.tons === 5) { drive = 'L'; notes.push('Competitor has a high-static fan → Rheem drive L (5 T only).'); }
      else notes.push('Competitor has a high-static fan — select a higher drive (' + Object.keys(s.drives).join('/') + ') after a static-pressure check.');
    }
    var heat = '000';
    if (s.heat.kind === 'gas') {
      var cfg = a.heat.stainless && s.heat.cfg && s.heat.cfg.B ? 'B' : '2';
      if (a.heat.stainless && !(s.heat.cfg && s.heat.cfg.B)) notes.push('Competitor has a stainless heat exchanger; ' + s.id + ' MNI shows no stainless code — verify.');
      if (a.heat.mbh) {
        var b = nearestCode(s.heat.codes, a.heat.mbh, s.heat.limits, a.tons);
        if (b) { heat = b.c + cfg; notes.push('Gas heat: competitor ' + a.heat.mbh + ' MBH input → Rheem code ' + b.c + ' = ' + b.v + 'k Btu/h' + (b.d / a.heat.mbh > 0.15 ? ' (⚠ differs by more than 15% — check the heating load)' : '') + '.'); }
      } else { heat = '**' + cfg; notes.push('Gas heat size not known from the competitor string — choose from ' + Object.keys(s.heat.codes).map(function (c) { return c + ' = ' + s.heat.codes[c] + 'k'; }).join(', ') + ' Btu/h (match the competitor input MBH).'); }
      if (a.heat.nox) notes.push('⚠ Competitor is ' + (a.heat.nox === 'ULN' ? 'Ultra-Low NOx' : 'Low NOx') + '. No low/ultra-low NOx heat code appears in the ' + s.id + ' model number identification — unverified; confirm with Rheem before quoting in NOx-regulated areas.');
      if (s.heat.note) notes.push(s.heat.note);
    } else if (a.heat && a.heat.kw && s.heat.codes) {
      var kws = Object.keys(s.heat.codes).filter(function (c) { return c !== '00'; }).map(function (c) { return +c; });
      var nb = kws.reduce(function (p, c) { return Math.abs(c - a.heat.kw) < Math.abs(p - a.heat.kw) ? c : p; }, kws[0]);
      notes.push('Electric heat: competitor ' + a.heat.kw + ' kW → nearest Rheem ' + s.id + ' heater code ' + nb + ' kW. Base model is shown with no heat (000); set heat digits per MNI ' + s.mni + '.');
    } else if (a.heat && a.heat.kind === 'electric' && a.heat.level) {
      notes.push('Competitor has ' + { L: 'low', M: 'medium', H: 'high' }[a.heat.level] + ' electric heat (kW not in model string). Rheem heater codes: ' + Object.keys(s.heat.codes).join('/') + ' — pick by kW.');
    } else if (a.heat && a.heat.kind === 'hydronic') notes.push('⚠ Competitor has hydronic (hot-water) heat — no Rheem factory equivalent in the loaded MNIs.');
    var v = a.volt || '?';
    return 'R' + t + s.cab + 'Y' + s.eff + row.cap + 'A' + v + drive + heat + s.ctrl + 'A' + s.opts;
  }
  function buildResidential(s, a, notes) {
    var row = tonRow(s, a.tons);
    var pool = s.models.filter(function (m) { return m.substr(6, 3) === row.cap && (!a.volt || m.charAt(10) === a.volt); });
    if (!pool.length) return null;
    var finish = function (m) { if (!a.volt) { notes.push('Voltage not supplied — printed voltages for this size: ' + pool.map(function (x) { return x.charAt(10); }).filter(function (v, i, x) { return x.indexOf(v) === i; }).join('/') + '.'); return m.substr(0, 10) + '?' + m.substr(11); } return m; };
    if (s.heat.kind === 'gas') {
      var cfgPref = a.heat.nox === 'LNOX' ? (s.tier === 'high' ? 'T' : 'X') : (a.heat.nox === 'ULN' ? 'U' : (s.tier === 'high' ? '2' : '1'));
      var p2 = pool.filter(function (m) { return m.charAt(14) === cfgPref; });
      if (!p2.length) { notes.push('⚠ No printed ' + s.id + ' model with heat configuration "' + cfgPref + '" at this size/voltage — showing standard configuration.'); p2 = pool.filter(function (m) { return /[12]/.test(m.charAt(14)); }); }
      if (a.heat.mbh) {
        var best = null;
        p2.forEach(function (m) { var k = +m.substr(12, 2) * 10, d = Math.abs(k - a.heat.mbh); if (!best || d < best.d || (d === best.d && k > best.k)) best = { m: m, d: d, k: k }; });
        if (best) { notes.push('Gas heat: competitor ' + a.heat.mbh + 'k Btuh → Rheem ' + best.k + 'k Btu/h (code ' + best.m.substr(12, 2) + ')' + (best.d / a.heat.mbh > 0.15 ? ' ⚠ >15% difference' : '') + '.'); return finish(best.m); }
      }
      notes.push('Competitor heat size not known — other printed heat sizes: ' + p2.map(function (m) { return m.substr(12, 2); }).filter(function (v, i, x) { return x.indexOf(v) === i; }).join('/') + '.');
      return finish(p2[0]);
    }
    var nh = pool.filter(function (m) { return m.substr(12, 3) === '000'; });
    if (s.type === 'HP' && pool.length > nh.length) notes.push('Factory electric heat variants also printed: ' + pool.filter(function (m) { return m.substr(12, 3) !== '000'; }).join(', ') + '.');
    return finish(nh[0] || pool[0]);
  }
  function candidate(s, a, why, flags) {
    var notes = [], row = tonRow(s, a.tons);
    var capFlag = null;
    if (row && row.capBtuh && a.netCap) {
      var rc = parseFloat(row.capBtuh) * 1000;
      if (row.t === a.tons && row.matchT) notes.push('Rheem lists the ' + s.id + ' as ' + fmtT(row.t) + ' T nominal, but its printed cooling capacity is ' + row.capBtuh + ' Btu/h (' + DATA.sources[s.src].form + ' p.' + row.capPage + ') — the ' + fmtT(row.matchT) + ' T class.');
      if (rc < a.netCap) capFlag = 'Capacity: Rheem ' + s.id + ' printed cooling capacity ' + row.capBtuh + ' Btu/h (' + DATA.sources[s.src].form + ' p.' + row.capPage + ') is below the competitor’s printed net capacity ' + a.netCap.toLocaleString('en-US') + ' Btu/h (' + a.netCapSrc + ') — ' + Math.round((1 - rc / a.netCap) * 100) + '% less; check the load.';
      else notes.push('Capacity check: Rheem ' + row.capBtuh + ' Btu/h printed ≥ competitor net ' + a.netCap.toLocaleString('en-US') + ' Btu/h (' + a.netCapSrc + ').');
    }
    if (row && row.t !== a.tons && row.matchT === a.tons) { notes.push(row.classNote); why = (why || '') + ' (Rheem ' + fmtT(row.t) + ' T nominal = ' + fmtT(row.matchT) + ' T class)'; a = Object.assign({}, a, { tons: row.t }); }
    var model = s.cls === 'commercial' ? buildCommercial(s, a, notes) : buildResidential(s, a, notes);
    if (!model) return null;
    var doc = DATA.sources[s.src];
    var rs = rheemStage(s, a.tons), f = (flags || []).slice();
    if (capFlag) f.push(capFlag);
    if (a.stage && rs !== 'unk' && a.stage !== rs) {
      if (a.stage === 'var') f.push('Staging: competitor is variable-speed (eFlex); Rheem ' + s.id + ' is ' + STAGE_TXT[rs] + '.');
      else if (a.stage === '2' && rs === '1') f.push('Staging: competitor is two-stage; Rheem ' + s.id + ' at this size is single-stage.');
      else if (a.stage === 'multi' && rs === '1') f.push('Staging: competitor uses multiple compressors/stages; Rheem ' + s.id + ' at this size is a single compressor.');
      else if (a.stage === '1' && rs === '2') notes.push('Rheem ' + s.id + ' is two-stage (competitor single-stage) — exceeds.');
    }
    notes = notes.filter(function (n) { if (n.indexOf('⚠') >= 0) { f.push(n.replace(/⚠\s*/g, '')); return false; } return true; });
    if (rs === 'unk') notes.push('Rheem staging for ' + s.id + ' not verified from the spec sheet.');
    if (!a.volt) f.push('Voltage not supplied — "?" in the model string must be filled (J/C/D/Y).');
    return { series: s.id, line: s.line, tier: s.tier, model: model, reason: why, notes: notes, flags: f, ratings: row, staging: s.staging, src: s.src, form: doc.form, rev: doc.rev, mni: s.mni, gd: s.gd, drive: doc.drive, dimsPages: doc.dimsPages };
  }
  function cross(dec) {
    var out = { recommended: null, alternates: [], rejected: [], flags: [], method: [] };
    if (!dec || !dec.ok) { out.flags.push('Cannot cross: ' + (dec ? dec.reason : 'no decode')); return out; }
    var a = dec.attrs;
    var tierWanted = a.tier === 'ultra' ? 'high' : a.tier;
    if (a.tier === 'ultra') out.flags.push('Competitor is ultra-high efficiency (Trane Z / eFlex variable speed). Rheem has no ultra-high-efficiency RTU; crossing to the highest Rheem tier available (Classic Plus) — flagged.');
    out.method.push('Match: type ' + a.type + ', ' + a.cls + ', tier ' + tierWanted + ', ' + tonsLabel(a.tons) + ', voltage ' + (a.volt ? VOLT_TEXT[a.volt] : 'not given') + '.');
    if (dec.familyOnly) {
      var fam = [];
      (dec.tonsRange || []).forEach(function (t) {
        var c = cross(Object.assign({}, dec, { familyOnly: false, attrs: Object.assign({}, a, { tons: t, volt: null }) }));
        fam.push({ tons: t, series: c.recommended ? c.recommended.series : null, model: c.recommended ? c.recommended.model : null, flags: c.flags.concat(c.recommended ? c.recommended.flags : []) });
      });
      out.familyTable = fam;
      out.flags.push('Family-only input — no tonnage/voltage. Showing the Rheem series per tonnage; enter the full model to get a single answer.');
      return out;
    }
    var tierPaths = DATA.paths[a.cls][a.type];
    function tryPaths(tier, label) {
      var acc = [];
      (tierPaths[tier] || []).forEach(function (p) {
        var s = seriesById(p[0]); if (!tonRow(s, a.tons)) return;
        if (a.volt && s.volts.indexOf(a.volt) < 0) { out.rejected.push({ series: s.id, reason: s.id + ' is not offered in ' + VOLT_TEXT[a.volt] + (s.voltNote ? ' (' + s.voltNote + ')' : '') + ' — voltage is never dropped.' }); return; }
        var c = candidate(s, a, (label ? label + ' ' : '') + (p[1] || 'Same type, tier, class and tonnage'), label ? [label] : []);
        if (c) acc.push(c); else out.rejected.push({ series: s.id, reason: 'No printed ' + s.id + ' Available Model at ' + fmtT(a.tons) + ' T / ' + (a.volt ? VOLT_TEXT[a.volt] : '?') + '.' });
      });
      return acc;
    }
    var same = tryPaths(tierWanted, '');
    if (a.type === 'DF' && a.cls === 'commercial') {
      out.flags.push('No Rheem commercial dual-fuel RTU. Rheem dual fuel (RDFXYC) is residential 2–5 T only. Alternates below are heat-pump and gas/electric units at the same tier — they are not dual fuel.');
      ['HP', 'GE'].forEach(function (ty) {
        var b = cross(Object.assign({}, dec, { attrs: Object.assign({}, a, { type: ty, tier: a.tier, heat: ty === 'HP' ? { kind: 'electric' } : a.heat }) }));
        if (!b.recommended && b.alternates.length) b.recommended = b.alternates[0];
        if (b.recommended) { b.recommended.reason = 'Not dual fuel — ' + (ty === 'HP' ? 'heat pump only' : 'gas/electric only') + ' alternate'; b.recommended.flags.push('Type mismatch: competitor is dual fuel.'); out.alternates.push(b.recommended); }
      });
      return out;
    }
    if (same.length) { out.recommended = same[0]; out.alternates = same.slice(1); }
    var maxT = Math.max.apply(null, DATA.rheem.filter(function (s) { return s.cls === 'commercial'; }).map(function (s) { return Math.max.apply(null, s.tons.map(function (r) { return r.t; })); }));
    if (dec.tierAssumed) out.flags.push('Efficiency digit 29 not given — standard-efficiency (eStage) Voyager assumed. If the basis of design is high efficiency (digit 29 K/L) there is no same-tier Rheem match.');
    if (!same.length && a.tons > maxT) {
      out.flags.push('No Rheem match: Rheem’s largest packaged units are the 360 series — 30 T nominal (printed cooling capacity 330k Btu/h RGEHYB360, R11-886 p.1; 348k Btu/h RACHYB360, S11-801 p.1). Nothing is offered for a ' + fmtT(a.tons) + ' T unit.');
      return out;
    }
    if (!same.length) {
      // Kevin's rules: never offer a lower-efficiency tier to a high-efficiency basis of design (2026-10-15), and no size
      // alternates at all for a high/ultra basis (2026-10-19) — only same-size (incl. the 27.5 T → 360 class rule) at the same or higher tier.
      var hi = tierWanted === 'high';
      if (hi) {
        out.flags.push('No Rheem match: no Rheem high-efficiency (Classic Plus) ' + a.type + ' at ' + tonsLabel(a.tons) + (a.volt ? ' / ' + VOLT_TEXT[a.volt] : '') + '; size alternates and lower-tier (standard) units are not offered for a high-efficiency basis of design.');
        return out;
      }
      out.flags.push('No Rheem standard (Classic) ' + a.type + ' at ' + tonsLabel(a.tons) + (a.volt ? ' / ' + VOLT_TEXT[a.volt] : '') + '.');
      var alt = hi ? [] : tryPaths('high', 'Upgrade: Rheem high-efficiency tier.');
      out.alternates = out.alternates.concat(alt);
      // standard basis only: nearest size (±2.5 T), standard or high tier
      var sizes = [], tiers = ['standard', 'high'];
      tiers.forEach(function (tr) { if (alt.length && tr !== tierWanted) return; (tierPaths[tr] || []).forEach(function (p) { var s = seriesById(p[0]); s.tons.forEach(function (r) { if (r.t !== a.tons && r.matchT !== a.tons && Math.abs(r.t - a.tons) <= 2.5 && (!a.volt || s.volts.indexOf(a.volt) >= 0)) sizes.push({ s: s, t: r.t, tr: tr, d: Math.abs(r.t - a.tons) }); }); }); });
      sizes.sort(function (x, y) { return (x.tr === tierWanted ? 0 : 1) - (y.tr === tierWanted ? 0 : 1) || x.d - y.d; });
      var seen = {};
      (alt.length ? sizes.filter(function (z) { return z.d <= 1; }).slice(0, 2) : sizes.slice(0, 4)).forEach(function (z) {
        var key = z.s.id + z.t; if (seen[key]) return; seen[key] = 1;
        var c = candidate(z.s, Object.assign({}, a, { tons: z.t }), 'Size mismatch: nearest Rheem size ' + fmtT(z.t) + ' T' + (z.tr !== tierWanted ? ' (higher ' + z.tr + ' tier)' : ''), ['Size mismatch: competitor ' + fmtT(a.tons) + ' T vs Rheem ' + fmtT(z.t) + ' T — check load and capacity tables.'].concat(z.tr !== tierWanted ? ['Tier: Rheem ' + z.tr + ' tier (upgrade).'] : []));
        if (c) out.alternates.push(c);
      });
      if (!out.alternates.length) out.flags.push('No Rheem match within ±2.5 T for this type/voltage.');
    } else if (tierWanted === 'standard') {
      // offer the high tier as an upgrade alternate when it exists
      var up = tryPaths('high', 'Upgrade option: Rheem high-efficiency tier.');
      out.alternates = out.alternates.concat(up);
    }
    return out;
  }
  var api = { init: init, decode: decode, cross: cross, fmtT: fmtT, tonsLabel: tonsLabel, VOLT_TEXT: VOLT_TEXT, STAGE_TXT: STAGE_TXT };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.RTUEngine = api;
})(this);
