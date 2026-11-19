// Gunplay, deliberately simple and loud: hitscan shots, tracers that hang in the air for
// a blink, muzzle flashes, and the dock crew — armed guards who hold their ground, shoot
// back in bursts, and go down for good. The player's own shots resolve here too, against
// guards, walkers, cars and walls, nearest first.

import { PISTOL } from './config.js';
import { animateHumanoid, buildHumanoid, knockDown } from './player.js';

/** A soft round glow texture for muzzle flashes and impact sparks. */
function glowTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 64; canvas.height = 64;
  const g = canvas.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 2, 32, 32, 30);
  grad.addColorStop(0, 'rgba(255,240,200,1)');
  grad.addColorStop(0.4, 'rgba(255,180,80,0.7)');
  grad.addColorStop(1, 'rgba(255,140,40,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(canvas);
}

export function createCombat(scene, rng) {
  const guards = [];
  const tracers = [];
  const flashes = [];
  const glow = glowTexture();
  const tracerMat = new THREE.LineBasicMaterial({ color: 0xffd98a, transparent: true, opacity: 0.9 });

  function addFlash(x, y, z, scale = 0.7) {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, transparent: true, depthWrite: false }));
    sprite.position.set(x, y, z);
    sprite.scale.set(scale, scale, 1);
    sprite.userData.life = 0.05;
    scene.add(sprite);
    flashes.push(sprite);
  }

  function addTracer(from, to) {
    const geo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(from.x, from.y, from.z),
      new THREE.Vector3(to.x, to.y, to.z),
    ]);
    const line = new THREE.Line(geo, tracerMat.clone());
    line.userData.life = 0.07;
    scene.add(line);
    tracers.push(line);
  }

  /** One of the dock crew: black shirt, no cap, a gun in hand and a short temper. */
  function spawnGuard(x, z, heading = 0) {
    const mesh = buildHumanoid(rng, { shirt: 0x23272e, pants: 0x14161a, cap: null });
    mesh.userData.gun.visible = true;
    mesh.position.set(x, 0, z);
    mesh.rotation.y = heading;
    scene.add(mesh);
    const guard = {
      mesh, heading, health: 70, alive: true,
      cooldown: rng.range(0.4, 1.4), burst: 0, animPhase: rng.range(0, 6),
    };
    guards.push(guard);
    return guard;
  }

  function clearGuards() {
    for (const guard of guards) scene.remove(guard.mesh);
    guards.length = 0;
  }

  /** Ray vs the city's solid boxes: the distance a shot travels before a wall, or Infinity. */
  function rayWallDistance(origin, dir, colliders) {
    let best = Infinity;
    for (const box of colliders) {
      let tmin = 0; let tmax = best;
      const axes = [
        [origin.x, dir.x, box.minX, box.maxX],
        [origin.z, dir.z, box.minZ, box.maxZ],
      ];
      let ok = true;
      for (const [o, d, lo, hi] of axes) {
        if (Math.abs(d) < 1e-9) { if (o < lo || o > hi) { ok = false; break; } }
        else {
          let t1 = (lo - o) / d; let t2 = (hi - o) / d;
          if (t1 > t2) [t1, t2] = [t2, t1];
          tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
          if (tmin > tmax) { ok = false; break; }
        }
      }
      if (ok && tmin > 0.5 && tmin < best) best = tmin;
    }
    // The ground and the sea wall at head height: a shot fired level never hits them.
    return best;
  }

  function raySphere(origin, dir, cx, cy, cz, radius) {
    const ox = cx - origin.x; const oy = cy - origin.y; const oz = cz - origin.z;
    const tca = ox * dir.x + oy * dir.y + oz * dir.z;
    if (tca < 0) return Infinity;
    const d2 = ox * ox + oy * oy + oz * oz - tca * tca;
    const r2 = radius * radius;
    if (d2 > r2) return Infinity;
    return tca - Math.sqrt(r2 - d2);
  }

  /**
   * Resolve one of the player's shots. Targets: guards, pedestrians, cars, walls.
   * Returns what was hit ('guard' | 'ped' | 'car' | 'wall' | null) so main can answer
   * for crimes and score mission kills. Draws the tracer and the flash itself.
   */
  function playerShoot(origin, dir, targets) {
    let bestT = Math.min(PISTOL.range, rayWallDistance(origin, dir, targets.colliders));
    let hitKind = bestT === Infinity ? null : 'wall';
    let hitRef = null;
    for (const guard of targets.guards) {
      if (!guard.alive) continue;
      const p = guard.mesh.position;
      const t = raySphere(origin, dir, p.x, p.y + 1.15, p.z, 0.85);
      if (t < bestT) { bestT = t; hitKind = 'guard'; hitRef = guard; }
    }
    for (const ped of targets.peds) {
      if (ped.state === 'down') continue;
      const p = ped.mesh.position;
      const t = raySphere(origin, dir, p.x, p.y + 1.15, p.z, 0.8);
      if (t < bestT) { bestT = t; hitKind = 'ped'; hitRef = ped; }
    }
    for (const car of targets.cars) {
      if (!car.alive) continue;
      const p = car.mesh.position;
      const t = raySphere(origin, dir, p.x, p.y + 0.75, p.z, 2.3);
      if (t < bestT) { bestT = t; hitKind = 'car'; hitRef = car; }
    }
    const end = {
      x: origin.x + dir.x * (bestT === Infinity ? PISTOL.range : bestT),
      y: origin.y + dir.y * (bestT === Infinity ? PISTOL.range : bestT),
      z: origin.z + dir.z * (bestT === Infinity ? PISTOL.range : bestT),
    };
    addTracer(origin, end);
    addFlash(origin.x, origin.y, origin.z, 0.55);
    if (hitKind) addFlash(end.x, end.y, end.z, 0.4);
    if (hitKind === 'guard' && hitRef) {
      hitRef.health -= PISTOL.damage;
      if (hitRef.health <= 0 && hitRef.alive) {
        hitRef.alive = false;
        knockDown(hitRef.mesh);
      }
    }
    return { kind: hitKind, ref: hitRef };
  }

  /**
   * The guards' half of the fight: face the player, keep a firing distance, and shoot
   * in bursts with honest inaccuracy. ctx: {playerPos, onPlayerHit, audio, city}.
   */
  function updateGuards(dt, ctx) {
    for (const guard of guards) {
      if (!guard.alive) continue;
      const pos = guard.mesh.position;
      const dx = ctx.playerPos.x - pos.x;
      const dz = ctx.playerPos.z - pos.z;
      const dist = Math.hypot(dx, dz);
      guard.heading = Math.atan2(dx, dz);
      guard.mesh.rotation.y = guard.heading;
      const sees = dist < 46 && !ctx.city.segmentBlocked(pos.x, pos.z, ctx.playerPos.x, ctx.playerPos.z);
      if (!sees) {
        animateHumanoid(guard.mesh, guard.animPhase, 0.15);
        continue;
      }
      // Strafe a little while fighting; close in if the player is far, back off if close.
      guard.animPhase += dt * 6;
      animateHumanoid(guard.mesh, guard.animPhase, 0.5);
      let mx = 0; let mz = 0;
      if (dist > 20) { mx = dx / dist; mz = dz / dist; }
      else if (dist < 8) { mx = -dx / dist; mz = -dz / dist; }
      else { mx = -dz / dist * 0.5; mz = dx / dist * 0.5; }
      pos.x += mx * 2.1 * dt;
      pos.z += mz * 2.1 * dt;
      ctx.city.collideCircle(pos, 0.55);

      guard.cooldown -= dt;
      if (guard.cooldown <= 0 && dist < 44) {
        guard.cooldown = rng.range(0.75, 1.5);
        const from = { x: pos.x + Math.sin(guard.heading) * 0.5, y: 1.25, z: pos.z + Math.cos(guard.heading) * 0.5 };
        const hitChance = dist < 14 ? 0.5 : dist < 26 ? 0.34 : 0.2;
        const hit = rng.next() < hitChance;
        const miss = hit ? 0 : rng.range(0.8, 2.4);
        const to = {
          x: ctx.playerPos.x + (hit ? 0 : miss * (rng.chance(0.5) ? 1 : -1)),
          y: 1.1,
          z: ctx.playerPos.z + (hit ? 0 : miss * (rng.chance(0.5) ? 1 : -1)),
        };
        addTracer(from, to);
        addFlash(from.x, from.y, from.z, 0.5);
        ctx.audio.enemyShoot();
        if (hit) ctx.onPlayerHit(rng.range(5, 10));
      }
    }
  }

  /** Fade tracers and flashes; called every frame. */
  function updateEffects(dt) {
    for (let i = tracers.length - 1; i >= 0; i -= 1) {
      const line = tracers[i];
      line.userData.life -= dt;
      line.material.opacity = Math.max(0, line.userData.life / 0.07) * 0.9;
      if (line.userData.life <= 0) { scene.remove(line); line.geometry.dispose(); tracers.splice(i, 1); }
    }
    for (let i = flashes.length - 1; i >= 0; i -= 1) {
      const sprite = flashes[i];
      sprite.userData.life -= dt;
      sprite.material.opacity = Math.max(0, sprite.userData.life / 0.05);
      if (sprite.userData.life <= 0) { scene.remove(sprite); flashes.splice(i, 1); }
    }
  }

  return { guards, spawnGuard, clearGuards, playerShoot, updateGuards, updateEffects };
}
