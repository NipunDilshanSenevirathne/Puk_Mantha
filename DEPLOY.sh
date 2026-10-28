#!/usr/bin/env sh
set -eu
cd "$(dirname "$0")"
node -e "if(Number(process.versions.node.split('.')[0])<22){console.error('Install Node.js 22 or newer from https://nodejs.org/');process.exit(1)}"
npm ci
npm test
npx wrangler login
npm run deploy
printf '\nOpen the HTTPS workers.dev address printed above. See README.md for TURN voice setup.\n'
