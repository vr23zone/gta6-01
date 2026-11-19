// combat.js — the shooting in Solara Heat: Nico's hitscan pistol, the guards who
// hold the docks and the bank, and the pickups they drop. The pistol fires along
// the camera's centre ray; a tracer and a muzzle flash sell the shot, and a guard
// is hit when the ray passes through his space with a clear line from Nico —
// buildings block bullets exactly as they block sight. Guards fight like people
// who want to live: they strafe around their cover, pause to reload behind it,
// and shoot back with aim that worsens with range. Downed guards drop the cash
// they were carrying; medkits and vests wait at fixed spots around the city.

import { makePerson, faceToward } from './people.js';
import { collideCircle } from './vehicles.js';
import { hasLineOfSight } from './police.js';

export class Guard {
  constructor(scene, rng, post) {
    this.person = makePerson(rng, { shirt: 0x37414a, pants: 0x22262b, cap: 0x22262b });
    this.person.setAim(true);
    this.pos = this.person.group.position;
    this.pos.set(post.x, 0, post.z);
    scene.add(this.person.group);
    this.post = post;
    this.hp = 100;
    this.state = 'idle'; // idle | fight | dead
    this.shotTimer = rng.range(0.4, 1.4);
    this.strafeDir = rng.chance(0.5) ? 1 : -1;
    this.strafeTimer = rng.range(1, 2.4);
    this.shotsFired = 0;
    this.reloadTimer = 0;
    this.phase = rng.range(0, 6);
    this.rng = rng;
  }

  get alive() {
    return this.state !== 'dead';
  }

  hurt(dmg) {
    this.hp -= dmg;
    this.state = 'fight';
    if (this.hp <= 0) {
      this.state = 'dead';
      this.person.setProne(true);
      this.person.setAim(false);
      return true;
    }
    return false;
  }
}

export class Combat {
  constructor(scene, rng) {
    this.scene = scene;
    this.rng = rng;
    this.guards = [];
    this.tracers = [];
    this.pickups = [];
    this.fireCooldown = 0;
    this.events = {}; // onGuardDown(guard), onPlayerHit(dmg), onShoot(x, z)
  }

  spawnGuard(post) {
    const g = new Guard(this.scene, this.rng, post);
    this.guards.push(g);
    return g;
  }

  clearGuards() {
    for (const g of this.guards) this.scene.remove(g.person.group);
    this.guards = [];
  }

  addPickup(kind, x, z, amount = 0) {
    const group = new THREE.Group();
    const mat = (c) => new THREE.MeshLambertMaterial({ color: c });
    if (kind === 'cash') {
      const stack = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.22, 0.36), mat(0x3f9e4d));
      stack.position.y = 0.5;
      group.add(stack);
    } else if (kind === 'health') {
      const box = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.55, 0.55), mat(0xf7f3e8));
      box.position.y = 0.55;
      group.add(box);
      const crossV = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.4, 0.58), mat(0xd7263d));
      crossV.position.y = 0.55;
      group.add(crossV);
      const crossH = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.12, 0.58), mat(0xd7263d));
      crossH.position.y = 0.55;
      group.add(crossH);
    } else {
      const vest = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.65, 0.3), mat(0x2e6bd9));
      vest.position.y = 0.6;
      group.add(vest);
    }
    group.position.set(x, 0, z);
    this.scene.add(group);
    this.pickups.push({ kind, amount, group, taken: false, phase: this.rng.range(0, 6) });
  }

  // Fixed medkits and vests: outside the farmacia, the marina, the park, the docks
  // gate and the police impound corner.
  spawnCityPickups() {
    this.addPickup('health', -52, -68);
    this.addPickup('health', 128, 96);
    this.addPickup('health', -118, 132);
    this.addPickup('armor', 66, -116);
    this.addPickup('armor', -178, -58);
  }

  // One pistol shot along the camera ray. Returns true when it fired.
  tryShoot(dt, camera, player, sound, colliders) {
    this.fireCooldown -= dt;
    if (this.fireCooldown > 0) return false;
    this.fireCooldown = 0.17;
    sound.gunshot(true);
    const origin = new THREE.Vector3();
    camera.getWorldPosition(origin);
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    let bestT = 62;
    let bestGuard = null;
    for (const g of this.guards) {
      if (!g.alive) continue;
      const cx = g.pos.x - origin.x;
      const cy = 1.25 - origin.y;
      const cz = g.pos.z - origin.z;
      const t = cx * dir.x + cy * dir.y + cz * dir.z;
      if (t < 0 || t > bestT) continue;
      const px = origin.x + dir.x * t;
      const py = origin.y + dir.y * t;
      const pz = origin.z + dir.z * t;
      const miss = Math.hypot(px - g.pos.x, py - 1.25, pz - g.pos.z);
      if (miss < 0.85) {
        bestT = t;
        bestGuard = g;
      }
    }
    const muzzle = new THREE.Vector3(player.pos.x, 1.35, player.pos.z);
    let end;
    if (bestGuard && hasLineOfSight(player.pos.x, player.pos.z, bestGuard.pos.x, bestGuard.pos.z, colliders)) {
      end = new THREE.Vector3(bestGuard.pos.x, 1.25, bestGuard.pos.z);
      const died = bestGuard.hurt(34);
      if (died) {
        this.addPickup('cash', bestGuard.pos.x, bestGuard.pos.z, this.rng.int(40, 90));
        if (this.events.onGuardDown) this.events.onGuardDown(bestGuard);
      }
    } else {
      end = origin.clone().add(dir.clone().multiplyScalar(bestT));
    }
    this.spawnTracer(muzzle, end);
    if (this.events.onShoot) this.events.onShoot(player.pos.x, player.pos.z);
    return true;
  }

  spawnTracer(a, b) {
    const geo = new THREE.BufferGeometry().setFromPoints([a, b]);
    const mat = new THREE.LineBasicMaterial({ color: 0xffd98a, transparent: true, opacity: 0.9 });
    const line = new THREE.Line(geo, mat);
    this.scene.add(line);
    this.tracers.push({ line, life: 0.07 });
    // Muzzle flash: a brief bright sprite at the gun.
    const flash = new THREE.Mesh(
      new THREE.SphereGeometry(0.14, 6, 5),
      new THREE.MeshBasicMaterial({ color: 0xffe9a8 }),
    );
    flash.position.copy(a);
    this.scene.add(flash);
    this.tracers.push({ line: flash, life: 0.045, isMesh: true });
  }

  alertGuardsNear(x, z, radius = 34) {
    for (const g of this.guards) {
      if (g.alive && Math.hypot(g.pos.x - x, g.pos.z - z) < radius) g.state = 'fight';
    }
  }

  update(dt, ctx) {
    const { player, colliders, sound } = ctx;
    // Tracers fade.
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const t = this.tracers[i];
      t.life -= dt;
      if (t.life <= 0) {
        this.scene.remove(t.line);
        this.tracers.splice(i, 1);
      }
    }
    // Guards.
    for (const g of this.guards) {
      if (!g.alive) continue;
      const dx = player.pos.x - g.pos.x;
      const dz = player.pos.z - g.pos.z;
      const dist = Math.hypot(dx, dz);
      if (g.state === 'idle') {
        if (dist < 26 && hasLineOfSight(g.pos.x, g.pos.z, player.pos.x, player.pos.z, colliders)) {
          // A guard who sees an armed stranger near his post challenges him — once
          // the mission says so; idle guards elsewhere just watch (main arms them).
          if (g.armed) g.state = 'fight';
        }
        continue;
      }
      // Fighting: face the player, strafe around the cover point, shoot in bursts.
      faceToward(g.person, dx, dz);
      g.strafeTimer -= dt;
      if (g.strafeTimer <= 0) {
        g.strafeDir *= -1;
        g.strafeTimer = this.rng.range(0.9, 2.2);
      }
      const cover = g.post.coverX !== undefined ? { x: g.post.coverX, z: g.post.coverZ } : g.post;
      const toCover = Math.hypot(cover.x - g.pos.x, cover.z - g.pos.z);
      let vx = 0;
      let vz = 0;
      if (g.reloadTimer > 0) {
        g.reloadTimer -= dt;
        // Duck back to cover while reloading.
        if (toCover > 0.8) {
          vx = ((cover.x - g.pos.x) / toCover) * 3.4;
          vz = ((cover.z - g.pos.z) / toCover) * 3.4;
        }
      } else if (dist > 30) {
        vx = (dx / dist) * 3.6;
        vz = (dz / dist) * 3.6;
      } else {
        // Strafe perpendicular, staying near the post.
        vx = (-dz / dist) * g.strafeDir * 1.9 + (g.post.x - g.pos.x) * 0.12;
        vz = (dx / dist) * g.strafeDir * 1.9 + (g.post.z - g.pos.z) * 0.12;
      }
      g.pos.x += vx * dt;
      g.pos.z += vz * dt;
      collideCircle(g.pos, 0.55, colliders);
      if (Math.abs(vx) + Math.abs(vz) > 0.2) {
        g.phase += dt * 9;
        g.person.setWalk(g.phase, 0.7);
      }
      // Shooting.
      g.shotTimer -= dt;
      if (g.reloadTimer <= 0 && g.shotTimer <= 0 && dist < 42) {
        if (hasLineOfSight(g.pos.x, g.pos.z, player.pos.x, player.pos.z, colliders)) {
          g.shotTimer = this.rng.range(0.8, 1.5);
          g.shotsFired++;
          sound.gunshot(false);
          const from = new THREE.Vector3(g.pos.x, 1.35, g.pos.z);
          const hitChance = Math.max(0.14, 0.52 - dist * 0.009) * (player.mode === 'car' ? 0.7 : 1);
          if (this.rng.chance(hitChance)) {
            const to = new THREE.Vector3(player.pos.x, 1.2, player.pos.z);
            this.spawnTracer(from, to);
            if (this.events.onPlayerHit) this.events.onPlayerHit(this.rng.range(5, 11));
          } else {
            const miss = new THREE.Vector3(
              player.pos.x + this.rng.range(-2.4, 2.4),
              1,
              player.pos.z + this.rng.range(-2.4, 2.4),
            );
            this.spawnTracer(from, miss);
          }
          if (g.shotsFired % 6 === 0) g.reloadTimer = 1.6;
        } else {
          g.shotTimer = 0.3;
        }
      }
    }
    // Pickups bob, spin, and are collected on foot.
    for (const p of this.pickups) {
      if (p.taken) continue;
      p.phase += dt * 2.4;
      p.group.position.y = 0.15 + Math.sin(p.phase) * 0.12;
      p.group.rotation.y = p.phase * 0.7;
      if (player.mode === 'foot') {
        const d = Math.hypot(p.group.position.x - player.pos.x, p.group.position.z - player.pos.z);
        if (d < 1.7) {
          p.taken = true;
          this.scene.remove(p.group);
          if (this.events.onPickup) this.events.onPickup(p);
        }
      }
    }
  }
}
