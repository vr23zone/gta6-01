// People are boxes with opinions: a torso, swinging arms and legs, a cap to show which
// way they face. This module builds that humanoid (the player, the crowds and the guards
// all wear it), and walks Nico around the city on foot, third-person, camera-relative.

import { PLAYER } from './config.js';
import { wrapAngle } from './vehicles.js';

const SKIN_TONES = [0xf2c79b, 0xc68863, 0x8d5524, 0xffdbac];

/**
 * Build a low-poly person. Returns the group; userData holds the limbs the walk
 * animation swings, and `setColors` is unnecessary — colors are chosen at build time.
 */
export function buildHumanoid(rng, { shirt = 0xff6b4a, pants = 0xf2f0e6, skin = null, cap = 0x20303e } = {}) {
  const group = new THREE.Group();
  const skinMat = new THREE.MeshLambertMaterial({ color: skin ?? SKIN_TONES[rng.int(0, SKIN_TONES.length - 1)] });
  const shirtMat = new THREE.MeshLambertMaterial({ color: shirt });
  const pantsMat = new THREE.MeshLambertMaterial({ color: pants });

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.72, 0.34), shirtMat);
  torso.position.y = 1.12;
  torso.castShadow = true;
  group.add(torso);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.42, 0.4), skinMat);
  head.position.y = 1.72;
  head.castShadow = true;
  group.add(head);
  if (cap !== null) {
    const top = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.12, 0.44), new THREE.MeshLambertMaterial({ color: cap }));
    top.position.y = 1.97;
    group.add(top);
    const brim = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.05, 0.3), top.material);
    brim.position.set(0, 1.93, 0.34);
    group.add(brim);
  }
  const limbGeo = new THREE.BoxGeometry(0.17, 0.78, 0.17);
  limbGeo.translate(0, -0.36, 0);
  const legs = [];
  const arms = [];
  for (const side of [-1, 1]) {
    const leg = new THREE.Mesh(limbGeo, pantsMat);
    leg.position.set(side * 0.17, 0.78, 0);
    leg.castShadow = true;
    group.add(leg);
    legs.push(leg);
    const arm = new THREE.Mesh(limbGeo, shirtMat);
    arm.position.set(side * 0.42, 1.44, 0);
    arm.castShadow = true;
    group.add(arm);
    arms.push(arm);
  }
  // A simple pistol block, shown in the right hand once Nico is armed.
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.16, 0.42), new THREE.MeshLambertMaterial({ color: 0x14161a }));
  gun.position.set(0.42, 0.62, 0.18);
  gun.visible = false;
  group.add(gun);
  group.userData = { legs, arms, gun };
  return group;
}

/** Swing the limbs for a walker at the given phase; bigger stride = bigger swing. */
export function animateHumanoid(mesh, phase, stride = 1) {
  const { legs, arms } = mesh.userData;
  const swing = Math.sin(phase) * 0.55 * stride;
  legs[0].rotation.x = swing;
  legs[1].rotation.x = -swing;
  arms[0].rotation.x = -swing * 0.8;
  arms[1].rotation.x = swing * 0.8;
  mesh.position.y = Math.abs(Math.sin(phase)) * 0.05 * stride;
}

/** Lay a person down (hit, floored, sleeping it off): rotate the group onto its back. */
export function knockDown(mesh) {
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.25;
}

/** Nico himself: the mesh, the stats, and the on-foot step. */
export function createPlayer(scene, rng) {
  const mesh = buildHumanoid(rng, { shirt: 0xff6b4a, pants: 0xf5f2ea, cap: 0xffb703 });
  scene.add(mesh);
  const player = {
    mesh,
    heading: Math.PI,
    health: PLAYER.maxHealth,
    armor: 0,
    armed: false,
    ammo: 0,
    animPhase: 0,
    moving: false,
    /** Seconds since the player last took damage; the HUD vignette reads it. */
    hurtAgo: 99,
  };
  mesh.position.set(-24, 0, 24);

  /**
   * Walk one step. Movement is relative to the camera's yaw; when the mouse is locked
   * Nico faces where the camera faces (so he can aim), otherwise he turns to his stride.
   */
  player.step = function step(dt, input, camYaw, city, aimWithCamera) {
    const axes = input.axes();
    const sprinting = input.sprint();
    const speed = sprinting ? PLAYER.sprintSpeed : PLAYER.walkSpeed;
    const fx = Math.sin(camYaw); const fz = Math.cos(camYaw);
    const rx = -Math.cos(camYaw); const rz = Math.sin(camYaw);
    let mx = fx * axes.z + rx * axes.x;
    let mz = fz * axes.z + rz * axes.x;
    const len = Math.hypot(mx, mz);
    player.moving = len > 0.05;
    if (player.moving) {
      mx /= len; mz /= len;
      const pos = mesh.position;
      pos.x += mx * speed * dt;
      pos.z += mz * speed * dt;
      city.collideCircle(pos, PLAYER.radius);
      const targetHeading = aimWithCamera ? camYaw : Math.atan2(mx, mz);
      const diff = wrapAngle(targetHeading - player.heading);
      player.heading += diff * Math.min(1, dt * 14);
      player.animPhase += dt * (sprinting ? 11 : 8);
    } else if (aimWithCamera) {
      player.heading += wrapAngle(camYaw - player.heading) * Math.min(1, dt * 14);
    }
    mesh.rotation.y = player.heading;
    animateHumanoid(mesh, player.animPhase, player.moving ? 1 : 0);
    if (!player.moving) {
      mesh.position.y = 0;
      const { legs, arms } = mesh.userData;
      legs[0].rotation.x *= 0.8; legs[1].rotation.x *= 0.8;
      arms[0].rotation.x *= 0.8; arms[1].rotation.x *= 0.8;
    }
    player.hurtAgo += dt;
  };

  /** Damage lands on armor first, then health. Returns true when it was the last of it. */
  player.hurt = function hurt(amount) {
    player.hurtAgo = 0;
    const soaked = Math.min(player.armor, amount);
    player.armor -= soaked;
    player.health -= (amount - soaked);
    return player.health <= 0;
  };

  player.heal = function heal(amount) {
    player.health = Math.min(PLAYER.maxHealth, player.health + amount);
  };

  return player;
}
