# SOLARA HEAT

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/vr23zone/gta6-01/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/vr23zone/gta6-01/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

A complete open-world crime game in the browser, built from scratch with
three.js and plain JavaScript. One original sun-soaked coastal city, one
debt, five story missions, and every cop in Solara Bay between you and
Friday.

**Play it:** open `game/index.html` in desktop Chrome. It runs fully
offline — the only library (three.js) is vendored under `game/vendor/`.

## The game

Nico Vega owes the Marina Crew **$10,000, due Friday**. Fixer Sol Marín
has work: steal, run, shoot, and race your way out of the debt across
Solara Bay — a procedural 8×8-block city with a marina, a container
docks, a park, beaches, and a coast road built for checkpoint sprints.

- **A living city** — lane-following traffic that brakes, yields, and
  flees; pedestrians who stroll, panic, and dive out of the road; a
  wanted system with line-of-sight police who chase on foot and by car,
  box you in, and bust you if they hold you.
- **Five story missions** — *First Wheels* (steal a coupe), *Hot Package*
  (a delivery under a two-star tail), *Costa Sprint* (8 checkpoints down
  the coast road), *Dockside Trouble* (a pistol shootout at Muelle 9),
  *The Big Score* (a four-star bank run and a hideout escape) — then
  endless courier fares once the debt is cleared.
- **Full crime sandbox** — steal any parked or moving car, run combat on
  foot with a hitscan pistol (tracers, muzzle flash, guard AI that
  strafes and takes cover behind containers), pick up cash, health, and
  armor, and get **wasted** or **busted** with fines that bite.
- **The whole HUD** — cash, health/armor, a live round minimap with
  police/traffic/guard blips and an edge-clamped objective marker,
  wanted stars, speedometer, dialogue boxes, mission banners, and a
  pause screen. Progress auto-saves to localStorage.
- **All-synthesized audio** — engine, sirens, gunshots, pickups, and a
  sunset pad, generated with Web Audio. No audio files.

## Controls

| Input | Action |
|---|---|
| W A S D / arrows | Move / drive |
| Mouse | Orbit camera |
| F or Enter | Enter / steal / exit a car |
| E | Talk / interact |
| Shift | Sprint |
| Left mouse (armed) | Shoot |
| R | Reload |
| P or Esc | Pause |
| M | Mute |

## Tech notes

- `game/src/` is split into single-job modules named for what they do:
  `city.js` builds the world, `vehicles.js` / `player.js` /
  `pedestrians.js` / `police.js` / `combat.js` run the actors,
  `missions.js` owns the story, `hud.js` + `minimap.js` draw the
  interface, `audio.js` synthesizes every sound, `shots.js` stages the
  screenshots.
- Everything is procedural: canvas-painted building facades and signs,
  seeded-RNG city layout, instanced palms and lamps, zero image or
  audio assets.
- `main.ts` (Node 22, stdlib only) copies `game/` + `screenshots/` to
  the output directory and writes the submission dossier.

## License

MIT — see `LICENSE`.
