require('dotenv').config();
const express = require('express'), fs = require('fs'), path = require('path');
const app = express();
const { SPOTIFY_CLIENT_ID: id, SPOTIFY_CLIENT_SECRET: secret, PORT = 3000 } = process.env;
const live = !!(id && secret && !id.startsWith('your_'));
let tok = { v: '', exp: 0 };

// Spotify "Client Credentials" token (no user login needed for search + cover art)
async function token() {
  if (Date.now() < tok.exp) return tok.v;
  const r = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { Authorization: 'Basic ' + Buffer.from(id + ':' + secret).toString('base64'), 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials'
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error_description || 'Spotify token error');
  tok = { v: j.access_token, exp: Date.now() + (j.expires_in - 60) * 1000 };
  return tok.v;
}

app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/songs', async (req, res) => {
  const { genres = '', artist = '' } = req.query;
  try {
    if (!live) { // demo mode: no keys set
      const all = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'demo-songs.json')));
      const songs = artist ? all.filter(s => s.artist.toLowerCase().includes(artist.toLowerCase())) : all;
      return res.json({ demo: true, songs });
    }
    // Spotify search matches words in titles, so search by genre (or artist) to get a varied pool of covers
    const queries = artist ? [`artist:"${artist}"`] : genres.split(',').filter(Boolean).map(g => `genre:"${g}"`);
    if (!queries.length) queries.push('genre:"pop"');
    const t = await token();
    const jobs = queries.flatMap(q => [0, 10, 20].map(o => [q, o]));
    const pages = await Promise.all(jobs.map(([q, o]) =>
      fetch('https://api.spotify.com/v1/search?' + new URLSearchParams({ q, type: 'track', limit: 10, offset: o }),
        { headers: { Authorization: 'Bearer ' + t } }).then(r => r.json()).catch(() => ({}))));
    const songs = pages.flatMap(p => p.tracks?.items || []).map(t => ({
      id: t.id, title: t.name, artist: t.artists.map(a => a.name).join(', '),
      cover: (t.album.images[1] || t.album.images[0])?.url, url: t.external_urls.spotify
    }));
    if (!songs.length) throw new Error(pages.find(p => p.error)?.error?.message || 'No songs found for that search');
    res.json({ demo: false, songs });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Serves cover art from our own origin so the canvas can export without CORS problems
app.get('/api/img', async (req, res) => {
  const u = req.query.u || '';
  if (!/^https:\/\/i\.scdn\.co\//.test(u)) return res.sendStatus(400);
  try {
    const r = await fetch(u);
    res.type(r.headers.get('content-type') || 'image/jpeg').send(Buffer.from(await r.arrayBuffer()));
  } catch { res.sendStatus(502); }
});

app.listen(PORT, () => console.log(`HueTune running at http://localhost:${PORT} (${live ? 'Spotify' : 'demo'} mode)`));
