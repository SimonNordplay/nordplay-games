/* Nordplay Games — dold intern katalog.
   Data ligger AES-256-GCM-krypterad i data.enc (PBKDF2-SHA256 200k).
   Utan rätt lösenord finns ingen läsbar data i repot. */
(function () {
  'use strict';
  const $ = s => document.querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, m =>
    ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m]));

  let GAMES = [];
  let filtered = [];
  let chip = 'alla';
  let prov = '';
  let q = '';
  let cursor = 0;
  const CHUNK = 60;
  let io = null;

  /* ---------- krypto ---------- */
  async function unlock(pw) {
    const buf = await (await fetch('data.enc', { cache: 'force-cache' })).arrayBuffer();
    const b = new Uint8Array(buf);
    const salt = b.slice(0, 16), iv = b.slice(16, 28), ct = b.slice(28);
    const km = await crypto.subtle.importKey('raw', new TextEncoder().encode(pw), 'PBKDF2', false, ['deriveKey']);
    const key = await crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt, iterations: 200000, hash: 'SHA-256' },
      km, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
    const gz = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct); // kastar vid fel pw
    const ds = new DecompressionStream('gzip');
    const json = await new Response(new Response(gz).body.pipeThrough(ds)).text();
    return JSON.parse(json);
  }

  $('#lockForm').addEventListener('submit', async e => {
    e.preventDefault();
    const pw = $('#pw').value.trim();
    if (!pw) return;
    $('#lockMsg').textContent = 'Dekrypterar…';
    $('#lockMsg').style.color = '#999';
    try {
      GAMES = await unlock(pw);
      sessionStorage.setItem('npg', pw);
      boot();
    } catch (_) {
      $('#lockMsg').style.color = '#f66';
      $('#lockMsg').textContent = 'Fel lösenord.';
      $('#pw').select();
    }
  });

  (async function autoUnlock() {
    const pw = sessionStorage.getItem('npg');
    if (!pw) return;
    try { GAMES = await unlock(pw); boot(); } catch (_) { sessionStorage.removeItem('npg'); }
  })();

  /* ---------- lobby ---------- */
  const today = new Date().toISOString().slice(0, 10);
  const isNew = g => g.rd && g.rd <= today && g.rd >= new Date(Date.now() - 45 * 864e5).toISOString().slice(0, 10);
  const isSoon = g => g.rd && g.rd > today;
  const hasBB = g => g.attrs && String(g.attrs.bonus_buy || '').match(/^(1|true|yes|ja)/i);
  const richCopy = g => g.copy && (g.copy.long || (g.copy.features || []).length);
  const wordCount = g => {
    const c = g.copy || {};
    let t = [c.tag, c.long || c.med || c.short].filter(Boolean).join(' ');
    (Array.isArray(c.features) ? c.features : []).forEach(f => { t += ' ' + (f.name || '') + ' ' + (f.description || f.text || f.desc || ''); });
    (Array.isArray(c.usp) ? c.usp : []).forEach(u => { t += ' ' + (typeof u === 'string' ? u : (u.text || '')); });
    return t.trim() ? t.trim().split(/\s+/).length : 0;
  };

  const CHIPS = [
    ['alla',     'Alla spel',    () => true],
    ['nyheter',  '✨ Nyheter',   isNew],
    ['kommande', '🔜 Kommande',  isSoon],
    ['bonuskop', '💰 Bonusköp',  hasBB],
    ['jackpot',  '🎰 Jackpott',  g => g.jp],
    ['live',     '🎥 Live',      g => g.gt === 'live_casino' || g.live],
    ['copy',     '📝 Rik copy',  richCopy],
    ['bild',     '🖼 Med bild',  g => g.th && g.th.sq],
    ['tunn',     '⚠️ Tunn copy', g => wordCount(g) < 60],
  ];

  function renderChips() {
    const provs = [...new Set(GAMES.map(g => g.p).filter(Boolean))].sort();
    $('#chips').innerHTML = CHIPS.map(([k, label]) =>
      `<button class="chip${k === chip ? ' on' : ''}" data-chip="${k}">${label}</button>`).join('') +
      `<label class="chip${prov ? ' on' : ''}"><select id="provSel">
        <option value="">Provider: alla</option>
        ${provs.map(p => `<option${p === prov ? ' selected' : ''}>${esc(p)}</option>`).join('')}
      </select></label>`;
    $('#chips').querySelectorAll('[data-chip]').forEach(b =>
      b.addEventListener('click', () => { chip = b.dataset.chip; applyFilter(); }));
    $('#provSel').addEventListener('change', e => { prov = e.target.value; applyFilter(); });
  }

  function applyFilter() {
    const pred = CHIPS.find(c => c[0] === chip)[2];
    const qq = q.toLowerCase();
    filtered = GAMES.filter(g => pred(g)
      && (!prov || g.p === prov)
      && (!qq || (g.t + ' ' + (g.p || '') + ' ' + (g.theme || '') + ' ' + (g.themes || []).join(' ')).toLowerCase().includes(qq)));
    const art = g => !!(g.th && g.th.sq);
    if (chip === 'kommande') filtered.sort((a, b) => String(a.rd).localeCompare(String(b.rd)));
    else if (chip === 'tunn') filtered.sort((a, b) => wordCount(a) - wordCount(b));
    else filtered.sort((a, b) => (art(b) - art(a)) || String(b.rd || '').localeCompare(String(a.rd || '')));
    cursor = 0;
    $('#grid').innerHTML = '';
    $('#empty').hidden = filtered.length > 0;
    const tw = filtered.reduce((s, g) => s + wordCount(g), 0);
    $('#count').textContent = filtered.length + ' spel · ' + tw.toLocaleString('sv-SE') + ' ord copy';
    renderChips();
    more();
  }

  function cardHTML(g) {
    const img = g.th && g.th.sq
      ? `<img loading="lazy" src="${esc(g.th.sq)}" onerror="this.style.display='none';this.nextElementSibling.style.display='grid'">
         <div class="ph" style="display:none">${esc(g.t)}</div>`
      : `<div class="ph">${esc(g.t)}</div>`;
    const badges = [];
    if (isSoon(g)) badges.push('<span class="b soon">SNART</span>');
    else if (isNew(g)) badges.push('<span class="b">NY</span>');
    if (g.jp) badges.push('<span class="b">JACKPOT</span>');
    return `<a class="gcard" href="#/game/${encodeURIComponent(g.id)}" style="text-decoration:none;color:inherit">
      <div class="thumb">${img}<div class="badges">${badges.join('')}</div></div>
      <div class="meta"><b>${esc(g.t)}</b><div class="prov">${esc(g.p || '')}</div></div></a>`;
  }

  function more() {
    if (cursor >= filtered.length) return;
    const frag = filtered.slice(cursor, cursor + CHUNK).map(cardHTML).join('');
    $('#grid').insertAdjacentHTML('beforeend', frag);
    cursor += CHUNK;
  }

  function boot() {
    $('#lock').remove();
    $('#app').hidden = false;
    $('#fcount').textContent = GAMES.length;
    $('#q').addEventListener('input', e => { q = e.target.value; applyFilter(); });
    io = new IntersectionObserver(es => es[0].isIntersecting && more());
    io.observe($('#sentinel'));
    applyFilter();
    route();
  }

  /* ---------- detalj ---------- */
  const VOL = { 'very high': 'Mycket hög', high: 'Hög', 'medium-high': 'Medelhög', medium: 'Medel', 'low-medium': 'Låg till medel', low: 'Låg' };
  const fmt = v => esc(String(v));

  function specRows(g) {
    const a = g.attrs || {};
    const rows = [];
    if (a.rtp) rows.push(['RTP', a.rtp.toString().includes('%') ? a.rtp : a.rtp + ' %']);
    if (a.volatility) rows.push(['Volatilitet', VOL[String(a.volatility).toLowerCase()] || a.volatility]);
    if (a.max_win_x || a.max_win) rows.push(['Max vinst', (a.max_win_x || a.max_win) + 'x']);
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

  function paras(txt) {
    return String(txt).split(/\n{2,}|\r\n\r\n/).map(p => p.trim()).filter(Boolean)
      .map(p => `<p>${esc(p)}</p>`).join('') || '';
  }

  function featureCards(g) {
    const fc = (g.copy && g.copy.features) || [];
    if (Array.isArray(fc) && fc.length) {
      return fc.map(f => {
        const name = f.name || f.title || f.feature || '';
        const txt = f.description || f.text || f.desc || '';
        if (!name && !txt) return '';
        return `<div class="fcard"><h3>${esc(name)}</h3><p>${esc(txt)}</p></div>`;
      }).join('');
    }
    return '';
  }

  let dver = null; // aktiv thumbnail-version i detaljvyn
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
        <div class="art">${hero ? `<img id="dheroimg" src="${esc(hero)}" onerror="this.outerHTML='<div class=noart>${esc(g.t)}</div>'">` : `<div class="noart">${esc(g.t)}</div>`}
          ${vkeys.length > 1 ? `<div class="vtoggle">${vkeys.map(k => `<button class="vbtn${k === dver ? ' on' : ''}" data-v="${esc(k)}">${esc(k)}</button>`).join('')}</div>` : ''}</div>
        <div class="dtitle">
          <h1>${esc(g.t)}</h1>
          <div class="dprov">${esc(g.p || 'Okänd provider')}${g.rd ? ' · ' + esc(g.rd) : ''}</div>
          ${c.tag ? `<div class="dtag">”${esc(c.tag)}”</div>` : ''}
          <div class="dbadges">
            ${g.jp ? '<span class="b">JACKPOT</span>' : ''}
            ${hasBB(g) ? '<span class="b">BONUSKÖP</span>' : ''}
            ${(g.gt === 'live_casino') ? '<span class="b">LIVE CASINO</span>' : ''}
            ${(g.br || []).map(b => `<span class="b ol">${esc(b)}</span>`).join('')}
            <span class="b wc${wc < 60 ? ' thin' : ''}">${wc} ORD COPY</span>
          </div>
        </div>
      </div>

      ${longTxt ? `<section class="dsec"><h2>Om spelet</h2><div class="prose">${paras(longTxt)}</div></section>` : ''}
      ${usp ? `<section class="dsec"><h2>Höjdpunkter</h2>${usp}</section>` : ''}
      ${featC ? `<section class="dsec"><h2>Funktioner</h2><div class="fgrid">${featC}</div></section>` : ''}
      ${!featC && featT ? `<section class="dsec"><h2>Funktioner</h2>${featT}</section>` : ''}
      ${specs.length ? `<section class="dsec"><h2>Specifikationer</h2><table class="specs">${specs.map(([k, v]) => `<tr><td>${esc(k)}</td><td>${fmt(v)}</td></tr>`).join('')}</table></section>` : ''}
      ${themes.length ? `<section class="dsec"><h2>Teman</h2><div class="ftags">${themes.map(t => `<span>${esc(t)}</span>`).join('')}</div></section>` : ''}
      ${g.desc ? `<section class="dsec"><h2>Vår ad-copy</h2><div class="adcopy"><span class="lbl">Games.description</span>${esc(g.desc)}</div></section>` : ''}
      ${vkeys.length ? `<section class="dsec"><h2>Thumbnails · ${esc(dver || '')}</h2><div class="variants" id="dvariants">
        ${['sq', 'ls', 'pt'].filter(k => vset[k]).map(k => `<figure><img loading="lazy" src="${esc(vset[k])}"><figcaption>${{ sq: '1200×1200', ls: '1200×750', pt: '1000×1350' }[k]}</figcaption></figure>`).join('')}
      </div></section>` : ''}
      <div class="dmeta">slug: ${esc(g.id)}${c.src ? ' · copy-källa: ' + esc(c.src) : ''}</div>
    </div>`;
  }

  function route() {
    const m = location.hash.match(/^#\/game\/(.+)$/);
    const d = $('#detail');
    if (m && GAMES.length) {
      const g = GAMES.find(x => x.id === decodeURIComponent(m[1]));
      if (g) {
        d.innerHTML = detailHTML(g); d.hidden = false; d.scrollTop = 0; document.body.style.overflow = 'hidden';
        d.querySelectorAll('.vbtn').forEach(b => b.addEventListener('click', () => {
          dver = b.dataset.v; const st = d.scrollTop; d.innerHTML = detailHTML(g); d.scrollTop = st;
          d.querySelectorAll('.vbtn').forEach(x => x.addEventListener('click', ev => { dver = ev.target.dataset.v; route(); }));
        }));
        return;
      }
    }
    d.hidden = true; d.innerHTML = ''; document.body.style.overflow = '';
  }
  addEventListener('hashchange', route);
})();
