# VoiceChat

Minimal 2-person peer-to-peer voice chat using WebRTC + WebSocket signaling.
No video. No chat. No auth. No database. Just voice.

---

## Project Structure

```
voicechat/
├── client/
│   ├── index.html
│   ├── script.js
│   └── style.css
└── server/
    ├── index.js
    └── package.json
```

---

## Local Development

### 1. Start the signaling server

```bash
cd server
npm install
npm start
# Server runs on http://localhost:3000
```

### 2. Serve the frontend

Use any static file server. Example with `npx`:

```bash
cd client
npx serve .
# or
npx http-server . -p 8080
```

Open two browser tabs at `http://localhost:8080` (or whatever port).
Click **Join Room** in each tab. They will connect automatically.

> **Note:** For local dev, `script.js` auto-detects `localhost` and uses `ws://localhost:3000`.

---

## Deploy the Backend to Render (Free Tier)

1. Push the `server/` folder to a GitHub repo (or the whole monorepo).
2. Go to [render.com](https://render.com) → **New → Web Service**.
3. Connect your GitHub repo.
4. Set:
   - **Root Directory:** `server`
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Environment:** `Node`
   - **Plan:** Free
5. Deploy. Render gives you a URL like `https://your-app-name.onrender.com`.

---

## Deploy the Frontend (Static)

Update `WS_URL` in `client/script.js`:

```js
// Replace this line:
: "wss://YOUR-APP-NAME.onrender.com";
// With your actual Render URL:
: "wss://your-app-name.onrender.com";
```

Then deploy the `client/` folder to any static host:

### Cloudflare Pages
1. Push `client/` to GitHub.
2. Cloudflare Pages → New project → Connect repo.
3. Build command: *(leave empty)*
   Output directory: `.` (or `client` if deploying from root)

### Vercel
```bash
cd client
npx vercel
```

### Netlify
```bash
cd client
npx netlify deploy --prod --dir .
```

---

## Waking the Render Free Tier Backend

Render free-tier services sleep after ~15 minutes of inactivity.

**Automatic wake:** When a user clicks **Join Room**, the client fetches `/ping` first to wake the server before opening the WebSocket. A cold start takes ~30 seconds.

**Keep-alive ping:** While in a call, the client pings `/ping` every 25 seconds to prevent the server from sleeping mid-call.

**Manual wake:** Visit `https://your-app-name.onrender.com/ping` in a browser.

---

## How It Works

```
User A                  Signaling Server               User B
  |                           |                           |
  |--- WS connect ----------->|                           |
  |<-- joined (index=0) ------|                           |
  |                           |<--- WS connect -----------|
  |                           |---- joined (index=1) ---->|
  |<-- ready -----------------|---- ready --------------->|
  |                           |                           |
  |--- offer (SDP) ---------->|---- offer (SDP) --------->|
  |                           |<--- answer (SDP) ---------|
  |<-- answer (SDP) ----------|                           |
  |--- ICE candidates ------->|---- ICE candidates ------>|
  |<-- ICE candidates --------|<--- ICE candidates -------|
  |                           |                           |
  |<======= direct P2P audio (no server) ================>|
```

- **Peer 0** (first to join) creates the WebRTC offer.
- **Peer 1** (second to join) answers.
- ICE candidates are exchanged via the signaling server.
- Once connected, audio flows **directly peer-to-peer** — the server is no longer involved.
- STUN server (`stun.l.google.com:19302`) is used for NAT traversal.

---

## Limitations

- **STUN only** — no TURN server. Connections behind symmetric NAT (some corporate/university networks) may fail.
- **Single room** — the server holds at most 2 WebSocket connections. A third user is rejected.
- **No reconnect logic** — if the peer drops, both users must rejoin manually.
- **Render free tier cold starts** — first connection after inactivity takes ~30s.
