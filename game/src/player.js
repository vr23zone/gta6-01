// player.js — Nico Vega himself: the on-foot controller, the car thief, and the
// camera that follows both. On foot he walks and sprints relative to the camera,
// turns to face his aim when the pistol is up, and collides with the city as a
// circle. E takes the nearest car — parked cars quietly, traffic cars by force,
// which the game reports as a crime if anyone is watching — and E again steps out
// beside it. The camera is a smoothed third-person rig: over the shoulder on foot,
// a chase view in a car that lags into the corners and shakes when metal meets wall.

import { makePerson, faceToward } from './people.js';
import { collideCircle } from './vehicles.js';
import { keys, justPressed, takeLook, isFiring } from './input.js';

export class Player {
  constructor(scene, rng) {
    this.person = makePerson(rng, { shirt: 0x17a398, pants: 0x2b3a4a, skin: 0xd9a066, hair: 0x1d150e });
    this.pos = this.person.group.position;
    this.pos.set(-196, 0, 196); // outside the garage, south-west corner
    scene.add(this.person.group);
    this.mode = 'foot'; // foot | car
    this.car = null;
    this.health = 100;
    this.armor = 0;
    this.walkPhase = 0;
    this.camYaw = Math.PI * 0.75;
    this.camPitch = 0.32;
    this.camShake = 0;
    this.dead = false;
    this.events = {}; // onEnterCar(car), onExitCar(car), onJack(car)
  }

  get speed2d() {
    if (this.mode === 'car' && this.car) return Math.abs(this.car.speed);
    return this.footSpeed || 0;
  }

  placeAt(x, z) {
    this.pos.set(x, 0, z);
  }

  nearestCar(cars, maxDist = 3.4) {
    let best = null;
    let bestD = maxDist;
    for (const car of cars) {
      const d = Math.hypot(car.pos.x - this.pos.x, car.pos.z - this.pos.z);
      if (d < bestD) {
        bestD = d;
        best = car;
      }
    }
    return best;
  }

  enterCar(car, wasMoving) {
    this.mode = 'car';
    this.car = car;
    this.person.group.visible = false;
    if (this.events.onEnterCar) this.events.onEnterCar(car, wasMoving);
  }

  exitCar() {
    const car = this.car;
    if (!car) return;
    const side = { x: Math.cos(car.heading), z: -Math.sin(car.heading) };
    this.pos.set(car.pos.x + side.x * 2.2, 0, car.pos.z + side.z * 2.2);
    this.person.group.visible = true;
    this.mode = 'foot';
    this.car = null;
    if (this.events.onExitCar) this.events.onExitCar(car);
  }

  damage(amount) {
    if (this.dead) return;
    const absorbed = Math.min(this.armor, amount * 0.7);
    this.armor -= absorbed;
    this.health -= amount - absorbed;
    if (this.health <= 0) {
      this.health = 0;
      this.dead = true;
    }
  }

  heal(amount) {
    this.health = Math.min(100, this.health + amount);
  }

  update(dt, ctx) {
    const look = takeLook();
    this.camYaw -= look.dx * 0.0026;
    this.camPitch = Math.max(-0.15, Math.min(1.1, this.camPitch + look.dy * 0.0022));

    if (this.mode === 'car' && this.car) {
      const car = this.car;
      const throttle = (keys.KeyW || keys.ArrowUp ? 1 : 0) + (keys.KeyS || keys.ArrowDown ? -1 : 0);
      const steer = (keys.KeyA || keys.ArrowLeft ? 1 : 0) + (keys.KeyD || keys.ArrowRight ? -1 : 0);
      const wasSpeed = Math.abs(car.speed);
      car.drive(throttle, steer, !!keys.Space, dt);
      car.collideWorld(ctx.colliders);
      if (car.crashed) {
        car.crashed = false;
        this.camShake = Math.min(0.5, wasSpeed * 0.012);
        if (ctx.events.onCrash) ctx.events.onCrash(car);
      }
      this.pos.set(car.pos.x, 0, car.pos.z);
      if (justPressed('KeyE') || justPressed('KeyF')) this.exitCar();
      return;
    }

    // On foot.
    const firing = isFiring();
    this.person.setAim(firing);
    let mx = 0;
    let mz = 0;
    const sin = Math.sin(this.camYaw);
    const cos = Math.cos(this.camYaw);
    if (keys.KeyW || keys.ArrowUp) { mx -= sin; mz -= cos; }
    if (keys.KeyS || keys.ArrowDown) { mx += sin; mz += cos; }
    if (keys.KeyA || keys.ArrowLeft) { mx -= cos; mz += sin; }
    if (keys.KeyD || keys.ArrowRight) { mx += cos; mz -= sin; }
    const len = Math.hypot(mx, mz);
    const sprint = keys.ShiftLeft || keys.ShiftRight;
    const speed = sprint ? 8.2 : 5.0;
    this.footSpeed = 0;
    if (len > 0.01) {
      mx /= len;
      mz /= len;
      this.pos.x += mx * speed * dt;
      this.pos.z += mz * speed * dt;
      this.footSpeed = speed;
      this.walkPhase += dt * (sprint ? 11 : 8);
      this.person.setWalk(this.walkPhase, 1);
      if (!firing) faceToward(this.person, mx, mz);
    } else {
      this.person.setWalk(this.walkPhase, 0);
    }
    if (firing) {
      // Face the camera's aim while shooting.
      this.person.group.rotation.y = this.camYaw + Math.PI;
    }
    collideCircle(this.pos, 0.55, ctx.colliders);
    // Keep Nico out of the sea and the marina basin.
    this.pos.x = Math.min(this.pos.x, 258);
    this.pos.x = Math.max(this.pos.x, -258);
    this.pos.z = Math.max(-258, Math.min(258, this.pos.z));

    if (justPressed('KeyE') || justPressed('KeyF')) {
      const car = this.nearestCar(ctx.allCars);
      if (car && ctx.events.tryEnterCar(car)) {
        // main.js performs the enter so it can move traffic cars between lists.
      }
    }
  }

  // Position the camera for this frame; call after update, before render.
  updateCamera(camera, dt) {
    this.camShake = Math.max(0, this.camShake - dt * 1.4);
    const shakeX = (Math.random() - 0.5) * this.camShake;
    const shakeY = (Math.random() - 0.5) * this.camShake;
    if (this.mode === 'car' && this.car) {
      const car = this.car;
      // The chase yaw eases toward the car's heading; the mouse can offset it.
      let diff = car.heading - this.camYaw;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      this.camYaw += diff * Math.min(1, dt * 3.2);
      const back = 9.6;
      const tx = car.pos.x - Math.sin(this.camYaw) * back;
      const tz = car.pos.z - Math.cos(this.camYaw) * back;
      camera.position.lerp(new THREE.Vector3(tx, 3.4 + shakeY, tz), Math.min(1, dt * 6));
      camera.position.y = Math.max(1.2, camera.position.y);
      const look = new THREE.Vector3(
        car.pos.x + Math.sin(this.camYaw) * 7 + shakeX,
        1.4,
        car.pos.z + Math.cos(this.camYaw) * 7,
      );
      camera.lookAt(look);
      return;
    }
    const dist = 5.6;
    const cx = this.pos.x + Math.sin(this.camYaw) * Math.cos(this.camPitch) * dist;
    const cz = this.pos.z + Math.cos(this.camYaw) * Math.cos(this.camPitch) * dist;
    const cy = 1.6 + Math.sin(this.camPitch) * dist;
    camera.position.lerp(new THREE.Vector3(cx, Math.max(0.5, cy), cz), Math.min(1, dt * 14));
    camera.lookAt(this.pos.x + shakeX, 1.5, this.pos.z);
  }

  // The world direction the crosshair points: from the camera through its centre.
  aimDirection(camera) {
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    return dir;
  }
}
