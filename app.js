(function () {
  'use strict';
  function fT(t) { if (t == null || t === '') return ''; var x = +t; return isNaN(x) ? String(t) : String(Math.round(x * 10) / 10); } /* tonnage display: at most 1 decimal */

  var D = window.RTU_DATA, E = window.RTUEngine; E.init(D);
  var $ = function (s) { return document.querySelector(s); };
  function esc(x) { return String(x == null ? '' : x).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function srcLink(id, page) {
    var s = D.sources[id]; if (!s) return esc(id);
    return '<a href="' + esc(s.drive) + '" target="_blank" rel="noopener" title="' + esc(s.title) + '">' + esc(s.form) + '</a>' + (s.rev ? ' <span class="small">' + esc(s.rev) + '</span>' : '') + (page ? ' <span class="small">p.' + esc(page) + '</span>' : '');
  }
  function dl(id, label) { var s = D.sources[id]; return s ? '<a class="dl" href="' + esc(s.drive) + '" target="_blank" rel="noopener">⬇ ' + esc(label || 'Download spec sheet') + ' (' + esc(s.form) + ')</a>' : ''; }
  $('#lv').textContent = D.lastVerified;
  // tabs
  document.querySelectorAll('#tabs button').forEach(function (b) {
    b.onclick = function () {
      document.querySelectorAll('#tabs button').forEach(function (x) { x.classList.remove('active'); });
      document.querySelectorAll('.tab').forEach(function (x) { x.classList.remove('active'); });
      b.classList.add('active'); $('#tab-' + b.dataset.tab).classList.add('active');
      history.replaceState(null, '', '#' + b.dataset.tab);
    };
  });
  var INIT_HASH = location.hash || ''; window.RTU_INIT_HASH = INIT_HASH; var h = INIT_HASH.slice(1); if (h) { var tb = document.querySelector('#tabs button[data-tab="' + h.split('=')[0] + '"]'); if (tb) tb.click(); }

  /* ---------- cross ---------- */
  function ratingRows(r) {
    if (!r) return '<span class="unv">not captured</span>';
    var k = ['eer2', 'seer2', 'eerseer2', 'eer', 'ieer', 'hspf2', 'cop47', 'cop17'], lab = { eer2: 'EER2', seer2: 'SEER2', eerseer2: 'EER2/SEER2', eer: 'EER', ieer: 'IEER', hspf2: 'HSPF2', cop47: 'COP@47°F', cop17: 'COP@17°F' };
    var out = k.filter(function (x) { return r[x]; }).map(function (x) { return lab[x] + ' ' + esc(r[x]); }).join(' · ');
    if (r.wt) out += ' · net wt ' + esc(r.wt) + ' lb';
    if (r.note) out += ' <span class="small">(' + esc(r.note) + ')</span>';
    return out + (r.p ? ' <span class="small">[GD p.' + r.p + ']</span>' : '');
  }
  function candCard(c, primary) {
    var s = D.sources[c.src];
    var html = '<div class="card ' + (primary ? 'okc' : 'altc') + '"><div class="small">' + (primary ? 'RECOMMENDED RHEEM BASE MODEL' : 'ALTERNATE') + ' — ' + esc(c.series) + ' · ' + esc(c.line) + '</div>';
    html += '<div class="model">' + esc(c.model) + '</div>';
    html += '<div class="note"><b>Why:</b> ' + esc(c.reason) + '</div>';
    c.flags.forEach(function (f) { html += '<div class="flag">⚠ ' + esc(f) + '</div>'; });
    c.notes.forEach(function (n) { html += '<div class="note">• ' + esc(n) + '</div>'; });
    html += '<div class="note"><b>Rheem ratings at this size:</b> ' + ratingRows(c.ratings) + '</div>';
    html += '<div class="note"><b>Staging:</b> ' + esc(c.staging) + '</div>';
    if (X) html += '<div class="note"><b>AHRI certified:</b> ' + X.ahriHTML(c.model, null) + '</div>';
    html += '<div class="small">Source: ' + srcLink(c.src) + ' — model number identification ' + esc(c.mni) + ', general data ' + esc(c.gd) + (c.dimsPages && c.dimsPages.length ? ', unit dimensions p.' + c.dimsPages.join('/') : ', dimensions: see spec sheet') + '. Model built from printed MNI codes' + (c.model.indexOf('?') >= 0 || c.model.indexOf('*') >= 0 ? ' — fill the ?/* positions before ordering' : '') + '; options shown as “none”.</div>';
    html += dl(c.src);
    return html + '</div>';
  }
  var X = window.RTUSearch ? window.RTUSearch.init(D, E, window.SplitEngine) : null;
  function render(q) {
    var out = $('#result');
    if (!q.trim()) { out.innerHTML = ''; return; }
    var R = X ? X.route(q, 'pk') : null;
    if (R && R.mode === 'list' && !R.partial) { out.innerHTML = X.resultsHTML(q.trim(), R.results, 'Wildcard search'); return; }
    if (R && R.mode === 'rheem') { out.innerHTML = X.rheemDetailHTML(R.entry, srcLink, dl); return; }
    var d = E.decode(q), c = E.cross(d);
    if (!d.ok) {
      var part = R && R.partial && R.results.length ? X.resultsHTML(q.trim(), R.results, 'Models containing') : '';
      var spl = window.SplitEngine ? (window.SplitEngine.init(D), window.SplitEngine.decode(q)) : null;
      out.innerHTML = part + (spl && spl.ok ? '<div class="card"><div class="note"><b>' + esc(q) + '</b> is a ' + esc(spl.brand + ' ' + spl.family) + ' split system — <a href="#" data-sx="' + esc(q) + '">open it in the Splits tab</a>.</div></div>' : '') + '<div class="card err"><h3>Cannot decode “' + esc(q) + '”</h3><div class="flag bad">' + esc(d.reason) + '</div>' + (d.suggestions ? '<div class="note">' + d.suggestions.slice(0, 30).map(function (x) { return '<a href="#" data-ex="' + esc(x) + '" class="mono">' + esc(x) + '</a>'; }).join(' ') + '</div>' : '') + '<div class="small">The tool only decodes codes printed in the loaded literature (see Sources). Nothing is guessed or broadened.</div></div>';
      return;
    }
    var a = d.attrs, html = '<div class="grid2"><div class="card"><h3>Competitor decode — ' + esc(d.brand) + ' ' + esc(d.family) + '</h3>';
    html += '<span class="pill">' + esc({ AC: 'Cooling / electric', GE: 'Gas/electric', HP: 'Heat pump', DF: 'Dual fuel' }[a.type]) + '</span><span class="pill">' + esc(a.cls) + '</span><span class="pill">' + esc(a.tier) + ' efficiency</span><span class="pill ' + (d.generation === 'legacy' ? 'warn' : 'ok') + '">' + esc(d.refrigerant) + (d.generation === 'legacy' ? ' (legacy)' : '') + '</span>';
    if (a.tons) html += '<span class="pill">' + fT(a.tons) + ' T</span>';
    if (a.volt) html += '<span class="pill">' + esc(E.VOLT_TEXT[a.volt]) + '</span>';
    if (a.stage) html += '<span class="pill">' + esc(E.STAGE_TXT[a.stage]) + '</span>';
    html += '<div class="tw"><table><tr><th>Pos.</th><th>Code</th><th>Meaning</th><th>Source</th></tr>';
    d.fields.forEach(function (f) { html += '<tr><td>' + esc(f.pos) + '</td><td class="mono">' + esc(f.code) + '</td><td>' + esc(f.meaning) + '</td><td>' + (f.src ? srcLink(f.src, f.page) : '') + '</td></tr>'; });
    html += '</table></div>';
    if (d.rating) html += '<div class="note"><b>Competitor rating (as printed):</b> ' + esc(d.rating) + ' — ' + srcLink(d.ratingSrc, (D.sources[d.ratingSrc].ratingPages || []).join('–')) + '</div>';
    d.warnings.forEach(function (w) { html += '<div class="flag">⚠ ' + esc(w) + '</div>'; });
    d.sources.forEach(function (s) { html += dl(s.id, 'Competitor literature'); });
    html += '</div><div>';
    c.method.forEach(function (m) { html += '<div class="note">' + esc(m) + '</div>'; });
    c.flags.forEach(function (f) { html += '<div class="card"><div class="flag">⚠ ' + esc(f) + '</div></div>'; });
    if (c.familyTable) {
      html += '<div class="card"><h3>Rheem series by tonnage</h3><table><tr><th>Tons</th><th>Rheem series</th><th>Base model (voltage “?”)</th><th>Flags</th></tr>';
      c.familyTable.forEach(function (r) { html += '<tr><td>' + fT(r.tons) + '</td><td>' + esc(r.series || '— none —') + '</td><td class="mono">' + esc(r.model || '') + '</td><td class="small">' + esc(r.flags.filter(function (x) { return !/Voltage not supplied/.test(x); }).join(' · ')) + '</td></tr>'; });
      html += '</table></div>';
    }
    if (c.recommended) html += candCard(c.recommended, true);
    else if (!c.familyTable) html += '<div class="card err"><div class="flag bad">No same-type, same-tier Rheem match' + (c.alternates.length ? ' — see flagged alternates.' : '.') + '</div></div>';
    c.alternates.forEach(function (x) { html += candCard(x, false); });
    if (c.rejected.length) html += '<div class="card"><details><summary>Excluded Rheem series (' + c.rejected.length + ')</summary>' + c.rejected.map(function (r) { return '<div class="note">✕ ' + esc(r.reason) + '</div>'; }).join('') + '</details></div>';
    html += '</div></div>';
    out.innerHTML = html;
  }
  var qi = $('#q'), t = null;
  qi.addEventListener('input', function () { clearTimeout(t); t = setTimeout(function () { render(qi.value); history.replaceState(null, '', '#cross=' + encodeURIComponent(qi.value.trim())); }, 120); });
  document.addEventListener('click', function (e) {
    var r = e.target.closest('[data-rh]');
    if (r && X) { e.preventDefault(); var en = X.exact(r.dataset.rh); if (en && en.cat === 'split' && window.SplitUI) { window.SplitUI.show(r.dataset.rh); return; } document.querySelector('#tabs button[data-tab="cross"]').click(); qi.value = r.dataset.rh; render(qi.value); window.scrollTo(0, 0); return; }
    var a = e.target.closest('[data-ex]'); if (a) { e.preventDefault(); document.querySelector('#tabs button[data-tab="cross"]').click(); qi.value = a.dataset.ex; render(qi.value); window.scrollTo(0, 0); } });
  var m = /cross=([^&]+)/.exec(INIT_HASH); if (m) { qi.value = decodeURIComponent(m[1]); render(qi.value); }

  /* ---------- browse ---------- */
  var FAMS = ['48FE', '50FE', '48GE', '50GE', '50FEQ', '50GEQ', '48FC', '50FC', '48GC', '50GC', '50FCQ', '50NR', '50NT', '50NL', '48NL', '48NG', '48NR',
    'TSK', 'THK', 'YSK', 'YHK', 'WSK', 'WHK', 'DSK', 'DHK', 'TZK', 'YZK', 'TSC', 'THC', 'YSC', 'YHC', 'WSC', 'WHC', 'DSC', 'DHC', 'TCD', 'TED', 'YCD', '5TCC4', '5YCC4', '5YCZ5'];
  var BROWSE = FAMS.map(function (f) { var d = E.decode(f); return { f: f, d: d, c: E.cross(d) }; }).filter(function (x) { return x.d.ok; });
  var allT = {}; BROWSE.forEach(function (x) { (x.c.familyTable || []).forEach(function (r) { allT[r.tons] = 1; }); });
  Object.keys(allT).map(Number).sort(function (a, b) { return a - b; }).forEach(function (t) { var o = document.createElement('option'); o.value = t; o.textContent = fT(t) + ' T'; $('#fTons').appendChild(o); });
  function renderBrowse() {
    var fb = $('#fBrand').value, ft = $('#fType').value, fn = $('#fTons').value, fc = $('#fCls').value, fq = ($('#fText') ? $('#fText').value : '').trim();
    var html = '<div class="tw"><table><tr><th>Competitor family</th><th>Type / tier</th><th>Refrigerant</th><th>Tons</th><th>Rheem series (base model, voltage “?”)</th><th>Flags</th><th>Literature</th></tr>';
    BROWSE.forEach(function (x) {
      var a = x.d.attrs; if (fb && x.d.brand !== fb) return; if (ft && a.type !== ft) return; if (fc && a.cls !== fc) return;
      (x.c.familyTable || []).forEach(function (r) {
        if (fn && String(r.tons) !== fn) return;
        if (fq && X && !X.test(fq, x.f) && !X.test(fq, r.model || '')) return;
        html += '<tr><td><a href="#" data-ex="' + esc(x.f) + '" class="mono">' + esc(x.d.brand + ' ' + x.f) + '</a></td><td>' + esc(a.type + ' / ' + a.tier + ' / ' + a.cls) + '</td><td>' + esc(x.d.refrigerant) + '</td><td>' + fT(r.tons) + '</td><td>' + (r.series ? '<b>' + esc(r.series) + '</b> <span class="mono small">' + esc(r.model) + '</span>' : '<span class="unv">no Rheem match</span>') + '</td><td class="small">' + esc(r.flags.filter(function (f) { return !/Voltage not supplied|Family-only/.test(f); }).join(' · ')) + '</td><td>' + x.d.sources.map(function (s) { return srcLink(s.id); }).join(', ') + '</td></tr>';
      });
    });
    $('#browse').innerHTML = html + '</table></div><p class="small">Click a family to open it in the cross tool; enter the full model there for tier/size/voltage-specific results. The text filter matches the competitor family or the Rheem base model (wildcards * and ? allowed); site-wide model matches are listed below.</p>' + (fq && X ? X.resultsHTML(fq, X.search(fq).filter(function (e) { return e.cat === 'packaged'; }), 'Packaged models matching') : '');
  }
  ['#fBrand', '#fType', '#fTons', '#fCls'].forEach(function (s) { $(s).onchange = renderBrowse; }); if ($('#fText')) $('#fText').addEventListener('input', function () { clearTimeout(t); t = setTimeout(renderBrowse, 150); }); renderBrowse();

  /* ---------- lineup ---------- */
  (function () {
    var html = '<p class="small">Current R-454B Rheem packaged equipment only. Ratings are as printed on each spec sheet’s General Data page (page cited). Dimensions are drawings — use the “Unit Dimensions” page in the spec sheet.</p>';
    ['commercial', 'residential'].forEach(function (cls) {
      html += '<h2>' + (cls === 'commercial' ? 'Commercial (Renaissance / Resolute)' : 'Residential (Endeavor / Select)') + '</h2>';
      D.rheem.filter(function (s) { return s.cls === cls; }).forEach(function (s) {
        var doc = D.sources[s.src];
        html += '<div class="card"><h3>' + esc(s.id) + ' — ' + esc(s.line) + ' <span class="pill">' + esc(s.type) + '</span><span class="pill ' + (s.tier === 'high' ? 'ok' : '') + '">' + esc(s.tier === 'high' ? 'Classic Plus / high' : 'Classic / standard') + '</span></h3>';
        html += '<div class="note">Voltages: ' + s.volts.map(function (v) { return v + ' = ' + E.VOLT_TEXT[v]; }).join(', ') + (s.voltNote ? ' <span class="small">(' + esc(s.voltNote) + ')</span>' : '') + '</div>';
        if (s.drives) html += '<div class="note">Drives: ' + Object.keys(s.drives).map(function (k) { return k + ' = ' + esc(s.drives[k]); }).join(', ') + '</div>';
        if (s.heat && s.heat.codes) html += '<div class="note">Heat: ' + esc(s.heat.kind) + ' — ' + Object.keys(s.heat.codes).map(function (k) { var v = s.heat.codes[k]; return k + ' = ' + (typeof v === 'number' ? v + 'k Btu/h' : v); }).join(', ') + (s.heat.cfg ? '; config ' + Object.keys(s.heat.cfg).map(function (k) { return k + ' = ' + s.heat.cfg[k]; }).join(', ') : '') + (s.heat.note ? ' <span class="small">(' + esc(s.heat.note) + ')</span>' : '') + '</div>';
        html += '<div class="note">Staging: ' + esc(s.staging) + '</div>';
        html += '<div class="tw"><table><tr><th>Tons</th><th>Cap. code</th><th>Ratings (as printed)</th></tr>';
        s.tons.forEach(function (r) { html += '<tr><td>' + fT(r.t) + (r.matchT ? ' T nominal <span class="pill">' + fT(r.matchT) + ' T class, ' + esc(r.capBtuh) + ' Btu/h</span><div class="small">' + esc(r.classNote) + '</div>' : '') + '</td><td class="mono">' + esc(r.cap) + '</td><td>' + ratingRows(r) + '</td></tr>'; });
        html += '</table></div>';
        if (s.wtRange) html += '<div class="note">Net weight range: ' + esc(s.wtRange) + ' lb</div>';
        if (s.ratingNote) html += '<div class="note"><span class="unv">' + esc(s.ratingNote) + '</span></div>';
        if (s.models) html += '<details><summary>Printed Available Models (' + s.models.length + ')</summary><div class="mono small">' + s.models.map(esc).join(' ') + '</div></details>';
        html += '<div class="small">Source: ' + srcLink(s.src) + ' — MNI ' + esc(s.mni) + ', general data ' + esc(s.gd) + (doc.dimsPages && doc.dimsPages.length ? ', unit dimensions p.' + doc.dimsPages.join('/') : '') + '</div>' + dl(s.src) + '</div>';
      });
    });
    $('#lineup').innerHTML = html;
  })();

  function ahriSection() {
    var A = D.ahri || {}, C = A.coverage || {}, L = A.links || {};
    function f(x) { return x ? x[0] + ' of ' + x[1] : '—'; }
    return '<p><b>AHRI certified reference numbers</b>: ' + esc(A.status || '') + ' Coverage — Rheem packaged models ' + f(C.packagedModels) + ' (series/sizes ' + f(C.packagedSeriesSizes) + '); residential split DTC matchups ' + f(C.splitResDTC) + '; commercial split matched systems ' + f(C.splitComm) + '. ' + (C.listings ? 'Refs loaded: ' + C.listings + ' (' + C.listingsExact + ' exact model match, ' + C.listingsBase + ' base-model match flagged “verify suffix”; Rheem ' + (C.listingsByBrand || {}).Rheem + ' / Ruud ' + (C.listingsByBrand || {}).Ruud + '); split DTC rows with a ref: ' + C.splitResDTCExact + ' exact + ' + C.splitResDTCBase + ' base-model; packaged models with a ref: ' + C.packagedExact + ' exact + ' + C.packagedBase + ' base-model; listings with an ENERGY STAR vs printed discrepancy: ' + C.discrepancies + '. ' : '') + (A.credit ? '<b>Credit:</b> AHRI reference numbers and listed ratings from <a href="' + esc(A.credit.url) + '" target="_blank" rel="noopener">' + esc(A.credit.name) + '</a> (dataset ' + esc(A.credit.dataset) + ', retrieved ' + esc(A.credit.retrieved) + '), used under the <a href="' + esc(A.credit.licenseUrl) + '" target="_blank" rel="noopener">' + esc(A.credit.license) + '</a>. ENERGY STAR / EPA do not endorse this site. ' : '') + 'Links: <a href="' + esc(L.home) + '" target="_blank" rel="noopener">AHRI Directory (home)</a> · <a href="' + esc(L.certificate) + '" target="_blank" rel="noopener">verify a printed AHRI certificate</a> · <a href="' + esc(L.terms) + '" target="_blank" rel="noopener">directory terms</a>.</p>';
  }
  /* ---------- sources ---------- */
  (function () {
    var html = '<div class="card"><h3>Method</h3>' +
      '<p>1. <b>Decode</b>: the competitor string is split by position using only the nomenclature tables printed in the competitor document (form and page cited per field). Unknown codes stop the decode — nothing is guessed. Residential Carrier and Trane strings must match a printed ordering/model number exactly.</p>' +
      '<p>2. <b>Match rules</b>: same unit type (AC / gas-electric / heat pump / dual fuel), residential vs commercial, same nominal tonnage, same voltage &amp; phase (never dropped — a Rheem series that lacks the voltage is excluded and listed), and same efficiency tier (Carrier FE/FC/FEQ/FCQ and Trane S = standard → Rheem Classic “B”; Carrier GE/GC/GEQ and Trane H = high → Rheem Classic Plus “C”; Carrier N-series 13.4 SEER2 → Endeavor Classic, 15.2+ SEER2 → Endeavor Classic Plus). Trane Z (eFlex ultra-high) crosses to the highest Rheem tier with a flag.</p>' +
      '<p>3. <b>Heat</b>: Carrier gas input (MBH) is read from the heat rating table for that size/phase/heat letter and matched to the nearest Rheem heat code (respecting printed size restrictions); a &gt;15% gap is flagged. Trane gas heat L/M/H has no MBH in the string — the Rheem heat digits are left as “**” with the choices listed. Electric heat kW (Trane) is matched to the nearest Rheem heater code in a note; the base model is shown without heat.</p>' +
      '<p>4. <b>Fallbacks</b> (always flagged): a standard-tier basis may get a Rheem high-tier upgrade at the same size; a high-efficiency (or ultra) basis gets <b>only</b> a same-size Rheem unit at the same or higher tier (the 27.5 T → 360 class rule counts as same size) — never a lower tier (Kevin\'s rule, 2026-10-15) and never a size alternate (2026-10-19); otherwise No Rheem match with the reason. For a standard basis only: nearest size within ±1 T (or ±2.5 T when nothing else exists). Staging differences (two-stage vs single-stage, variable-speed vs staged) are flagged.</p>' +
      '<p>5. <b>Rheem model string</b>: built from the printed Model Number Identification codes with options = none (AA0 / AA0A / CA0A). Residential Rheem answers are always a printed “Available Model”. ? = value you must supply; ** = heat size to choose.</p>' +
      '<p><b>Split systems</b> (Splits tab): outdoor units only. Residential Carrier strings must be a printed catalog ordering number; Trane strings are decoded digit by digit from the PSD nomenclature page and must use a printed family, size and voltage. Rheem match = same type (AC/HP), same size, same voltage, Rheem nominal SEER2 class ≥ the basis of design (never lower), preferring top discharge and the same staging; staging/discharge differences are flagged. Split SEER2/EER2/HSPF2 is an AHRI matchup property: Rheem shows printed DTC rows, Carrier shows the outdoor unit’s printed range, Trane prints none — all labelled “per AHRI matchup — verify”. Commercial splits (38AX, Odyssey TTA/TWA → RACY/RPCY) compare printed AHRI 340/360 EER/IEER with each brand’s matched air handler.</p>' +
      '<p><b>Search</b>: the cross and split boxes and both browse filters accept wildcards — <span class="mono">*</span> = any run of characters, <span class="mono">?</span> = exactly one character; case-insensitive; spaces and dashes ignored. A plain partial string lists every indexed model containing it (prefix matches first). The index holds printed model numbers plus model strings built from printed nomenclature (Rheem commercial base models, Trane split strings), each labelled with its basis. A single exact decodable model still opens the cross directly.</p>' +
      ahriSection() +
      '<p><b>Not covered yet:</b> Lennox, York, Daikin and others; Trane residential heat pumps/dual fuel; Trane Voyager 3 50 Hz models (60 Hz only); Voyager above 30 T (no Rheem packaged unit that large); Carrier 48/50FC 15+ T; Trane legacy THC/YHC/WHC ratings at 6+ T (shown as “not captured”).</p></div>';
    html += '<div class="tw"><table><tr><th>Brand</th><th>Document</th><th>Form</th><th>Rev / date</th><th>Refrig.</th><th>Pages used</th><th>Public URL</th><th>Drive copy</th></tr>';
    Object.keys(D.sources).forEach(function (k) {
      var s = D.sources[k];
      var pg = []; if (s.nomPages && s.nomPages.length) pg.push('nomenclature ' + s.nomPages.join(',')); if (s.ratingPages && s.ratingPages.length) pg.push('ratings ' + s.ratingPages.join('–')); if (s.dimsPages && s.dimsPages.length) pg.push('dims ' + s.dimsPages.join(','));
      html += '<tr><td>' + esc(s.brand) + '</td><td>' + esc(s.title) + (s.legacy ? ' <span class="unv">legacy</span>' : '') + '</td><td class="mono">' + esc(s.form) + '</td><td>' + esc(s.rev) + '</td><td>' + esc(s.refrigerant) + '</td><td class="small">' + esc(pg.join('; ')) + '</td><td class="small">' + (s.url ? '<a href="' + esc(s.url) + '" target="_blank" rel="noopener">' + esc(s.url.replace(/^https?:\/\//, '').slice(0, 60)) + '…</a>' : (s.brand === 'Rheem' ? 'Rheem literature (myRheem)' : '<span class="unv">not recorded — Drive copy only</span>')) + '</td><td><a href="' + esc(s.drive) + '" target="_blank" rel="noopener">Open / download</a></td></tr>';
    });
    $('#sources').innerHTML = html + '</table></div><p class="small">Page numbers are PDF page indexes. Last verified ' + esc(D.lastVerified) + '.</p>';
  })();
})();
