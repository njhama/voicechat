const express = require("express");
const http = require("http");
const { WebSocketServer } = require("ws");

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const PORT = process.env.PORT || 3000;

// Clients in the single room: [peer1, peer2]
const room = [];

app.get("/ping", (req, res) => res.send("pong"));

app.use((req, res) => res.status(404).send("Not found"));

wss.on("connection", (ws) => {
  if (room.length >= 2) {
    ws.send(JSON.stringify({ type: "full" }));
    ws.close();
    return;
  }

  room.push(ws);
  const myIndex = room.indexOf(ws);
  const peer = () => room[myIndex === 0 ? 1 : 0];

  console.log(`Peer ${myIndex} connected. Room size: ${room.length}`);

  // Tell this client what slot they got
  ws.send(JSON.stringify({ type: "joined", index: myIndex }));

  // Tell existing peer that someone joined
  if (room.length === 2) {
    room[0].send(JSON.stringify({ type: "ready" }));
    room[1].send(JSON.stringify({ type: "ready" }));
  }

  ws.on("message", (data) => {
    let msg;
    try {
      msg = JSON.parse(data);
    } catch {
      return;
    }

    const other = peer();
    if (other && other.readyState === 1) {
      other.send(JSON.stringify(msg));
    }
  });

  ws.on("close", () => {
    const idx = room.indexOf(ws);
    if (idx !== -1) room.splice(idx, 1);
    console.log(`Peer ${myIndex} disconnected. Room size: ${room.length}`);

    const other = peer();
    if (other && other.readyState === 1) {
      other.send(JSON.stringify({ type: "peer-left" }));
    }
  });

  ws.on("error", (err) => {
    console.error("WS error:", err.message);
  });
});

server.listen(PORT, () => {
  console.log(`Signaling server running on port ${PORT}`);
});
