# SOLARA HEAT

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/vr23zone/gta6-01/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/vr23zone/gta6-01/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

An open-world crime game that plays in a desktop browser, written from
scratch in plain JavaScript on a vendored three.js. An original coastal
city at golden hour, a courier with a debt, and five jobs between him
and Friday.

**Play it:** serve `game/` with any static server (or run
`node serve.ts` and open http://localhost:8080). It plays fully offline:
the only library, three.js, sits in `game/vendor/`, and there is not one
image or audio file in the game — every texture is painted on a canvas
at boot and every sound is synthesized with Web Audio.

## The story

**Nico Vega** owes the Marina Crew **$10,000, due Friday**. Fixer
**Sol Marín** feeds him the work that pays it off, across Solara Bay —
an 8×8-block procedural city with the Muelle 9 container docks, a
marina, Plaza Verde park, the Banco Solara downtown, a beach, a pier,
and a coast road that begs to be raced.

1. **First Wheels** — steal the red coupe from the marina lot and park
   it at your garage, under the law's nose.
2. **Hot Package** — carry a package from the docks gate to a buyer at
   Plaza Verde with a two-star tail and a clock.
3. **Costa Sprint** — eight checkpoints down the coast road, one timer.
4. **Dockside Trouble** — clear six armed guards at Muelle 9 and take
   the cash case.
5. **The Big Score** — rob Banco Solara at four stars and escape to the
   hideout. Then the debt is done, and endless courier fares remain.

## What's in the world

- **Traffic with somewhere to be** — cars follow right-hand lanes,
  turn at intersections, and brake for whatever is ahead of them,
  including you. Parked cars line the kerbs. All of them can be stolen;
  whether it becomes a crime depends on who saw it.
- **A crowd** — forty pedestrians stroll the block perimeters, cross at
  corners, and panic, run, or dive flat when shots ring out or a car
  mounts the pavement.
- **Police who hunt by eyesight** — heat becomes stars, stars become
  interceptors. Cop cars box you in; officers on foot run you down and
  fill the bust meter by holding you. Break line of sight — it is
  tested honestly against the buildings — and the heat bleeds away.
- **A pistol and people who shoot back** — hitscan combat with tracers
  and muzzle flash; dock and bank guards strafe around cover, reload
  behind it, and drop their cash where they fall. Medkits and armour
  vests wait at known corners.
- **The full instrument panel** — cash and debt, wanted stars, health
  and armour, a speedometer, a live round minimap (traffic, police,
  guards, and a gold objective diamond that clamps to the rim),
  dialogue, mission banners, a bust meter, pause, and wasted/busted
  screens with fines. Progress auto-saves to localStorage.

## Controls

| Input | Action |
|---|---|
| W A S D / arrows | Move / drive |
| Mouse (pointer locked) | Look |
| Left mouse | Shoot |
| E | Enter / exit a car, advance dialogue |
| Shift | Sprint on foot |
| Space | Handbrake |
| P | Pause |

## How it is built

`game/src/` is one file per job, named for it: `config.js` holds the
city grid and the story's numbers; `city.js` builds the world and its
collision list; `vehicles.js` makes the cars and drives the traffic;
`people.js` makes the figures and walks the crowd; `player.js` is Nico
and the camera; `police.js` is the wanted system; `combat.js` is the
shooting; `missions.js` is the story; `hud.js` and `minimap.js` are the
interface; `audio.js` synthesizes the engine, the sirens, the shots
and the sunset pad; `save.js` keeps the auto-save; `shots.js` stages
the four screenshots in `screenshots/` (open the game with
`?shot=cover&seed=7` and friends to see them posed). The layout is
seeded, so the city is the same city on every visit.

`main.ts` (Node 22, standard library only) hands the entry in: it
copies `game/` and `screenshots/` to the output directory and writes
the dossier with the kit's vendored library.

## License

MIT — see `LICENSE`.
