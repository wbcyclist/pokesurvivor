# Local network co-op

## Start and join

Install Node.js 22 or later on one computer. Keep the complete game directory,
including `assets/`, the generated pages, and `version.json`.
Run these commands from the repository root:

```bash
npm ci
npm run start:lan
```

The first command needs internet access to install `ws`. Later starts and games
need only the local network. The server listens on port 8765 on all IPv4 interfaces.
The terminal prints a localhost URL and the computer's network URLs.

1. Connect all devices to the same network. Open the same network URL on each.
2. Select **Play as guest**. Complete the starter selection if this is a new save.
3. Open **Local network**, enter a display name, and select **Create room**.
4. Share the six-character room code and the network URL shown in the lobby.
   The link also fills the room code when the other player opens Local network.
5. Other players enter their names and select **Join**. The host can start with
   two to four players. Each player uses their own selected Pokemon and upgrades.

Use the network address on other devices; `localhost` points to the device that
opens it. If several addresses appear, use the one for the shared Wi-Fi or Ethernet
network. Keep the server terminal open and the host's game in the foreground.

To change the port or bind address:

```bash
npm run start:lan -- --port 9000
npm run start:lan -- --host 127.0.0.1 --port 8765
```

The second command permits connections only from this computer. Stop the server
with Ctrl-C. This service is for a trusted private network, not public hosting.
It serves game resources, not repository metadata, tools, tests, or private files.

## Develop with automatic reload

```bash
npm run dev:lan
# Use a different port if the normal LAN server is still running:
npm run dev:lan -- --port 9000
```

Open the printed URL on every device. Development mode loads `dev.html` and the
individual source scripts, so frontend edits do not need a build. The default
homepage redirects to this entry. Localized game URLs also load the source page
while keeping their language path and room code. The same `--host` and `--port`
options work for both LAN commands.

- Changes to `dev.html`, JavaScript sources in `js/`, styles in `css/`, and images
  or fonts in `assets/` reload all connected browsers after a short debounce.
- Changes to JavaScript in `server/`, `js/data/pokedex.js`, or `version.json`
  restart the server. The last two files are read at server startup. Browsers wait
  for the server to return before reloading. If a server edit has a syntax error,
  fix it and save again; the watcher stays running.
- Reload ends active runs through the normal quit/save path and closes rooms.
  Create a new room after the reload. This is a full page reload, not stateful HMR.
- Generated `js/app.min.js` and HTML pages, tests, logs, and temporary files do not
  trigger frontend reloads. Editing `tools/dev-lan.js` itself requires restarting
  the command. This workflow does not generate release files or static guide pages.
- Ctrl-C stops the watcher and its server process. `npm run start:lan` continues
  to serve the generated release files without a watcher or reload connection.

## Room and save behavior

- The existing co-op rules still apply. The host simulates enemies, drops, team
  progress, and the run clock. Each player controls their own Pokemon.
- The local server manages rooms and forwards ordered WebSocket messages. It
  does not use Firebase, STUN, TURN, cloud accounts, or online leaderboards.
- Rooms allow at most four players. Only the host can start. Joining a running
  game is blocked. There is no host migration or in-progress reconnect.
- A guest who disconnects leaves the team. If the host disconnects, the remaining
  players finish the run with their earned progress. A broken network connection
  can take about 10–15 seconds to be detected.
- After a run, each player must return from the summary to the lobby before the
  host can start again. A departing host closes the room. Create a new room to
  choose another host.
- Guest progress remains in each browser's local storage. It is tied to the URL's
  host and port. Switching between localhost and a LAN IP uses a different save.
  This service does not import or merge saves from the public website.
- Touch and keyboard controls work over local HTTP. Browsers can restrict gamepad
  access to HTTPS or localhost, so gamepads may be unavailable on remote devices.

## Implementation

`server/lan-server.js` serves the game and accepts same-origin WebSocket upgrades
at `/lan`. Its HTML responses enable LAN mode before the game loads. Ordinary
static hosting and file entry points keep their existing behavior. The browser
uses its native WebSocket API; only the Node server depends on `ws`.

`js/net/lan.js` implements the existing `G.Net` contract and local room operations.
`G.Social` delegates room state and lifecycle calls when LAN mode is enabled.
`G.Coop` retains the existing combat protocol. The server assigns player IDs,
validates room membership, starts all players from one configuration, and rejects
frames from another room or run. A return-to-lobby flag prevents a new run from
starting while a player is still viewing the previous summary.

The server checks the protocol and generated build version. Reload all players
after an update, and restart the local server after rebuilding. It limits payload
size, queued bytes, request rate, clients, and rooms. Slow peers disconnect instead
of silently losing combat events. Rooms are held only in memory.

## Troubleshooting and checks

- If a page does not open, check the printed IP and port. Allow incoming Node.js
  connections in the host's firewall. Guest Wi-Fi, client isolation, and some VPNs
  prevent devices from reaching each other; use a shared network that allows it.
- If the port is in use, stop the existing service or choose another port.
- If room creation fails, keep the terminal open and reload the page from its URL.
  A plain static HTTP server supports solo play but does not provide LAN rooms.
- If the game pauses for everyone, return the host's browser to the foreground.
  Mobile operating systems may suspend background browser tabs.
- If Start remains disabled after a run, return every player to the lobby or have
  the absent player leave the room.

```bash
npm test
node tools/build.js
node tools/export_data.js
python3 tools/make_seo_pages.py
```

The automated LAN tests use real local HTTP and WebSocket connections. They cover
four-player capacity, start authority, version mismatch, cross-room isolation,
ordered frame delivery, disconnects, and repeated runs. Browser checks should also
cover guest entry, movement and enemies on both sides, level choices, run summaries,
and mobile layout. A same-computer browser test does not verify a physical phone's
Wi-Fi, touch controls, background suspension, or firewall access.
