'use strict';
// Bible Cross References — static app. Data lives in ./data (see build/build.py).
const OPEN_IN = [ // Bible Gateway version codes; copyrighted text is never stored here
  ['NLT', 'NLT'], ['NASB', 'NASB 2020'], ['NASB1995', 'NASB 1995'], ['NIV', 'NIV'], ['ESV', 'ESV'], ['NKJV', 'NKJV'], ['CSB', 'CSB']];
const GENRES = ['Law', 'History', 'Poetry/Wisdom', 'Major Prophets', 'Minor Prophets', 'Gospels', 'Acts', 'Pauline Epistles', 'General Epistles', 'Revelation'];
const PAGE = 40;
const $ = s => document.querySelector(s);
const cache = new Map();
const getJSON = url => {
  if (!cache.has(url)) cache.set(url, fetch(url).then(r => { if (!r.ok) throw new Error(url + ' ' + r.status); return r.json(); }).catch(e => { cache.delete(url); throw e; }));
  return cache.get(url);
};
const store = {
  get: (k, d) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch {} }
};
let BOOKS, VERSIONS, TOPICS, offsets = [], totalVerses = 0;
const st = { b: 42, c: 3, v: 16, version: store.get('version', 'KJV'), openIn: store.get('openIn', 'NLT'), shown: PAGE, filtered: [] };

const testament = bi => bi < 39 ? 'OT' : 'NT';
const gclass = g => 'var(--' + g.replace(/[^A-Za-z]/g, '') + ')';
const refLabel = (b, c, v, ec, ev) => {
  let s = `${BOOKS[b].name} ${c}:${v}`;
  if (ec) s += ec === c ? `-${ev}` : `-${ec}:${ev}`;
  return s;
};
const bgUrl = (label) => `https://www.biblegateway.com/passage/?search=${encodeURIComponent(label).replace(/%20/g, '+').replace(/%3A/g, ':')}&version=${st.openIn}`;
const openInLink = label => `<a class="ext" href="${bgUrl(label)}" target="_blank" rel="noopener">${st.openIn} ↗</a>`;
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const chapterText = (b, c) => getJSON(`data/text/${st.version}/${BOOKS[b].id}/${c}.json`).catch(() => []);

// ---------- reference parsing ("John 3:16", "jn 3 16", "1 Cor 13", "Ps 23")
let aliasMap = {};
function buildAliases() {
  BOOKS.forEach((bk, i) => {
    const keys = [bk.name, bk.id, bk.usfm, ...bk.aliases];
    keys.forEach(k => { aliasMap[norm(k)] = i; });
  });
  aliasMap['psalm'] = 18; aliasMap['songofsolomon'] = 21; aliasMap['revelation'] = 65;
}
function norm(s) {
  return s.toLowerCase().replace(/^(iii|3rd|third)\s*/, '3').replace(/^(ii|2nd|second)\s*/, '2').replace(/^(i|1st|first)\s+/, '1').replace(/[^a-z0-9]/g, '');
}
function parseRef(q) {
  q = q.trim().replace(/\s+/g, ' ');
  const m = q.match(/^((?:[1-3]|i{1,3}|1st|2nd|3rd|first|second|third)?\s*[a-z][a-z .]*?)\.?\s*(\d+)?(?:\s*[:. ]\s*(\d+))?\s*$/i);
  if (!m) return null;
  let key = norm(m[1]);
  let bi = aliasMap[key];
  if (bi === undefined) { // prefix match on full names
    const hit = BOOKS.findIndex(b => norm(b.name).startsWith(key) && key.length >= 2);
    if (hit < 0) return null; bi = hit;
  }
  const c = Math.min(+m[2] || 1, BOOKS[bi].verses.length);
  const v = Math.min(+m[3] || 1, BOOKS[bi].verses[c - 1]);
  return { b: bi, c, v };
}

// ---------- navigation via hash (#/John/3/16) so the phone's back button works
function go(b, c, v) { location.hash = `#/${BOOKS[b].id}/${c}/${v}`; }
function fromHash() {
  const p = location.hash.replace(/^#\/?/, '').split('/');
  const bi = BOOKS.findIndex(b => b.id === p[0]);
  if (bi >= 0) {
    st.b = bi; st.c = Math.max(1, Math.min(+p[1] || 1, BOOKS[bi].verses.length));
    st.v = Math.max(1, Math.min(+p[2] || 1, BOOKS[bi].verses[st.c - 1]));
  }
  render();
}

function fillPickers() {
  const sb = $('#selBook'), sc = $('#selChap'), sv = $('#selVerse');
  if (!sb.options.length) sb.innerHTML = BOOKS.map((b, i) => `<option value="${i}">${b.name}</option>`).join('');
  sb.value = st.b;
  sc.innerHTML = BOOKS[st.b].verses.map((_, i) => `<option>${i + 1}</option>`).join(''); sc.value = st.c;
  sv.innerHTML = Array.from({ length: BOOKS[st.b].verses[st.c - 1] }, (_, i) => `<option>${i + 1}</option>`).join(''); sv.value = st.v;
}

async function verseText(b, c, v, ec, ev) {
  // returns text for a verse or range (range capped to keep the list readable)
  const endC = ec || c, endV = ec ? ev : v;
  let out = [], count = 0;
  for (let ch = c; ch <= endC && count < 12; ch++) {
    const arr = await chapterText(b, ch);
    const from = ch === c ? v : 1, to = ch === endC ? endV : arr.length;
    for (let i = from; i <= to && count < 12; i++, count++) if (arr[i - 1]) out.push((ec ? `<sup>${ec !== c ? ch + ':' : ''}${i}</sup>` : '') + esc(arr[i - 1]));
  }
  if (count >= 12) out.push('…');
  return out.join(' ') || '<span class="muted">(not in this version\'s numbering)</span>';
}

let renderToken = 0;
async function render() {
  const tok = ++renderToken;
  fillPickers();
  const bk = BOOKS[st.b], label = refLabel(st.b, st.c, st.v);
  document.title = label + ' — Cross References';
  $('#q').value = '';
  const [chap, xref, vtopics] = await Promise.all([
    chapterText(st.b, st.c), getJSON(`data/xref/${bk.id}.json`).catch(() => ({})),
    getJSON(`data/topics/verse/${bk.id}.json`).catch(() => ({}))]);
  if (tok !== renderToken) return;
  const tids = vtopics[`${st.c}:${st.v}`] || [];
  const all = xref[`${st.c}:${st.v}`] || [];
  st.all = all; st.bookXref = xref;
  $('#verseCard').innerHTML = `
    <h1>${label} <span class="muted small">${st.version}</span></h1>
    <div class="badges"><span class="badge" style="background:${gclass(bk.genre)}">${bk.genre}</span><span class="badge dir">${bk.testament === 'OT' ? 'Old Testament' : 'New Testament'}</span>${openInLink(label)}</div>
    <p class="vtext">${esc(chap[st.v - 1]) || '<span class="muted">(This verse is not in this version\'s numbering.)</span>'}</p>
    ${tids.length ? `<div class="badges"><span class="muted small">Topics:</span>${tids.slice(0, 24).map(t => `<button class="topic" data-t="${t}">${esc(TOPICS[t])}</button>`).join('')}</div>` : ''}
    <div class="navrow"><button id="prevV">◀ Previous verse</button><button id="nextV">Next verse ▶</button></div>`;
  $('#chapterText').innerHTML = chap.map((t, i) => t ? `<p data-v="${i + 1}" class="${i + 1 === st.v ? 'cur' : ''}"><sup>${i + 1}</sup>${esc(t)}</p>` : '').join('');
  st.shown = PAGE;
  applyFilters();
  drawArcs();
}

function filtered(list, fromB) {
  const min = +$('#fStrength').value, g = $('#fGenre').value;
  const dirs = new Set([...document.querySelectorAll('#fDir input:checked')].map(i => i.value));
  return list.filter(r => r[5] >= min && dirs.has(testament(fromB) + '>' + testament(r[0])) && (!g || BOOKS[r[0]].genre === g));
}

async function applyFilters() {
  const tok = renderToken;
  st.filtered = filtered(st.all, st.b);
  $('#xrefCount').textContent = `(${st.filtered.length.toLocaleString()} of ${st.all.length.toLocaleString()})`;
  const items = st.filtered.slice(0, st.shown);
  const texts = await Promise.all(items.map(r => verseText(r[0], r[1], r[2], r[3], r[4])));
  if (tok !== renderToken) return;
  $('#xrefList').innerHTML = items.map((r, i) => {
    const lab = refLabel(r[0], r[1], r[2], r[3], r[4]), g = BOOKS[r[0]].genre;
    return `<li data-go="${r[0]}.${r[1]}.${r[2]}">
      <div class="xhead"><button class="xref">${lab}</button>${openInLink(lab)}</div>
      <div class="xtext">${texts[i]}</div>
      <div class="badges"><span class="badge" style="background:${gclass(g)}">${g}</span><span class="badge dir">${testament(st.b)} → ${testament(r[0])}</span><span class="badge votes" title="OpenBible.info votes">${r[5]} vote${Math.abs(r[5]) === 1 ? '' : 's'}</span></div></li>`;
  }).join('') || '<li class="muted">No cross references match these filters.</li>';
  $('#moreBtn').hidden = st.filtered.length <= st.shown;
  $('#moreBtn').textContent = `Show more (${(st.filtered.length - st.shown).toLocaleString()} left)`;
}

// ---------- arc chart
function drawArcs() {
  const cv = $('#arc'), dpr = window.devicePixelRatio || 1;
  const W = cv.clientWidth, H = 220;
  cv.width = W * dpr; cv.height = H * dpr; cv.style.height = H + 'px';
  const ctx = cv.getContext('2d'); ctx.scale(dpr, dpr); ctx.clearRect(0, 0, W, H);
  const base = H - 16, x = (b, c, v) => 4 + (offsets[b][c - 1] + v - 1) / totalVerses * (W - 8);
  BOOKS.forEach((bk, i) => { // book bands
    const x0 = x(i, 1, 1), x1 = i < 65 ? x(i + 1, 1, 1) : W - 4;
    ctx.fillStyle = i === st.b ? '#d9a441' : (i % 2 ? '#6b5a48' : '#9c8a74'); ctx.fillRect(x0, base + 3, x1 - x0, 7);
  });
  ctx.fillStyle = '#fff'; ctx.fillRect(x(39, 1, 1) - 1, base + 1, 2, 12);
  const mode = document.querySelector('input[name=arcMode]:checked').value;
  const bk = BOOKS[st.b];
  $('#arcFrom').textContent = mode === 'chapter' ? `${bk.name} ${st.c}` : bk.name;
  const entries = Object.entries(st.bookXref || {}).filter(([k]) => mode === 'book' || k.startsWith(st.c + ':'));
  const draw = (x1, x2, color, lw) => {
    const mid = (x1 + x2) / 2, r = Math.abs(x2 - x1) / 2;
    ctx.beginPath(); ctx.strokeStyle = color; ctx.lineWidth = lw;
    ctx.ellipse(mid, base, r, Math.min(base - 4, r * 0.9), 0, Math.PI, 2 * Math.PI); ctx.stroke();
  };
  ctx.globalCompositeOperation = 'lighter';
  let n = 0; const sel = []; const alpha = mode === 'book' ? 0.08 : 0.3;
  for (const [k, list] of entries) {
    const [c, v] = k.split(':').map(Number), x1 = x(st.b, c, v);
    for (const r of filtered(list, st.b)) {
      const x2 = x(r[0], r[1], r[2]);
      if (c === st.c && v === st.v) { sel.push([x1, x2]); continue; }
      const d = Math.abs(x2 - x1) / W; draw(x1, x2, `hsla(${200 + d * 160},80%,60%,${alpha})`, 0.6); n++;
    }
  }
  ctx.globalCompositeOperation = 'source-over';
  sel.forEach(([a, b]) => draw(a, b, 'rgba(255,200,60,0.95)', 1.4));
  ctx.fillStyle = '#ccc'; ctx.font = '11px system-ui';
  ctx.fillText('Genesis', 4, H - 1); ctx.fillText('| NT', x(39, 1, 1) - 2, H - 1);
  const t = 'Revelation'; ctx.fillText(t, W - 4 - ctx.measureText(t).width, H - 1);
  ctx.fillText(`${(n + sel.length).toLocaleString()} arcs`, 6, 14);
}

// ---------- topics
async function showTopic(ti) {
  const name = TOPICS[ti], letter = name[0].toUpperCase();
  $('#topicTitle').textContent = name; $('#topicRefs').innerHTML = '<li>Loading…</li>'; $('#topicSheet').hidden = false;
  const lists = await getJSON(`data/topics/list/${letter}.json`).catch(() => ({}));
  const refs = lists[name] || [];
  $('#topicRefs').innerHTML = refs.map(r => `<li><a href="#/${BOOKS[r[0]].id}/${r[1]}/${r[2]}">${refLabel(r[0], r[1], r[2], r[3] ? r[1] : 0, r[3])}</a></li>`).join('') || '<li>No verse-level references.</li>';
}

// ---------- events
function wire() {
  $('#searchForm').addEventListener('submit', e => {
    e.preventDefault(); $('#q').blur();
    const r = parseRef($('#q').value);
    if (r) go(r.b, r.c, r.v); else { $('#q').value = ''; $('#q').placeholder = 'Not found — try "John 3:16"'; }
  });
  $('#selBook').onchange = e => go(+e.target.value, 1, 1);
  $('#selChap').onchange = e => go(st.b, +e.target.value, 1);
  $('#selVerse').onchange = e => go(st.b, st.c, +e.target.value);
  $('#selVersion').onchange = e => { st.version = e.target.value; store.set('version', st.version); render(); };
  $('#selOpenIn').onchange = e => { st.openIn = e.target.value; store.set('openIn', st.openIn); render(); };
  ['#fStrength', '#fGenre'].forEach(s => $(s).onchange = () => { store.set(s, $(s).value); st.shown = PAGE; applyFilters(); drawArcs(); });
  $('#fDir').onchange = () => { st.shown = PAGE; applyFilters(); drawArcs(); };
  document.querySelectorAll('input[name=arcMode]').forEach(r => r.onchange = drawArcs);
  $('#moreBtn').onclick = () => { st.shown += PAGE; applyFilters(); };
  $('#xrefList').onclick = e => {
    if (e.target.closest('a')) return;
    const li = e.target.closest('li[data-go]'); if (!li) return;
    const [b, c, v] = li.dataset.go.split('.').map(Number); go(b, c, v); window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  $('#chapterText').onclick = e => { const p = e.target.closest('p[data-v]'); if (p) go(st.b, st.c, +p.dataset.v); };
  $('#verseCard').onclick = e => {
    if (e.target.id === 'prevV' || e.target.id === 'nextV') {
      const d = e.target.id === 'nextV' ? 1 : -1; let { b, c, v } = st; v += d;
      if (v < 1) { if (c > 1) c--; else if (b > 0) { b--; c = BOOKS[b].verses.length; } else return; v = BOOKS[b].verses[c - 1]; }
      else if (v > BOOKS[b].verses[c - 1]) { v = 1; if (c < BOOKS[b].verses.length) c++; else if (b < 65) { b++; c = 1; } else return; }
      go(b, c, v);
    }
    const t = e.target.closest('.topic'); if (t) showTopic(+t.dataset.t);
  };
  $('#topicClose').onclick = () => $('#topicSheet').hidden = true;
  $('#topicSheet').onclick = e => { if (e.target.id === 'topicSheet' || e.target.closest('a')) $('#topicSheet').hidden = true; };
  window.addEventListener('hashchange', fromHash);
  let rt; window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(drawArcs, 200); });
}

(async function init() {
  try {
    [BOOKS, VERSIONS, TOPICS] = await Promise.all([getJSON('data/books.json'), getJSON('data/versions.json'), getJSON('data/topics/names.json')]);
  } catch (e) { document.body.insertAdjacentHTML('afterbegin', `<p class="err">Could not load data: ${esc(e.message)}</p>`); return; }
  BOOKS.forEach(b => { const o = []; b.verses.reduce((s, n, i) => (o[i] = totalVerses + s, s + n), 0); offsets.push(o); totalVerses += b.verses.reduce((a, n) => a + n, 0); });
  buildAliases();
  if (!VERSIONS.some(v => v.id === st.version)) st.version = VERSIONS[0].id;
  if (!OPEN_IN.some(v => v[0] === st.openIn)) st.openIn = 'NLT';
  $('#selVersion').innerHTML = VERSIONS.map(v => `<option value="${v.id}">${v.id} — ${esc(v.name)}</option>`).join(''); $('#selVersion').value = st.version;
  $('#selOpenIn').innerHTML = OPEN_IN.map(([k, n]) => `<option value="${k}">${n} (Bible Gateway)</option>`).join(''); $('#selOpenIn').value = st.openIn;
  $('#fGenre').innerHTML += GENRES.map(g => `<option>${g}</option>`).join('');
  ['#fStrength', '#fGenre'].forEach(s => { const v = store.get(s, null); if (v !== null) $(s).value = v; });
  $('#versionCredits').innerHTML = VERSIONS.map(v => `<li><b>${v.id}</b> — ${esc(v.name)}: ${esc(v.license)}. Source: <a href="${v.url}">${esc(v.source)}</a></li>`).join('');
  wire();
  if (!location.hash) history.replaceState(null, '', '#/John/3/16');
  fromHash();
})();
