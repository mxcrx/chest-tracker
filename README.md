# Chest Hunt

Gemeinsamer, synchroner Kisten-Zähler für Fortnite-Squads. Die App zählt jede Kiste, weist sie der Person zu, die sie gezählt hat, und berechnet die kumulierte Chance für eine Drop-Rate von **1:137.500**.

## Lokal testen

```powershell
npm install
npm run server
# in einem zweiten Terminal
npm start
```

In der App als Server-Adresse `http://localhost:3000` verwenden. Alle Personen betreten mit demselben Raumcode denselben Live-Zähler.

## Server-Port festlegen

Standardmäßig läuft der Server auf Port `3000`. Du kannst beim Start einen anderen Port angeben:

```powershell
npm run server -- --port 3001
```

Alternativ wird die Umgebungsvariable `PORT` verwendet. Die Reihenfolge ist: `--port`/`-p`, dann `PORT`, dann `3000`. In der App muss die Server-Adresse denselben Port enthalten, z. B. `http://localhost:3001`.

## Raum zurücksetzen

Ein Reset ist absichtlich nicht in der App verfügbar. Im Terminal, in dem der Server läuft, `reset <RAUMCODE>` eingeben, zum Beispiel `reset SQUAD-2026`. Damit werden die Stände aller Mitglieder dieses Raums zurückgesetzt.

## Auf den VPS stellen

1. Node.js 20+ auf dem VPS installieren und dieses Projekt dorthin kopieren.
2. Im Projektordner `npm ci --omit=dev` ausführen.
3. Den Server dauerhaft starten, beispielsweise mit `PORT=3000 node server/index.js` oder `node server/index.js --port 3000` (oder mit systemd/pm2).
4. Einen Reverse Proxy mit HTTPS (z. B. Nginx oder Caddy) auf den lokalen Port `3000` leiten. WebSocket-Weiterleitung muss aktiviert bleiben.
5. In allen Desktop-Apps die öffentliche HTTPS-Adresse eintragen, z. B. `https://tracker.deinedomain.de`.

Alle Räume und persönlichen Kistenstände werden serverseitig in `server/data.json` dauerhaft gespeichert. Diese Datei gehört zum VPS-Backup und darf nicht öffentlich erreichbar sein.
