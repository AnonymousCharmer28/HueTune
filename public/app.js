const $ = id => document.getElementById(id);
const FILTERS = {
  Original: 'none',
  Vintage: 'sepia(.4) contrast(1.1) saturate(1.3) brightness(1.05)',
  Faded: 'contrast(.85) brightness(1.1) saturate(.8) sepia(.2)',
  Cool: 'hue-rotate(-12deg) saturate(.9) contrast(1.1) brightness(1.05)',
  'B&W': 'grayscale(1) contrast(1.2)'
};
// moods and colours turn into Spotify genres (searching by genre gives a varied pool of covers)
const MOODS = {
  Dreamy: ['dream pop', 'shoegaze', 'bedroom pop'], Chill: ['lo-fi', 'chillwave', 'bedroom pop'],
  Happy: ['pop', 'dance pop', 'funk'], Nostalgic: ['synthpop', 'soft rock', 'oldies'],
  Romantic: ['r&b', 'soul', 'singer-songwriter'], Moody: ['dark pop', 'trip hop', 'dark r&b']
};
const HUE_G = [['indie pop', 'soft rock'], ['folk', 'acoustic'], ['indie folk', 'acoustic'], ['chillwave', 'lo-fi'], ['synthwave', 'dream pop'], ['synthpop', 'bedroom pop']]; // one per 60° of hue
const BAD = /slowed|reverb|sped up|speed up|nightcore|8d audio|karaoke|instrumental/i;
const cam = $('cam'), out = $('out'), ctx = out.getContext('2d');
let src = null, hero = null, cur = 'Vintage', song = null, mood = null, layout = 'stack', pool = [], demo = false, drag = null, moved = false;
const pos = { song: [.5, .7], lyric: [.5, .92] }, boxes = {}; // positions are fractions of the photo
let raw = null, ratio = 0, fr = 'None', pick = null; // original photo, crop ratio (0 = keep), frame, picked point
let rot = 0, exporting = false; // rotation of the song group (radians); exporting hides the handle

const hint = t => { $('hint').textContent = t; };
const mark = (box, b) => [...$(box).children].forEach(c => c.classList.toggle('on', c === b));
const chip = (box, label, fn) => { const b = document.createElement('button'); b.textContent = label; b.onclick = () => fn(b); $(box).append(b); return b; };

// ---------- colour helpers ----------
function dominant(el) { // hero colour = biggest colourful bucket, favouring vivid pixels near the centre
  const c = document.createElement('canvas'); c.width = c.height = 50;
  const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(el, 0, 0, 50, 50);
  const d = x.getImageData(0, 0, 50, 50).data, b = {}, all = [0, 0, 0];
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i], g = d[i + 1], bl = d[i + 2], mx = Math.max(r, g, bl), mn = Math.min(r, g, bl), l = (mx + mn) / 2;
    all[0] += r; all[1] += g; all[2] += bl;
    if (mx - mn < 15 || l < 25 || l > 240) continue; // skip greys, near-black, near-white
    const px = (i / 4) % 50 - 24.5, py = Math.floor(i / 200) - 24.5;
    const wt = (1 + (mx - mn) / 128) * (1.6 - Math.hypot(px, py) / 35);
    const o = b[(r >> 4) + ',' + (g >> 4) + ',' + (bl >> 4)] ||= { n: 0, c: 0, r: 0, g: 0, b: 0 };
    o.n += wt; o.c++; o.r += r; o.g += g; o.b += bl;
  }
  const t = Object.values(b).sort((a, z) => z.n - a.n)[0];
  return t ? [t.r / t.c, t.g / t.c, t.b / t.c].map(Math.round) : all.map(v => Math.round(v / 2500)); // no colour at all: true average (black/grey/white)
}
function lab(rgb) {
  let [r, g, b] = rgb.map(v => { v /= 255; return v > .04045 ? ((v + .055) / 1.055) ** 2.4 : v / 12.92; });
  let [x, y, z] = [(r * .4124 + g * .3576 + b * .1805) / .95047, r * .2126 + g * .7152 + b * .0722, (r * .0193 + g * .1192 + b * .9505) / 1.08883]
    .map(v => v > .008856 ? Math.cbrt(v) : 7.787 * v + 16 / 116);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}
const dE = (a, b) => { const p = lab(a), q = lab(b); return Math.hypot((p[0] - q[0]) * .5, p[1] - q[1], p[2] - q[2]); }; // lightness counts half: vibe = hue + richness
function hue([r, g, b]) {
  const mx = Math.max(r, g, b), d = mx - Math.min(r, g, b); if (!d) return 0;
  const h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
}
const hx = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const load = u => new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = u; });

// ---------- camera + photo ----------
(navigator.mediaDevices?.getUserMedia({ video: { facingMode: 'user' } }) || Promise.reject())
  .then(s => { cam.srcObject = s; cam.style.filter = FILTERS[cur]; })
  .catch(() => hint('Camera unavailable. Use "Upload a photo" instead.'));

function crop() { // centre-crop the original photo to the chosen ratio (0 = keep as is)
  if (!raw) return;
  let w = raw.width, h = raw.height;
  if (ratio) { if (w / h > ratio) w = Math.round(h * ratio); else h = Math.round(w / ratio); }
  src = document.createElement('canvas'); src.width = out.width = w; src.height = out.height = h;
  src.getContext('2d', { willReadFrequently: true }).drawImage(raw, (raw.width - w) / 2, (raw.height - h) / 2, w, h, 0, 0, w, h);
}
function setSrc(el, w, h) {
  const k = Math.min(1, 1600 / Math.max(w, h));
  raw = document.createElement('canvas'); raw.width = Math.round(w * k); raw.height = Math.round(h * k);
  raw.getContext('2d').drawImage(el, 0, 0, raw.width, raw.height);
  crop(); hero = dominant(src); pick = null;
  cam.hidden = true; out.hidden = false; $('retake').hidden = false;
  showHero(); render(); if (pool.length) rank(); // new photo: re-rank the songs we already loaded
}
const showHero = () => { $('hint').innerHTML = `<span class="dot" style="background:rgb(${hero})"></span> Matching this colour. Tap your outfit, or anywhere on the photo, to pick a different one.`; };
$('snap').onclick = () => cam.videoWidth ? setSrc(cam, cam.videoWidth, cam.videoHeight) : hint('Camera not ready. Try "Upload a photo".');
$('file').onchange = e => {
  const f = e.target.files[0]; if (!f) return;
  const im = new Image(); im.onload = () => setSrc(im, im.naturalWidth, im.naturalHeight); im.src = URL.createObjectURL(f);
};
$('retake').onclick = () => { src = raw = hero = pick = null; out.hidden = true; cam.hidden = false; $('retake').hidden = true; hint(''); };

// ---------- pointer: drag the song/lyric, tap to pick a colour ----------
const at = e => { const r = out.getBoundingClientRect(); return [(e.clientX - r.left) * out.width / r.width, (e.clientY - r.top) * out.height / r.height]; };
const local = (b, [x, y]) => { // pointer position relative to a box's centre, undoing its rotation
  const c = Math.cos(-(b.rot || 0)), s = Math.sin(-(b.rot || 0)), dx = x - b.cx, dy = y - b.cy;
  return [dx * c - dy * s, dx * s + dy * c];
};
const hit = (b, p) => { if (!b) return false; const [x, y] = local(b, p); return Math.abs(x) <= b.w / 2 && Math.abs(y) <= b.h / 2; };
const onHandle = p => { const b = boxes.song; if (!b) return false; const [x, y] = local(b, p); return Math.hypot(x - b.w / 2, y - b.h / 2) < Math.min(out.width, out.height) * .045; };
const grab = p => onHandle(p) ? 'handle' : ['lyric', 'song'].find(k => hit(boxes[k], p));
out.addEventListener('pointerdown', e => {
  moved = false; if (!src) return;
  const p = at(e), k = grab(p); if (!k) return;
  const b = boxes[k === 'handle' ? 'song' : k];
  drag = { k, dx: p[0] - b.cx, dy: p[1] - b.cy, sx: e.clientX, sy: e.clientY };
  out.setPointerCapture(e.pointerId);
});
out.addEventListener('pointermove', e => {
  if (!src) return;
  const p = at(e);
  if (!drag) { const k = grab(p); out.style.cursor = k === 'handle' ? 'nwse-resize' : k ? 'move' : 'crosshair'; return; }
  if (Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) > 4) moved = true;
  if (!moved) return;
  if (drag.k === 'handle') { // drag the corner dot: distance from the centre = size, angle = rotation
    const b = boxes.song, vx = p[0] - b.cx, vy = p[1] - b.cy;
    const k = Math.min(2.5, Math.max(.3, $('size').value / 100 * Math.hypot(vx, vy) / Math.hypot(b.w / 2, b.h / 2)));
    rot = Math.atan2(vy, vx) - Math.atan2(b.h / 2, b.w / 2);
    if (Math.abs(rot) < .07) rot = 0; // snaps upright
    $('size').value = Math.round(k * 100);
  } else pos[drag.k] = [Math.min(1, Math.max(0, (p[0] - drag.dx) / out.width)), Math.min(1, Math.max(0, (p[1] - drag.dy) / out.height))];
  render();
});
out.addEventListener('pointerup', () => { drag = null; });
out.onclick = e => { // eyedropper: average a 7x7 patch of the original photo
  if (!src) return; if (moved) { moved = false; return; }
  const [x, y] = at(e), px = Math.min(out.width - 4, Math.max(3, Math.floor(x))), py = Math.min(out.height - 4, Math.max(3, Math.floor(y)));
  const d = src.getContext('2d').getImageData(px - 3, py - 3, 7, 7).data, s = [0, 0, 0];
  for (let i = 0; i < d.length; i += 4) { s[0] += d[i]; s[1] += d[i + 1]; s[2] += d[i + 2]; }
  hero = s.map(v => Math.round(v / 49)); pick = [x, y]; showHero(); render(); if (pool.length) rank();
};

// ---------- drawing ----------
const noise = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const x = c.getContext('2d'), d = x.createImageData(128, 128);
  for (let i = 0; i < d.data.length; i += 4) { const v = Math.random() * 255; d.data.set([v, v, v, 255], i); }
  x.putImageData(d, 0, 0); return c;
})();
function wrap(t, mw) {
  const ls = []; let l = '';
  for (const w of t.split(' ')) { const n = l ? l + ' ' + w : w; if (ctx.measureText(n).width > mw && l) { ls.push(l); l = w; } else l = n; }
  return [...ls, l];
}
function render() {
  if (!src) return;
  const w = out.width, h = out.height;
  ctx.filter = FILTERS[cur]; ctx.drawImage(src, 0, 0); ctx.filter = 'none';
  if (cur !== 'Original') {
    ctx.globalAlpha = .12; ctx.fillStyle = ctx.createPattern(noise, 'repeat'); ctx.fillRect(0, 0, w, h); ctx.globalAlpha = 1; // grain
    const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * .35, w / 2, h / 2, Math.max(w, h) * .75); // vignette
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,.4)'); ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    const d = new Date(), p = n => String(n).padStart(2, '0'); // date stamp
    ctx.font = `${w * .032}px "Courier New",monospace`; ctx.textAlign = 'right'; ctx.fillStyle = '#ff9a3c';
    ctx.fillText(`'${String(d.getFullYear()).slice(2)} ${p(d.getMonth() + 1)} ${p(d.getDate())}`, w * .96, w * .06);
  }
  frame(w, h);
  overlay(w, h);
  if (!exporting && pick) reticle();
}
function frame(w, h) { // polaroid / film strip, drawn over the edges of the photo
  const u = Math.min(w, h);
  if (fr === 'Polaroid') {
    const m = u * .05, b = u * .17; ctx.fillStyle = '#f8f6f1';
    ctx.fillRect(0, 0, w, m); ctx.fillRect(0, 0, m, h); ctx.fillRect(w - m, 0, m, h); ctx.fillRect(0, h - b, w, b);
  } else if (fr === 'Film strip') {
    const f = u * .09, n = Math.floor(w / (f * .95)), gap = w / n;
    ctx.fillStyle = '#111'; ctx.fillRect(0, 0, w, f); ctx.fillRect(0, h - f, w, f);
    ctx.fillStyle = '#f4efe6'; ctx.beginPath();
    for (let i = 0; i < n; i++) { const x = i * gap + gap / 2 - f * .17; ctx.roundRect(x, f * .27, f * .34, f * .46, f * .08); ctx.roundRect(x, h - f * .73, f * .34, f * .46, f * .08); }
    ctx.fill();
  }
}
function reticle() { // ring where you picked the colour (not in the downloaded image)
  const r = Math.min(out.width, out.height) * .035;
  ctx.save(); ctx.lineWidth = 3; ctx.strokeStyle = '#fff'; ctx.shadowColor = 'rgba(0,0,0,.6)'; ctx.shadowBlur = 6;
  ctx.beginPath(); ctx.arc(pick[0], pick[1], r, 0, 7); ctx.stroke(); ctx.shadowBlur = 0;
  ctx.fillStyle = `rgb(${hero})`; ctx.beginPath(); ctx.arc(pick[0], pick[1], r * .5, 0, 7); ctx.fill(); ctx.stroke(); ctx.restore();
}

function overlay(w, h) {
  boxes.song = boxes.lyric = null;
  const u = Math.min(w, h), k = $('size').value / 100, showS = $('tSong').checked, showC = $('tCover').checked, L = $('lyric').value.trim();
  if (song && (showS || showC)) {
    const c = song.rgb, pcx = pos.song[0] * w, pcy = pos.song[1] * h;
    ctx.save(); ctx.translate(pcx, pcy); ctx.rotate(rot); ctx.translate(-pcx, -pcy); // rotate the whole song group around its centre
    let bw, bh;
    if (layout === 'stack') { // cover art on top, name and artist underneath, no box
      const s = u * .34 * k, tf = s * .115, af = s * .09, gap = s * .06, cap = s * 1.5; // cap = widest the text may get
      const fit = (t, size, bold) => { ctx.font = `${bold ? 'bold ' : ''}${size}px Georgia,serif`; const m = ctx.measureText(t).width; return m > cap ? size * cap / m : size; };
      const tf2 = showS ? fit(song.title, tf, true) : tf, af2 = showS ? fit(song.artist, af, false) : af; // long names shrink to fit
      ctx.font = `bold ${tf2}px Georgia,serif`; const tw = showS ? ctx.measureText(song.title).width : 0;
      ctx.font = `${af2}px Georgia,serif`; const aw = showS ? ctx.measureText(song.artist).width : 0;
      bw = Math.max(showC ? s : 0, tw, aw); bh = (showC ? s + gap : 0) + (showS ? tf * 1.25 + af * 1.3 : 0);
      const bx = pcx - bw / 2; let y = pcy - bh / 2;
      if (showC) {
        const cx = bx + (bw - s) / 2;
        ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.45)'; ctx.shadowBlur = s * .12; ctx.shadowOffsetY = s * .03;
        ctx.fillStyle = `rgb(${c})`; ctx.beginPath(); ctx.roundRect(cx, y, s, s, s * .06); ctx.fill(); ctx.restore();
        if (song.img) { ctx.save(); ctx.beginPath(); ctx.roundRect(cx, y, s, s, s * .06); ctx.clip(); ctx.drawImage(song.img, cx, y, s, s); ctx.restore(); }
        y += s + gap;
      }
      if (showS) {
        ctx.save(); ctx.textAlign = 'center'; ctx.fillStyle = '#fff'; ctx.shadowColor = 'rgba(0,0,0,.6)'; ctx.shadowBlur = tf * .4;
        ctx.font = `bold ${tf2}px Georgia,serif`; ctx.fillText(song.title, pcx, y + tf);
        ctx.globalAlpha = .85; ctx.font = `${af2}px Georgia,serif`; ctx.fillText(song.artist, pcx, y + tf * 1.25 + af); ctx.restore();
      }
    } else { // card: cover left, text right, on a block tinted with the cover colour
      const ch = u * .17 * k, cw = Math.min(w * .94, u * 1.05 * k), p = ch * .12, dark = c[0] * .3 + c[1] * .59 + c[2] * .11 < 140;
      const bx = pcx - cw / 2, by = pcy - ch / 2; bw = cw; bh = ch;
      ctx.fillStyle = `rgba(${c},.88)`; ctx.beginPath(); ctx.roundRect(bx, by, cw, ch, ch * .16); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.lineWidth = 2; ctx.stroke();
      let tx = bx + p;
      if (showC) {
        const s = ch - 2 * p;
        if (song.img) ctx.drawImage(song.img, tx, by + p, s, s);
        else { ctx.fillStyle = `rgb(${c})`; ctx.fillRect(tx, by + p, s, s); ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.strokeRect(tx, by + p, s, s); }
        tx += s + p;
      }
      if (showS) {
        const mw = bx + cw - p - tx; ctx.textAlign = 'left'; ctx.fillStyle = dark ? '#fff' : '#111';
        ctx.font = `bold ${ch * .27}px Georgia,serif`; ctx.fillText(song.title, tx, by + ch * .47, mw);
        ctx.font = `${ch * .21}px Georgia,serif`; ctx.fillText(song.artist, tx, by + ch * .75, mw);
      }
    }
    boxes.song = { cx: pcx, cy: pcy, w: bw, h: bh, rot };
    if (!exporting) { // resize/rotate dot on the corner (left out of the downloaded image)
      ctx.beginPath(); ctx.arc(pcx + bw / 2, pcy + bh / 2, u * .022, 0, 7); ctx.fillStyle = '#fff'; ctx.fill();
      ctx.strokeStyle = '#1c2530'; ctx.lineWidth = 2; ctx.stroke();
    }
    ctx.restore();
  }
  if (L) {
    ctx.font = `italic ${u * .06}px Georgia,serif`; ctx.textAlign = 'center'; ctx.fillStyle = '#fff';
    ctx.shadowColor = 'rgba(0,0,0,.7)'; ctx.shadowBlur = u * .012;
    const ls = wrap(L, w * .84), lh = u * .075, cx = pos.lyric[0] * w, top = pos.lyric[1] * h - ls.length * lh / 2;
    ls.forEach((l, i) => ctx.fillText(l, cx, top + (i + .8) * lh));
    ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0;
    boxes.lyric = { cx, cy: top + ls.length * lh / 2, w: w * .84, h: ls.length * lh };
  }
}

// ---------- controls ----------
Object.keys(FILTERS).forEach(k => {
  const b = chip('filters', k, b => { cur = k; mark('filters', b); cam.style.filter = FILTERS[k]; render(); });
  if (k === cur) b.classList.add('on');
});
Object.keys(MOODS).forEach(k => chip('moods', k, b => { const was = b.classList.contains('on'); mark('moods', was ? null : b); mood = was ? null : MOODS[k]; }));
['Stack', 'Card'].forEach(k => {
  const b = chip('layouts', k, b => { layout = k.toLowerCase(); mark('layouts', b); render(); });
  if (layout === k.toLowerCase()) b.classList.add('on');
});
[['Original', 0], ['1:1', 1], ['4:5', .8], ['9:16', 9 / 16]].forEach(([k, v]) => {
  const b = chip('ratios', k, b => { ratio = v; mark('ratios', b); crop(); pick = null; render(); });
  if (v === ratio) b.classList.add('on');
});
['None', 'Polaroid', 'Film strip'].forEach(k => {
  const b = chip('frames', k, b => { fr = k; mark('frames', b); render(); });
  if (k === fr) b.classList.add('on');
});
['tSong', 'tCover', 'lyric', 'size'].forEach(i => $(i).addEventListener('input', render));

// ---------- song matching ----------
$('find').onclick = async () => {
  if (!hero) return hint('Snap or upload a photo first.');
  const artist = $('artist').value.trim(), box = $('results'); box.textContent = 'Finding songs...';
  try {
    const genres = (mood || HUE_G[Math.floor(hue(hero) / 60) % 6]).join(',');
    const r = await fetch('/api/songs?' + new URLSearchParams({ genres, artist })), j = await r.json();
    if (!r.ok) throw Error(j.error);
    const seen = new Set(); // drop slowed/reverb versions and repeats from the same album cover
    const uniq = j.songs.filter(s => { const k = s.cover || s.id; if (BAD.test(s.title) || seen.has(k)) return false; seen.add(k); return true; });
    pool = (await Promise.all(uniq.map(async s => {
      try {
        if (s.color) s.rgb = hx(s.color);
        else { s.img = await load('/api/img?u=' + encodeURIComponent(s.cover)); s.rgb = dominant(s.img); }
        return s;
      } catch { return null; }
    }))).filter(Boolean);
    demo = j.demo; rank();
  } catch (e) { box.textContent = 'Search failed: ' + e.message; }
};
function rank() { // best colour matches from the loaded pool
  pool.forEach(s => { s.diff = dE(hero, s.rgb); });
  showResults([...pool].sort((a, b) => a.diff - b.diff).slice(0, 3));
}
function showResults(list) {
  const box = $('results'); box.innerHTML = demo ? '<p class="hint">Demo mode: add Spotify keys in .env for real songs.</p>' : '';
  if (!list.length) { box.append('No matches. Try another mood or artist.'); return; }
  list.forEach(s => {
    const b = document.createElement('button'); b.className = 'res';
    b.innerHTML = (s.img ? `<img src="${s.img.src}" alt="">` : `<i style="background:rgb(${s.rgb})"></i>`) + '<span><b></b><small></small></span>';
    b.querySelector('b').textContent = s.title;
    b.querySelector('small').textContent = `${s.artist}, ${Math.round(100 * Math.exp(-s.diff / 30))}% colour match`;
    b.onclick = () => { song = s; box.querySelectorAll('.res').forEach(x => x.classList.toggle('sel', x === b)); render(); };
    box.append(b);
    if (s.url) { const a = document.createElement('a'); a.href = s.url; a.target = '_blank'; a.rel = 'noopener'; a.className = 'hint'; a.textContent = 'Open in Spotify'; box.append(a); }
  });
  box.querySelector('.res').click();
}

// ---------- export ----------
const blob = async () => { exporting = true; render(); const b = await new Promise(r => out.toBlob(r, 'image/png')); exporting = false; render(); return b; };
$('dl').onclick = async () => { if (!src) return hint('Snap or upload a photo first.'); const a = document.createElement('a'); a.href = URL.createObjectURL(await blob()); a.download = 'huetune.png'; a.click(); };
if (navigator.canShare?.({ files: [new File([''], 'a.png', { type: 'image/png' })] })) $('share').hidden = false;
$('share').onclick = async () => { if (src) navigator.share({ files: [new File([await blob()], 'huetune.png', { type: 'image/png' })] }).catch(() => {}); };

// ---------- photobooth strip + stickers ----------
const S = $('strip'), sctx = S.getContext('2d');
const KAOMOJI = ['(◕‿◕)♡', 'ʕ•ᴥ•ʔ', '(≧◡≦)', '(｡♥‿♥｡)', '(ﾉ◕ヮ◕)ﾉ*:･ﾟ✧', '♡', '✿', '☆彡', '⋆｡°✩', '୨୧', '🎀', '✨', '🌸', '💗'];
const STRIP_COLORS = { White: '#ffffff', Black: '#141414', Pink: '#f7c6d9', Sky: '#bcd7ee', Butter: '#f6e7a8' };
let shots = [], stickers = [], stripBg = '#ffffff', sdrag = null;
const isDark = c => { const v = hx(c); return v[0] * .3 + v[1] * .59 + v[2] * .11 < 140; };

function drawStrip() {
  const W = 480, pad = 28, fw = W - 2 * pad, fh = Math.round(fw * .75), gap = 18, foot = 96, n = 4, H = pad + n * fh + (n - 1) * gap + foot;
  const dark = isDark(stripBg), ink = dark ? '#fff' : '#1c2530';
  S.width = W; S.height = H; sctx.fillStyle = stripBg; sctx.fillRect(0, 0, W, H);
  for (let i = 0; i < n; i++) {
    const y = pad + i * (fh + gap), s = shots[i];
    if (!s) { sctx.fillStyle = dark ? 'rgba(255,255,255,.12)' : 'rgba(0,0,0,.07)'; sctx.fillRect(pad, y, fw, fh); continue; } // empty slot
    let sw = s.width, sh = s.height; if (sw / sh > fw / fh) sw = sh * fw / fh; else sh = sw * fh / fw; // cover-crop to the slot
    sctx.filter = FILTERS[cur]; sctx.drawImage(s, (s.width - sw) / 2, (s.height - sh) / 2, sw, sh, pad, y, fw, fh); sctx.filter = 'none';
  }
  sctx.fillStyle = ink; sctx.textAlign = 'center';
  sctx.font = '700 28px "Bricolage Grotesque",Georgia,serif'; sctx.fillText('HueTune', W / 2, H - 52);
  sctx.font = '16px "Courier New",monospace'; sctx.fillText(new Date().toLocaleDateString('en-GB').replace(/\//g, '.'), W / 2, H - 26);
  sctx.textBaseline = 'middle';
  stickers.forEach(k => { sctx.font = `${k.s}px Georgia,"Segoe UI Symbol",sans-serif`; k.w = sctx.measureText(k.t).width; k.h = k.s * 1.2; sctx.fillText(k.t, k.x * W, k.y * H); });
  sctx.textBaseline = 'alphabetic';
}

$('booth').onclick = async () => { // 4 photos, 3-second countdown before each
  if (!cam.srcObject) return hint('The photobooth needs the camera. Use "Add this photo" for uploads.');
  if (cam.hidden) $('retake').click();
  $('booth').disabled = true; shots = []; drawStrip();
  for (let i = 0; i < 4; i++) {
    for (let n = 3; n > 0; n--) { hint(`Photo ${i + 1} of 4 in ${n}...`); await new Promise(r => setTimeout(r, 1000)); }
    const c = document.createElement('canvas'); c.width = cam.videoWidth; c.height = cam.videoHeight; c.getContext('2d').drawImage(cam, 0, 0);
    shots.push(c); drawStrip();
  }
  hint('Your photo strip is ready. Add stickers, then download it.'); $('booth').disabled = false;
};
$('addStrip').onclick = () => { if (!src) return hint('Snap or upload a photo first.'); if (shots.length >= 4) shots.shift(); shots.push(src); drawStrip(); };
$('clearStrip').onclick = () => { shots = []; stickers = []; drawStrip(); };
$('undoSticker').onclick = () => { stickers.pop(); drawStrip(); };
$('dlStrip').onclick = () => S.toBlob(b => { const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = 'huetune-strip.png'; a.click(); });

Object.entries(STRIP_COLORS).forEach(([k, v]) => {
  const b = chip('stripColors', k, b => { stripBg = v; mark('stripColors', b); drawStrip(); });
  if (v === stripBg) b.classList.add('on');
});
KAOMOJI.forEach(t => chip('stickers', t, () => { stickers.push({ t, x: .5, y: .25 + Math.random() * .5, s: +$('ssize').value }); drawStrip(); }));
document.querySelectorAll('#filters button').forEach(b => b.addEventListener('click', drawStrip)); // strip follows the chosen filter

const sat = e => { const r = S.getBoundingClientRect(); return [(e.clientX - r.left) * S.width / r.width, (e.clientY - r.top) * S.height / r.height]; };
S.addEventListener('pointerdown', e => { // drag a sticker around the strip
  const [x, y] = sat(e);
  const i = stickers.map((_, i) => i).reverse().find(i => { const k = stickers[i]; return Math.abs(x - k.x * S.width) <= k.w / 2 && Math.abs(y - k.y * S.height) <= k.h / 2; });
  if (i === undefined) return;
  sdrag = { i, dx: x - stickers[i].x * S.width, dy: y - stickers[i].y * S.height }; S.setPointerCapture(e.pointerId);
});
S.addEventListener('pointermove', e => {
  const [x, y] = sat(e);
  if (!sdrag) { S.style.cursor = stickers.some(k => Math.abs(x - k.x * S.width) <= k.w / 2 && Math.abs(y - k.y * S.height) <= k.h / 2) ? 'grab' : 'default'; return; }
  const k = stickers[sdrag.i]; k.x = Math.min(1, Math.max(0, (x - sdrag.dx) / S.width)); k.y = Math.min(1, Math.max(0, (y - sdrag.dy) / S.height)); drawStrip();
});
S.addEventListener('pointerup', () => { sdrag = null; });
drawStrip(); document.fonts?.ready.then(drawStrip);
