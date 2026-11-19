// vehicles.js — Solara Bay's cars: how they look, how they drive, and the traffic
// that drives itself. One factory builds every car from boxes — sedan, sporty coupe,
// taxi, the police interceptor with its light bar, the docks' box truck — and one
// Car class carries the arcade physics they all share: accelerate, brake, steer
// with speed, two collision circles against the city's AABBs and each other.
// Traffic cars steer between waypoints laid on the right-hand lanes of the grid,
// brake for the car (or the pedestrian, or you) ahead, and turn at intersections;
// a parked car is just a Car nobody is driving yet, waiting to be stolen.

import { GRID, LANE, streetX, streetZ, CAR_PAINTS, COLORS } from './config.js';

export const CAR_KINDS = {
  sedan: { len: 4.4, wid: 1.9, topSpeed: 38, accel: 13, paint: null },
  coupe: { len: 4.3, wid: 1.85, topSpeed: 47, accel: 17, paint: 0xd7263d },
  taxi: { len: 4.4, wid: 1.9, topSpeed: 36, accel: 12, paint: COLORS.taxi },
  cop: { len: 4.5, wid: 1.95, topSpeed: 44, accel: 16, paint: COLORS.copBody },
  truck: { len: 6.4, wid: 2.3, topSpeed: 27, accel: 9, paint: 0xe8e8ec },
};

export function makeCarMesh(rng, kind = 'sedan') {
  const spec = CAR_KINDS[kind];
  const paint = spec.paint ?? rng.pick(CAR_PAINTS);
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color: paint });
  const glassMat = new THREE.MeshLambertMaterial({ color: 0x1d2b36 });
  const trimMat = new THREE.MeshLambertMaterial({ color: 0x22262b });

  const body = new THREE.Mesh(new THREE.BoxGeometry(spec.wid, 0.55, spec.len), bodyMat);
  body.position.y = 0.55;
  body.castShadow = true;
  group.add(body);
  const nose = new THREE.Mesh(new THREE.BoxGeometry(spec.wid * 0.94, 0.3, 0.7), bodyMat);
  nose.position.set(0, 0.42, spec.len / 2 - 0.2);
  group.add(nose);
  const cabin = new THREE.Mesh(
    new THREE.BoxGeometry(spec.wid * 0.82, 0.5, spec.len * 0.46),
    kind === 'truck' ? bodyMat : glassMat,
  );
  cabin.position.set(0, 1.05, kind === 'truck' ? spec.len * 0.28 : -spec.len * 0.05);
  cabin.castShadow = true;
  group.add(cabin);
  if (kind === 'truck') {
    const box = new THREE.Mesh(new THREE.BoxGeometry(spec.wid, 1.9, spec.len * 0.62), new THREE.MeshLambertMaterial({ color: 0xd8dde2 }));
    box.position.set(0, 1.45, -spec.len * 0.16);
    box.castShadow = true;
    group.add(box);
  }
  if (kind === 'coupe') {
    const spoiler = new THREE.Mesh(new THREE.BoxGeometry(spec.wid * 0.9, 0.08, 0.4), trimMat);
    spoiler.position.set(0, 0.98, -spec.len / 2 + 0.3);
    group.add(spoiler);
  }
  if (kind === 'taxi') {
    const sign = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.22, 0.3), new THREE.MeshBasicMaterial({ color: 0xffe27a }));
    sign.position.set(0, 1.42, -0.2);
    group.add(sign);
  }
  const wheels = [];
  const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.26, 10);
  wheelGeo.rotateZ(Math.PI / 2);
  const wheelMat = new THREE.MeshLambertMaterial({ color: 0x15181c });
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const w = new THREE.Mesh(wheelGeo, wheelMat);
      w.position.set(sx * (spec.wid / 2 - 0.05), 0.36, sz * (spec.len / 2 - 0.95));
      group.add(w);
      wheels.push({ mesh: w, front: sz > 0 });
    }
  }
  const lights = { red: null, blue: null };
  if (kind === 'cop') {
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(spec.wid + 0.02, 0.2, spec.len * 0.7), new THREE.MeshLambertMaterial({ color: COLORS.copTrim }));
    stripe.position.y = 0.62;
    group.add(stripe);
    const barMat = new THREE.MeshLambertMaterial({ color: 0x2b2f36 });
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.12, 0.4), barMat);
    bar.position.set(0, 1.38, -0.2);
    group.add(bar);
    lights.red = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.16, 0.34), new THREE.MeshBasicMaterial({ color: 0xff2a2a }));
    lights.red.position.set(-0.32, 1.4, -0.2);
    group.add(lights.red);
    lights.blue = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.16, 0.34), new THREE.MeshBasicMaterial({ color: 0x2a6bff }));
    lights.blue.position.set(0.32, 1.4, -0.2);
    group.add(lights.blue);
  }
  group.userData.wheels = wheels;
  group.userData.lights = lights;
  return group;
}

// Push a circle (x, z, r) out of every AABB it overlaps; returns true if it hit.
export function collideCircle(pos, r, colliders) {
  let hit = false;
  for (const c of colliders) {
    const nx = Math.max(c.minX, Math.min(pos.x, c.maxX));
    const nz = Math.max(c.minZ, Math.min(pos.z, c.maxZ));
    const dx = pos.x - nx;
    const dz = pos.z - nz;
    const d2 = dx * dx + dz * dz;
    if (d2 < r * r) {
      hit = true;
      if (d2 > 1e-6) {
        const d = Math.sqrt(d2);
        pos.x = nx + (dx / d) * r;
        pos.z = nz + (dz / d) * r;
      } else {
        // Centre inside the box: leave by the shallowest face.
        const left = pos.x - c.minX;
        const right = c.maxX - pos.x;
        const top = pos.z - c.minZ;
        const bottom = c.maxZ - pos.z;
        const m = Math.min(left, right, top, bottom);
        if (m === left) pos.x = c.minX - r;
        else if (m === right) pos.x = c.maxX + r;
        else if (m === top) pos.z = c.minZ - r;
        else pos.z = c.maxZ + r;
      }
    }
  }
  return hit;
}

export class Car {
  constructor(scene, rng, kind = 'sedan') {
    this.kind = kind;
    this.spec = CAR_KINDS[kind];
    this.mesh = makeCarMesh(rng, kind);
    this.pos = this.mesh.position;
    this.heading = 0;
    this.speed = 0;
    this.steer = 0;
    this.dead = false;
    scene.add(this.mesh);
  }

  forward() {
    return { x: Math.sin(this.heading), z: Math.cos(this.heading) };
  }

  place(x, z, heading) {
    this.pos.set(x, 0, z);
    this.heading = heading;
    this.syncMesh(0);
  }

  syncMesh(dt) {
    this.mesh.rotation.y = this.heading;
    const spin = (this.speed * dt) / 0.36;
    for (const w of this.mesh.userData.wheels) {
      w.mesh.rotation.x += spin;
      if (w.front) w.mesh.rotation.y = this.steer * 0.9;
    }
  }

  // Two collision circles, front and back bumper, against the city and the sea wall.
  collideWorld(colliders) {
    const f = this.forward();
    let hit = false;
    for (const s of [1.35, -1.35]) {
      const p = { x: this.pos.x + f.x * s, z: this.pos.z + f.z * s };
      if (collideCircle(p, 1.12, colliders)) {
        hit = true;
        this.pos.x += p.x - (this.pos.x + f.x * s);
        this.pos.z += p.z - (this.pos.z + f.z * s);
      }
    }
    // Keep cars out of the sea and inside the world.
    if (this.pos.x > 262) { this.pos.x = 262; hit = true; }
    if (this.pos.x < -262) { this.pos.x = -262; hit = true; }
    if (this.pos.z > 262) { this.pos.z = 262; hit = true; }
    if (this.pos.z < -262) { this.pos.z = -262; hit = true; }
    if (hit && Math.abs(this.speed) > 3) this.crashed = true;
    if (hit) this.speed *= 0.45;
    return hit;
  }

  // Steer toward a world point at a desired speed; used by traffic and police.
  steerToward(tx, tz, desiredSpeed, dt, turnRate = 1.7) {
    const dx = tx - this.pos.x;
    const dz = tz - this.pos.z;
    const dist = Math.hypot(dx, dz);
    const targetHeading = Math.atan2(dx, dz);
    let diff = targetHeading - this.heading;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    const step = turnRate * dt;
    let delta = Math.max(-step, Math.min(step, diff));
    if (this.speed < -0.5) delta = -delta;
    this.heading += delta;
    this.steer = Math.max(-0.6, Math.min(0.6, diff));
    const accel = desiredSpeed > this.speed ? this.spec.accel : 26;
    const speedStep = accel * dt;
    this.speed += Math.max(-speedStep, Math.min(speedStep, desiredSpeed - this.speed));
    if (dist < 2.5) this.speed = Math.min(this.speed, desiredSpeed * 0.4);
    this.pos.x += Math.sin(this.heading) * this.speed * dt;
    this.pos.z += Math.cos(this.heading) * this.speed * dt;
    this.syncMesh(dt);
    return dist;
  }

  // Direct driving from input: throttle -1..1, steerInput -1..1.
  drive(throttle, steerInput, handbrake, dt) {
    const spec = this.spec;
    if (throttle > 0) {
      this.speed += spec.accel * throttle * dt * (this.speed < 0 ? 2.2 : 1);
    } else if (throttle < 0) {
      this.speed += (this.speed > 0.5 ? -26 : spec.accel * throttle * 0.55) * dt;
    }
    this.speed -= this.speed * 0.35 * dt; // rolling drag
    if (handbrake) this.speed -= this.speed * 2.4 * dt;
    this.speed = Math.max(-9, Math.min(spec.topSpeed, this.speed));
    const steerTarget = steerInput * 0.55 * (handbrake ? 1.35 : 1);
    this.steer += (steerTarget - this.steer) * Math.min(1, dt * 8);
    const grip = 1 - Math.min(0.45, Math.abs(this.speed) / spec.topSpeed) * 0.4;
    if (Math.abs(this.speed) > 0.05) {
      this.heading += (this.speed / 2.7) * Math.tan(this.steer * grip) * dt;
    }
    this.pos.x += Math.sin(this.heading) * this.speed * dt;
    this.pos.z += Math.cos(this.heading) * this.speed * dt;
    this.syncMesh(dt);
  }
}

// The lane point on a street: axis 'z' means the street runs north-south at
// streetX(index) and traffic travels along z, and right-hand traffic puts the lane
// on the driver's right.
export function lanePoint(axis, index, dir, s) {
  if (axis === 'z') return { x: streetX(index) - dir * LANE, z: s };
  return { x: s, z: streetZ(index) + dir * LANE };
}

export class Traffic {
  constructor(scene, rng, city) {
    this.cars = [];
    this.rng = rng;
    const kinds = ['sedan', 'sedan', 'sedan', 'taxi', 'coupe', 'truck'];
    for (let k = 0; k < 24; k++) {
      const kind = k === 5 ? 'truck' : rng.pick(kinds);
      const car = new Car(scene, rng, kind);
      const axis = rng.chance(0.5) ? 'z' : 'x';
      const index = rng.int(0, GRID);
      const dir = rng.chance(0.5) ? 1 : -1;
      // Keep spawn points apart on the same street so the city never starts in a jam.
      let s = rng.range(-230, 230);
      for (let tries = 0; tries < 6; tries++) {
        const clash = this.cars.some(
          (o) => o.traffic.axis === axis && o.traffic.index === index && Math.abs((axis === 'z' ? o.pos.z : o.pos.x) - s) < 15,
        );
        if (!clash) break;
        s += 24;
      }
      const p = lanePoint(axis, index, dir, s);
      car.place(p.x, p.z, axis === 'z' ? (dir > 0 ? 0 : Math.PI) : (dir > 0 ? Math.PI / 2 : -Math.PI / 2));
      car.speed = rng.range(6, 10);
      car.traffic = { axis, index, dir, wp: null, decideAt: 0 };
      this.cars.push(car);
    }
    // Parked cars from the city's kerb spots — the stealable fleet.
    this.parked = [];
    for (const spot of city.parkedSpots) {
      if (rng.chance(0.35)) continue;
      const car = new Car(scene, rng, rng.pick(['sedan', 'sedan', 'coupe', 'taxi']));
      car.place(spot.x, spot.z, spot.heading + (rng.chance(0.5) ? 0 : Math.PI));
      this.parked.push(car);
    }
  }

  nextWaypoint(car) {
    const t = car.traffic;
    const s = t.axis === 'z' ? car.pos.z : car.pos.x;
    // Next intersection ahead on this street.
    let inter = null;
    for (let j = 0; j <= GRID; j++) {
      const c = t.axis === 'z' ? streetZ(j) : streetX(j);
      const ahead = (c - s) * t.dir;
      if (ahead > 4 && (inter === null || ahead < inter.ahead)) inter = { ahead, index: j, at: c };
    }
    const rng = this.rng;
    if (inter && inter.ahead < 42 && rng.chance(0.42)) {
      // Turn onto the crossing street.
      const newDir = rng.chance(0.5) ? 1 : -1;
      const newAxis = t.axis === 'z' ? 'x' : 'z';
      const crossS = t.axis === 'z' ? car.pos.x : car.pos.z;
      const wp = lanePoint(newAxis, inter.index, newDir, crossS + newDir * 20);
      t.pending = { axis: newAxis, index: inter.index, dir: newDir, at: inter.at };
      return wp;
    }
    t.pending = null;
    return lanePoint(t.axis, t.index, t.dir, s + t.dir * 34);
  }

  update(dt, obstacles) {
    const all = obstacles.concat(this.cars);
    for (const car of this.cars) {
      const t = car.traffic;
      if (!t.wp) t.wp = this.nextWaypoint(car);
      const d = Math.hypot(t.wp.x - car.pos.x, t.wp.z - car.pos.z);
      if (d < 6) {
        if (t.pending) {
          t.axis = t.pending.axis;
          t.index = t.pending.index;
          t.dir = t.pending.dir;
          t.pending = null;
        }
        t.wp = this.nextWaypoint(car);
      }
      // Brake for whatever is ahead: another car, the player, a pedestrian.
      let desired = car.kind === 'truck' ? 8.5 : 11;
      const f = car.forward();
      for (const o of all) {
        if (o === car) continue;
        const ox = (o.pos ? o.pos.x : o.x) - car.pos.x;
        const oz = (o.pos ? o.pos.z : o.z) - car.pos.z;
        const ahead = ox * f.x + oz * f.z;
        const lateral = Math.abs(ox * f.z - oz * f.x);
        if (ahead > 0 && ahead < 9 && lateral < 2.3) {
          desired = Math.min(desired, Math.max(0, (ahead - 5) * 1.6));
        }
      }
      car.steerToward(t.wp.x, t.wp.z, desired, dt, 1.5);
    }
  }
}
