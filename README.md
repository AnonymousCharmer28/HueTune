# 🎞️🎧 HueTune

> Snap a photo with vintage-cam filters, and get a song whose cover art matches the colours of your pic. Stick the song, cover and a lyric line on the photo, then post it.

![HueTune banner]<img width="229" height="280" alt="image" src="https://github.com/user-attachments/assets/76aa8fbe-2982-4ca6-9ee6-a900abf32719" />


## 📸 Screenshots

| Vintage filters | Colour → song match |
| :---: | :---: |
| ![Filters]<img width="150" height="62" alt="image" src="https://github.com/user-attachments/assets/5dbf03da-bef5-4ce1-a738-0349053de53b" /> | ![Top 3 matches]<img width="188" height="129" alt="image" src="https://github.com/user-attachments/assets/5df2ef4c-b0b3-48b5-9a44-13b4dfab912d" /> |

## ✨ Features

- 📷 Take a photo in the browser (webcam or phone camera)
- 🎞️ Vintage-cam filters: grain, warm fade, light leaks, date stamp
- 🎨 Finds the **hero colour** of your photo (or tap the photo to pick it yourself)
- 🎵 Matches it to songs whose **cover art** has the closest colour, and shows the top 3
- 🎚️ Optional mood chips and artist search to narrow the song pool
- 🖼️ Add the song title, artist, cover art and one lyric line onto the photo
- ✋ Drag the song and lyric anywhere on the photo, in a Stack or Card layout
- 🎞️ Export as 1:1, 4:5 or 9:16 with Polaroid or film-strip frames, and make a photobooth strip with kaomoji stickers
- ⬇️ Export the image, or share it straight to Instagram on mobile

## 🧠 How the colour match works

1. The photo is shrunk and grouped into colour buckets. The biggest non-grey bucket becomes the hero colour.
2. Candidate songs come from a Spotify search (built from the mood or artist you choose).
3. The dominant colour of each cover is extracted the same way.
4. Both colours are converted to CIELAB and compared with ΔE (smaller = closer). The 3 closest covers win.

## 🛠️ Tech stack

- Frontend: HTML, CSS, vanilla JavaScript, Canvas API, `getUserMedia`, Web Share API
- Backend: Node.js + Express (keeps the Spotify secret off the browser)
- Music data: Spotify Web API (search + album art)

## 🚀 Getting started

**Prerequisites:** [Node.js](https://nodejs.org) and [Git](https://git-scm.com)

```bash
git clone https://github.com/<your-username>/huetune.git
cd huetune
npm install
cp .env.example .env   # Windows cmd: copy .env.example .env
npm start
```

Open http://localhost:3000.

### Demo mode (no keys needed)

If no Spotify keys are set, the app uses a small built-in song list from `data/demo-songs.json`, so you can try the camera, filters and colour matching straight away.

### Connect Spotify

1. Go to the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard) and create an app (choose **Web API**).
2. Add `http://127.0.0.1:3000/callback` as a redirect URI.
3. Copy the **Client ID** and **Client Secret** into your `.env`:

```env
SPOTIFY_CLIENT_ID=your_client_id
SPOTIFY_CLIENT_SECRET=your_client_secret
```

4. Restart with `npm start`.

> ⚠️ Never commit your `.env` file. It is already listed in `.gitignore`.

## 📁 Project structure

```
huetune/
├── public/            # index.html, style.css, app.js
├── data/              # demo-songs.json
├── docs/screenshots/  # images used in this README
├── server.js          # Express server + Spotify calls
├── package.json
├── .env.example
├── .gitignore
└── README.md
```

## 🗺️ Roadmap

- [x] Camera, filters, export
- [x] Hero colour extraction + tap-to-pick
- [x] Spotify search + cover colour matching
- [x] Lyric line overlay
- [ ] Full in-browser playback with the Spotify Web Playback SDK (needs Premium)
- [ ] Deploy over HTTPS for phone use
- [ ] Tint the overlay using the cover's palette

## 📝 Notes

- Lyrics are a single short line typed by the user. The app does not fetch or display full lyrics.
- Instagram has no direct web posting, so the app exports the image and uses the Web Share button on mobile.
- Music data and cover art come from Spotify. This is a personal project and is not affiliated with or endorsed by Spotify. Cover art belongs to its respective owners.

## 📄 License

MIT
#
