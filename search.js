/* Site-wide model search (wildcards) + Rheem model detail + AHRI listing plumbing.
   '*' = any run of characters, '?' = exactly one character. Case-insensitive; spaces and dashes ignored.
   A plain string (no wildcard) is a contains search, prefix matches ranked first.
   The index only holds model strings that are printed in the loaded literature or built from printed
   MNI codes (flagged as such). Nothing is invented: competitor commercial packaged families whose full
   strings need option letters are indexed at family/size level only. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.RTUSearch = factory();
})(this, function () {
  'use strict';
  function fT(t) { if (t == null || t === '') return ''; var x = +t; return isNaN(x) ? String(t) : String(Math.round(x * 10) / 10); } /* tonnage display: at most 1 decimal */

  var D = null, E = null, S = null, IDX = null, EXACT = null;
  var VT_PK = { J: '208/230 V 1-ph', C: '208/230 V 3-ph', D: '460 V 3-ph', Y: '575 V 3-ph' };
  var VT_SP = { '1PH': '208/230 V 1-ph', '3PH': '208/230 V 3-ph', '460': '460 V 3-ph', '575': '575 V 3-ph' };
  var RL = { J: '1PH', C: '3PH', D: '460', Y: '575' };
  var TYPE_PK = { AC: 'Packaged AC / electric heat', GE: 'Packaged gas/electric', HP: 'Packaged heat pump', DF: 'Packaged dual fuel' };
  var TYPE_SP = { AC: 'Split AC', HP: 'Split heat pump' };

  function norm(s) { return String(s == null ? '' : s).toUpperCase().replace(/[\s\-]+/g, ''); }
  function isWildcard(q) { return /[*?]/.test(q || ''); }
  function toRegex(q) {
    var n = norm(q), r = '';
    for (var i = 0; i < n.length; i++) {
      var ch = n.charAt(i);
      if (ch === '*') r += '.*'; else if (ch === '?') r += '.'; else r += ch.replace(/[.+^${}()|[\]\\\/]/g, '\\$&');
    }
    return new RegExp('^' + r + '$');
  }
  /* test one string against a query (wildcard = anchored pattern; plain = contains) */
  function test(q, str) {
    var n = norm(q); if (!n) return true;
    var s = norm(str);
    return isWildcard(n) ? toRegex(n).test(s) : s.indexOf(n) >= 0;
  }
  function ratingText(r) {
    if (!r) return '';
    var k = ['seer2', 'eer2', 'eerseer2', 'hspf2', 'eer', 'ieer', 'cop47'], lab = { eer2: 'EER2', seer2: 'SEER2', eerseer2: 'EER2/SEER2', eer: 'EER', ieer: 'IEER', hspf2: 'HSPF2', cop47: 'COP47' };
    return k.filter(function (x) { return r[x]; }).map(function (x) { return lab[x] + ' ' + r[x]; }).join(' / ');
  }

  /* ---------------- AHRI listing plumbing ---------------- */
  function AH() { return (D && D.ahri) || { listings: [], links: {}, coverage: {} }; }
  /* listing = {program, ref, outdoor, indoor, furnace, ratings:{...}, retrieved, url, urlKind:'detail'|'search'|'certificate', source}
     outdoor/indoor may contain * / ? wildcards (AHRI lists model strings with wildcards). */
  // match per displayed unit: 'exact' = identical strings (or AHRI wildcard pattern), 'base' = listed model is a shorter base model of the shown one
  function mcls(site, lst) {
    if (lst.indexOf('*') >= 0 || lst.indexOf('?') >= 0) return test(lst, site) ? 'exact' : null;
    var l = norm(lst); return site === l ? 'exact' : (site.indexOf(l) === 0 ? 'base' : null);
  }
  function ahriFind(outdoor, indoor) {
    var L = AH().listings || [], o = norm(outdoor), i = indoor ? norm(indoor) : null, out = [];
    L.forEach(function (x) {
      if (!x.ref || !x.outdoor) return;
      var mo = mcls(o, x.outdoor); if (!mo) return;
      var mi = 'exact';
      if (i != null) { if (!x.indoor) return; mi = mcls(i, x.indoor); if (!mi) return; }
      var m = (mo === 'exact' && mi === 'exact' && (x.match_type || 'exact') === 'exact') ? 'exact' : 'base';
      out.push(Object.assign({}, x, { match: m, shownOutdoor: outdoor, shownIndoor: indoor || null }));
    });
    var rank = { Rheem: 0, Ruud: 1 };
    return out.sort(function (a, b) { return (a.match === 'exact' ? 0 : 1) - (b.match === 'exact' ? 0 : 1) || ((a.indoor || '') < (b.indoor || '') ? -1 : (a.indoor || '') > (b.indoor || '') ? 1 : 0) || ((rank[a.brand] == null ? 2 : rank[a.brand]) - (rank[b.brand] == null ? 2 : rank[b.brand])); });
  }

  /* ---------------- index ---------------- */
  function push(e) { e.n = norm(e.m); if (!EXACT[e.n]) EXACT[e.n] = e; IDX.push(e); }
  function build() {
    IDX = []; EXACT = {};
    // Rheem packaged
    D.rheem.forEach(function (s) {
      var type = TYPE_PK[s.id.substr(1, 2) === 'AC' ? 'AC' : s.id.substr(1, 2) === 'GE' ? 'GE' : s.id.substr(1, 2) === 'HP' ? 'HP' : 'DF'];
      if (s.models && s.models.length) {
        s.models.forEach(function (m) {
          var row = s.tons.filter(function (r) { return r.cap === m.substr(6, 3); })[0];
          push({ m: m, brand: 'Rheem', cat: 'packaged', type: type, cls: s.cls, tons: row ? row.t : null, volt: VT_PK[m.charAt(10)] || '', eff: ratingText(row), fam: s.id, open: 'rh', basis: 'printed model', series: s.id, row: row });
        });
      } else {
        var t = s.id.substr(1, 2);
        s.tons.forEach(function (row) {
          s.volts.forEach(function (v) {
            if (row.volts && row.volts.indexOf(v) < 0) return;
            var heat = s.heat && s.heat.kind === 'gas' ? '**2' : '000';
            var m = 'R' + t + s.cab + 'Y' + s.eff + row.cap + 'A' + v + s.drive + heat + s.ctrl + 'A' + s.opts;
            push({ m: m, brand: 'Rheem', cat: 'packaged', type: type, cls: s.cls, tons: row.matchT ? fT(row.t) + ' nominal (' + fT(row.matchT) + ' T class, ' + row.capBtuh + ' Btu/h)' : row.t, volt: VT_PK[v], eff: ratingText(row), fam: s.id, open: 'rh', basis: 'base model built from MNI ' + (s.mni || '') + (heat === '**2' ? ' (gas heat digits **)' : ' (no heat, options none)'), series: s.id, row: row });
          });
        });
      }
    });
    // Rheem splits
    D.splits.rheemRes.forEach(function (R) {
      R.models.forEach(function (m) {
        var sz = m.substr(6, 2), v = RL[m.charAt(9)];
        push({ m: m, brand: 'Rheem', cat: 'split', type: TYPE_SP[R.type], cls: 'residential', tons: +sz / 12, volt: VT_SP[v] || '', eff: 'nominal ' + R.nominal + ' SEER2 class — system rating per AHRI matchup', fam: R.id, open: 'rh', basis: 'printed Available Model', series: R.id });
      });
    });
    D.splits.rheemComm.forEach(function (R) {
      R.caps.forEach(function (c) {
        ['C', 'D', 'Y'].forEach(function (L) {
          if (c.volts.indexOf(RL[L]) < 0) return;
          var eff = 'EER ' + c.eer + ' / IEER ' + c.ieer + (c.cop47 ? ' / COP47 ' + c.cop47 : '') + ' (with ' + c.ah + ')';
          push({ m: R.id + '2' + c.cap + L + 'AZ', brand: 'Rheem', cat: 'split', type: TYPE_SP[R.type] + ' (commercial)', cls: 'commercial', tons: c.t, volt: VT_SP[RL[L]], eff: eff, fam: R.id, open: 'rh', basis: 'built from MNI ' + R.mni, series: R.id, cap: c });
          push({ m: c.ah + L + 'A', brand: 'Rheem', cat: 'split', type: 'Air handler (commercial, matched to ' + R.id + ')', cls: 'commercial', tons: c.t, volt: VT_SP[RL[L]], eff: eff, fam: c.ah.substr(0, 5), open: 'rh', basis: 'air-handler prefix (motor/drive digit R/S/T not chosen)', series: R.id, cap: c, ahOnly: true });
        });
      });
    });
    // competitor packaged residential (printed lists)
    Object.keys(D.carrierRes).forEach(function (k) { (D.carrierRes[k].models || []).forEach(function (m) { pkComp(m); }); });
    Object.keys(D.traneRes).forEach(function (k) { Object.keys(D.traneRes[k].models).forEach(function (m) { pkComp(m); }); });
    // competitor packaged commercial: Trane family + printed capacity (decodes), Carrier family-level
    var TR = ['TSK', 'THK', 'YSK', 'YHK', 'WSK', 'WHK', 'DSK', 'DHK', 'TZK', 'YZK', 'TSC', 'THC', 'YSC', 'YHC', 'WSC', 'WHC', 'DSC', 'DHC'];
    var caps = ['036', '048', '060', '072', '074', '090', '092', '102', '120', '150', '180', '210', '240', '300'];
    TR.forEach(function (f) { caps.forEach(function (c) { var d = E.decode(f + c); if (d.ok && d.attrs.tons) pkComp(f + c, d, 'family + printed capacity (voltage/heat digits not chosen)'); }); });
    ['48FE', '50FE', '48GE', '50GE', '50FEQ', '50GEQ', '48FC', '50FC', '48GC', '50GC', '50FCQ'].forEach(function (f) {
      var d = E.decode(f); if (!d.ok) return; var c = E.cross(d);
      var fam = (D.carrierFamilies.filter(function (x) { return f.indexOf(x.fam) === 2; })[0]) || {};
      var tt = (c.familyTable || []).map(function (r) { return r.tons; });
      push({ m: f, brand: d.brand, cat: 'packaged', type: TYPE_PK[d.attrs.type], cls: 'commercial', tons: tt.length ? tt[0] + '–' + tt[tt.length - 1] : '', volt: 'per digit', eff: 'per size (see cross)', fam: f, open: 'pk', basis: 'family level — full string needs heat/option letters' });
    });
    // Trane Voyager 3 (27.5–50 T): digits 1–9 built from the printed Model Number Description (airflow D shown; H/F/R decode too)
    var VY = D.traneVoyager;
    if (VY) ['D', 'C'].forEach(function (gen) {
      var C = VY.common, doc = D.sources[VY[gen].doc];
      ['TC', 'TE', 'YC'].forEach(function (fn) {
        Object.keys(C.sizes).forEach(function (cap) {
          var grp = C.sizes[cap] <= 35 ? 'small' : 'large';
          Object.keys(C.volt).forEach(function (v) {
            var heats = fn === 'TC' ? ['0'] : fn === 'YC' ? Object.keys(C.gas).filter(function (h) { return !C.gas[h][2] || C.gas[h][2] === grp; }) : C.kwAvail[grp][C.volt[v][2]].split('');
            heats.forEach(function (h) { pkComp(fn + 'D' + cap + gen + v + h, null, 'built from ' + doc.form + ' p.24 (digits 1–9; airflow D shown — H/F/R also decode; digit 29 not given → standard efficiency)'); });
          });
        });
      });
    });
    // competitor splits
    var SP = D.splits;
    Object.keys(SP.carrier).forEach(function (k) { SP.carrier[k].models.forEach(function (m) { spComp(m); }); });
    Object.keys(SP.trane).forEach(function (k) { var F = SP.trane[k]; F.sizes.forEach(function (sz) { F.volts.forEach(function (v) { spComp(k + F.digit6 + sz + 'A' + v + '000A', 'built from PSD nomenclature'); }); }); });
    Object.keys(SP.comm.c38AX.rows).forEach(function (k) { ['5', '6', '1'].forEach(function (v) { spComp('38AX' + k[0] + (k[0] === 'Z' ? 'M' : 'T') + k.slice(1) + 'A0A' + v, 'built from nomenclature (coil/option digits A0A)'); }); });
    ['TTA', 'TWA'].forEach(function (u) { Object.keys(SP.comm[u].rows).forEach(function (k) { ['3', '4', 'W'].forEach(function (v) { spComp(u + k.slice(0, 3) + 'K' + v + k[3], 'built from nomenclature'); }); }); });
    return IDX;
  }
  function pkComp(m, d, basis) {
    d = d || E.decode(m); if (!d.ok) return;
    var a = d.attrs;
    push({ m: m, brand: d.brand, cat: 'packaged', type: TYPE_PK[a.type], cls: a.cls, tons: a.tons, volt: a.volt ? VT_PK[a.volt] : 'not in string', eff: d.rating || '', fam: d.family, open: 'pk', basis: basis || 'printed model' });
  }
  function spComp(m, basis) {
    var d = S.decode(m); if (!d.ok) return;
    var eff = d.eff.kind === 'system' ? 'EER ' + d.eff.eer + ' / IEER ' + d.eff.ieer + ' (matched AH)' : 'nominal ' + d.attrs.nominal + ' SEER2 class' + (d.eff.perSize ? '; range ' + d.eff.perSize.value : '');
    push({ m: m, brand: d.brand, cat: 'split', type: TYPE_SP[d.type] + (d.cls === 'commercial' ? ' (commercial)' : ''), cls: d.cls, tons: d.attrs.tons, volt: VT_SP[d.attrs.volt] || '', eff: eff, fam: d.family, open: 'sp', basis: basis || 'printed catalog number' });
  }

  function init(data, engine, splitEngine) { D = data; E = engine; S = splitEngine; E.init(D); S.init(D); IDX = null; return api; }
  function index() { if (!IDX) build(); return IDX; }
  /* search: returns ranked entries */
  function search(q, opt) {
    opt = opt || {}; var n = norm(q); if (!n || n.replace(/[*?]/g, '').length === 0 && n.length < 1) return [];
    var L = index(), out;
    if (isWildcard(n)) { var re = toRegex(n); out = L.filter(function (e) { return re.test(e.n); }); }
    else {
      if (n.length < 2) return [];
      out = L.filter(function (e) { return e.n.indexOf(n) >= 0; });
      out.sort(function (a, b) { return (a.n.indexOf(n) === 0 ? 0 : 1) - (b.n.indexOf(n) === 0 ? 0 : 1); });
    }
    if (opt.cat) out = out.filter(function (e) { return e.cat === opt.cat; });
    return out;
  }
  function exact(q) { index(); return EXACT[norm(q)] || null; }
  /* route: what the main search boxes do with an input */
  function route(q, box) {
    var s = (q || '').trim(); if (!s) return { mode: 'empty' };
    if (isWildcard(s)) return { mode: 'list', results: search(s) };
    var r = exact(s);
    if (r && r.brand === 'Rheem') return { mode: 'rheem', entry: r };
    var pd = E.decode(s), sd = S.decode(s);
    if (box === 'split' ? sd.ok : pd.ok) return { mode: box === 'split' ? 'split' : 'cross' };
    if (box === 'split' ? pd.ok : sd.ok) return { mode: box === 'split' ? 'cross' : 'split', other: true };
    return { mode: 'list', results: search(s), partial: true, reason: (box === 'split' ? sd : pd).reason, suggestions: (box === 'split' ? sd : pd).suggestions };
  }

  /* ---------------- HTML helpers (browser only) ---------------- */
  function esc(x) { return String(x == null ? '' : x).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function openAttr(e) { return e.open === 'pk' ? 'data-ex="' + esc(e.m) + '"' : e.open === 'sp' ? 'data-sx="' + esc(e.m) + '"' : 'data-rh="' + esc(e.m) + '"'; }
  function resultsHTML(q, res, head) {
    var max = 400, h = '<div class="card"><h3>' + (head || 'Search results') + ' for “' + esc(q) + '” — ' + res.length + ' model' + (res.length === 1 ? '' : 's') + (res.length > max ? ' (first ' + max + ' shown — narrow the pattern)' : '') + '</h3>';
    if (!res.length) return h + '<div class="flag bad">No loaded model matches. Wildcards: * = any run of characters, ? = exactly one character; spaces/dashes ignored. Only models printed in (or built from) the loaded literature are indexed.</div></div>';
    h += '<div class="tw"><table><tr><th>Model</th><th>Brand</th><th>Type</th><th>Tons</th><th>Voltage</th><th>Efficiency</th><th>Family</th><th>Basis</th></tr>';
    res.slice(0, max).forEach(function (e) {
      h += '<tr><td><a href="#" ' + openAttr(e) + ' class="mono">' + esc(e.m) + '</a></td><td>' + esc(e.brand) + '</td><td>' + esc(e.type) + ' <span class="small">' + esc(e.cls) + '</span></td><td>' + esc(fT(e.tons)) + '</td><td>' + esc(e.volt) + '</td><td class="small">' + esc(e.eff) + '</td><td class="mono">' + esc(e.fam) + '</td><td class="small">' + esc(e.basis) + '</td></tr>';
    });
    return h + '</table></div><div class="small">Click a model to open its full decode and Rheem cross (competitor) or its Rheem detail. * = any run of characters, ? = exactly one character.</div></div>';
  }
  function linkHome() { var L = AH().links || {}; return '<a href="' + esc(L.home || 'https://www.ahridirectory.org') + '" target="_blank" rel="noopener">AHRI Directory</a>'; }
  function usDate(d) { var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d || ''); return m ? m[2] + '/' + m[3] + '/' + m[1] : (d || ''); }
  function n1(v) { var x = parseFloat(v); if (isNaN(x)) return String(v); return (Math.round(x * 100) % 10 === 0) ? x.toFixed(1) : String(Math.round(x * 100) / 100); }
  var RLAB = { seer2: 'SEER2', eer2: 'EER2', hspf2: 'HSPF2', eer: 'EER', ieer: 'IEER', cop47: 'COP47' };
  function esRatings(r) { return ['seer2', 'eer2', 'hspf2', 'eer', 'ieer', 'cop47'].filter(function (k) { return r && r[k] != null && r[k] !== ''; }).map(function (k) { return RLAB[k] + ' ' + n1(r[k]); }).join(' / '); }
  function srcCite(id, page) { var s = (D.sources || {})[id]; return (s ? s.form + (s.rev && s.rev !== '—' ? ' ' + s.rev : '') : id) + (page ? ' p.' + page : ''); }
  function ahriHTML(outdoor, indoor, fallback) {
    var f = ahriFind(outdoor, indoor);
    if (!f.length) return '<span class="unv">' + esc(fallback || 'AHRI ref not retrieved — per AHRI matchup, verify') + '</span> in the ' + linkHome() + ' <span class="small">(link is the directory home page; no stable per-listing URL is recorded)</span>';
    return f.map(function (x) {
      var es = typeof x.source === 'object' && x.source, h = '<div class="ahri' + (x.match === 'exact' ? '' : ' ahri-base') + '">';
      if (es) {
        h += '<b>AHRI ref ' + esc(x.ref) + '</b> · <b>' + esc(x.brand || es.brand || '') + '-brand</b> — AHRI ref (per ENERGY STAR, retrieved ' + esc(usDate(x.retrieved)) + ') · ENERGY STAR ratings: ' + esc(esRatings(x.ratings)) +
          ' <span class="small">[listed: ' + esc(x.outdoor) + (x.indoor ? ' + ' + esc(x.indoor) : '') + (x.furnace ? ' + ' + esc(x.furnace) : '') + '; ' + esc(x.program || '') + ']</span>' +
          ' — <a href="' + esc(x.url) + '" target="_blank" rel="noopener">ENERGY STAR data row</a> · ' + linkHome() + ' <span class="small">(verify)</span>';
      } else {
        h += '<b>AHRI ref ' + esc(x.ref) + '</b> (' + esc(x.program || '') + ') ' + esc(ratingText(x.ratings)) + ' — <a href="' + esc(x.url) + '" target="_blank" rel="noopener">' + esc(x.urlKind === 'detail' ? 'AHRI listing' : x.urlKind === 'certificate' ? 'AHRI verify-certificate page' : 'AHRI search') + '</a> <span class="small">(' + esc(x.urlKind) + ' link; retrieved ' + esc(x.retrieved) + '; ' + esc(x.source || 'AHRI Directory') + ')</span>';
      }
      if (x.match !== 'exact') h += '<div class="flag">⚠ base-model match — verify suffix: ENERGY STAR lists ' + esc(x.outdoor) + (x.indoor ? ' + ' + esc(x.indoor) : '') + '; this unit is ' + esc(x.shownOutdoor) + (x.shownIndoor ? ' + ' + esc(x.shownIndoor) : '') + '. Confirm the full model is covered by this ref before quoting.</div>';
      (x.diffs || []).forEach(function (d) {
        h += '<div class="flag">⚠ Rating discrepancy (' + RLAB[d.k] + '): ENERGY STAR ' + n1(d.es) + ' (data.energystar.gov ' + esc(es ? es.dataset : '') + ', pd_id ' + esc(es ? es.pd_id : '') + ') vs Rheem printed ' + n1(d.printed) + ' (' + esc(srcCite(x.printed.src, x.printed.page)) + (x.printed.what ? ', ' + esc(x.printed.what) : '') + '). Cross and tier use the printed sheet; confirm in the AHRI Directory.</div>';
      });
      return h + '</div>';
    }).join('');
  }
  function rheemDetailHTML(e, srcLink, dl) {
    var h = '<div class="card okc"><div class="small">RHEEM MODEL — ' + esc(e.series) + ' · ' + esc(e.basis) + '</div><div class="model">' + esc(e.m) + '</div>';
    h += '<span class="pill">' + esc(e.type) + '</span><span class="pill">' + esc(e.cls) + '</span><span class="pill">' + esc(fT(e.tons)) + (/T class/.test(String(e.tons)) ? '' : ' T') + '</span><span class="pill">' + esc(e.volt) + '</span><span class="pill ok">R-454B</span>';
    if (e.cat === 'packaged') {
      var s = D.rheem.filter(function (x) { return x.id === e.series; })[0];
      h += '<div class="note"><b>Line:</b> ' + esc(s.line || '') + '</div>' + (e.row && e.row.classNote ? '<div class="note"><b>Size class:</b> ' + esc(e.row.classNote) + '</div>' : '') + '<div class="note"><b>Ratings at this size (as printed):</b> ' + esc(e.eff || 'not captured') + (e.row && e.row.p ? ' <span class="small">[GD p.' + e.row.p + ']</span>' : '') + '</div>';
      h += '<div class="note"><b>AHRI certified:</b> ' + ahriHTML(e.m, null) + '</div>';
      h += '<div class="small">Source: ' + srcLink(s.src) + ' — MNI ' + esc(s.mni || '') + ', general data ' + esc(s.gd || '') + '</div>' + dl(s.src);
    } else if (e.cls === 'residential') {
      var R = D.splits.rheemRes.filter(function (x) { return x.id === e.series; })[0];
      var rows = R.dtc.filter(function (r) { return norm(e.m).indexOf(norm(r[0])) === 0; });
      h += '<div class="note"><b>Line:</b> ' + esc(R.line) + ' · nominal ' + R.nominal + ' SEER2 class (model number, MNI p.4) · ' + esc(R.staging) + ' stage · ' + esc(R.discharge) + ' discharge</div>';
      h += '<div class="note"><b>System efficiency:</b> per outdoor + indoor AHRI matchup.</div>';
      if (rows.length) {
        h += '<div class="tw"><table><tr><th>Outdoor</th><th>Indoor (printed DTC)</th><th>SEER2</th><th>EER2</th><th>HSPF2</th><th>AHRI certified</th></tr>';
        rows.forEach(function (r) { h += '<tr><td class="mono">' + esc(r[0]) + '</td><td class="mono">' + esc(r[1]) + '</td><td>' + esc(r[2]) + '</td><td>' + esc(r[3]) + '</td><td>' + esc(r[4] || '—') + '</td><td class="small">' + ahriHTML(r[0], r[1]) + '</td></tr>'; });
        h += '</table></div><div class="small">DTC rows printed on ' + srcLink(R.src, R.dtcPage) + ' — reference only, not the rating for any other indoor unit.</div>';
      } else h += '<div class="note"><span class="unv">No printed DTC row for this exact model</span> — ' + ahriHTML(e.m, null) + '</div>';
      h += '<div class="small">Printed Available Model in ' + srcLink(R.src) + ' (MNI ' + esc(R.mni) + ').</div>' + dl(R.src);
    } else {
      var C = D.splits.rheemComm.filter(function (x) { return x.id === e.series; })[0], c = e.cap;
      h += '<div class="note"><b>Line:</b> ' + esc(C.line) + '</div><div class="note"><b>Matched system:</b> ' + esc(C.id + '2' + c.cap) + ' + ' + esc(c.ah) + ' — printed rating ' + esc(e.eff) + ' ' + srcLink(C.src, c.p) + '</div>';
      h += '<div class="note"><b>AHRI certified:</b> ' + ahriHTML(C.id + '2' + c.cap, c.ah) + '</div>' + dl(C.src) + ' ' + dl(C.ahSrc, 'Air handler spec');
    }
    return h + '<div class="small">Rheem models are the cross <i>result</i>; enter a Carrier/Trane model to cross to Rheem.</div></div>';
  }
  var api = { init: init, norm: norm, isWildcard: isWildcard, toRegex: toRegex, test: test, index: index, search: search, exact: exact, route: route, ahriFind: ahriFind, resultsHTML: resultsHTML, ahriHTML: ahriHTML, rheemDetailHTML: rheemDetailHTML };
  return api;
});
