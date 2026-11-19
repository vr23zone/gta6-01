// police.js — the law in Solara Bay: a wanted system built on heat and eyesight.
// Crimes add heat — jacking a car, firing a gun, running someone down — but only in
// full when someone sees them: a police unit with line of sight, or a pedestrian
// close enough to tell the tale. Heat becomes stars; stars become interceptors.
// Cop cars hunt the player's position and box him in; when he is on foot they stop
// and put officers on the ground who run him down and fill the bust meter by
// holding him. Stay out of sight — line of sight is tested honestly against the
// buildings — and the heat bleeds away until the city forgets.

import { Car } from './vehicles.js';
import { makePerson, faceToward } from './people.js';
import { streetX, streetZ, GRID } from './config.js';

const CRIME_HEAT = {
  jack: 1.0,
  shot: 1.1,
  hitPed: 1.7,
  hitCop: 2.4,
  killGuard: 1.6,
  crash: 0.5,
  mission: 0, // scripted heat is set directly by missions
};

// Does the straight line from a to b stay clear of every building AABB?
export function hasLineOfSight(ax, az, bx, bz, colliders) {
  for (const c of colliders) {
    if (segmentHitsBox(ax, az, bx, bz, c)) return false;
  }
  return true;
}

function segmentHitsBox(ax, az, bx, bz, c) {
  // Slab test in 2D.
  const dx = bx - ax;
  const dz = bz - az;
  let tmin = 0;
  let tmax = 1;
  if (Math.abs(dx) < 1e-9) {
    if (ax < c.minX || ax > c.maxX) return false;
  } else {
    let t1 = (c.minX - ax) / dx;
    let t2 = (c.maxX - ax) / dx;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return false;
  }
  if (Math.abs(dz) < 1e-9) {
    if (az < c.minZ || az > c.maxZ) return false;
  } else {
    let t1 = (c.minZ - az) / dz;
    let t2 = (c.maxZ - az) / dz;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return false;
  }
  return true;
}

export class Police {
  constructor(scene, rng) {
    this.scene = scene;
    this.rng = rng;
    this.heat = 0;
    this.cars = []; // {car, footCops: [officer], state}
    this.officers = []; // every foot officer, whichever car they came from
    this.unseenTime = 0;
    this.playerSeen = false;
    this.bust = 0;
    this.flashPhase = 0;
    this.setHeat = (n) => {
      this.heat = Math.max(this.heat, n);
    };
  }

  get stars() {
    return Math.max(0, Math.min(5, Math.floor(this.heat + 0.0001)));
  }

  // Witnesses decide how much of a crime sticks.
  reportCrime(kind, x, z, ctx) {
    const base = CRIME_HEAT[kind] ?? 0.5;
    let witnessed = false;
    for (const unit of this.cars) {
      const d = Math.hypot(unit.car.pos.x - x, unit.car.pos.z - z);
      if (d < 60 && hasLineOfSight(unit.car.pos.x, unit.car.pos.z, x, z, ctx.colliders)) witnessed = true;
    }
    if (!witnessed && ctx.peds) {
      for (const p of ctx.peds.list) {
        const g = p.person.group.position;
        if (Math.hypot(g.x - x, g.z - z) < 17) {
          witnessed = true;
          break;
        }
      }
    }
    this.heat = Math.min(5.9, this.heat + base * (witnessed ? 1 : 0.35));
    if (witnessed) this.unseenTime = 0;
  }

  addHeat(n) {
    this.heat = Math.min(5.9, Math.max(0, this.heat + n));
  }

  clearAll() {
    for (const unit of this.cars) {
      this.scene.remove(unit.car.mesh);
      for (const o of unit.footCops) this.scene.remove(o.person.group);
    }
    this.cars = [];
    this.officers = [];
    this.heat = 0;
    this.bust = 0;
    this.unseenTime = 0;
  }

  spawnCar(playerPos) {
    const rng = this.rng;
    const car = new Car(this.scene, rng, 'cop');
    // Come from a street a hundred metres out, in a random direction.
    const ang = rng.range(0, Math.PI * 2);
    let x = playerPos.x + Math.sin(ang) * rng.range(95, 130);
    let z = playerPos.z + Math.cos(ang) * rng.range(95, 130);
    x = Math.max(-252, Math.min(252, x));
    z = Math.max(-252, Math.min(252, z));
    // Snap to the nearest street centre so they arrive on the road.
    const si = Math.round((x + 240) / 60);
    const sj = Math.round((z + 240) / 60);
    if (Math.abs(streetX(Math.max(0, Math.min(GRID, si))) - x) < Math.abs(streetZ(Math.max(0, Math.min(GRID, sj))) - z)) {
      x = streetX(Math.max(0, Math.min(GRID, si)));
    } else {
      z = streetZ(Math.max(0, Math.min(GRID, sj)));
    }
    car.place(x, z, Math.atan2(playerPos.x - x, playerPos.z - z));
    car.speed = 12;
    this.cars.push({ car, footCops: [], deployed: false });
  }

  deployOfficers(unit) {
    for (let k = 0; k < 2; k++) {
      const person = makePerson(this.rng, { shirt: 0x1d4e89, pants: 0x14273c, cap: 0x1d4e89 });
      person.group.position.set(unit.car.pos.x + (k ? 1.6 : -1.6), 0, unit.car.pos.z);
      this.scene.add(person.group);
      const officer = { person, phase: this.rng.range(0, 6), unit };
      unit.footCops.push(officer);
      this.officers.push(officer);
    }
    unit.deployed = true;
  }

  recallOfficers(unit) {
    for (const o of unit.footCops) {
      this.scene.remove(o.person.group);
      const idx = this.officers.indexOf(o);
      if (idx >= 0) this.officers.splice(idx, 1);
    }
    unit.footCops = [];
    unit.deployed = false;
  }

  nearestCopDist(x, z) {
    let best = Infinity;
    for (const unit of this.cars) {
      best = Math.min(best, Math.hypot(unit.car.pos.x - x, unit.car.pos.z - z));
    }
    for (const o of this.officers) {
      const g = o.person.group.position;
      best = Math.min(best, Math.hypot(g.x - x, g.z - z));
    }
    return best;
  }

  update(dt, ctx) {
    const { player, colliders } = ctx;
    const stars = this.stars;
    this.flashPhase += dt * 6;

    // Sight: any unit with a clear line to the player keeps the heat alive.
    let seen = false;
    if (stars > 0) {
      const watchers = [];
      for (const unit of this.cars) watchers.push(unit.car.pos);
      for (const o of this.officers) watchers.push(o.person.group.position);
      for (const w of watchers) {
        const d = Math.hypot(w.x - player.pos.x, w.z - player.pos.z);
        if (d < 75 && hasLineOfSight(w.x, w.z, player.pos.x, player.pos.z, colliders)) {
          seen = true;
          break;
        }
      }
    }
    this.playerSeen = seen;
    if (seen) this.unseenTime = 0;
    else {
      this.unseenTime += dt;
      if (this.unseenTime > 5 && this.heat > 0) {
        this.heat = Math.max(0, this.heat - dt * 0.1);
      }
    }

    // Reinforce or stand down to match the stars.
    const wantedCars = stars === 0 ? 0 : Math.min(5, stars + 1);
    if (this.cars.length < wantedCars) {
      this.spawnCar(player.pos);
    }
    for (let idx = this.cars.length - 1; idx >= 0; idx--) {
      const unit = this.cars[idx];
      const car = unit.car;
      const distToPlayer = Math.hypot(car.pos.x - player.pos.x, car.pos.z - player.pos.z);
      if (stars === 0 && distToPlayer > 170) {
        this.recallOfficers(unit);
        this.scene.remove(car.mesh);
        this.cars.splice(idx, 1);
        continue;
      }
      // Light bar strobes.
      const lights = car.mesh.userData.lights;
      if (lights.red) {
        const on = Math.sin(this.flashPhase + idx) > 0;
        lights.red.material.color.setHex(on ? 0xff2a2a : 0x571010);
        lights.blue.material.color.setHex(on ? 0x1c3f7d : 0x2a6bff);
      }
      if (player.mode === 'car') {
        if (unit.deployed) this.recallOfficers(unit);
        // Predict a point just behind the player's car and drive at it hard.
        const f = player.car ? player.car.forward() : { x: 0, z: 1 };
        const tx = player.pos.x - f.x * 4 + Math.sin(idx * 2.4) * 3;
        const tz = player.pos.z - f.z * 4 + Math.cos(idx * 2.4) * 3;
        car.steerToward(tx, tz, distToPlayer > 60 ? 43 : 40, dt, 1.9);
        car.collideWorld(colliders);
      } else {
        // On foot: close to nine metres, stop, and put officers on the ground.
        if (!unit.deployed) {
          car.steerToward(player.pos.x, player.pos.z, distToPlayer > 30 ? 40 : 26, dt, 1.8);
          car.collideWorld(colliders);
          if (distToPlayer < 10 && Math.abs(car.speed) < 6) {
            car.speed = 0;
            this.deployOfficers(unit);
          }
        } else if (distToPlayer > 42) {
          this.recallOfficers(unit);
        }
      }
    }

    // Officers on foot run the player down; holding him fills the bust meter.
    let holding = 0;
    for (const o of this.officers) {
      const g = o.person.group.position;
      const dx = player.pos.x - g.x;
      const dz = player.pos.z - g.z;
      const d = Math.hypot(dx, dz);
      if (player.mode === 'foot' && d > 1.7) {
        const sp = 6.3;
        g.x += (dx / d) * sp * dt;
        g.z += (dz / d) * sp * dt;
        o.phase += dt * 11;
        o.person.setWalk(o.phase, 1);
        faceToward(o.person, dx, dz);
      } else if (player.mode === 'foot') {
        holding++;
        o.person.setWalk(o.phase, 0);
        faceToward(o.person, dx, dz);
      } else {
        // The player drove off: officers jog back toward their car.
        const carPos = o.unit.car.pos;
        const bx = carPos.x - g.x;
        const bz = carPos.z - g.z;
        const bd = Math.hypot(bx, bz);
        if (bd > 2) {
          g.x += (bx / bd) * 5 * dt;
          g.z += (bz / bd) * 5 * dt;
          o.phase += dt * 10;
          o.person.setWalk(o.phase, 1);
          faceToward(o.person, bx, bz);
        }
      }
    }
    if (holding > 0 && player.speed2d < 3.4) {
      this.bust = Math.min(1, this.bust + dt * 0.42 * holding);
    } else {
      this.bust = Math.max(0, this.bust - dt * 0.25);
    }
    if (this.bust >= 1 && ctx.events.onBusted) {
      ctx.events.onBusted();
    }
  }
}
