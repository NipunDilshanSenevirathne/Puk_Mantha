# Credits, licenses, and asset scope

This file describes the origins of included material. It does **not** grant a blanket license to the game or user-supplied media. No overall open-source license has been selected for this repository.

## User-supplied material

| Material | Repository location | Notes |
| --- | --- | --- |
| 13 character photographs | `public/assets/face-0.jpg` through `face-12.jpg` | Supplied for the project; name-to-file mapping is in the README and `src/shared.js`. |
| Background sounds.mp3 | `public/assets/background.mp3` | Supplied music/audio, used as a looping background track. |
| IF we lost the game play this.mp3 | `public/assets/lose.mp3` | Supplied defeat audio. |
| Game name and character names | UI, README, `src/shared.js` | Supplied by the project requester. |

Ownership and redistribution permissions for the supplied photos/audio have not been independently established by this package. Inclusion does not transfer those rights. Obtain the appropriate permission before public publication or redistribution. The original full JPG assets remain downloadable even though the game renders only masked head regions.

## Project-created assets

- `public/assets/lagoon-hero.png`: original generated tropical hero artwork created for this game.
- `public/assets/course-*.svg`: original vector destination illustrations.
- Cartoon bodies, raft, environmental geometry, and particle effects: programmatic scene assets in `src/render.js`.
- Fart effects and chimes: procedural Web Audio synthesis in `src/client.js`.
- `docs/diagrams/*.svg`: original editable documentation diagrams.
- `docs/images/home.png`: screenshot of the game landing page; it depicts the game's included assets.

The uploaded design reference and research reports informed the project but are not bundled as third-party redistributable content. No Steam game binaries or extracted Steam game assets are included. The reference game is credited as inspiration, without implying affiliation or endorsement.

## Three.js

Three.js is distributed under the MIT license. The unmodified notice is included at [docs/licenses/three-LICENSE.txt](docs/licenses/three-LICENSE.txt). The build also copies the installed dependency's license to `dist/licenses/three.txt` for distribution with the browser bundle.

Project: [Three.js](https://threejs.org/) · Source/license: [mrdoob/three.js](https://github.com/mrdoob/three.js/blob/dev/LICENSE)

The MIT notice applies to Three.js. It does not license unrelated application code, photographs, or music.

## Fonts

The following self-hosted fonts include their original SIL Open Font License 1.1 notices. Keep each notice with its font when redistributing. Refer to the actual license text for its conditions, attribution, and any reserved font names.

| Font | Font file | Included notice |
| --- | --- | --- |
| Manrope | `public/assets/fonts/manrope.ttf` | [manrope-OFL.txt](public/assets/fonts/manrope-OFL.txt) |
| Nunito | `public/assets/fonts/nunito.ttf` | [nunito-OFL.txt](public/assets/fonts/nunito-OFL.txt) |
| Fredoka | `public/assets/fonts/fredoka.ttf` | [fredoka-OFL.txt](public/assets/fonts/fredoka-OFL.txt) |
| Noto Sans Sinhala | `public/assets/fonts/notosanssinhala.ttf` | [notosanssinhala-OFL.txt](public/assets/fonts/notosanssinhala-OFL.txt) |

## Development dependencies

esbuild, Wrangler, `ws`, and their transitive dependencies retain their own licenses in the packages installed by npm. `package-lock.json` identifies the resolved packages. They are not relicensed by this repository. Dependencies themselves are installed with `npm ci` and are not copied into this source-upload folder.

For redistribution beyond the existing static build/project package, review the notices of any additional dependencies or assets you add. This document is an inventory of the included material, not a warranty that every intended use is permitted.
