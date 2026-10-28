# Pukමන්තා 1.1.0 — release verification

Verified locally on 23 October 2026.

## Completed checks

- 85 automated tests passed: authoritative physics, complete course playthroughs, room authorization and lifecycle, reconnects, host migration, all three modes, race results, controls, local records and mocked WebRTC negotiation.
- Local Wrangler WebSocket integration passed with four independent clients. Checked room capacity, unique characters, ready checks, mode changes, malformed inputs, shared movement, free mode, independent race boats, reconnect identity/team preservation and voice signaling/credential authorization.
- A two-tab browser race was created through the actual UI. The guest readied up, both entered the round, each saw the same race progress, and reloading the guest restored its original team.
- Desktop landing, character selection and gameplay inspected in the browser. Portrait 390px and landscape 844px layouts inspected through browser frames; these are viewport checks, not physical phone tests.
- Solo propulsion, settings, keyboard remapping, restored default controls and modal pause behavior checked through the UI.
- Required artwork, all thirteen photos, both supplied MP3 files, locally hosted fonts and licenses validated. Local HTML/CSS asset references resolve.
- Fresh production build and Cloudflare Wrangler deployment dry run passed with the `ROOMS` Durable Object and `ASSETS` bindings.

## Complete-course simulation results

The controller only sets ordinary aim/fire inputs at normal thrust. It does not modify raft position, gas, hull, pickups or timers. It plans around moving obstacles and rotates available crewmates' bursts.

| Course | Solo | Two players | Four players | Time limit |
| --- | ---: | ---: | ---: | ---: |
| Beanwater Bay | 67.10s | 53.25s | 51.20s | 150s |
| Curry Rapids | 86.70s | 73.45s | 71.70s | 180s |
| The Final Flush | 114.95s | 87.00s | 84.40s | 210s |

## Deployment and device checks remaining

The ZIP is ready for the included Cloudflare Workers deployment workflow. Deployment into your own account requires your Cloudflare login. A static Pages upload alone does not create the multiplayer room server.

Actual microphone audio between physical devices, restrictive mobile networks, Safari/iOS behavior, real gamepad hardware and long-duration load have not been verified in this environment. Configure the TURN secrets described in README.md and perform a two-device voice check on the deployed HTTPS site. The supplied ZIP contains no TURN credentials.

Rooms are intentionally temporary and reset on a deployment or Worker restart. Browser records and cosmetic unlocks are local to each device. The game is an original browser adaptation inspired by the supplied research, with its own controls and physics; it does not implement Steam Remote Play or the reference game's eight-player modes.
