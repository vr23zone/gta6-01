// The law: a wanted level that crimes raise and hiding lowers, and the patrol cars that
// answer it. Cops chase, ram and — if Nico is on foot or sitting in a dead car — close in
// and fill the bust meter. Lose their eyes long enough and the stars go out one by one.

import { WANTED } from './config.js';
import { createCar, driveToward, placeCar } from './vehicles.js';

export function createPolice(scene, city, rng) {
  const cars = [];
  let wanted = 0;
  let unseenTime = 0;
  let decayTime = 0;
  let bustMeter = 0;
  let elapsed = 0;

  /** A road point 75–110 units from the player: close enough to matter, never on top of them. */
  function spawnPoint(playerPos) {
    for (let tries = 0; tries < 14; tries += 1) {
      const angle = rng.range(0, Math.PI * 2);
      const dist = rng.range(75, 110);
      const x = playerPos.x + Math.sin(angle) * dist;
      const z = playerPos.z + Math.cos(angle) * dist;
      const lineX = city.streetLines.reduce((a, b) => (Math.abs(b - x) < Math.abs(a - x) ? b : a));
      const lineZ = city.streetLines.reduce((a, b) => (Math.abs(b - z) < Math.abs(a - z) ? b : a));
      const snapX = Math.abs(lineX - x) < Math.abs(lineZ - z);
      return {
        x: snapX ? lineX : THREE.MathUtils.clamp(x, -200, 200),
        z: snapX ? THREE.MathUtils.clamp(z, -200, 200) : lineZ,
      };
    }
    return { x: playerPos.x + 90, z: playerPos.z };
  }

  function ensureCars(playerPos) {
    const want = Math.min(wanted, 5);
    while (cars.length < want) {
      const spot = spawnPoint(playerPos);
      const car = createCar(scene, rng, 'police', { police: true, x: spot.x, z: spot.z, topSpeed: 26.5 });
      cars.push(car);
    }
    while (cars.length > want) {
      const car = cars.pop();
      scene.remove(car.mesh);
    }
  }

  return {
    cars,
    get wanted() { return wanted; },
    get bustMeter() { return bustMeter; },

    /** A witnessed crime: the wanted level rises to at least this many stars. */
    commitCrime(stars) {
      wanted = Math.max(wanted, Math.min(WANTED.max, stars));
      unseenTime = 0;
      decayTime = 0;
    },
    /** One more star, for crimes that stack (a rampage, a wrecked patrol car). */
    addStar() {
      wanted = Math.min(WANTED.max, wanted + 1);
      unseenTime = 0;
      decayTime = 0;
    },
    /** The slate wiped clean: busted, wasted, or a job that pays the heat off. */
    clear() {
      wanted = 0;
      bustMeter = 0;
      unseenTime = 0;
      decayTime = 0;
    },
    /** A gunshot in the open: every nearby cop's eyes snap to the player. */
    notifyShot() { unseenTime = 0; decayTime = 0; },

    /**
     * Chase, watch and bust for one step. ctx: {playerPos, playerCar, playerInCar,
     * playerSpeed, onBusted}. Returns {seen, nearest} for the HUD and the siren.
     */
    update(dt, ctx) {
      elapsed += dt;
      ensureCars(ctx.playerPos);
      let seen = false;
      let nearest = Infinity;

      for (const car of cars) {
        const pos = car.mesh.position;
        const dist = Math.hypot(pos.x - ctx.playerPos.x, pos.z - ctx.playerPos.z);
        nearest = Math.min(nearest, dist);
        if (dist < 62 && !city.segmentBlocked(pos.x, pos.z, ctx.playerPos.x, ctx.playerPos.z)) seen = true;

        // A cop left far behind rejoins the hunt near the player instead of crossing the map.
        if (dist > 300) {
          const spot = spawnPoint(ctx.playerPos);
          placeCar(car, spot.x, spot.z, Math.atan2(ctx.playerPos.x - spot.x, ctx.playerPos.z - spot.z));
          continue;
        }
        // Aim where the player will be, not where they were.
        let tx = ctx.playerPos.x;
        let tz = ctx.playerPos.z;
        if (ctx.playerInCar && ctx.playerCar) {
          tx += Math.sin(ctx.playerCar.heading) * ctx.playerCar.speed * 0.55;
          tz += Math.cos(ctx.playerCar.heading) * ctx.playerCar.speed * 0.55;
        }
        driveToward(car, tx, tz, dt, city, { topSpeed: 27.5, throttleScale: 1 });
        // Rubber-band mercy: a cop stuck on a corner for long teleports back into the chase.
        if (Math.abs(car.speed) < 0.6 && dist > 26) {
          car.stuckTime += dt;
          if (car.stuckTime > 4.5) {
            const spot = spawnPoint(ctx.playerPos);
            placeCar(car, spot.x, spot.z, Math.atan2(ctx.playerPos.x - spot.x, ctx.playerPos.z - spot.z));
            car.stuckTime = 0;
          }
        } else car.stuckTime = 0;

        // Lightbar: red and blue halves alternate.
        const bar = car.mesh.userData.lightbar;
        if (bar) {
          const phase = Math.sin(elapsed * 11 + car.flashPhase) > 0;
          bar.userData.red.visible = phase;
          bar.userData.blue.visible = !phase;
        }
      }

      // Being seen holds the heat; hiding bleeds it away a star at a time.
      if (seen) { unseenTime = 0; decayTime = 0; }
      else if (wanted > 0) {
        unseenTime += dt;
        if (unseenTime > WANTED.unseenGrace) {
          decayTime += dt;
          if (decayTime >= WANTED.decayPerStar) {
            wanted -= 1;
            decayTime = 0;
            unseenTime = 0;
          }
        }
      }

      // The bust: a cop sitting on an on-foot (or stranded) player fills the meter.
      const exposed = !ctx.playerInCar || Math.abs(ctx.playerSpeed) < 1.2;
      if (wanted > 0 && exposed && nearest < WANTED.bustRadius + (ctx.playerInCar ? 1.5 : 0)) {
        bustMeter += dt / WANTED.bustTime;
        if (bustMeter >= 1) {
          bustMeter = 0;
          ctx.onBusted();
        }
      } else {
        bustMeter = Math.max(0, bustMeter - dt * 0.7 / WANTED.bustTime);
      }

      return { seen, nearest };
    },
  };
}
