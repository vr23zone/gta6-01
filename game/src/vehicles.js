// Cars: how they are built (boxes, wheels, lightbars), how they move (one arcade physics
// step shared by the player, traffic and the police), and the traffic itself — a fleet
// that follows the street grid, keeps its lane, stops for trouble and turns at corners.

import { CAR, GRID, ROAD_HALF } from './config.js';

const BODY_COLORS = [0xd64541, 0x2e6da4, 0xf2f0e6, 0x30343c, 0xe8a13a, 0x5b8c5a, 0x8e44ad, 0xc0c6cc, 0x7fb3d5, 0xb03a2e];
const glassMat = new THREE.MeshLambertMaterial({ color: 0x18242f });
const tyreMat = new THREE.MeshLambertMaterial({ color: 0x14161a });
const chromeMat = new THREE.MeshLambertMaterial({ color: 0x9aa2ab });

/** Wrap an angle to [-PI, PI). */
export function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

/** Build one low-poly car. Police cars get a lightbar whose two halves the police module flashes. */
export function buildCarMesh(rng, { police = false, color = null } = {}) {
  const group = new THREE.Group();
  const paint = new THREE.MeshLambertMaterial({ color: police ? 0xf4f6f8 : (color ?? BODY_COLORS[rng.int(0, BODY_COLORS.length - 1)]) });
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.62, 4.3), paint);
  body.position.y = 0.62;
  body.castShadow = true;
  group.add(body);
  if (police) {
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(1.94, 0.3, 4.34), new THREE.MeshLambertMaterial({ color: 0x20303e }));
    stripe.position.y = 0.6;
    group.add(stripe);
  }
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.66, 0.55, 2.1), glassMat);
  cabin.position.set(0, 1.16, -0.25);
  cabin.castShadow = true;
  group.add(cabin);
  const wheelGeo = new THREE.CylinderGeometry(0.37, 0.37, 0.28, 10);
  wheelGeo.rotateZ(Math.PI / 2);
  const wheels = [];
  for (const [wx, wz] of [[-0.88, 1.4], [0.88, 1.4], [-0.88, -1.4], [0.88, -1.4]]) {
    const wheel = new THREE.Mesh(wheelGeo, tyreMat);
    wheel.position.set(wx, 0.37, wz);
    group.add(wheel);
    wheels.push(wheel);
  }
  const lightGeo = new THREE.BoxGeometry(0.34, 0.16, 0.06);
  const headMat = new THREE.MeshBasicMaterial({ color: 0xfff3b0 });
  const tailMat = new THREE.MeshBasicMaterial({ color: 0xd92626 });
  for (const lx of [-0.6, 0.6]) {
    const head = new THREE.Mesh(lightGeo, headMat);
    head.position.set(lx, 0.68, 2.16);
    group.add(head);
    const tail = new THREE.Mesh(lightGeo, tailMat);
    tail.position.set(lx, 0.68, -2.16);
    group.add(tail);
  }
  const bumper = new THREE.Mesh(new THREE.BoxGeometry(1.94, 0.22, 0.3), chromeMat);
  bumper.position.set(0, 0.34, 2.1);
  group.add(bumper);
  let lightbar = null;
  if (police) {
    lightbar = new THREE.Group();
    const red = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.18, 0.5), new THREE.MeshBasicMaterial({ color: 0xff2a2a }));
    red.position.x = -0.3;
    const blue = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.18, 0.5), new THREE.MeshBasicMaterial({ color: 0x2a6bff }));
    blue.position.x = 0.3;
    lightbar.add(red); lightbar.add(blue);
    lightbar.position.set(0, 1.55, -0.25);
    lightbar.userData = { red, blue };
    group.add(lightbar);
  }
  group.userData = { wheels, lightbar };
  return group;
}

/** A car in the world: mesh plus the state the physics and the drivers share. */
export function createCar(scene, rng, kind, opts = {}) {
  const mesh = buildCarMesh(rng, opts);
  scene.add(mesh);
  const car = {
    kind,
    mesh,
    heading: opts.heading || 0,
    speed: 0,
    topSpeed: opts.topSpeed || 24,
    health: 100,
    alive: true,
    highlighted: false,
    waypoint: null,
    stuckTime: 0,
    flashPhase: Math.random() * Math.PI * 2,
  };
  placeCar(car, opts.x || 0, opts.z || 0, car.heading);
  return car;
}

/** Put a car somewhere, facing a heading (forward = (sin h, cos h) in xz). */
export function placeCar(car, x, z, heading) {
  car.mesh.position.set(x, 0, z);
  car.heading = heading;
  car.mesh.rotation.y = heading;
  car.speed = 0;
}

/**
 * One arcade physics step: throttle and steer in [-1, 1], handbrake optional.
 * Resolves building collision through the city and returns the impact speed (0 = none),
 * which callers turn into crash sounds, damage and wanted stars.
 */
export function stepCar(car, control, dt, city) {
  const accel = car.kind === 'police' ? CAR.policeAccel : CAR.accel;
  if (control.throttle > 0) {
    car.speed += accel * control.throttle * dt * (car.speed < 0 ? 2.4 : 1);
  } else if (control.throttle < 0) {
    car.speed += control.throttle * dt * (car.speed > 0.5 ? CAR.brake : accel * 0.8);
  }
  car.speed -= car.speed * CAR.drag * dt * 0.35;
  if (control.handbrake) car.speed -= car.speed * 2.6 * dt;
  const top = car.kind === 'police' ? car.topSpeed * CAR.policeTopBonus : car.topSpeed;
  car.speed = THREE.MathUtils.clamp(car.speed, -CAR.reverseMax, top);
  if (Math.abs(car.speed) < 0.02 && control.throttle === 0) car.speed = 0;

  const steerAuthority = THREE.MathUtils.clamp(car.speed / 9, -1.3, 1.3);
  car.heading -= control.steer * CAR.gripTurn * steerAuthority * dt * 0.62;

  const pos = car.mesh.position;
  const beforeX = pos.x; const beforeZ = pos.z;
  pos.x += Math.sin(car.heading) * car.speed * dt;
  pos.z += Math.cos(car.heading) * car.speed * dt;
  const wanted = Math.abs(car.speed) * dt;
  city.collideCircle(pos, CAR.radius);
  const moved = Math.hypot(pos.x - beforeX, pos.z - beforeZ);
  let impact = 0;
  if (wanted > 0.01 && moved < wanted * 0.45) {
    impact = Math.abs(car.speed);
    car.speed *= 0.25;
  }
  car.mesh.rotation.y = car.heading;
  const spin = car.speed * dt / 0.37;
  for (const wheel of car.mesh.userData.wheels) wheel.rotation.x += spin;
  return impact;
}

/**
 * Steer a car toward a point and return the distance left: the one driver traffic,
 * police and mission cars all share. Slows for corners, stops at the point if asked.
 */
export function driveToward(car, tx, tz, dt, city, { topSpeed = 14, arrive = false, throttleScale = 1 } = {}) {
  const pos = car.mesh.position;
  const dx = tx - pos.x;
  const dz = tz - pos.z;
  const dist = Math.hypot(dx, dz);
  const desired = Math.atan2(dx, dz);
  const diff = wrapAngle(desired - car.heading);
  const steer = THREE.MathUtils.clamp(diff * 1.7, -1, 1);
  let throttle = Math.abs(diff) > 1.25 ? 0.15 : 1;
  if (arrive && dist < 7) throttle = Math.min(throttle, dist / 7);
  const savedTop = car.topSpeed;
  car.topSpeed = topSpeed;
  stepCar(car, { throttle: throttle * throttleScale, steer }, dt, city);
  car.topSpeed = savedTop;
  return dist;
}

/** The next intersection along a street from (coord), one grid step in direction dir. */
function nextIntersection(coord, dir) {
  const cell = Math.round(coord / GRID);
  return (cell + dir) * GRID;
}

/**
 * The traffic fleet: cars that pick a lane, follow it to the next corner, and there
 * choose where to go next. They brake for anything solid ahead of them and quietly
 * respawn far away when they drift too far from the player, so the city stays full.
 */
export function createTraffic(scene, city, rng, count, obstacles) {
  const cars = [];
  const lines = city.streetLines;

  function spawnPoint(farFrom) {
    for (let tries = 0; tries < 12; tries += 1) {
      const vertical = rng.chance(0.5);
      const line = lines[rng.int(0, lines.length - 1)];
      const along = rng.range(-190, 190);
      const dir = rng.chance(0.5) ? 1 : -1;
      const lane = line - dir * 3.4;
      const x = vertical ? lane : along;
      const z = vertical ? along : lane;
      if (farFrom && Math.hypot(x - farFrom.x, z - farFrom.z) < 55) continue;
      return { x, z, vertical, line, dir };
    }
    return { x: 0, z: -190, vertical: true, line: 0, dir: 1 };
  }

  function aimAtNextCorner(car) {
    const pos = car.mesh.position;
    if (car.vertical) {
      const targetZ = nextIntersection(pos.z, car.dir);
      car.waypoint = { x: car.line - car.dir * 3.4, z: targetZ };
    } else {
      const targetX = nextIntersection(pos.x, car.dir);
      car.waypoint = { x: targetX, z: car.line - car.dir * 3.4 };
    }
  }

  function chooseTurn(car) {
    const pos = car.mesh.position;
    const roll = rng.next();
    if (roll < 0.45) {
      // Straight on: same axis, same line, new target corner.
      aimAtNextCorner(car);
      return;
    }
    // Turn: the cross street here becomes the new line.
    const crossLine = Math.round((car.vertical ? pos.z : pos.x) / GRID) * GRID;
    car.vertical = !car.vertical;
    car.line = crossLine;
    car.dir = rng.chance(0.5) ? 1 : -1;
    aimAtNextCorner(car);
  }

  for (let i = 0; i < count; i += 1) {
    const spot = spawnPoint(null);
    const car = createCar(scene, rng, 'traffic', {
      x: spot.x, z: spot.z,
      heading: spot.vertical ? (spot.dir > 0 ? 0 : Math.PI) : (spot.dir > 0 ? Math.PI / 2 : -Math.PI / 2),
      topSpeed: rng.range(11, 15),
    });
    car.vertical = spot.vertical;
    car.line = spot.line;
    car.dir = spot.dir;
    aimAtNextCorner(car);
    cars.push(car);
  }

  /** Anything solid within braking distance ahead of this car? */
  function blockedAhead(car) {
    const pos = car.mesh.position;
    const fx = Math.sin(car.heading);
    const fz = Math.cos(car.heading);
    for (const other of obstacles()) {
      if (other === car || !other.alive) continue;
      const op = other.mesh ? other.mesh.position : other;
      const dx = op.x - pos.x;
      const dz = op.z - pos.z;
      const ahead = dx * fx + dz * fz;
      if (ahead < 0.5 || ahead > 8.5) continue;
      const lateral = Math.abs(dx * fz - dz * fx);
      if (lateral < 2.1) return true;
    }
    return false;
  }

  function update(dt, playerPos) {
    for (const car of cars) {
      if (!car.alive || car.hijacked) continue;
      const pos = car.mesh.position;
      if (Math.hypot(pos.x - playerPos.x, pos.z - playerPos.z) > 280) {
        const spot = spawnPoint(playerPos);
        placeCar(car, spot.x, spot.z, spot.vertical ? (spot.dir > 0 ? 0 : Math.PI) : (spot.dir > 0 ? Math.PI / 2 : -Math.PI / 2));
        car.vertical = spot.vertical; car.line = spot.line; car.dir = spot.dir;
        aimAtNextCorner(car);
        continue;
      }
      const dist = driveToward(car, car.waypoint.x, car.waypoint.z, dt, city, {
        topSpeed: car.topSpeed,
        throttleScale: blockedAhead(car) ? 0 : 1,
      });
      if (blockedAhead(car)) {
        car.speed = Math.min(car.speed, 0);
        car.stuckTime += dt;
      } else {
        car.stuckTime = 0;
      }
      if (dist < 4.5) chooseTurn(car);
      if (car.stuckTime > 7) {
        // Gridlock is forever: quietly move the car to a far street.
        const spot = spawnPoint(playerPos);
        placeCar(car, spot.x, spot.z, spot.vertical ? (spot.dir > 0 ? 0 : Math.PI) : (spot.dir > 0 ? Math.PI / 2 : -Math.PI / 2));
        car.vertical = spot.vertical; car.line = spot.line; car.dir = spot.dir;
        aimAtNextCorner(car);
      }
    }
  }

  return { cars, update };
}

/** Parked cars along the curbs: the city's stealable stock, plus one the story picks out. */
export function spawnParkedCars(scene, city, rng, count) {
  const cars = [];
  const lines = city.streetLines;
  for (let i = 0; i < count; i += 1) {
    const vertical = rng.chance(0.5);
    const line = lines[rng.int(0, lines.length - 1)];
    const side = rng.chance(0.5) ? 1 : -1;
    const along = Math.floor(rng.range(-3.8, 3.8)) * GRID + rng.range(13, 35);
    const curb = line + side * (ROAD_HALF - 1.8);
    const x = vertical ? curb : along;
    const z = vertical ? along : curb;
    const heading = vertical ? (side > 0 ? Math.PI : 0) : (side > 0 ? -Math.PI / 2 : Math.PI / 2);
    const car = createCar(scene, rng, 'parked', { x, z, heading, topSpeed: rng.range(21, 27) });
    cars.push(car);
  }
  return cars;
}
