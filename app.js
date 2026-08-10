/* Nordplay Games — dold intern katalog (Stake-stil: sidomeny + scrolliga rader).
   Data ligger AES-256-GCM-krypterad i data.enc (PBKDF2-SHA256 200k). */
(function () {
  'use strict';
  const $ = s => document.querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, m =>
    ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m]));

  let GAMES = [], filtered = [], cursor = 0, bandIx = 0, io = null;
  let view = { kind: 'hem' };   // {kind:'hem'} | {kind:'cat',key} | {kind:'prov',name}
  let q = '';

  /* ---------- krypto ---------- */
  async function unlock(pw) {
    const buf = await (await fetch('data.enc', { cache: 'no-cache' })).arrayBuffer();
    const b = new Uint8Array(buf);
    const salt = b.slice(0, 16), iv = b.slice(16, 28), ct = b.slice(28);
    const km = await crypto.subtle.importKey('raw', new TextEncoder().encode(pw), 'PBKDF2', false, ['deriveKey']);
    const key = await crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 200000, hash: 'SHA-256' },
      km, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
    const gz = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct);
    const json = await new Response(new Response(gz).body.pipeThrough(new DecompressionStream('gzip'))).text();
    return JSON.parse(json);
  }
  $('#lockForm').addEventListener('submit', async e => {
    e.preventDefault();
    const pw = $('#pw').value.trim(); if (!pw) return;
    $('#lockMsg').textContent = 'Dekrypterar…'; $('#lockMsg').style.color = '#999';
    try { GAMES = await unlock(pw); sessionStorage.setItem('npg', pw); boot(); }
    catch (_) { $('#lockMsg').style.color = '#f66'; $('#lockMsg').textContent = 'Fel lösenord.'; $('#pw').select(); }
  });
  (async () => {
    const pw = sessionStorage.getItem('npg'); if (!pw) return;
    try { GAMES = await unlock(pw); boot(); } catch (_) { sessionStorage.removeItem('npg'); }
  })();

  /* ---------- predikat ---------- */
  const today = new Date().toISOString().slice(0, 10);
  const isNew = g => g.rd && g.rd <= today && g.rd >= new Date(Date.now() - 45 * 864e5).toISOString().slice(0, 10);
  const isSoon = g => g.rd && g.rd > today;
  const hasBB = g => g.attrs && String(g.attrs.bonus_buy || '').match(/^(1|true|yes|ja)/i);
  const isLiveC = g => g.gt === 'live_casino';
  const isClassic = g => g.rd && g.rd < '2021-01-01' && !isLiveC(g);
  const richCopy = g => g.copy && (g.copy.long || (g.copy.features || []).length);
  const hasArt = g => !!(g.th && (g.th.sq || g.th.ls || g.th.pt));
  const wordCount = g => {
    const c = g.copy || {};
    let t = [c.tag, c.long || c.med || c.short].filter(Boolean).join(' ');
    (Array.isArray(c.features) ? c.features : []).forEach(f => { t += ' ' + (f.name || '') + ' ' + (f.description || f.text || f.desc || ''); });
    (Array.isArray(c.usp) ? c.usp : []).forEach(u => { t += ' ' + (typeof u === 'string' ? u : (u.text || '')); });
    return t.trim() ? t.trim().split(/\s+/).length : 0;
  };
  const artFirst = (a, b) => (hasArt(b) - hasArt(a)) || String(b.rd || '').localeCompare(String(a.rd || ''));

  const CATS = {
    nya:       ['✨ Nya släpp',   isNew, artFirst],
    kommande:  ['🔜 Kommande',    isSoon, (a, b) => String(a.rd).localeCompare(String(b.rd))],
    bonuskop:  ['💰 Bonusköp',    g => hasBB(g) && !isSoon(g), artFirst],
    jackpot:   ['🎰 Jackpott',    g => g.jp, artFirst],
    live:      ['🎥 Live Casino', isLiveC, artFirst],
    klassiker: ['🕹 Klassiker',   isClassic, artFirst],
    copy:      ['📝 Rik copy',    richCopy, artFirst],
    tunn:      ['⚠️ Tunn copy',   g => wordCount(g) < 60, (a, b) => wordCount(a) - wordCount(b)],
    alla:      ['🎮 Alla spel',   () => true, artFirst],
  };
  const MENU = [['hem', '🏠 Lobby'], ...Object.entries(CATS).map(([k, v]) => [k, v[0]])];

  /* ---------- kort ---------- */
  const SZL = { sq: '1200×1200', ls: '1200×750', pt: '1000×1350' };
  function pickImg(g, fmt) {
    const vs = Object.values(g.vers || {});
    const withFmt = vs.filter(v => v[fmt]);
    if (withFmt.length) return withFmt[Math.floor(Math.random() * withFmt.length)][fmt];
    for (const v of vs) { const any = v.sq || v.ls || v.pt; if (any) return any; }
    return g.th ? (g.th[fmt] || g.th.sq || g.th.ls || g.th.pt) : null;
  }
  function infoLine(g) {
    const a = g.attrs || {};
    const bits = [];
    if (a.rtp) bits.push('RTP ' + String(a.rtp).replace('%', '') + '%');
    if (a.max_win_x) bits.push(parseInt(String(a.max_win_x).replace(/[^0-9]/g, '') || '0').toLocaleString('sv-SE') + 'x');
    else if (a.volatility) bits.push(String(a.volatility));
    return bits.slice(0, 2).join(' · ');
  }
  function cardHTML(g, fmt) {
    fmt = fmt || 'sq';
    const src = pickImg(g, fmt);
    const img = src
      ? `<img loading="lazy" src="${esc(src)}" onerror="this.style.display='none';this.nextElementSibling.style.display='grid'">
         <div class="ph" style="display:none">${esc(g.t)}</div>`
      : `<div class="ph">${esc(g.t)}</div>`;
    const badges = [];
    if (isSoon(g)) badges.push('<span class="b soon">SNART</span>');
    else if (isNew(g)) badges.push('<span class="b">NY</span>');
    if (g.jp) badges.push('<span class="b">JACKPOT</span>');
    const info = infoLine(g);
    return `<a class="gcard" href="#/game/${encodeURIComponent(g.id)}">
      <div class="thumb ${fmt}">${img}<div class="badges">${badges.join('')}</div></div>
      <div class="meta"><b>${esc(g.t)}</b><div class="prov">${esc(g.p || '')}${info ? ' <span class="inf">· ' + esc(info) + '</span>' : ''}</div></div></a>`;
  }

  /* ---------- HEM: hero + scrolliga rader ---------- */
  function topProviders(n) {
    const c = {};
    GAMES.forEach(g => { if (g.p) c[g.p] = (c[g.p] || 0) + 1; });
    return Object.entries(c).sort((a, b) => b[1] - a[1]).slice(0, n);
  }
  function rowsConfig() {
    const provRows = topProviders(6).map(([p], i) =>
      ({ label: p, pred: g => g.p === p, fmt: ['sq', 'pt', 'ls'][i % 3], href: '#/p/' + encodeURIComponent(p) }));
    return [
      { label: '✨ Nya släpp',   pred: CATS.nya[1],       fmt: 'sq', href: '#/c/nya' },
      { label: '🔥 Populära',    pred: g => (g.br || []).length >= 4 && !isSoon(g), fmt: 'pt', href: '#/c/alla' },
      { label: '💰 Bonusköp',    pred: CATS.bonuskop[1],  fmt: 'sq', href: '#/c/bonuskop' },
      { label: '🎰 Jackpott',    pred: CATS.jackpot[1],   fmt: 'ls', href: '#/c/jackpot' },
      { label: '🎥 Live Casino', pred: CATS.live[1],      fmt: 'sq', href: '#/c/live' },
      { label: '🔜 Kommande',    pred: CATS.kommande[1],  fmt: 'ls', href: '#/c/kommande' },
      { label: '🕹 Klassiker',   pred: CATS.klassiker[1], fmt: 'pt', href: '#/c/klassiker' },
      ...provRows,
    ];
  }
  function rowHTML(r, ix) {
    let games = GAMES.filter(g => r.pred(g) && hasArt(g)).sort(artFirst).slice(0, 34);
    if (games.length < 6) games = GAMES.filter(r.pred).sort(artFirst).slice(0, 34);
    if (!games.length) return '';
    return `<section class="row">
      <div class="row-head">
        <h3>${r.label}</h3>
        <div class="row-tools">
          <a class="row-all" href="${r.href}">Visa alla</a>
          <button class="ra" data-dir="-1" data-row="${ix}">‹</button>
          <button class="ra" data-dir="1" data-row="${ix}">›</button>
        </div>
      </div>
      <div class="scroller" id="row${ix}">${games.map(g => cardHTML(g, r.fmt)).join('')}</div>
    </section>`;
  }
  function renderHome() {
    const rows = rowsConfig();
    $('#home').innerHTML = `
      <div class="hero">
        <picture>
          <source media="(max-width:700px)" srcset="assets/hero-sm.jpg">
          <img src="assets/hero.jpg" alt="">
        </picture>
        <div class="hero-ov">
          <h1>NORDPLAY <b>GAMES</b></h1>
          <p>${GAMES.length.toLocaleString('sv-SE')} spel · hela katalogen med copy, specs & thumbnails</p>
        </div>
      </div>
      ${rows.map((r, i) => rowHTML(r, i)).join('')}`;
    $('#home').querySelectorAll('.ra').forEach(b => b.addEventListener('click', () => {
      const sc = $('#row' + b.dataset.row);
      sc.scrollBy({ left: (parseInt(b.dataset.dir)) * sc.clientWidth * 0.85, behavior: 'smooth' });
    }));
  }

  /* ---------- GRID (kategori/provider/sök) ---------- */
  const BANDS = [['sq', 6], ['ls', 4], ['pt', 5], ['sq', 6], ['pt', 5], ['ls', 4]];
  function applyGrid(title, pred, sort) {
    const qq = q.toLowerCase();
    filtered = GAMES.filter(g => pred(g)
      && (!qq || (g.t + ' ' + (g.p || '') + ' ' + (g.theme || '') + ' ' + (g.themes || []).join(' ')).toLowerCase().includes(qq)));
    filtered.sort(sort || artFirst);
    cursor = 0; bandIx = 0;
    $('#grid').innerHTML = '';
    $('#gv-title').textContent = title;
    $('#gv-count').textContent = filtered.length + ' spel';
    $('#empty').hidden = filtered.length > 0;
    const tw = filtered.reduce((s, g) => s + wordCount(g), 0);
    $('#count').textContent = filtered.length + ' spel · ' + tw.toLocaleString('sv-SE') + ' ord copy';
    more();
  }
  function more() {
    if (view.kind === 'hem' || cursor >= filtered.length) return;
    let html = '';
    for (let n = 0; n < 5 && cursor < filtered.length; n++) {
      const [fmt, cnt] = BANDS[bandIx % BANDS.length]; bandIx++;
      const games = filtered.slice(cursor, cursor + cnt);
      cursor += games.length;
      html += `<div class="band ${fmt}">${games.map(g => cardHTML(g, fmt)).join('')}</div>`;
    }
    $('#grid').insertAdjacentHTML('beforeend', html);
  }

  /* ---------- meny & vyer ---------- */
  function renderMenu() {
    $('#menu').innerHTML = MENU.map(([k, label]) =>
      `<a class="mi${(view.kind === 'hem' && k === 'hem') || (view.kind === 'cat' && view.key === k) ? ' on' : ''}"
          href="${k === 'hem' ? '#/' : '#/c/' + k}">${label}</a>`).join('');
    $('#provmenu').innerHTML = topProviders(12).map(([p, n]) =>
      `<a class="mi sm${view.kind === 'prov' && view.name === p ? ' on' : ''}" href="#/p/${encodeURIComponent(p)}">${esc(p)} <i>${n}</i></a>`).join('');
    document.body.classList.remove('side-open');
  }
  function show(kind) {
    $('#home').hidden = kind !== 'hem';
    $('#gridview').hidden = kind === 'hem';
  }
  function applyView() {
    renderMenu();
    if (view.kind === 'hem') {
      show('hem');
      $('#count').textContent = GAMES.length.toLocaleString('sv-SE') + ' spel';
      if (!$('#home').innerHTML) renderHome();
    } else if (view.kind === 'cat') {
      show('grid');
      const c = CATS[view.key] || CATS.alla;
      applyGrid(c[0].replace(/^[^\s]+\s/, ''), c[1], c[2]);
    } else if (view.kind === 'prov') {
      show('grid');
      applyGrid(view.name, g => g.p === view.name);
    }
    window.scrollTo(0, 0);
  }

  /* ---------- detalj ---------- */
  const VOL = { 'very high': 'Mycket hög', high: 'Hög', 'medium-high': 'Medelhög', medium: 'Medel', 'low-medium': 'Låg till medel', low: 'Låg' };
  function specRows(g) {
    const a = g.attrs || {}; const rows = [];
    if (a.rtp) rows.push(['RTP', String(a.rtp).includes('%') ? a.rtp : a.rtp + ' %']);
    if (a.volatility) rows.push(['Volatilitet', VOL[String(a.volatility).toLowerCase()] || a.volatility]);
    if (a.max_win_x || a.max_win) rows.push(['Max vinst', (a.max_win_x ? a.max_win_x + 'x' : a.max_win)]);
    if (a.hit_rate || a.hit_frequency) rows.push(['Träfffrekvens', a.hit_rate || a.hit_frequency]);
    if (a.reels) rows.push(['Hjul', a.reels + (a.rows ? ' × ' + a.rows : '')]);
    if (a.paylines) rows.push(['Vinstlinjer', a.paylines]);
    if (a.ways) rows.push(['Vinstvägar', a.ways]);
    if (a.bonus_buy != null) rows.push(['Bonusköp', String(a.bonus_buy).match(/^(1|true|yes|ja)/i) ? 'Ja' + (a.bonus_buy_max_x ? ' (upp till ' + a.bonus_buy_max_x + 'x)' : '') : 'Nej']);
    if (a.min_bet || a.max_bet) rows.push(['Insats', [a.min_bet, a.max_bet].filter(Boolean).join(' – ') + ' €']);
    if (g.rd) rows.push(['Släppdatum', g.rd]);
    if (g.gt) rows.push(['Speltyp', g.gt.replace(/_/g, ' ')]);
    return rows;
  }
  const paras = t => String(t).split(/\n{2,}|\r\n\r\n/).map(p => p.trim()).filter(Boolean).map(p => `<p>${esc(p)}</p>`).join('');
  function featureCards(g) {
    const fc = (g.copy && g.copy.features) || [];
    return Array.isArray(fc) ? fc.map(f => {
      const name = f.name || f.title || f.feature || '', txt = f.description || f.text || f.desc || '';
      return (name || txt) ? `<div class="fcard"><h3>${esc(name)}</h3><p>${esc(txt)}</p></div>` : '';
    }).join('') : '';
  }
  let dver = null;
  function detailHTML(g) {
    const c = g.copy || {};
    const vkeys = Object.keys(g.vers || {});
    if (!dver || !vkeys.includes(dver)) dver = vkeys[vkeys.length - 1] || null;
    const vset = dver ? g.vers[dver] : (g.th || {});
    const hero = vset.ls || vset.sq || vset.pt;
    const wc = wordCount(g);
    const specs = specRows(g);
    const featC = featureCards(g);
    const featT = (g.feat || []).length ? `<div class="ftags">${g.feat.map(f => `<span>${esc(f)}</span>`).join('')}</div>` : '';
    const themes = [...new Set([g.theme, ...(g.themes || [])].filter(Boolean))];
    const usp = Array.isArray(c.usp) && c.usp.length ? `<ul class="usp">${c.usp.map(u => `<li>${esc(typeof u === 'string' ? u : (u.text || ''))}</li>`).join('')}</ul>` : '';
    const longTxt = [c.long, c.med !== c.long ? c.med : null, !c.long ? c.short : null].filter(Boolean)[0];
    return `<div class="dwrap">
      <div class="dbar"><button class="back" onclick="history.back()">← Tillbaka</button>
        <span class="bc">${esc(g.p || '')} / ${esc(g.t)}</span></div>
      <div class="dhero">
        <div class="art">${hero ? `<img src="${esc(hero)}" onerror="this.outerHTML='<div class=noart>${esc(g.t)}</div>'">` : `<div class="noart">${esc(g.t)}</div>`}
          ${vkeys.length > 1 ? `<div class="vtoggle">${vkeys.map(k => `<button class="vbtn${k === dver ? ' on' : ''}" data-v="${esc(k)}">${esc(k)}</button>`).join('')}</div>` : ''}</div>
        <div class="dtitle">
          <h1>${esc(g.t)}</h1>
          <div class="dprov">${esc(g.p || 'Okänd provider')}${g.rd ? ' · ' + esc(g.rd) : ''}</div>
          ${c.tag ? `<div class="dtag">”${esc(c.tag)}”</div>` : ''}
          <div class="dbadges">
            ${g.jp ? '<span class="b">JACKPOT</span>' : ''}
            ${hasBB(g) ? '<span class="b">BONUSKÖP</span>' : ''}
            ${isLiveC(g) ? '<span class="b">LIVE CASINO</span>' : ''}
            ${(g.br || []).map(b => `<span class="b ol">${esc(b)}</span>`).join('')}
            <span class="b wc${wc < 60 ? ' thin' : ''}">${wc} ORD COPY</span>
          </div>
        </div>
      </div>
      ${longTxt ? `<section class="dsec"><h2>Om spelet</h2><div class="prose">${paras(longTxt)}</div></section>` : ''}
      ${usp ? `<section class="dsec"><h2>Höjdpunkter</h2>${usp}</section>` : ''}
      ${featC ? `<section class="dsec"><h2>Funktioner</h2><div class="fgrid">${featC}</div></section>` : ''}
      ${!featC && featT ? `<section class="dsec"><h2>Funktioner</h2>${featT}</section>` : ''}
      ${specs.length ? `<section class="dsec"><h2>Specifikationer</h2><table class="specs">${specs.map(([k, v]) => `<tr><td>${esc(k)}</td><td>${esc(String(v))}</td></tr>`).join('')}</table></section>` : ''}
      ${themes.length ? `<section class="dsec"><h2>Teman</h2><div class="ftags">${themes.map(t => `<span>${esc(t)}</span>`).join('')}</div></section>` : ''}
      ${g.desc ? `<section class="dsec"><h2>Vår ad-copy</h2><div class="adcopy"><span class="lbl">Games.description</span>${esc(g.desc)}</div></section>` : ''}
      ${vkeys.length ? vkeys.map(vk => `<section class="dsec"><h2>Thumbnails · ${esc(vk)}</h2><div class="variants">
        ${['sq', 'ls', 'pt'].filter(k => g.vers[vk][k]).map(k => `<figure><img loading="lazy" src="${esc(g.vers[vk][k])}"><figcaption>${SZL[k]}</figcaption></figure>`).join('')}
      </div></section>`).join('') : ''}
      <div class="dmeta">slug: ${esc(g.id)}${c.src ? ' · copy-källa: ' + esc(c.src) : ''}</div>
    </div>`;
  }

  /* ---------- routing ---------- */
  function route() {
    const h = location.hash;
    const d = $('#detail');
    const gm = h.match(/^#\/game\/(.+)$/);
    if (gm && GAMES.length) {
      const g = GAMES.find(x => x.id === decodeURIComponent(gm[1]));
      if (g) {
        d.innerHTML = detailHTML(g); d.hidden = false; d.scrollTop = 0; document.body.style.overflow = 'hidden';
        d.querySelectorAll('.vbtn').forEach(b => b.addEventListener('click', () => { dver = b.dataset.v; route(); }));
        return;
      }
    }
    d.hidden = true; d.innerHTML = ''; document.body.style.overflow = '';
    const cm = h.match(/^#\/c\/([a-z]+)/);
    const pm = h.match(/^#\/p\/(.+)$/);
    if (cm) view = { kind: 'cat', key: cm[1] };
    else if (pm) view = { kind: 'prov', name: decodeURIComponent(pm[1]) };
    else view = { kind: 'hem' };
    if (GAMES.length) applyView();
  }
  addEventListener('hashchange', route);

  function boot() {
    $('#lock').remove();
    $('#app').hidden = false;
    $('#fcount').textContent = GAMES.length;
    $('#q').addEventListener('input', e => {
      q = e.target.value;
      if (q && view.kind === 'hem') { location.hash = '#/c/alla'; return; }
      if (view.kind !== 'hem') applyView();
    });
    $('#burger').addEventListener('click', () => document.body.classList.toggle('side-open'));
    $('#scrim').addEventListener('click', () => document.body.classList.remove('side-open'));
    io = new IntersectionObserver(es => es[0].isIntersecting && more());
    io.observe($('#sentinel'));
    route();
  }
})();
