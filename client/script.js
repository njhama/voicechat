// ── Config ────────────────────────────────────────────────────────────────────
// Replace with your Render backend URL after deploying.
// For local dev, leave as-is and run the server on port 3000.
const WS_URL =
  location.hostname === "localhost" || location.hostname === "127.0.0.1"
    ? `ws://${location.hostname}:3000`
    : "wss://YOUR-APP-NAME.onrender.com"; // <-- update this

const ICE_SERVERS = [{ urls: "stun:stun.l.google.com:19302" }];
const WAKE_PING_INTERVAL_MS = 25000; // keep Render free-tier alive

// ── State ─────────────────────────────────────────────────────────────────────
let ws = null;
let pc = null;
let localStream = null;
let myIndex = null;
let isMuted = false;
let wakeTimer = null;

// ── DOM refs ──────────────────────────────────────────────────────────────────
const statusEl   = document.getElementById("status");
const joinBtn    = document.getElementById("joinBtn");
const leaveBtn   = document.getElementById("leaveBtn");
const muteBtn    = document.getElementById("muteBtn");
const remoteAudio = document.getElementById("remoteAudio");
const avatar0    = document.getElementById("avatar0");
const avatar1    = document.getElementById("avatar1");
const wakeHint   = document.getElementById("wakeHint");

// ── Helpers ───────────────────────────────────────────────────────────────────
function setStatus(msg, cls = "") {
  statusEl.textContent = msg;
  statusEl.className = cls;
}

function myAvatar()   { return myIndex === 0 ? avatar0 : avatar1; }
function peerAvatar() { return myIndex === 0 ? avatar1 : avatar0; }

function showCallUI(visible) {
  joinBtn.style.display  = visible ? "none"  : "block";
  leaveBtn.style.display = visible ? "block" : "none";
  muteBtn.style.display  = visible ? "block" : "none";
}

function resetAvatars() {
  [avatar0, avatar1].forEach(a => a.className = "avatar");
}

// ── Wake-up ping ──────────────────────────────────────────────────────────────
function startWakePing(httpBase) {
  stopWakePing();
  wakeTimer = setInterval(() => fetch(`${httpBase}/ping`).catch(() => {}), WAKE_PING_INTERVAL_MS);
}
function stopWakePing() {
  clearInterval(wakeTimer);
  wakeTimer = null;
}

// ── WebRTC ────────────────────────────────────────────────────────────────────
function createPeerConnection() {
  pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

  pc.onicecandidate = ({ candidate }) => {
    if (candidate) send({ type: "ice", candidate });
  };

  pc.ontrack = (e) => {
    remoteAudio.srcObject = e.streams[0];
    peerAvatar().className = "avatar active";
    setStatus("Connected — peer audio live", "connected");
  };

  pc.onconnectionstatechange = () => {
    const s = pc.connectionState;
    if (s === "disconnected" || s === "failed" || s === "closed") {
      setStatus("Peer disconnected", "error");
      peerAvatar().className = "avatar";
    }
  };

  // Add local tracks
  localStream.getTracks().forEach(t => pc.addTrack(t, localStream));
}

async function startCall() {
  createPeerConnection();
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  send({ type: "offer", sdp: pc.localDescription });
}

async function handleOffer(sdp) {
  createPeerConnection();
  await pc.setRemoteDescription(new RTCSessionDescription(sdp));
  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);
  send({ type: "answer", sdp: pc.localDescription });
}

async function handleAnswer(sdp) {
  await pc.setRemoteDescription(new RTCSessionDescription(sdp));
}

async function handleIce(candidate) {
  try {
    await pc.addIceCandidate(new RTCIceCandidate(candidate));
  } catch (e) {
    console.warn("ICE error:", e);
  }
}

// ── Signaling ─────────────────────────────────────────────────────────────────
function send(msg) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

function connectSignaling() {
  ws = new WebSocket(WS_URL);

  ws.onopen = () => {
    setStatus("Connected to server, waiting for peer…");
  };

  ws.onmessage = async ({ data }) => {
    let msg;
    try { msg = JSON.parse(data); } catch { return; }

    switch (msg.type) {
      case "joined":
        myIndex = msg.index;
        myAvatar().className = "avatar active";
        setStatus(`Joined as peer ${myIndex + 1}. Waiting for other peer…`);
        break;

      case "full":
        setStatus("Room is full (max 2 peers).", "error");
        cleanup(false);
        break;

      case "ready":
        setStatus("Peer joined! Connecting…");
        peerAvatar().className = "avatar active";
        // Peer 0 initiates the offer
        if (myIndex === 0) await startCall();
        break;

      case "offer":
        await handleOffer(msg.sdp);
        break;

      case "answer":
        await handleAnswer(msg.sdp);
        break;

      case "ice":
        await handleIce(msg.candidate);
        break;

      case "peer-left":
        setStatus("Peer left the room.", "error");
        peerAvatar().className = "avatar";
        if (pc) { pc.close(); pc = null; }
        break;
    }
  };

  ws.onclose = () => {
    if (localStream) setStatus("Disconnected from server.", "error");
  };

  ws.onerror = () => setStatus("WebSocket error.", "error");
}

// ── Join / Leave ──────────────────────────────────────────────────────────────
joinBtn.addEventListener("click", async () => {
  // Wake the backend first, then open mic
  const httpBase = WS_URL.replace(/^ws/, "http");
  wakeHint.textContent = "Waking server…";
  try {
    await fetch(`${httpBase}/ping`);
    wakeHint.textContent = "";
  } catch {
    wakeHint.textContent = "Server may be cold-starting, please wait…";
  }

  try {
    localStream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, sampleRate: 48000 },
      video: false,
    });
  } catch (e) {
    setStatus("Microphone access denied.", "error");
    return;
  }

  showCallUI(true);
  startWakePing(httpBase);
  connectSignaling();
});

leaveBtn.addEventListener("click", () => cleanup(true));

// ── Mute ──────────────────────────────────────────────────────────────────────
muteBtn.addEventListener("click", () => {
  if (!localStream) return;
  isMuted = !isMuted;
  localStream.getAudioTracks().forEach(t => (t.enabled = !isMuted));
  muteBtn.textContent = isMuted ? "🎙️ Unmute" : "🔇 Mute";
  muteBtn.classList.toggle("muted", isMuted);
  myAvatar().className = "avatar " + (isMuted ? "muted" : "active");
});

// ── Cleanup ───────────────────────────────────────────────────────────────────
function cleanup(resetStatus = true) {
  stopWakePing();
  if (pc)  { pc.close();  pc = null; }
  if (ws)  { ws.close();  ws = null; }
  if (localStream) {
    localStream.getTracks().forEach(t => t.stop());
    localStream = null;
  }
  remoteAudio.srcObject = null;
  myIndex = null;
  isMuted = false;
  muteBtn.textContent = "🔇 Mute";
  muteBtn.classList.remove("muted");
  resetAvatars();
  showCallUI(false);
  if (resetStatus) setStatus("Waiting to join…");
  wakeHint.textContent = "";
}
