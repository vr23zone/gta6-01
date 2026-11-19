// people.js — the low-poly people of Solara Bay and the crowd that walks its
// pavements. makePerson builds one articulated figure from boxes — legs and arms on
// hip and shoulder pivots so it can walk, run, aim a pistol and dive flat — and the
// pedestrian system walks forty of them around the block perimeters, crossing at the
// corners, strolling until something frightens them: a gunshot, a car on the
// pavement, a chase coming through. Then they run, and some of them dive.

import { BLOCK, blockX, blockZ, GRID } from './config.js';

const SKIN_TONES = [0xf2c49b, 0xd9a066, 0xa06a35, 0x6e4520, 0xffdbac];
const SHIRTS = [0xe4572e, 0x2e86de, 0xf7f3e8, 0x59b06a, 0xffc933, 0xff5d8f, 0x17a398, 0xe8e8ec, 0x74563c];
const PANTS = [0x2b3a4a, 0x5a4632, 0xd9d2c0, 0x37414a, 0x7a2e2e];

export function makePerson(rng, opts = {}) {
  const skin = opts.skin ?? rng.pick(SKIN_TONES);
  const shirt = opts.shirt ?? rng.pick(SHIRTS);
  const pants = opts.pants ?? rng.pick(PANTS);
  const group = new THREE.Group();
  const mat = (c) => new THREE.MeshLambertMaterial({ color: c });

  const mkLimb = (w, h, d, color, x, y, z) => {
    const pivot = new THREE.Group();
    pivot.position.set(x, y, z);
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color));
    m.position.y = -h / 2;
    m.castShadow = true;
    pivot.add(m);
    group.add(pivot);
    return pivot;
  };
  const legL = mkLimb(0.21, 0.8, 0.23, pants, -0.14, 0.82, 0);
  const legR = mkLimb(0.21, 0.8, 0.23, pants, 0.14, 0.82, 0);
  const armL = mkLimb(0.16, 0.68, 0.18, shirt, -0.4, 1.48, 0);
  const armR = mkLimb(0.16, 0.68, 0.18, shirt, 0.4, 1.48, 0);
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.7, 0.3), mat(shirt));
  torso.position.y = 1.17;
  torso.castShadow = true;
  group.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.21, 10, 8), mat(skin));
  head.position.y = 1.76;
  head.castShadow = true;
  group.add(head);
  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.215, 10, 6, 0, Math.PI * 2, 0, 1.4), mat(opts.hair ?? 0x2b2118));
  hair.position.y = 1.79;
  group.add(hair);
  if (opts.cap) {
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.23, 0.24, 0.1, 10), mat(opts.cap));
    cap.position.y = 1.9;
    group.add(cap);
  }

  return {
    group,
    // phase advances with distance walked; amount 0 stills the limbs.
    setWalk(phase, amount) {
      const s = Math.sin(phase) * 0.62 * amount;
      legL.rotation.x = s;
      legR.rotation.x = -s;
      armL.rotation.x = -s * 0.8;
      if (!this.aiming) armR.rotation.x = s * 0.8;
    },
    aiming: false,
    setAim(on) {
      this.aiming = on;
      armR.rotation.x = on ? -1.35 : 0;
      armR.rotation.z = on ? -0.12 : 0;
    },
    setProne(on) {
      group.rotation.x = on ? -Math.PI / 2 : 0;
      group.position.y = on ? 0.25 : 0;
    },
  };
}

// --- Pedestrians ---------------------------------------------------------------

export class Pedestrians {
  constructor(scene, rng, count = 40) {
    this.list = [];
    this.rng = rng;
    for (let k = 0; k < count; k++) {
      const person = makePerson(rng);
      const i = rng.int(0, GRID - 1);
      const j = rng.int(0, GRID - 1);
      const corner = rng.int(0, 3);
      const pos = cornerPoint(i, j, corner);
      person.group.position.set(pos.x, 0, pos.z);
      scene.add(person.group);
      this.list.push({
        person,
        i, j, corner,
        dir: rng.chance(0.5) ? 1 : -1,
        phase: rng.range(0, 6),
        state: 'walk', // walk | panic | dive | down
        timer: 0,
        fleeFrom: null,
        speed: rng.range(1.1, 1.6),
      });
    }
  }

  // A gunshot, a scream, a car mounting the kerb: everyone in earshot runs.
  panicAt(x, z, radius = 13) {
    for (const p of this.list) {
      const g = p.person.group.position;
      const d = Math.hypot(g.x - x, g.z - z);
      if (d < radius && p.state === 'walk') {
        p.state = this.rng.chance(0.28) ? 'dive' : 'panic';
        p.timer = p.state === 'dive' ? 1.1 : this.rng.range(1.6, 3);
        p.fleeFrom = { x, z };
        if (p.state === 'dive') p.person.setProne(true);
      }
    }
  }

  hitByCar(p) {
    if (p.state === 'down') return false;
    p.state = 'down';
    p.timer = 4.5;
    p.person.setProne(true);
    return true;
  }

  update(dt, traffic) {
    for (const p of this.list) {
      const g = p.person.group.position;
      p.timer -= dt;
      if (p.state === 'dive' || p.state === 'down') {
        if (p.timer <= 0) {
          p.person.setProne(false);
          p.state = p.state === 'dive' ? 'panic' : 'walk';
          p.timer = 1.6;
        }
        continue;
      }
      if (p.state === 'panic') {
        if (p.timer <= 0 || !p.fleeFrom) {
          p.state = 'walk';
          continue;
        }
        const dx = g.x - p.fleeFrom.x;
        const dz = g.z - p.fleeFrom.z;
        const len = Math.hypot(dx, dz) || 1;
        const vx = (dx / len) * 4.3;
        const vz = (dz / len) * 4.3;
        g.x += vx * dt;
        g.z += vz * dt;
        faceToward(p.person, vx, vz);
        p.phase += dt * 11;
        p.person.setWalk(p.phase, 1);
        continue;
      }
      // Stroll the block perimeter; at a corner, sometimes cross to the next block.
      const target = cornerPoint(p.i, p.j, (p.corner + p.dir + 4) % 4);
      const dx = target.x - g.x;
      const dz = target.z - g.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 0.5) {
        p.corner = (p.corner + p.dir + 4) % 4;
        if (this.rng.chance(0.3)) {
          // Cross the street: adopt the neighbouring block across this corner.
          const ni = clampBlock(p.i + (p.corner === 1 || p.corner === 2 ? 1 : -1) * (p.dir > 0 ? 1 : 0));
          const nj = clampBlock(p.j + (p.corner >= 2 ? 1 : -1) * 0);
          if (ni !== p.i || nj !== p.j) {
            p.i = ni;
            p.j = nj;
          }
        }
        continue;
      }
      const vx = (dx / dist) * p.speed;
      const vz = (dz / dist) * p.speed;
      // A fast car close ahead stops a pedestrian in their tracks.
      let blocked = false;
      for (const car of traffic) {
        if (car.speed > 4 && Math.hypot(car.pos.x - g.x, car.pos.z - g.z) < 4.5) {
          blocked = true;
          break;
        }
      }
      if (!blocked) {
        g.x += vx * dt;
        g.z += vz * dt;
        p.phase += dt * 6.4 * p.speed;
        p.person.setWalk(p.phase, 0.8);
      }
      faceToward(p.person, vx, vz);
    }
  }
}

function cornerPoint(i, j, corner) {
  const cx = blockX(i);
  const cz = blockZ(j);
  const o = BLOCK / 2 + 1.7;
  const pts = [
    { x: cx - o, z: cz - o },
    { x: cx + o, z: cz - o },
    { x: cx + o, z: cz + o },
    { x: cx - o, z: cz + o },
  ];
  return pts[corner];
}

function clampBlock(v) {
  return Math.max(0, Math.min(GRID - 1, v));
}

export function faceToward(person, vx, vz) {
  if (Math.abs(vx) + Math.abs(vz) < 0.01) return;
  person.group.rotation.y = Math.atan2(vx, vz);
}
