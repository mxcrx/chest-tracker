import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

const DROP_RATE = 137500;
const DEADLINE = new Date(2026, 11, 5, 0, 0, 0);
let socket;
let hotkey = localStorage.getItem("hotkey") || "F8";
let recordingHotkey = false;
let joined = false;
const playerId = localStorage.getItem("player-id") || crypto.randomUUID();
localStorage.setItem("player-id", playerId);
let personalCount = Number(localStorage.getItem("personal-count") || 0);

const $ = (id) => document.getElementById(id);
const settings = ["name", "server-url", "room-code"];
settings.forEach((key) => {
  $(key).value = localStorage.getItem(key) || "";
});
$("hotkey-button").textContent = hotkey;

function prettifyKey(event) {
  const pieces = [];
  if (event.ctrlKey) pieces.push("Ctrl");
  if (event.altKey) pieces.push("Alt");
  if (event.shiftKey) pieces.push("Shift");
  if (event.metaKey) pieces.push("Super");
  const key = event.key.length === 1 ? event.key.toUpperCase() : event.key;
  if (!["Control", "Alt", "Shift", "Meta"].includes(key)) pieces.push(key);
  return pieces.join("+");
}

function addChest() {
  if (joined) socket.emit("room:add", { amount: 1 });
}
function setError(message = "") {
  $("join-error").textContent = message;
}

function probability(total) {
  return 1 - Math.pow(1 - 1 / DROP_RATE, total);
}
function formatNumber(value) {
  return new Intl.NumberFormat("de-DE").format(value);
}
function remainingDays() {
  return Math.max(0, (DEADLINE - new Date()) / 86400000);
}
function dailyNeeded(count) {
  const days = remainingDays();
  return days > 0 ? Math.ceil(Math.max(0, DROP_RATE - count) / days) : 0;
}

function renderCountdown() {
  const difference = Math.max(0, DEADLINE - new Date());
  const days = Math.floor(difference / 86400000);
  const hours = Math.floor((difference % 86400000) / 3600000);
  const minutes = Math.floor((difference % 3600000) / 60000);
  const seconds = Math.floor((difference % 60000) / 1000);
  $("countdown").textContent = difference
    ? `${days} Tage · ${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
    : "Deadline erreicht";
}
function renderLobbyStats() {
  const chance = probability(personalCount) * 100;
  $("lobby-count").textContent = formatNumber(personalCount);
  $("lobby-probability").textContent =
    `${chance.toLocaleString("de-DE", { maximumFractionDigits: 4 })} %`;
  $("lobby-daily").textContent =
    `${formatNumber(dailyNeeded(personalCount))} Kisten / Tag`;
}
async function refreshLobbyStats() {
  const url = ($("server-url").value.trim() || "http://localhost:3000").replace(
    /\/$/,
    "",
  );
  try {
    const response = await fetch(`${url}/profile/${playerId}`);
    if (!response.ok) return;
    const profile = await response.json();
    if (Number.isSafeInteger(profile.count)) {
      personalCount = profile.count;
      localStorage.setItem("personal-count", String(personalCount));
      renderLobbyStats();
    }
  } catch {
    /* Der Server kann vor dem ersten lokalen Start noch nicht laufen. */
  }
}

function render(room) {
  const p = probability(room.total);
  const me = room.members.find((member) => member.id === playerId) || {
    count: 0,
  };
  const myP = probability(me.count);
  personalCount = me.count;
  localStorage.setItem("personal-count", String(personalCount));
  $("counter").textContent = formatNumber(room.total);
  $("probability").textContent =
    `${(p * 100).toLocaleString("de-DE", { maximumFractionDigits: 4 })} %`;
  $("formula").textContent =
    `bei ${formatNumber(room.total)} unabhängigen Kisten · 1 : ${formatNumber(DROP_RATE)} pro Kiste`;
  $("meter-fill").style.width = `${Math.min(p * 100, 100)}%`;
  $("one-in").textContent =
    p > 0 ? `1 : ${formatNumber(Math.round(1 / p))}` : "—";
  $("remaining").textContent = formatNumber(
    Math.max(0, DROP_RATE - room.total),
  );
  $("my-counter").innerHTML = `${formatNumber(me.count)} <span>Kisten</span>`;
  $("my-probability").textContent =
    `${(myP * 100).toLocaleString("de-DE", { maximumFractionDigits: 4 })} %`;
  $("my-share").textContent = room.total
    ? `Du hast ${((me.count / room.total) * 100).toLocaleString("de-DE", { maximumFractionDigits: 1 })} % der Squad-Kisten geöffnet.`
    : "Öffne deine erste Kiste für die Squad.";
  $("my-daily").textContent =
    `${formatNumber(dailyNeeded(me.count))} Kisten / Tag`;
  $("squad-daily").textContent =
    `${formatNumber(dailyNeeded(room.total))} Kisten / Tag`;
  $("online-count").textContent =
    `${room.members.filter((m) => m.online).length} online`;
  $("members").replaceChildren(
    ...room.members
      .sort((a, b) => b.count - a.count)
      .map((member) => {
        const row = document.createElement("div");
        row.className = "member";
        const chance = probability(member.count) * 100;
        row.innerHTML = `<span class="avatar ${member.online ? "is-online" : ""}">${member.name.charAt(0).toUpperCase()}</span><span class="member-name">${member.name}${member.id === playerId ? " <em>Du</em>" : ""}<small>${chance.toLocaleString("de-DE", { maximumFractionDigits: 4 })} % eigene Chance</small></span><strong>${formatNumber(member.count)}</strong>`;
        return row;
      }),
  );
}

function join() {
  const name = $("name").value.trim();
  const code = $("room-code").value.trim();
  const url = $("server-url").value.trim() || "http://localhost:3000";
  if (!name || !code) return setError("Bitte Name und Raumcode eintragen.");
  settings.forEach((key) => localStorage.setItem(key, $(key).value.trim()));
  setError();
  socket?.disconnect();
  socket = io(url, { transports: ["websocket", "polling"], timeout: 7000 });
  socket.on("connect_error", () =>
    setError("Server nicht erreichbar. Prüfe die Server-Adresse."),
  );
  socket.on("room:update", render);
  socket.on("connect", () =>
    socket.emit("room:join", { name, code, playerId }, (response) => {
      if (!response.ok)
        return setError(response.error || "Raum konnte nicht betreten werden.");
      joined = true;
      $("room-label").textContent = response.room.code;
      $("join-screen").hidden = true;
      $("tracker-screen").hidden = false;
      render(response.room);
    }),
  );
}

$("join-button").addEventListener("click", join);
["name", "server-url", "room-code"].forEach((id) =>
  $(id).addEventListener("keydown", (event) => {
    if (event.key === "Enter") join();
  }),
);
$("server-url").addEventListener("change", refreshLobbyStats);
$("add-button").addEventListener("click", addChest);
$("leave-button").addEventListener("click", () => {
  socket?.disconnect();
  joined = false;
  $("tracker-screen").hidden = true;
  $("join-screen").hidden = false;
  refreshLobbyStats();
});
$("hotkey-button").addEventListener("click", () => {
  recordingHotkey = true;
  $("hotkey-button").textContent = "Taste drücken …";
});

window.addEventListener("keydown", async (event) => {
  if (recordingHotkey) {
    event.preventDefault();
    const value = prettifyKey(event);
    if (value && !["Ctrl", "Alt", "Shift", "Super"].includes(value)) {
      try {
        const response = await invoke("set_shortcut", { accelerator: value });
        if (!response.ok) {
          alert(response.error);
          $("hotkey-button").textContent = hotkey;
          return;
        }
        hotkey = value;
        localStorage.setItem("hotkey", hotkey);
        $("hotkey-button").textContent = hotkey;
        recordingHotkey = false;
      } catch (err) {
        console.error("Fehler beim Setzen des Shortcuts:", err);
      }
    }
  }
});

async function initTauriListeners() {
  try {
    await listen("hotkey_pressed", () => addChest());
    await invoke("set_shortcut", { accelerator: hotkey });
  } catch (err) {
    console.error("Fehler beim Initialisieren der Tauri-Listener:", err);
  }
}

initTauriListeners();
renderCountdown();
renderLobbyStats();
refreshLobbyStats();
setInterval(renderCountdown, 1000);
