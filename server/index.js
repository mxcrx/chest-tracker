const express = require("express");
const http = require("http");
const fs = require("fs");
const path = require("path");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });
const dataPath = path.join(__dirname, "data.json");
const rooms = new Map();
const profiles = new Map();
app.use((_, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  next();
});

const clean = (value, fallback = "") =>
  String(value || fallback)
    .trim()
    .slice(0, 32);
const roomKey = (value) =>
  clean(value)
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, "")
    .slice(0, 16);
const playerKey = (value) =>
  String(value || "")
    .replace(/[^a-zA-Z0-9-]/g, "")
    .slice(0, 64);
function configuredPort() {
  const args = process.argv.slice(2);
  const optionIndex = args.findIndex((arg) => arg === "--port" || arg === "-p");
  const inlineOption = args.find((arg) => arg.startsWith("--port="));
  const rawPort =
    optionIndex >= 0
      ? args[optionIndex + 1]
      : inlineOption?.slice("--port=".length) || process.env.PORT || 3000;
  const port = Number(rawPort);
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error(
      "Ungültiger Port. Bitte einen Wert von 1 bis 65535 angeben.",
    );
  return port;
}
const port = configuredPort();

function loadRooms() {
  try {
    const saved = JSON.parse(fs.readFileSync(dataPath, "utf8"));
    for (const [code, room] of Object.entries(saved.rooms || {}))
      rooms.set(code, {
        code,
        members: new Map(Object.entries(room.members || {})),
        online: new Map(),
      });
    for (const [id, profile] of Object.entries(saved.profiles || {}))
      profiles.set(id, profile);
    for (const room of rooms.values())
      for (const member of room.members.values()) {
        const profile = profiles.get(member.id) || {
          id: member.id,
          name: member.name,
          count: member.count || 0,
        };
        if (member.count > profile.count) profile.count = member.count;
        profiles.set(member.id, profile);
      }
  } catch (error) {
    if (error.code !== "ENOENT")
      console.error("Daten konnten nicht geladen werden:", error.message);
  }
}
function saveRooms() {
  const saved = {
    profiles: Object.fromEntries(profiles),
    rooms: Object.fromEntries(
      [...rooms].map(([code, room]) => [
        code,
        { members: Object.fromEntries(room.members) },
      ]),
    ),
  };
  fs.writeFileSync(`${dataPath}.tmp`, JSON.stringify(saved, null, 2));
  fs.renameSync(`${dataPath}.tmp`, dataPath);
}
function roomTotal(room) {
  return [...room.members.values()].reduce(
    (sum, member) => sum + member.count,
    0,
  );
}
function publicRoom(room) {
  return {
    code: room.code,
    total: roomTotal(room),
    members: [...room.members.values()]
      .map((member) => ({
        ...member,
        online: (room.online.get(member.id) || 0) > 0,
      }))
      .sort((a, b) => b.count - a.count),
  };
}
function emitRoom(room) {
  io.to(room.code).emit("room:update", publicRoom(room));
}
function resetRoom(code) {
  const room = rooms.get(roomKey(code));
  if (!room) return false;

  const memberIds = new Set(room.members.keys());
  for (const id of memberIds) {
    const profile = profiles.get(id);
    if (profile) profile.count = 0;
  }
  const affectedRooms = [];
  for (const savedRoom of rooms.values()) {
    let changed = false;
    for (const member of savedRoom.members.values()) {
      if (memberIds.has(member.id)) {
        member.count = 0;
        changed = true;
      }
    }
    if (changed) affectedRooms.push(savedRoom);
  }
  saveRooms();
  affectedRooms.forEach(emitRoom);
  return true;
}
function leavePresence(socket) {
  const room = rooms.get(socket.data.room);
  if (!room || !socket.data.playerId) return;
  const activeConnections = (room.online.get(socket.data.playerId) || 1) - 1;
  if (activeConnections > 0)
    room.online.set(socket.data.playerId, activeConnections);
  else room.online.delete(socket.data.playerId);
  emitRoom(room);
}

loadRooms();
app.get("/health", (_, res) => res.json({ ok: true, rooms: rooms.size }));
app.get("/profile/:id", (req, res) => {
  const profile = profiles.get(playerKey(req.params.id));
  res.json(profile || { id: playerKey(req.params.id), name: "", count: 0 });
});
io.on("connection", (socket) => {
  socket.on("room:join", ({ code, name, playerId }, reply) => {
    const key = roomKey(code),
      id = playerKey(playerId),
      playerName = clean(name, "Spieler");
    if (key.length < 4)
      return reply({
        ok: false,
        error: "Der Raumcode braucht mindestens 4 Zeichen.",
      });
    if (id.length < 12)
      return reply({
        ok: false,
        error: "Ungültige Spielerkennung. Bitte starte die App neu.",
      });
    if (socket.data.room) {
      leavePresence(socket);
      socket.leave(socket.data.room);
    }
    let room = rooms.get(key);
    if (!room) {
      room = { code: key, members: new Map(), online: new Map() };
      rooms.set(key, room);
    }
    const profile = profiles.get(id) || { id, name: playerName, count: 0 };
    profile.name = playerName;
    profiles.set(id, profile);
    const member = room.members.get(id) || { id, name: playerName, count: 0 };
    member.name = playerName;
    member.count = profile.count;
    room.members.set(id, member);
    room.online.set(id, (room.online.get(id) || 0) + 1);
    socket.data.room = key;
    socket.data.playerId = id;
    socket.join(key);
    saveRooms();
    emitRoom(room);
    reply({ ok: true, room: publicRoom(room) });
  });
  socket.on("room:add", ({ amount = 1 }, reply) => {
    const room = rooms.get(socket.data.room),
      member = room?.members.get(socket.data.playerId),
      profile = profiles.get(socket.data.playerId),
      value = Number(amount);
    if (
      !room ||
      !member ||
      !Number.isInteger(value) ||
      value < 1 ||
      value > 1000
    )
      return reply?.({ ok: false });
    profile.count += value;
    member.count = profile.count;
    saveRooms();
    emitRoom(room);
    reply?.({ ok: true, profile });
  });
  socket.on("disconnect", () => leavePresence(socket));
});
server.listen(port, () =>
  console.log(
    `Chest tracker server läuft auf Port ${port}. Reset nur per Konsole: reset <RAUMCODE>`,
  ),
);

process.stdin.setEncoding("utf8");
process.stdin.on("data", (input) => {
  for (const line of input.split(/\r?\n/)) {
    const match = line.trim().match(/^reset\s+(.+)$/i);
    if (!match) continue;
    const code = roomKey(match[1]);
    if (!code) {
      console.log("Reset fehlgeschlagen: Raumcode fehlt.");
      continue;
    }
    console.log(
      resetRoom(code)
        ? `Raum ${code} wurde zurückgesetzt.`
        : `Reset fehlgeschlagen: Raum ${code} existiert nicht.`,
    );
  }
});
