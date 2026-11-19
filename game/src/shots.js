// The screenshot scenes behind ?shot=cover|chase|docks|boulevard. Each stages the real
// game — its own cars, cops, guards, walkers and HUD — into one honest frame: traffic is
// stepped forward so the streets are mid-motion, the police are spawned by the wanted
// system itself, and the HUD is set through the same calls the live game makes.
// Nothing here is drawn or composited; it is the game, arranged.

import { animateHumanoid, buildHumanoid, knockDown } from './player.js';
import { placeCar } from './vehicles.js';

/** Step the ambient systems forward so a still frame catches the city mid-life. */
function settle(api, seconds, focusPos) {
  const dt = 1 / 30;
  for (let t = 0; t < seconds; t += dt) {
    api.traffic.update(dt, focusPos);
    api.peds.update(dt, focusPos);
    api.city.update(dt);
  }
}

function aim(camera, x, y, z, lx, ly, lz) {
  camera.position.set(x, y, z);
  camera.lookAt(lx, ly, lz);
}

/** The shared HUD furniture for a scene about the story. */
function baseHud(api, { cash, respect, health = 100, armor = 0, clock = '17:05' }) {
  api.hud.setCash(cash);
  api.hud.setRespect(respect);
  api.hud.setHealth(health, armor);
  api.hud.setClock(clock);
  api.hud.setBust(0);
}

/** Paint a car's body shell (the first mesh of its group) for the camera. */
function repaint(car, color) {
  car.mesh.children[0].material = new THREE.MeshLambertMaterial({ color });
}

/** Cover: late sun on the Costa, Nico at the wheel, a checkpoint gold ahead. */
function stageCover(api) {
  const { city, player, parkedCars, state, camera, hud, minimap, missions } = api;
  const car = parkedCars[0];
  repaint(car, 0xd64541);
  placeCar(car, -40, 195.4, Math.PI / 2);
  car.speed = 16;
  state.driving = true;
  state.car = car;
  player.mesh.visible = false;
  settle(api, 2.2, car.mesh.position);
  // Traffic to race: one car ahead in the same lane, one coming the other way.
  const ahead = api.traffic.cars[0];
  if (ahead) { placeCar(ahead, 14, 195.4, Math.PI / 2); ahead.speed = 11; }
  const oncoming = api.traffic.cars[1];
  if (oncoming) { placeCar(oncoming, -88, 188.6, -Math.PI / 2); oncoming.speed = 12; }
  baseHud(api, { cash: 1250, respect: 'DEBT LEFT: $8,000' });
  hud.setStars(0);
  hud.setWeapon(false, 0, false);
  hud.setSpeed(64);
  hud.setObjective('COSTA SPRINT', 'Checkpoint 3 of 8 · 62s', 88);
  const marker = new THREE.Vector3(48, 0, 192);
  minimap.draw(0.4, {
    playerPos: car.mesh.position, playerHeading: car.heading, marker,
    police: [], traffic: api.traffic.cars, guards: [], pickups: [],
  });
  aim(camera, -55, 3.4, 185.5, -22, 1.2, 194);
  city.followSun(car.mesh.position);
  missions.state.marker = marker;
}

/** Chase: three stars over downtown, the law filling the mirror. */
function stageChase(api) {
  const { city, player, parkedCars, state, camera, hud, minimap, police, missions } = api;
  const car = parkedCars[1];
  repaint(car, 0x2e6da4);
  placeCar(car, 3.4, -20, Math.PI);
  car.speed = 21;
  car.heading = Math.PI;
  state.driving = true;
  state.car = car;
  player.mesh.visible = false;
  police.commitCrime(3);
  const ctx = {
    playerPos: car.mesh.position, playerCar: car, playerInCar: true,
    playerSpeed: car.speed, onBusted: () => {},
  };
  for (let t = 0; t < 1.2; t += 1 / 30) police.update(1 / 30, ctx);
  // Bring the patrol cars into the frame behind Nico; the third is still coming.
  if (police.cars[0]) placeCar(police.cars[0], -2.5, -6, Math.PI);
  if (police.cars[1]) placeCar(police.cars[1], 7.5, -1, Math.PI);
  if (police.cars[2]) placeCar(police.cars[2], 0.5, 8, Math.PI);
  settle(api, 1.4, car.mesh.position);
  baseHud(api, { cash: 800, respect: 'DEBT LEFT: $8,500', health: 88 });
  hud.setStars(3);
  hud.setWeapon(false, 0, false);
  hud.setSpeed(91);
  hud.setObjective('HOT PACKAGE', 'Café Sol — lose them or outrun them', 214);
  const marker = city.landmarks.cafe;
  minimap.draw(0.4, {
    playerPos: car.mesh.position, playerHeading: Math.PI, marker,
    police: police.cars, traffic: api.traffic.cars, guards: [], pickups: [],
  });
  aim(camera, 10.5, 2.8, -33, 2.5, 1.1, -14);
  city.followSun(car.mesh.position);
  missions.state.marker = marker;
}

/** Docks: the Muelle 9 shootout, one guard already down, the case still to grab. */
function stageDocks(api) {
  const { city, player, state, camera, hud, minimap, combat, missions } = api;
  player.mesh.position.set(131, 0, 153);
  player.heading = 2.15;
  player.mesh.rotation.y = 2.15;
  player.armed = true;
  player.ammo = 9;
  player.mesh.userData.gun.visible = true;
  animateHumanoid(player.mesh, 0.7, 0.5);
  const g1 = combat.spawnGuard(137.5, 147, -2.2);
  const g2 = combat.spawnGuard(123, 161, 0.9);
  const g3 = combat.spawnGuard(150, 158, -2.8);
  const down = combat.spawnGuard(134.5, 150.5, 0);
  down.alive = false;
  knockDown(down.mesh);
  animateHumanoid(g1.mesh, 1.9, 0.4);
  animateHumanoid(g2.mesh, 0.4, 0.4);
  animateHumanoid(g3.mesh, 3.1, 0.4);
  settle(api, 1.2, player.mesh.position);
  baseHud(api, { cash: 2400, respect: 'DEBT LEFT: $5,800', health: 72, armor: 40, clock: '17:22' });
  hud.setStars(0);
  hud.setWeapon(true, 9, false);
  hud.setSpeed(null);
  hud.setObjective('DOCKSIDE TROUBLE', 'Clear the dock crew — 3 left', null);
  const marker = new THREE.Vector3(138, 0, 156);
  minimap.draw(0.4, {
    playerPos: player.mesh.position, playerHeading: 2.15, marker,
    police: [], traffic: api.traffic.cars, guards: combat.guards, pickups: [],
  });
  const fx = Math.sin(2.15); const fz = Math.cos(2.15);
  aim(camera,
    131 - fx * 5.2, 2.3, 153 - fz * 5.2,
    131 + fx * 5.5, 1.0, 153 + fz * 5.5);
  city.followSun(player.mesh.position);
  missions.state.marker = marker;
  state.camYaw = 2.15;
}

/** Boulevard: the first meeting — Sol, the Hotel Palmera, and ten thousand reasons. */
function stageBoulevard(api) {
  const { city, player, state, camera, hud, minimap, missions, rng } = api;
  const spot = city.landmarks.hotel;
  player.mesh.position.set(spot.x - 2.5, 0, spot.z + 2.5);
  player.heading = 2.25;
  player.mesh.rotation.y = 2.25;
  animateHumanoid(player.mesh, 0.2, 0.1);
  const sol = buildHumanoid(rng, { shirt: 0x0e7c86, pants: 0x20303e, cap: null });
  sol.position.set(spot.x + 0.5, 0, spot.z - 0.5);
  sol.rotation.y = 2.25 + Math.PI;
  api.scene.add(sol);
  // The beacon column would swallow both characters at this range; the ring stays.
  const beaconMesh = api.scene.getObjectByName('mission-beacon');
  if (beaconMesh) beaconMesh.visible = false;
  settle(api, 2.4, player.mesh.position);
  baseHud(api, { cash: 0, respect: 'DEBT LEFT: $10,000', clock: '16:58' });
  hud.setStars(0);
  hud.setWeapon(false, 0, false);
  hud.setSpeed(null);
  hud.setObjective('', '');
  hud.showDialogue('SOL', 'Nico Vega. Ten thousand owed to the Marina Crew, due Friday, and you arrive on foot.');
  minimap.draw(0.4, {
    playerPos: player.mesh.position, playerHeading: 2.25, marker: spot,
    police: [], traffic: api.traffic.cars, guards: [], pickups: [],
  });
  const fx = Math.sin(2.25); const fz = Math.cos(2.25);
  aim(camera,
    spot.x - 2.5 - fx * 6.5, 2.5, spot.z + 2.5 - fz * 6.5,
    spot.x + fx * 3, 1.3, spot.z + fz * 3);
  city.followSun(player.mesh.position);
  missions.state.marker = spot;
  state.camYaw = 2.25;
}

/** Stage the named scene into the world main built. Any other name is the cover. */
export function stageShot(name, api) {
  if (name === 'chase') stageChase(api);
  else if (name === 'docks') stageDocks(api);
  else if (name === 'boulevard') stageBoulevard(api);
  else stageCover(api);
}
