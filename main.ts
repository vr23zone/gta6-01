// Solara Heat — the hand-in program for the make.fun gta6-01 entry (Node 22,
// standard library only). The game itself is the static site under game/ — open
// game/index.html in a desktop browser and it plays, offline, from its own files.
// This program's one job is to hand that game in exactly as the bounty asks: copy
// game/ and screenshots/ into the output directory and write dossier.json there
// with the kit's vendored buildDossier, under the scorer's caps, so the dossier
// the judge reads is byte for byte the one the library makes from these files.
//
// Run it the way the grader does, or locally against a stand-in output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
// Play the game locally with: node serve.ts  (http://localhost:8080)

import { cpSync, existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const repoRoot = fileURLToPath(new URL('.', import.meta.url));
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(outDir, { recursive: true });
cpSync(join(repoRoot, 'game'), join(outDir, 'game'), { recursive: true });
mkdirSync(join(outDir, 'screenshots'), { recursive: true });
const shotsDir = join(repoRoot, 'screenshots');
if (existsSync(shotsDir)) {
  cpSync(shotsDir, join(outDir, 'screenshots'), { recursive: true });
}

// The caps are the scorer's own (the kit's gate): the dossier text is capped, an
// entry with more than four screenshots or one over 256 KiB is refused, and game/
// may hold at most 993 files and 48 MiB in all with no path over 1000 bytes.
const dossier = buildDossier(outDir, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
});
writeFileSync(join(outDir, 'dossier.json'), dossier);

// A maker's summary, so a local run says what it handed in: how many screenshots
// went out and how large the dossier is. The grader ignores stdout; humans don't.
const shotCount = existsSync(join(outDir, 'screenshots'))
  ? readdirSync(join(outDir, 'screenshots')).filter((n) => !n.startsWith('.')).length
  : 0;
console.log(`solara-heat: handed in game/ with ${shotCount} screenshots; dossier.json is ${dossier.length} bytes`);
