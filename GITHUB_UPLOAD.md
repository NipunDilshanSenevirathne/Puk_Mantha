# Upload Pukමන්තා to GitHub

This is the source folder. Upload its **contents**, keeping the directory structure, so that `README.md`, `package.json`, and `wrangler.jsonc` appear at the repository root.

1. Create an empty repository in your GitHub account.
2. Choose **Add file → Upload files**.
3. Add the files and directories in this folder. Do not upload just a ZIP: GitHub does not unpack it into source files.
4. Include hidden/dot files: `.github/`, `.gitignore`, `.gitattributes`, `.editorconfig`, and `.node-version`.
5. Commit, then check the README's images and the repository's **Actions** tab.

The photo and music assets are included. Repository visibility determines who can see committed files; it does not make a deployed website private. See [asset rights](THIRD_PARTY_NOTICES.md).

## Prefer Git for repeated updates

Run in this folder, replacing the example account/repository:

```sh
git init
git add .
git commit -m "Add Pukmantha game"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/pukmanta.git
git push -u origin main
```

This package has not already created a remote repository, committed under your identity, or pushed files.

## Local run

```sh
npm ci
npm run dev
```

Open http://localhost:8787 with Node 22+ installed. Windows users can use `START-GAME.cmd`.

## Cloudflare from GitHub

Connect the repository to **Cloudflare Workers Builds**:

| Setting | Value |
| --- | --- |
| Root | `.` |
| Node | 22+ |
| Build | `npm run build` |
| Deploy | `npx wrangler deploy` |
| Worker name | `pukmantha`, matching `wrangler.jsonc` |

The source generates `dist/` during the build. Keep the `ROOMS` Durable Object binding and migration in the configuration. A static Pages or GitHub Pages upload cannot provide multiplayer by itself.

Set `TURN_KEY_ID` and `TURN_API_TOKEN` as Worker secrets for voice relay compatibility. Do not commit credentials. The full [README](README.md) explains deployment alternatives, voice setup, gameplay, and troubleshooting.
