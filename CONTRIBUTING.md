# Maintaining Pukමන්තා

Start with the [README](README.md) and [protocol reference](docs/PROTOCOL.md). The project is vanilla JavaScript; source changes belong in `src/` and `public/`, not generated `dist/` files.

## Local workflow

1. Install Node 22+ and run `npm ci`.
2. Run `npm run dev` and open http://localhost:8787.
3. Make a focused change and update documentation when behavior changes.
4. Run `npm run check` for tests, a production build, asset checks, and a deployment dry run.
5. For room/protocol changes, keep a local server running and execute `npm run test:rooms` in a second terminal.

Use separate fresh browser sessions to exercise multiple players. Do not reuse a reconnect token as though it were another participant.

## Verification by change type

| Change | Useful checks |
| --- | --- |
| Documentation | Relative links, diagrams, screenshots, paths, command accuracy, and ownership statements |
| Page layout | Desktop and narrow portrait/landscape views; keyboard focus; touch targets; no clipped controls |
| Controls | Held inputs, blur, hidden tab, modal dialogs, remapping, restored defaults, actual gamepad if available |
| Physics | Unit tests and full-course ordinary-input playthroughs for different crew sizes |
| Multiplayer | Ready checks, role restrictions, room capacity, fresh join vs reconnect, host migration, races |
| Voice | Mocked negotiation tests plus real two-device audio across different networks, mute and leave behavior |
| Assets | Build, asset validator, appearance/audio inspection, correct paths and license notices |
| Deployment | Wrangler dry run and, when authorized, an account deployment and HTTPS smoke test |

Passing automated tests does not establish physical mobile compatibility or actual microphone audio. Report what was checked and what remains unverified.

## Repository rules

- Keep `package-lock.json` committed; use `npm ci` for reproducible installs.
- Keep credentials, `.dev.vars`, `.env*`, `.wrangler`, `node_modules`, generated `dist`, and local logs out of commits.
- Do not place credentials in screenshots, error reports, URLs, or client bundles.
- Preserve the supplied character-name spelling and numeric asset mapping unless deliberately changing the roster.
- Preserve third-party license notices. Do not assign a blanket license to supplied photographs or music.
- Changes to room size, persistence, or Durable Object class names need coordinated design/configuration/test changes.
- Keep input and gameplay authority on the server in multiplayer.
- Document new user-facing behavior in the README and protocol changes in `docs/PROTOCOL.md`.

The included CI workflow runs on pushes and pull requests, installs the lockfile, performs `npm run check`, starts a local Worker, and runs room integration. It does not publish to Cloudflare. Do not add deployment credentials to a pull-request workflow.

## Release workflow

Run `npm run package` after the checks pass. The packager explicitly includes source, public assets, generated build, tests, scripts, documentation, repository configuration, and deployment helpers. It rejects private file paths and symlinks, writes a per-file checksum manifest, and creates a ZIP checksum sidecar.

If adding a new root documentation or configuration file, update the allowlist in `scripts/package.mjs` so future release ZIPs include it. Avoid bundling local test logs or scratch documents.

Before distributing a release, extract it into a fresh directory, install with `npm ci`, and run the documented checks. Keep verification dates and limitations accurate in the release notes. Only claim deployment success after checking the actual deployment output.
