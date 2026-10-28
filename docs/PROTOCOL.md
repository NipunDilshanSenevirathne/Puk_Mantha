# Room protocol and state reference

This document describes version 1.1.0 as implemented in [worker.js](../src/worker.js) and [shared.js](../src/shared.js). It is a developer reference, not an API compatibility guarantee for future versions. For player instructions, see the [README](../README.md).

## Transport and authority

HTTP creates rooms and retrieves voice configuration. WebSocket carries JSON messages, including input, lobby actions, authoritative state snapshots, and WebRTC signaling. The server controls physics and results. Microphone audio uses WebRTC rather than this WebSocket.

A room code maps through `env.ROOMS.idFromName(code)` to a `GameRoom` Durable Object. State is in memory. A SQLite-backed class is provisioned, but the implementation does not persist a round or its players to storage.

## HTTP routes

| Method / path | Result |
| --- | --- |
| `POST /api/create` | Initializes a room and returns `{ "ok": true, "code": "ABCDEFGH" }` on success. |
| WebSocket upgrade at `/api/room/ABCDEFGH?character=2` | Creates a new participant in an available lobby. |
| WebSocket upgrade at `/api/room/ABCDEFGH?token=RECONNECT_TOKEN` | Restores an existing valid participant. |
| `GET /api/room/ABCDEFGH/ice?token=RECONNECT_TOKEN` | Returns `{ "iceServers": [...], "relay": true/false }` for an active participant. |
| Other `/api/*` paths | JSON not-found response. |
| Non-API paths | Forwarded to the static `ASSETS` binding. |

Codes are eight characters generated from `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`. The API route regex accepts eight uppercase letters or digits 2–9; only generated codes identify initialized rooms. Generation retries up to three times if initialization reports a collision. `/init` is an internal Durable Object request and is not a public Worker endpoint.

If an Origin header is present on an API request, it must equal the URL's origin. JSON responses use `Cache-Control: no-store`. A missing Origin header is not rejected, so this check is not account authentication.

### HTTP failures

| Status | Typical cause |
| ---: | --- |
| 403 | Mismatched Origin; invalid/expired reconnect token; unauthorized ICE request |
| 404 | Unknown route; room not initialized or expired |
| 405 | Non-GET request to the ICE endpoint |
| 409 | Room full; new entrant during play/results; invalid race-seat reservation; initialization collision internally |
| 426 | Room connection did not request a WebSocket upgrade |
| 503 | Room-code creation exhausted its collision retries |

These are HTTP statuses before a socket is accepted. Browser WebSocket APIs may expose only a connection failure rather than the JSON error text. The game's UI therefore also gives general guidance about codes, capacity, and lobby state.

## Connection handshake

Successful WebSocket upgrade returns status 101. The first application message is:

```json
{
  "type": "welcome",
  "id": "player-uuid",
  "token": "private-reconnect-uuid",
  "host": "host-player-uuid"
}
```

The server then broadcasts a state snapshot. The `token` is a bearer credential for that seat; do not log it into public issues or expose it in an invite link. Invite links contain the room code, not this token.

A newly requested character must be a free valid roster ID. If it is invalid or already taken on initial join, the server chooses the first unused ID. A later `select` request for a taken character returns an error rather than silently switching.

## Client-to-server messages

| Type | Fields besides `type` | Rules |
| --- | --- | --- |
| `input` | `x`, `z`, `fire`, optional `power` | Finite numeric x/z in [−1,1]; normalized; zero/very small vector defaults forward. `fire` is true only when exactly `true` and a round is playing. Power accepts 0.6, 1, 1.4. |
| `select` | `character` | Integer roster ID; unique in room; ignored while playing. Clears this player's readiness. |
| `ready` | `ready` | Boolean; ignored while playing. |
| `level` | `level` | Host only, not playing; accepts 0, 1, 2. A changed value clears round, teams, and readiness. |
| `mode` | `mode` | Host only, not playing; `trial`, `free`, or `race`. A changed value clears round, teams, and readiness. |
| `start` | None | Host only, not playing; at least two active participants. Race needs exactly two or four. Fresh lobby guests must be ready. Completed-round rematches skip the lobby readiness requirement. |
| `lobby` | None | Host only, not playing; clears completed state, readiness, firing, and teams. |
| `voice` | `on` | Boolean voice presence; this is not microphone audio. |
| `signal` | `to`, `data` | Destination must be another connected seat in the same room; validated offer/answer or ICE candidate payload. |
| `emote` | `index` | Integer 0–3; more than 1.5 s between accepted emotes per player. |
| `leave` | None | Removes the seat, migrates host if needed, and closes its socket. |

Unknown message types and many invalid field values are ignored. Some invalid user actions return a `type: "error"` message. Clients should use received state as authority instead of assuming that sending a command made it succeed.

### Input example

```json
{"type":"input","x":0.70710678,"z":0.70710678,"fire":true,"power":0.6}
```

This requests a gentle diagonal burst toward positive x/z. The client cannot set its own position, hull, gas, team, elapsed time, or winner through this message.

## Server-to-client messages

| Type | Data |
| --- | --- |
| `welcome` | Current player's `id`, reconnect `token`, and `host` ID |
| `state` | `host`, `level`, `mode`, `state`, and `players` |
| `error` | Human-readable `error` string |
| `signal` | Sender ID in `from` and its validated `data` |
| `emote` | Character ID in `from` and one of the four server-selected text strings |

Note the differing meaning of `from`: `signal.from` is a participant UUID; `emote.from` is a numeric character ID.

## State shapes

### Snapshot envelope

```json
{
  "type": "state",
  "host": "host-player-uuid",
  "level": 0,
  "mode": "trial",
  "state": null,
  "players": []
}
```

`state: null` means lobby. The empty array above illustrates the envelope shape; a live populated room includes player objects.

### Participant fields

| Field | Meaning |
| --- | --- |
| `id` | Stable UUID for this room seat |
| `character` | Numeric roster ID |
| `team` | `null` in co-op/lobby; 0 for Papaya or 1 for Mint during a race |
| `power` | Selected 0.6, 1, or 1.4 thrust |
| `gas` | Personal remaining gas |
| `aimX`, `aimZ` | Normalized direction |
| `fire` | Current firing intention after server safety checks |
| `shots` | Successful bursts this round |
| `voice` | Announced voice-enabled/unmuted presence |
| `ready` | Lobby ready flag |
| `connected` | Whether the socket is currently active |
| `cooldown` | Remaining burst cooldown, present once initialized during play |

Disconnected reservations remain in the roster with `connected: false` until removed. Reconnect tokens and socket handles are not part of broadcast player records.

### One-raft round

Time Trial and Free Sailing use the raft state directly:

```text
level, mode, phase, roundId
x, z, vx, vz, angle, spin
hull, time, elapsed, checkpoint, beans, combo, lastHit
puffs[], collected[], events[], seq
```

- `phase` is `playing`, `won`, or `lost`.
- `time` counts down in trial and is `null` in free mode.
- `puffs` contain recent burst IDs, world positions, timing, directions, and character IDs; old entries are removed after 1.5 seconds.
- `collected` contains bean indices already picked up by that raft.
- `events` contains current-step effects such as `bean`, `checkpoint`, and `bonk`.
- `roundId` is generated at launch and helps the client avoid counting a result twice.

### Race wrapper

```text
{
  mode: "race",
  level: 0 | 1 | 2,
  phase: "playing" | "won" | "lost",
  winner: null | 0 | 1,
  elapsed: number,
  roundId: string,
  boats: [raftForPapaya, raftForMint]
}
```

Each boat uses trial-style physics and has its own `phase`, hull, countdown, and pickup collection. The wrapper's `winner: null` with `phase: "won"` represents a tied finish; `winner: null` while playing does not mean a draw yet. Both failing sets the wrapper phase to `lost`.

## Timers and connection safety

- Nominal simulation interval: 50 ms; delta clamped to 0.1 s.
- Stale-input cutoff: 700 ms; firing is cleared.
- Reconnect reservation: 20,000 ms.
- Maximum room lifetime: 4 hours from initialization.
- Per-client incoming allowance: 70 messages per one-second counter window. Excess messages are ignored, not queued indefinitely.
- Maximum accepted raw message length: 20,000 JavaScript string characters, not a separately measured byte limit.
- Messages must be strings containing JSON objects, not binary data, arrays, or null.

Reconnection replaces the socket before closing the previous one. Event handlers compare the current socket and membership, preventing stale close/message events from removing or controlling the restored seat. A previous socket is closed with `Reconnected elsewhere`; expired rooms use `Room expired`.

During lobby and results, state broadcasts occur after relevant changes. During active play they occur each simulation tick. This implementation uses regular accepted WebSockets and an interval, not the Durable Object WebSocket hibernation API.

## WebRTC signaling and TURN

`signal.data` contains either `description` with type `offer` or `answer` and an SDP string, or a `candidate` object with a candidate string. The server validates the broad shape and destination, then forwards the payload. It does not parse SDP into game state.

The client uses stable participant IDs to choose an offerer, serializes peer negotiation, buffers early ICE candidates, and closes departed peers. Tests use mocked media and peer APIs; they do not establish a physical microphone call.

The ICE endpoint requires the token of a currently connected seat. When both server secrets exist, the server calls Cloudflare's TURN credential-generation API with `ttl: 3600` and an eight-second request timeout. A response must contain a TURN/TURNS URL to be treated as relay-capable. Otherwise it returns STUN fallback.

Successful configurations are cached for 30 minutes per seat; fallback for 30 seconds. Concurrent credential requests for a seat share one pending request. A client receives temporary ICE credentials, never the long-lived TURN API secret. There is no periodic long-session ICE credential refresh in the current voice client.

## Extending the protocol

Update worker validation, client handling, shared physics where relevant, and tests together. Keep state-authority decisions on the server. If a future change introduces persistence, accounts, more players, manual team selection, or new message types, document the migration and compatibility expectations explicitly.
