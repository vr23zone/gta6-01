// The crowd: Solara's walkers stroll the sidewalks in loops, minding their business —
// until a car mounts the curb or a shot cracks, when they scatter. A walker who is run
// down falls, and the city quietly replaces them somewhere far away a few seconds later.

import { GRID, ROAD_HALF } from './config.js';
import { animateHumanoid, buildHumanoid, knockDown } from './player.js';

const SHIRTS = [0xf2e394, 0x90caf9, 0xf48fb1, 0xa5d6a7, 0xffe082, 0xce93d8, 0x80cbc4, 0xffab91, 0xe6ee9c, 0xbcaaa4];
const PANTS = [0x37474f, 0x5d4037, 0x1a237e, 0xf5f5f5, 0x4e342e, 0x00695c];

/** The sidewalk offset from a street's centre line where walkers pace. */
const WALK_OFF = ROAD_HALF + 2.4;

export function createPedestrians(scene, city, rng, count) {
  const peds = [];

  /** Aim the walker at the next street corner along their sidewalk line. */
  function cornerTarget(ped) {
    const pos = ped.mesh.position;
    if (ped.vertical) {
      const next = (Math.round(pos.z / GRID) + ped.dir) * GRID;
      ped.waypoint = { x: ped.line, z: next };
    } else {
      const next = (Math.round(pos.x / GRID) + ped.dir) * GRID;
      ped.waypoint = { x: next, z: ped.line };
    }
  }

  /** At a corner: turn onto the cross street's sidewalk, or keep strolling straight. */
  function cornerChoice(ped) {
    const pos = ped.mesh.position;
    if (rng.chance(0.45)) {
      const crossStreet = Math.round((ped.vertical ? pos.z : pos.x) / GRID) * GRID;
      ped.vertical = !ped.vertical;
      ped.line = crossStreet + (rng.chance(0.5) ? WALK_OFF : -WALK_OFF);
      ped.dir = rng.chance(0.5) ? 1 : -1;
    }
    cornerTarget(ped);
  }

  function spawn(ped, farFrom) {
    for (let tries = 0; tries < 10; tries += 1) {
      const vertical = rng.chance(0.5);
      const line = city.streetLines[rng.int(0, city.streetLines.length - 1)] + (rng.chance(0.5) ? WALK_OFF : -WALK_OFF);
      const along = rng.range(-185, 185);
      const x = vertical ? line : along;
      const z = vertical ? along : line;
      if (farFrom && Math.hypot(x - farFrom.x, z - farFrom.z) < 60) continue;
      ped.mesh.position.set(x, 0, z);
      ped.vertical = vertical;
      ped.line = line;
      ped.dir = rng.chance(0.5) ? 1 : -1;
      ped.state = 'walk';
      ped.downTime = 0;
      ped.fleeTime = 0;
      ped.mesh.rotation.set(0, 0, 0);
      cornerTarget(ped);
      return;
    }
  }

  for (let i = 0; i < count; i += 1) {
    const mesh = buildHumanoid(rng, {
      shirt: SHIRTS[rng.int(0, SHIRTS.length - 1)],
      pants: PANTS[rng.int(0, PANTS.length - 1)],
      cap: rng.chance(0.4) ? 0xe5383b : null,
    });
    scene.add(mesh);
    const ped = {
      mesh,
      heading: 0,
      speed: rng.range(1.5, 2.3),
      state: 'walk',
      animPhase: rng.range(0, 6),
      waypoint: { x: 0, z: 0 },
      vertical: true, line: 0, dir: 1,
      fleeTime: 0, downTime: 0, fleeFrom: { x: 0, z: 0 },
      alive: true,
    };
    spawn(ped, null);
    peds.push(ped);
  }

  /** Send every walker near a point running from it: gunshots, crashes, near misses. */
  function panic(x, z, radius) {
    for (const ped of peds) {
      if (ped.state !== 'walk') continue;
      const pos = ped.mesh.position;
      if (Math.hypot(pos.x - x, pos.z - z) < radius) {
        ped.state = 'flee';
        ped.fleeTime = rng.range(2.2, 3.6);
        ped.fleeFrom = { x, z };
      }
    }
  }

  /** Run a walker down: they fall where they stand. The caller answers for the crime. */
  function knockOut(ped) {
    if (ped.state === 'down') return;
    ped.state = 'down';
    ped.downTime = 7;
    knockDown(ped.mesh);
  }

  function update(dt, playerPos) {
    for (const ped of peds) {
      const pos = ped.mesh.position;
      if (ped.state === 'down') {
        ped.downTime -= dt;
        if (ped.downTime <= 0) spawn(ped, playerPos);
        continue;
      }
      let tx; let tz; let speed = ped.speed;
      if (ped.state === 'flee') {
        ped.fleeTime -= dt;
        const dx = pos.x - ped.fleeFrom.x;
        const dz = pos.z - ped.fleeFrom.z;
        const d = Math.max(1, Math.hypot(dx, dz));
        tx = pos.x + (dx / d) * 10;
        tz = pos.z + (dz / d) * 10;
        speed = 5.6;
        if (ped.fleeTime <= 0) { ped.state = 'walk'; cornerTarget(ped); }
      } else {
        tx = ped.waypoint.x; tz = ped.waypoint.z;
        if (Math.hypot(tx - pos.x, tz - pos.z) < 1.6) cornerChoice(ped);
      }
      const dx = tx - pos.x;
      const dz = tz - pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 0.05) {
        const targetHeading = Math.atan2(dx, dz);
        let diff = targetHeading - ped.heading;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        ped.heading += diff * Math.min(1, dt * 8);
        pos.x += Math.sin(ped.heading) * speed * dt;
        pos.z += Math.cos(ped.heading) * speed * dt;
        city.collideCircle(pos, 0.5);
        ped.animPhase += dt * (ped.state === 'flee' ? 12 : 7.5);
      }
      ped.mesh.rotation.y = ped.heading;
      animateHumanoid(ped.mesh, ped.animPhase, ped.state === 'flee' ? 1.2 : 0.8);
    }
  }

  return { peds, update, panic, knockOut };
}
