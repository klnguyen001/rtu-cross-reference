(function () {
  'use strict';
  function fT(t) { if (t == null || t === '') return ''; var x = +t; return isNaN(x) ? String(t) : String(Math.round(x * 10) / 10); } /* tonnage display: at most 1 decimal */

  var D = window.RTU_DATA, S = window.SplitEngine; S.init(D);
  var SP = D.splits;
  var $ = function (s) { return document.querySelector(s); };
  function esc(x) { return String(x == null ? '' : x).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function srcLink(id, page) { var s = D.sources[id]; if (!s) return esc(id); return '<a href="' + esc(s.drive) + '" target="_blank" rel="noopener" title="' + esc(s.title) + '">' + esc(s.form) + '</a>' + (s.rev ? ' <span class="small">' + esc(s.rev) + '</span>' : '') + (page ? ' <span class="small">p.' + esc(page) + '</span>' : ''); }
  function dl(id, label) { var s = D.sources[id]; return s ? '<a class="dl" href="' + esc(s.drive) + '" target="_blank" rel="noopener">⬇ ' + esc(label || 'Download spec sheet') + ' (' + esc(s.form) + ')</a>' : ''; }
  var AHRI = '<a href="' + esc(SP.ahri) + '" target="_blank" rel="noopener">AHRI Directory</a>';
  var X = window.RTUSearch ? window.RTUSearch.init(D, window.RTUEngine, S) : null;
  function ah(o, i) { return X ? X.ahriHTML(o, i, 'not retrieved') : '<span class="unv">not retrieved</span>'; }
  // sub-tabs
  document.querySelectorAll('#splitNav button').forEach(function (b) {
    b.onclick = function () {
      document.querySelectorAll('#splitNav button').forEach(function (x) { x.classList.remove('active'); });
      document.querySelectorAll('.spane').forEach(function (x) { x.style.display = 'none'; });
      b.classList.add('active'); $('#sp-' + b.dataset.sp).style.display = 'block';
    };
  });
  function dtcTable(c) {
    if (!c.dtc || !c.dtc.length) return '<div class="note"><span class="unv">No printed DTC row for this size/voltage</span> — system rating only from the ' + AHRI + '.</div>';
    var h = '<div class="note"><b>Printed DTC (designated tested combination)</b> — ' + srcLink(c.src, c.dtcPage) + '. Reference rows only, <b>not</b> the rating for any other indoor unit; confirm the exact matchup in the ' + AHRI + '.</div><div class="tw"><table><tr><th>Outdoor</th><th>Indoor (as printed)</th><th>SEER2</th><th>EER2</th><th>HSPF2</th><th>AHRI certified ref</th></tr>';
    c.dtc.forEach(function (r) { h += '<tr><td class="mono">' + esc(r[0]) + '</td><td class="mono">' + esc(r[1]) + '</td><td>' + esc(r[2]) + '</td><td>' + esc(r[3]) + '</td><td>' + esc(r[4] || '—') + '</td><td class="small">' + ah(r[0], r[1]) + '</td></tr>'; });
    return h + '</table></div>';
  }
  function cardRes(c, primary) {
    var h = '<div class="card ' + (primary ? 'okc' : 'altc') + '"><div class="small">' + (primary ? 'RECOMMENDED RHEEM OUTDOOR UNIT' : 'ALTERNATE (same or higher tier)') + ' — ' + esc(c.series) + ' · ' + esc(c.line) + '</div>';
    h += '<div class="model">' + esc(c.model || (c.series + ' — model not printed for this size/voltage')) + '</div><div class="note"><b>Why:</b> ' + esc(c.reason) + '</div>';
    c.flags.forEach(function (f) { h += '<div class="flag">⚠ ' + esc(f) + '</div>'; });
    c.notes.forEach(function (n) { h += '<div class="note">• ' + esc(n) + '</div>'; });
    h += '<div class="note"><b>Staging:</b> ' + esc(c.staging) + ' · <b>Nominal SEER2 class:</b> ' + esc(c.nominal) + ' (model number, ' + srcLink(c.src, 4) + ')</div>';
    var cert = X && c.model ? X.ahriFind(c.model, null) : [];
    h += '<div class="note"><b>System efficiency:</b> ' + (cert.length ? X.ahriHTML(c.model, null) : '<span class="unv">per AHRI matchup — verify</span>') + '</div>' + dtcTable(c);
    h += '<div class="small">Model is a printed Available Model in ' + srcLink(c.src) + ' (MNI ' + esc(c.mni) + ').</div>' + dl(c.src);
    return h + '</div>';
  }
  function cardComm(c) {
    var r = c.ratings, h = '<div class="card okc"><div class="small">RECOMMENDED RHEEM COMMERCIAL SPLIT — ' + esc(c.series) + ' · ' + esc(c.line) + '</div>';
    h += '<div class="model">' + esc(c.model) + ' + ' + esc(c.ah) + '</div><div class="note"><b>Why:</b> ' + esc(c.reason) + '</div>';
    c.flags.forEach(function (f) { h += '<div class="flag">⚠ ' + esc(f) + '</div>'; });
    c.notes.forEach(function (n) { h += '<div class="note">• ' + esc(n) + '</div>'; });
    h += '<div class="note"><b>Matched-system rating (AHRI 340/360, as printed):</b> EER ' + r.eer + ' · IEER ' + r.ieer + (r.cop47 ? ' · COP 47°F ' + r.cop47 + ' · COP 17°F ' + r.cop17 : '') + ' — ' + srcLink(c.src, r.p) + '</div>';
    h += '<div class="note"><b>AHRI certified:</b> ' + (X ? X.ahriHTML(c.model, c.ah) : '') + '</div>';
    h += '<div class="small">Model built from MNI ' + esc(c.mni) + ' codes (pos 5 = 2-stage, pos 10 A, pos 11 Z = scroll).</div>' + dl(c.src) + ' ' + dl(c.ahSrc, 'Air handler spec');
    return h + '</div>';
  }
  function render(q) {
    var out = $('#sresult'); if (!q.trim()) { out.innerHTML = ''; return; }
    var R = X ? X.route(q, 'split') : null;
    if (R && R.mode === 'list' && !R.partial) { out.innerHTML = X.resultsHTML(q.trim(), R.results, 'Wildcard search'); return; }
    if (R && R.mode === 'rheem') { out.innerHTML = X.rheemDetailHTML(R.entry, srcLink, dl); return; }
    if (R && R.mode === 'cross') { out.innerHTML = '<div class="card"><div class="note"><b>' + esc(q) + '</b> is a packaged unit — <a href="#" data-ex="' + esc(q.trim()) + '">open it in the packaged cross</a>.</div></div>'; return; }
    var d = S.decode(q), c = S.cross(d);
    if (!d.ok) {
      out.innerHTML = (R && R.partial && R.results.length ? X.resultsHTML(q.trim(), R.results, 'Models containing') : '') + '<div class="card err"><h3>Cannot decode “' + esc(q) + '”</h3><div class="flag bad">' + esc(d.reason) + '</div>' + (d.suggestions ? '<div class="note">Printed catalog numbers: ' + d.suggestions.map(function (x) { return '<a href="#" data-sx="' + esc(x) + '" class="mono">' + esc(x) + '</a>'; }).join(' ') + '</div>' : '') + '<div class="small">Only codes printed in the loaded split literature are decoded. Nothing is guessed.</div></div>';
      return;
    }
    var a = d.attrs, h = '<div class="grid2"><div class="card"><h3>Competitor decode — ' + esc(d.brand) + ' ' + esc(d.family) + '</h3>';
    h += '<span class="pill">' + (d.type === 'AC' ? 'Split AC / condensing unit' : 'Split heat pump') + '</span><span class="pill">' + esc(d.cls) + '</span><span class="pill ' + (d.legacy ? 'warn' : 'ok') + '">' + esc(d.refrigerant) + (d.legacy ? ' (legacy)' : '') + '</span><span class="pill">' + fT(a.tons) + ' T</span><span class="pill">' + esc(S.VT[a.volt]) + '</span><span class="pill">' + esc(S.STG[a.staging] || a.staging) + '</span>' + (a.nominal ? '<span class="pill">nominal ' + a.nominal + ' SEER2 class</span>' : '');
    h += '<div class="tw"><table><tr><th>Pos.</th><th>Code</th><th>Meaning</th><th>Source</th></tr>';
    d.fields.forEach(function (f) { h += '<tr><td>' + esc(f.pos) + '</td><td class="mono">' + esc(f.code) + '</td><td>' + esc(f.meaning) + '</td><td>' + srcLink(f.src, f.page) + '</td></tr>'; });
    h += '</table></div>';
    var e = d.eff;
    if (e.kind === 'system') h += '<div class="note"><b>Competitor matched-system rating (as printed):</b> ' + esc(e.text) + ' — ' + srcLink(e.src, e.page) + '</div>';
    else {
      h += '<div class="note"><b>Competitor efficiency:</b> <span class="unv">per AHRI matchup — verify</span>. ' + esc(e.text) + ' — ' + srcLink(e.src, e.page) + '</div>';
      if (e.perSize) h += '<div class="note">Outdoor unit’s rated range at this size, “' + esc(e.perSize.label) + '”: <b>' + esc(e.perSize.value) + ' SEER2</b> — ' + srcLink(e.src, e.perSize.page) + '. This is a range across indoor combinations, not a system rating.</div>';
    }
    d.warnings.forEach(function (w) { h += '<div class="flag">⚠ ' + esc(w) + '</div>'; });
    d.sources.forEach(function (s) { h += dl(s, 'Competitor literature'); });
    h += '</div><div>';
    c.method.forEach(function (m) { h += '<div class="note">' + esc(m) + '</div>'; });
    c.flags.forEach(function (f) { h += '<div class="card"><div class="flag">⚠ ' + esc(f) + '</div></div>'; });
    if (c.recommended) h += d.cls === 'commercial' ? cardComm(c.recommended) : cardRes(c.recommended, true);
    else h += '<div class="card err"><div class="flag bad">No same-type, same-or-higher-tier Rheem match.</div></div>';
    c.alternates.forEach(function (x) { h += cardRes(x, false); });
    if (c.rejected.length) h += '<div class="card"><details><summary>Excluded Rheem series (' + c.rejected.length + ')</summary>' + c.rejected.map(function (r) { return '<div class="note">✕ ' + esc(r.reason) + '</div>'; }).join('') + '</details></div>';
    out.innerHTML = h + '</div></div>';
  }
  var qi = $('#sq'), t = null;
  qi.addEventListener('input', function () { clearTimeout(t); t = setTimeout(function () { render(qi.value); history.replaceState(null, '', '#splits=' + encodeURIComponent(qi.value.trim())); }, 120); });
  document.addEventListener('click', function (e) {
    var a = e.target.closest('[data-sx]'); if (!a) return; e.preventDefault();
    document.querySelector('#tabs button[data-tab="splits"]').click(); document.querySelector('#splitNav button[data-sp="lookup"]').click();
    qi.value = a.dataset.sx; render(qi.value); window.scrollTo(0, 0);
  });
  function show(v) { document.querySelector('#tabs button[data-tab="splits"]').click(); document.querySelector('#splitNav button[data-sp="lookup"]').click(); qi.value = v; render(v); window.scrollTo(0, 0); }
  window.SplitUI = { render: render, show: show };
  var m = /splits=([^&]+)/.exec(window.RTU_INIT_HASH || location.hash); if (m) { document.querySelector('#tabs button[data-tab="splits"]').click(); qi.value = decodeURIComponent(m[1]); render(qi.value); }

  /* ---------- browse ---------- */
  var ROWS = [];
  Object.keys(SP.carrier).forEach(function (k) {
    var F = SP.carrier[k], seen = {};
    F.models.forEach(function (mm) { var sz = mm.slice(6, 8); if (seen[sz] && mm.slice(-1) !== '3') return; if (!seen[sz] || mm.slice(-1) === '3') seen[sz] = mm; });
    Object.keys(seen).sort().forEach(function (sz) { ROWS.push({ brand: 'Carrier', fam: k, model: seen[sz], src: F.src }); });
  });
  Object.keys(SP.trane).forEach(function (k) { var F = SP.trane[k]; F.sizes.forEach(function (sz) { ROWS.push({ brand: 'Trane', fam: k, model: k + F.digit6 + sz + 'A' + F.volts[0] + '000A', src: F.src }); }); });
  Object.keys(SP.comm.c38AX.rows).forEach(function (k) { ROWS.push({ brand: 'Carrier', fam: '38AX' + k[0], model: '38AX' + k[0] + (k[0] === 'Z' ? 'M' : 'T') + k.slice(1) + 'A0A5', src: 'CS-38AX' }); });
  ['TTA', 'TWA'].forEach(function (u) { Object.keys(SP.comm[u].rows).forEach(function (k) { ROWS.push({ brand: 'Trane', fam: 'Odyssey ' + u, model: u + k.slice(0, 3) + 'K3' + k[3], src: SP.comm[u].src }); }); });
  ROWS.forEach(function (r) { r.d = S.decode(r.model); r.c = S.cross(r.d); });
  function renderBrowse() {
    var fb = $('#sfBrand').value, ft = $('#sfType').value, fc = $('#sfCls').value, fq = ($('#sfText') ? $('#sfText').value : '').trim();
    var h = '<div class="tw"><table><tr><th>Competitor model (example)</th><th>Type / class</th><th>Refrig.</th><th>Tons · voltage</th><th>Competitor efficiency</th><th>Rheem recommended</th><th>Alternates (≥ tier)</th><th>Flags</th><th>Literature</th></tr>';
    ROWS.forEach(function (r) {
      var d = r.d, c = r.c; if (!d.ok) return;
      if (fb && r.brand !== fb) return; if (ft && d.type !== ft) return; if (fc && d.cls !== fc) return;
      if (fq && X && !X.test(fq, r.model) && !(c.recommended && X.test(fq, c.recommended.model || ''))) return;
      var eff = d.eff.kind === 'system' ? 'EER ' + d.eff.eer + ' / IEER ' + d.eff.ieer + ' (matched AH)' : 'nominal ' + d.attrs.nominal + ' SEER2 class' + (d.eff.perSize ? '; range ' + d.eff.perSize.value : '') + ' <span class="unv">AHRI — verify</span>';
      var rec = c.recommended ? '<b>' + esc(c.recommended.series) + '</b> <span class="mono small">' + esc(c.recommended.model) + (c.recommended.ah ? ' + ' + esc(c.recommended.ah) : '') + '</span>' : '<span class="unv">no Rheem match</span>';
      var fl = [].concat(c.flags, c.recommended ? c.recommended.flags : []).map(function (x) { return x.split(/[.—]/)[0]; });
      h += '<tr><td><a href="#" data-sx="' + esc(r.model) + '" class="mono">' + esc(r.model) + '</a></td><td>' + esc(d.type + ' / ' + d.cls) + '</td><td>' + esc(d.refrigerant) + '</td><td>' + fT(d.attrs.tons) + ' T · ' + esc(S.VT[d.attrs.volt]) + '</td><td class="small">' + eff + '</td><td>' + rec + '</td><td class="mono small">' + esc(c.alternates.map(function (x) { return x.model; }).join(', ') || '—') + '</td><td class="small">' + esc(fl.join(' · ')) + '</td><td>' + srcLink(r.src) + '</td></tr>';
    });
    $('#sbrowse').innerHTML = h + '</table></div><p class="small">One example per family and size (single-phase where printed; commercial rows shown at 208/230 V 3-ph). Click a model to open the full decode and cross; change the voltage digit there for other voltages. The text filter matches the example model or the recommended Rheem model (wildcards * and ? allowed); all split models matching are listed below.</p>' + (fq && X ? X.resultsHTML(fq, X.search(fq).filter(function (e) { return e.cat === 'split'; }), 'Split models matching') : '');
  }
  ['#sfBrand', '#sfType', '#sfCls'].forEach(function (s) { $(s).onchange = renderBrowse; }); if ($('#sfText')) $('#sfText').addEventListener('input', function () { clearTimeout(t); t = setTimeout(renderBrowse, 150); }); renderBrowse();

  /* ---------- Rheem split lineup ---------- */
  (function () {
    var VT = S.VT, h = '<p class="small">Current R-454B Rheem split equipment (R = Rheem; W-prefix WeatherKing twins not listed). Nominal SEER2 class is the model-number code (MNI p.4). <b>System efficiency is per AHRI matchup</b>: the tables show only each sheet’s printed DTC rows.</p><h2>Residential outdoor units</h2>';
    SP.rheemRes.forEach(function (R) {
      h += '<div class="card"><h3>' + esc(R.id) + ' — ' + esc(R.line) + ' <span class="pill">' + (R.type === 'AC' ? 'Split AC' : 'Split heat pump') + '</span><span class="pill">' + esc(S.STG[R.staging]) + '</span>' + (R.discharge === 'side' ? '<span class="pill warn">side discharge</span>' : '') + '</h3>';
      h += '<div class="note">Sizes / voltages (from printed Available Models): ' + Object.keys(R.sizes).map(function (k) { return k + ' (' + R.sizes[k].map(function (v) { return VT[v]; }).join(', ') + ')'; }).join(' · ') + '</div>';
      (R.flags || []).forEach(function (f) { h += '<div class="flag">⚠ ' + esc(f) + '</div>'; });
      h += dtcTable({ dtc: R.dtc, src: R.src, dtcPage: R.dtcPage });
      h += '<details><summary>Printed Available Models (' + R.models.length + ')</summary><div class="mono small">' + R.models.map(esc).join(' ') + '</div></details>';
      h += '<div class="small">Source: ' + srcLink(R.src) + ' — MNI p.4, DTC p.' + R.dtcPage + '</div>' + dl(R.src) + '</div>';
    });
    h += '<h2>Commercial splits</h2>';
    SP.rheemComm.forEach(function (R) {
      h += '<div class="card"><h3>' + esc(R.id) + ' — ' + esc(R.line) + '</h3><div class="tw"><table><tr><th>Tons</th><th>Model (C = 208/230-3 · D = 460-3 · Y = 575-3)</th><th>Matched air handler</th><th>EER / IEER' + (R.type === 'HP' ? ' / COP47 / COP17' : '') + '</th><th>Page</th><th>AHRI certified ref</th></tr>';
      R.caps.forEach(function (c) { h += '<tr><td>' + fT(c.t) + '</td><td class="mono">' + R.id + '2' + c.cap + '[C/D/Y]AZ</td><td class="mono">' + c.ah + '[C/D/Y]A[R/S/T]</td><td>' + c.eer + ' / ' + c.ieer + (c.cop47 ? ' / ' + c.cop47 + ' / ' + c.cop17 : '') + (c.note ? ' <span class="small">(' + esc(c.note) + ')</span>' : '') + '</td><td>' + srcLink(R.src, c.p) + '</td><td class="small">' + ah(R.id + '2' + c.cap, c.ah) + '</td></tr>'; });
      h += '</table></div><div class="small">MNI ' + esc(R.mni) + '; matched air handler: ' + srcLink(R.ahSrc, 5) + '</div>' + dl(R.src) + ' ' + dl(R.ahSrc, 'Air handler spec') + '</div>';
    });
    h += '<h2>Indoor units referenced by the DTC rows</h2><div class="card">' + ['RS-RH2TY', 'RS-RH2VY', 'RS-RHMVY', 'RS-RCFY'].map(function (id) { return '<div class="note">' + esc(D.sources[id].title) + ' — ' + srcLink(id) + ' ' + dl(id) + '</div>'; }).join('') + '</div>';
    h += '<h2>Known gaps (splits)</h2><div class="card">' + SP.gaps.map(function (g) { return '<div class="note"><span class="unv">gap</span> ' + esc(g) + '</div>'; }).join('') + '</div>';
    $('#slineup').innerHTML = h;
  })();
})();
