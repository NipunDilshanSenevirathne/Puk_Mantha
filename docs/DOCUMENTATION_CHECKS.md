# GitHub source package verification

Prepared on **28 October 2026** for game version **1.1.0**. This is a documentation and repository-packaging update. It does not change game rules or claim a new account deployment.

## Checks performed

| Area | Result / scope |
| --- | --- |
| Source review | README and protocol details checked against the six source modules, configuration, command scripts, asset files, and existing tests. |
| Automated game tests | **85 passed, 0 failed** using Node 24.16.0 with `node --test --test-isolation=none tests/*.test.js`. The in-process option was used because this environment blocks child-process spawning. |
| Fresh browser bundle | Compiled the prepared client source using the installed esbuild executable with the production bundle/minify/ES module/ES2022/legal-comment options from `scripts/build.mjs`. |
| Bundle comparison | The fresh `game.js` SHA-256 matches the previously verified release: `5c40484065b0e436b42f173db3dfa794aaf2bfe301f7b067c162465e8083b6f1`. |
| Static assets | `node scripts/check-assets.mjs` passed: 33 deployable files, 13 local HTML/CSS references resolved, and public files match the prepared build. |
| Diagrams | Four self-contained SVGs rendered to PNG for visual inspection. Text, connectors, padding, and labels reviewed. |
| Screenshot | Reused the existing actual release home-page screenshot. It was inspected; it is not a newly captured gameplay image. |
| Documentation paths | Local Markdown links, README section anchors, image references, and referenced license files checked before copying the final package. |
| Source-package hygiene | Source, public assets, tests, helpers, docs, and repository configuration included. Dependencies, generated build, caches, local logs, credentials, and Git metadata excluded from the GitHub upload folder. |
| Release packaging | Updated the explicit release allowlist to include the documentation and GitHub files. The packager's ZIP entries and checksum manifest checked using the prepared production build. |
| Final delivery | The copied folder's file list and SHA-256 hashes checked against the prepared source package. |

## What was not rerun here

The normal Wrangler launcher and its esbuild subprocess failed with `spawn EPERM` in this restricted environment. Consequently, a new Wrangler deployment dry run and live room integration were **not** completed on 28 October. The ordinary `npm run build` wrapper was not reported as passing; the browser bundle was compiled directly and its assets checked as described above.

The 23 October game release had already passed its production build, Wrangler dry run, four-client room integration, and two-tab browser race/reconnect check. That historical record is retained in [VERIFICATION.md](../VERIFICATION.md), with its original date. No gameplay source or public game asset changed in this documentation update.

The browser-capture tool was unavailable for fresh screenshots during this documentation pass, so the included home screenshot comes from the verified release. The documentation adds original explanatory diagrams, not simulated gameplay screenshots.

The GitHub workflow file is ready to run on a remote repository but has not yet run there. No GitHub push, Cloudflare login, production deployment, physical-phone test, real-controller test, or cross-network microphone test was performed as part of this documentation task.

## Reproduce the full project checks

In a regular permitted shell with Node 22+:

```sh
npm ci
npm run check
```

Then start `npm run dev` and, from a second terminal, run `npm run test:rooms`. On the deployed HTTPS site, verify microphone audio between two physical devices on different networks with TURN configured.

See the [README](../README.md) for setup and [CONTRIBUTING.md](../CONTRIBUTING.md) for the release workflow.
