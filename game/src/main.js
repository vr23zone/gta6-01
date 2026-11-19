// Solara Heat — boot, the loop, and the law that binds the modules: screens (title, play,
// pause, busted, wasted), the camera, driving and walking, entering and stealing cars,
// collisions and the crimes they commit, shooting, pickups, saving. The fixed-step loop
// advances the world in 1/60 s slices exactly as the starter's did, so a slow frame never
// changes how the game plays — and ?shot= scenes stage themselves through shots.js.

import { ECONOMY, PISTOL, STEP } from './config.js';
import { createRandom } from './random.js';
import { createInput, ACTION_INTERACT, ACTION_PAUSE, ACTION_RELOAD } from './input.js';
import { createAudio } from './audio.js';
import { createCity } from './city.js';
import { createPlayer } from './player.js';
import { createTraffic, spawnParkedCars, stepCar } from './vehicles.js';
import { createPedestrians } from './pedestrians.js';
import { createPolice } from './police.js';
import { createCombat } from './combat.js';
import { createMissions, MISSION_REWARDS } from './missions.js';
import { createHud } from './hud.js';
import { createMinimap } from './minimap.js';
import { loadSave, storeSave, clearSave } from './save.js';
import { stageShot } from './shots.js';

const params = new URLSearchParams(window.location.search);
const shotName = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : 20261117;

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const rng = createRandom(seed);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
function sizeRenderer() { renderer.setSize(window.innerWidth, window.innerHeight); }
sizeRenderer();
window.addEventListener('resize', sizeRenderer);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.1, 2400);
window.addEventListener('resize', () => { camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix(); });

const audio = createAudio();
const input = createInput(canvas);
const city = createCity(scene, rng);
const player = createPlayer(scene, rng);
const peds = createPedestrians(scene, city, rng, 26);
const parkedCars = spawnParkedCars(scene, city, rng, 18);
const police = createPolice(scene, city, rng);
const combat = createCombat(scene, rng);

const state = {
  screen: shotName ? 'shot' : 'title', // title | playing | paused | banner | shot
  driving: false,
  car: null,
  cash: 0,
  totalEarned: 0,
  storyEarned: 0,
  camYaw: Math.PI,
  camPitch: 0.32,
  shake: 0,
  bannerTime: 0,
  bannerKind: '',
  shotCooldown: 0,
  reloading: 0,
  mWasDown: false,
  lastPedCrime: -99,
  lastStarCrime: -99,
  elapsed: 0,
  clockMinutes: 16 * 60 + 40,
  started: false,
};

const traffic = createTraffic(scene, city, rng, 14, () => {
  const list = [...parkedCars, ...police.cars];
  for (const car of traffic.cars) if (!car.hijacked) list.push(car);
  if (state.car) list.push(state.car);
  else list.push({ mesh: player.mesh, alive: true });
  return list;
});

// Pickups: cash cases, health and armor, each on its own respawn clock.
const pickups = [];
function addPickup(kind, x, z) {
  let mesh;
  if (kind === 'cash') {
    mesh = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.3, 0.55), new THREE.MeshLambertMaterial({ color: 0x2f9e44, emissive: 0x0d3316 }));
  } else if (kind === 'health') {
    mesh = new THREE.Group();
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, 0.7), new THREE.MeshLambertMaterial({ color: 0xf5f5f5 }));
    mesh.add(box);
    const crossA = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.14, 0.74), new THREE.MeshBasicMaterial({ color: 0xe5383b }));
    const crossB = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.44, 0.74), crossA.material);
    mesh.add(crossA); mesh.add(crossB);
  } else {
    mesh = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.8, 0.3), new THREE.MeshLambertMaterial({ color: 0x4361ee, emissive: 0x0a1440 }));
  }
  mesh.position.set(x, 0.8, z);
  scene.add(mesh);
  pickups.push({
    kind, mesh, pos: mesh.position, active: true, timer: 0,
    color: kind === 'cash' ? '#7dff9a' : kind === 'health' ? '#ffffff' : '#4cc9f0',
  });
}
addPickup('cash', -60, 60); addPickup('cash', 108, -60); addPickup('cash', -12, -132);
addPickup('cash', 156, 60); addPickup('cash', -156, -36); addPickup('cash', 60, 156);
addPickup('health', city.landmarks.cafe.x - 6, city.landmarks.cafe.z - 10);
addPickup('health', city.landmarks.hotel.x - 8, city.landmarks.hotel.z + 10);
addPickup('health', city.landmarks.park.x + 8, city.landmarks.park.z + 6);
addPickup('armor', 138, 128); addPickup('armor', city.landmarks.bank.x + 14, city.landmarks.bank.z - 12);

const hud = createHud();
const minimap = createMinimap(document.getElementById('minimap'), city);

const missions = createMissions(scene, city, rng, {
  city, player, parkedCars, police, combat, peds, audio, rng,
  inCar: () => state.driving,
  playerCar: () => state.car,
  setArmed() {
    player.armed = true;
    player.ammo = PISTOL.mag;
    player.mesh.userData.gun.visible = true;
    hud.toast('PISTOL ACQUIRED', 'Click to shoot · R to reload');
  },
  onCash(amount) {
    state.cash += amount;
    state.totalEarned += amount;
  },
  onToast(title, sub) { hud.toast(title, sub); },
  onMissionDone() { persist(); },
  onStoryDone() {
    hud.toast('DEBT PAID IN FULL', 'Solara Bay is yours — courier work and the open city remain');
    persist();
  },
});

function storyEarnedFor(missionIndex) {
  let sum = 0;
  for (let i = 0; i < missionIndex && i < MISSION_REWARDS.length; i += 1) sum += MISSION_REWARDS[i];
  return sum;
}

function persist() {
  if (!state.started) return;
  storeSave({
    cash: state.cash,
    missionIndex: missions.state.missionIndex,
    totalEarned: state.totalEarned,
    x: player.mesh.position.x,
    z: player.mesh.position.z,
  });
}

// ---------------------------------------------------------------- screens ----

const titleScreen = document.getElementById('title-screen');
const pauseScreen = document.getElementById('pause-screen');
const btnContinue = document.getElementById('btn-continue');
function refreshContinue() { btnContinue.disabled = !loadSave(); }
refreshContinue();

function announce(message) { status.textContent = message; }

function startGame(fromSave) {
  audio.unlock();
  audio.click();
  state.started = true;
  titleScreen.classList.add('hidden');
  hud.show();
  if (fromSave) {
    const save = loadSave();
    if (save) {
      state.cash = save.cash;
      state.totalEarned = save.totalEarned || 0;
      player.mesh.position.set(save.x || -24, 0, save.z || 24);
      missions.startFromSave(save.missionIndex);
      state.storyEarned = storyEarnedFor(save.missionIndex);
      if (save.missionIndex >= 4) {
        player.armed = true;
        player.ammo = PISTOL.mag;
        player.mesh.userData.gun.visible = true;
      }
      hud.toast('WELCOME BACK', 'Your Solara is where you left it');
    }
  } else {
    clearSave();
    missions.startFromSave(0);
  }
  state.screen = 'playing';
  input.lock();
  announce('Playing Solara Heat.');
}

document.getElementById('btn-new').addEventListener('click', () => {
  if (state.started) { sessionStorage.setItem('solara-boot', 'new'); location.reload(); return; }
  startGame(false);
});
btnContinue.addEventListener('click', () => {
  if (state.started) { sessionStorage.setItem('solara-boot', 'continue'); location.reload(); return; }
  startGame(true);
});
document.getElementById('btn-resume').addEventListener('click', () => {
  audio.click();
  pauseScreen.classList.add('hidden');
  state.screen = 'playing';
  input.lock();
});
document.getElementById('btn-save').addEventListener('click', () => {
  persist();
  audio.click();
  hud.toast('GAME SAVED', 'Cash, story and position stored');
});
document.getElementById('btn-quit').addEventListener('click', () => { location.reload(); });

const bootMode = sessionStorage.getItem('solara-boot');
if (bootMode) {
  sessionStorage.removeItem('solara-boot');
  startGame(bootMode === 'continue');
}

// ---------------------------------------------------------------- crimes -----

/** Witnesses: a walker or a cop close enough to see the act. */
function witnessed(x, z, radius = 30) {
  for (const ped of peds.peds) {
    if (ped.state !== 'down' && Math.hypot(ped.mesh.position.x - x, ped.mesh.position.z - z) < radius) return true;
  }
  return police.wanted > 0;
}

function commitPedCrime(x, z) {
  if (state.elapsed - state.lastPedCrime < 4) return;
  state.lastPedCrime = state.elapsed;
  police.commitCrime(2);
  peds.panic(x, z, 16);
}

// ------------------------------------------------------------- car entry -----

function nearestEnterableCar() {
  const pos = player.mesh.position;
  let best = null; let bestD = 3.4;
  const all = [...parkedCars, ...traffic.cars];
  for (const car of all) {
    if (!car.alive || car === state.car) continue;
    const d = Math.hypot(car.mesh.position.x - pos.x, car.mesh.position.z - pos.z);
    if (d < bestD) { bestD = d; best = car; }
  }
  return best;
}

function enterCar(car) {
  state.driving = true;
  state.car = car;
  player.mesh.visible = false;
  audio.door();
  audio.engineStart();
  if (car.kind === 'traffic' && !car.hijacked) {
    car.hijacked = true;
    car.kind = 'player';
  } else if (car.kind === 'parked') {
    car.kind = 'player';
  }
  if (!car.everStolen) {
    car.everStolen = true;
    const pos = car.mesh.position;
    if (witnessed(pos.x, pos.z)) {
      police.commitCrime(1);
      peds.panic(pos.x, pos.z, 13);
    }
  }
  state.camYaw = car.heading;
}

function exitCar() {
  const car = state.car;
  if (!car) return;
  const pos = car.mesh.position;
  const side = { x: -Math.cos(car.heading), z: Math.sin(car.heading) };
  player.mesh.position.set(pos.x + side.x * 2.3, 0, pos.z + side.z * 2.3);
  city.collideCircle(player.mesh.position, 0.55);
  player.heading = car.heading;
  player.mesh.visible = true;
  state.driving = false;
  state.car = null;
  car.kind = 'player'; // no longer traffic-managed or a patrol car: it is Nico's ride now
  audio.door();
  audio.engineStop();
}

// -------------------------------------------------------------- shooting -----

function tryShoot() {
  if (!player.armed || state.driving || missions.dialogueActive) return;
  if (state.reloading > 0) return;
  if (state.shotCooldown > 0) return;
  if (player.ammo <= 0) {
    audio.dryFire();
    startReload();
    return;
  }
  state.shotCooldown = PISTOL.cooldown;
  player.ammo -= 1;
  audio.shoot();
  police.notifyShot();
  const origin = new THREE.Vector3();
  player.mesh.userData.gun.getWorldPosition(origin);
  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  // The shot leaves the gun but flies where the crosshair points: start it at the muzzle,
  // aimed along the camera, and let the resolver find the nearest thing in the way.
  const from = { x: origin.x, y: origin.y, z: origin.z };
  const result = combat.playerShoot(from, dir, {
    guards: combat.guards,
    peds: peds.peds,
    cars: [...parkedCars, ...traffic.cars, ...police.cars],
    colliders: city.colliders,
  });
  const px = player.mesh.position.x; const pz = player.mesh.position.z;
  if (witnessed(px, pz, 42)) police.commitCrime(1);
  if (result.kind === 'ped') {
    peds.knockOut(result.ref);
    commitPedCrime(px, pz);
  }
  if (result.kind === 'car' && result.ref) {
    result.ref.health -= 6;
    audio.hit();
  }
  peds.panic(px, pz, 15);
  state.shake = Math.min(0.35, state.shake + 0.08);
}

function startReload() {
  if (state.reloading > 0 || player.ammo === PISTOL.mag) return;
  state.reloading = PISTOL.reloadTime;
  audio.reload();
}

// ------------------------------------------------------------- end states ----

function endRun(kind) {
  // kind: 'wasted' | 'busted'
  const fine = Math.floor(state.cash * (kind === 'wasted' ? ECONOMY.wastedFine : ECONOMY.bustedFine));
  state.cash -= fine;
  if (state.driving) exitCar();
  police.clear();
  audio.sirenStop();
  if (kind === 'wasted') audio.missionFail(); else audio.busted();
  hud.banner(kind === 'wasted' ? 'WASTED' : 'BUSTED',
    kind === 'wasted'
      ? `The Clínica Palmera patches you up · −$${fine.toLocaleString('en-US')}`
      : `The precinct takes its cut · −$${fine.toLocaleString('en-US')}`, kind);
  state.screen = 'banner';
  state.bannerTime = 2.8;
  state.bannerKind = kind;
  if (missions.state.mode === 'active') missions.abortMission(kind === 'wasted' ? 'You woke up in the clinic' : 'The police took you in');
  announce(kind === 'wasted' ? 'Wasted.' : 'Busted.');
}

function respawn() {
  hud.hideBanner();
  player.health = 100;
  player.armor = 0;
  const spot = state.bannerKind === 'wasted'
    ? { x: city.landmarks.hotel.x - 4, z: city.landmarks.hotel.z + 6 }
    : { x: city.landmarks.bank.x + 10, z: city.landmarks.bank.z + 12 };
  player.mesh.position.set(spot.x, 0, spot.z);
  player.heading = Math.PI;
  state.camYaw = Math.PI;
  state.screen = 'playing';
  input.lock();
  persist();
}

// ------------------------------------------------------------- collisions ----

const allCarsScratch = [];
function collideCars(dt) {
  allCarsScratch.length = 0;
  for (const car of parkedCars) if (car.alive) allCarsScratch.push(car);
  for (const car of traffic.cars) if (car.alive && !car.hijacked) allCarsScratch.push(car);
  for (const car of police.cars) if (car.alive) allCarsScratch.push(car);
  if (state.car && !allCarsScratch.includes(state.car)) allCarsScratch.push(state.car);

  for (let i = 0; i < allCarsScratch.length; i += 1) {
    for (let j = i + 1; j < allCarsScratch.length; j += 1) {
      const a = allCarsScratch[i]; const b = allCarsScratch[j];
      const pa = a.mesh.position; const pb = b.mesh.position;
      const dx = pb.x - pa.x; const dz = pb.z - pa.z;
      const d2 = dx * dx + dz * dz;
      const minD = 3.1;
      if (d2 > minD * minD || d2 < 0.0001) continue;
      const d = Math.sqrt(d2);
      const push = (minD - d) / 2;
      const nx = dx / d; const nz = dz / d;
      const aMovable = a === state.car || a.kind === 'traffic' || a.kind === 'police';
      const bMovable = b === state.car || b.kind === 'traffic' || b.kind === 'police';
      if (aMovable) { pa.x -= nx * push; pa.z -= nz * push; }
      if (bMovable) { pb.x += nx * push; pb.z += nz * push; }
      const relSpeed = Math.abs(a.speed - b.speed);
      if (relSpeed > 5) {
        const mid = { x: (pa.x + pb.x) / 2, z: (pa.z + pb.z) / 2 };
        audio.crash(relSpeed);
        a.health -= relSpeed * 1.1;
        b.health -= relSpeed * 1.1;
        if (a === state.car || b === state.car) {
          state.shake = Math.min(0.7, state.shake + relSpeed * 0.03);
          const other = a === state.car ? b : a;
          if (other.kind === 'police' && state.elapsed - state.lastStarCrime > 6) {
            state.lastStarCrime = state.elapsed;
            police.addStar();
          }
        }
        peds.panic(mid.x, mid.z, 12);
      }
      const avg = (a.speed + b.speed) / 2;
      if (aMovable) a.speed = avg * 0.7;
      if (bMovable) b.speed = avg * 0.7;
    }
  }

  // Cars versus walkers, and cars versus Nico when he is on foot.
  const runners = state.car ? [...traffic.cars, ...police.cars, state.car] : [...traffic.cars, ...police.cars];
  for (const car of runners) {
    if (!car.alive || Math.abs(car.speed) < 2.5) continue;
    const cp = car.mesh.position;
    for (const ped of peds.peds) {
      if (ped.state === 'down') continue;
      const pp = ped.mesh.position;
      if (Math.hypot(pp.x - cp.x, pp.z - cp.z) < 2.1) {
        if (Math.abs(car.speed) > 4.5) {
          peds.knockOut(ped);
          audio.crash(4);
          if (car === state.car) commitPedCrime(cp.x, cp.z);
          else peds.panic(cp.x, cp.z, 12);
        } else {
          peds.panic(cp.x, cp.z, 6);
        }
      }
    }
    if (!state.driving && car !== state.car) {
      const pp = player.mesh.position;
      if (Math.hypot(pp.x - cp.x, pp.z - cp.z) < 2.0 && Math.abs(car.speed) > 4) {
        if (player.hurt(9)) { endRun('wasted'); return; }
        audio.hurt();
        state.shake = 0.5;
        pp.x += (pp.x - cp.x) * 0.4;
        pp.z += (pp.z - cp.z) * 0.4;
      }
    }
  }
}

// -------------------------------------------------------------- the step -----

function actorPos() { return state.driving && state.car ? state.car.mesh.position : player.mesh.position; }

function step(dt) {
  state.elapsed += dt;
  state.shotCooldown = Math.max(0, state.shotCooldown - dt);
  if (state.reloading > 0) {
    state.reloading -= dt;
    if (state.reloading <= 0) player.ammo = PISTOL.mag;
  }

  if (state.screen === 'banner') {
    state.bannerTime -= dt;
    if (state.bannerTime <= 0) respawn();
    return;
  }
  if (state.screen !== 'playing' && state.screen !== 'title') return;

  const playing = state.screen === 'playing';
  const actions = input.takeActions();
  const mouse = input.takeMouse();
  const clicked = input.takeClick();

  if (playing && (actions & ACTION_PAUSE) && !missions.dialogueActive) {
    state.screen = 'paused';
    document.getElementById('pause-stats').textContent =
      `Cash $${Math.round(state.cash).toLocaleString('en-US')} · Earned $${Math.round(state.totalEarned).toLocaleString('en-US')} · Debt left $${Math.max(0, ECONOMY.debt - storyEarnedFor(missions.state.missionIndex)).toLocaleString('en-US')}`;
    pauseScreen.classList.remove('hidden');
    input.unlock();
    return;
  }

  if (playing && (actions & ACTION_INTERACT)) {
    if (missions.dialogueActive) missions.advanceDialogue();
    else if (state.driving) exitCar();
    else {
      const car = nearestEnterableCar();
      if (car && Math.abs(car.speed) < 2.5) enterCar(car);
    }
  }
  if (playing && (actions & ACTION_RELOAD)) startReload();
  if (playing && clicked) tryShoot();
  const mDown = input.down('KeyM');
  if (playing && mDown && !state.mWasDown) {
    const mutedNow = audio.toggleMute();
    hud.toast(mutedNow ? 'SOUND OFF' : 'SOUND ON', '');
  }
  state.mWasDown = mDown;

  // Camera yaw: the mouse steers it when locked; otherwise it settles behind the actor.
  if (input.isLocked()) {
    state.camYaw -= mouse.dx * 0.0031;
    state.camPitch = THREE.MathUtils.clamp(state.camPitch + mouse.dy * 0.0026, -0.12, 1.05);
  }

  const pos = actorPos();

  if (state.driving && state.car) {
    const axes = input.axes();
    const impact = stepCar(state.car, {
      throttle: playing ? axes.z : 0,
      steer: playing ? axes.x : 0,
      handbrake: playing && input.handbrake(),
    }, dt, city);
    if (impact > 7) {
      audio.crash(impact);
      state.car.health -= impact * 1.4;
      state.shake = Math.min(0.8, state.shake + impact * 0.035);
      peds.panic(pos.x, pos.z, 11);
    }
    if (state.car.health <= 0 && Math.abs(state.car.speed) < 0.5) {
      hud.toast('CAR WRECKED', 'This one is done — find other wheels');
      state.car.health = 1; // never fully soft-lock: it crawls, but it is a wreck
      state.car.topSpeed = 4;
    }
    audio.engineUpdate(state.car.speed / state.car.topSpeed, axes.z !== 0);
    if (!input.isLocked()) {
      const diff = wrapAngleLocal(state.car.heading - state.camYaw);
      state.camYaw += diff * Math.min(1, dt * 3.2);
    }
  } else if (playing || state.screen === 'title') {
    if (playing && !missions.dialogueActive) {
      player.step(dt, input, state.camYaw, city, input.isLocked());
    }
    if (!input.isLocked() && player.moving) {
      const diff = wrapAngleLocal(player.heading - state.camYaw);
      state.camYaw += diff * Math.min(1, dt * 4.5);
    }
  }

  if (playing && !missions.dialogueActive) missions.tryStartMission(actorPos());
  missions.update(dt, actorPos());
  traffic.update(dt, actorPos());
  peds.update(dt, actorPos());

  let policeInfo = { seen: false, nearest: Infinity };
  if (playing) {
    policeInfo = police.update(dt, {
      playerPos: actorPos(),
      playerCar: state.car,
      playerInCar: state.driving,
      playerSpeed: state.driving && state.car ? state.car.speed : 0,
      onBusted: () => endRun('busted'),
    });
    if (police.wanted > 0) {
      audio.sirenStart();
      audio.sirenSetLevel(policeInfo.nearest < 40 ? 1 : 0.4);
    } else audio.sirenStop();
    if (state.screen === 'banner') return; // busted mid-step: the run is over
  }

  if (playing) {
    combat.updateGuards(dt, {
      playerPos: player.mesh.position,
      city,
      audio,
      onPlayerHit(dmg) {
        if (state.driving) return;
        if (player.hurt(dmg)) { endRun('wasted'); return; }
        audio.hurt();
        state.shake = Math.min(0.6, state.shake + 0.18);
      },
    });
  }
  combat.updateEffects(dt);
  collideCars(dt);
  if (state.screen === 'banner') return; // wasted mid-step: the run is over

  // Pickups.
  for (const pickup of pickups) {
    if (!pickup.active) {
      pickup.timer -= dt;
      if (pickup.timer <= 0) { pickup.active = true; pickup.mesh.visible = true; }
      continue;
    }
    pickup.mesh.rotation.y += dt * 1.8;
    if (!state.driving && Math.hypot(pickup.pos.x - player.mesh.position.x, pickup.pos.z - player.mesh.position.z) < 1.7) {
      pickup.active = false;
      pickup.mesh.visible = false;
      pickup.timer = pickup.kind === 'cash' ? 75 : 50;
      if (pickup.kind === 'cash') {
        const amount = 90 + Math.floor(Math.random() * 140);
        state.cash += amount;
        state.totalEarned += amount;
        audio.cash();
        hud.toast('CASH FOUND', `+$${amount}`);
      } else if (pickup.kind === 'health') {
        player.heal(45);
        audio.pickup();
        hud.toast('PATCHED UP', '+45 health');
      } else {
        player.armor = 100;
        audio.pickup();
        hud.toast('ARMOR ON', 'Full vest');
      }
    }
  }

  city.update(dt);
  city.followSun(actorPos());
  state.shake = Math.max(0, state.shake - dt * 1.6);
}

function wrapAngleLocal(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

// ------------------------------------------------------------ HUD refresh ----

function refreshHud(dt) {
  if (state.screen === 'title' || state.screen === 'shot') return;
  hud.setCash(state.cash);
  hud.setHealth(Math.max(0, player.health), player.armor);
  const debtLeft = Math.max(0, ECONOMY.debt - storyEarnedFor(missions.state.missionIndex));
  hud.setRespect(missions.state.storyDone ? '★ SOLARA IS YOURS ★' : `DEBT LEFT: $${debtLeft.toLocaleString('en-US')}`);
  hud.setStars(police.wanted);
  hud.setBust(police.bustMeter);
  state.clockMinutes += dt * 0.5;
  const hh = Math.floor(state.clockMinutes / 60) % 24;
  const mm = Math.floor(state.clockMinutes % 60);
  hud.setClock(`${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`);
  hud.setVignette(player.hurtAgo < 0.4 ? 0.85 : player.health < 30 ? 0.45 : 0);

  const ms = missions.state;
  if (ms.dialogue) {
    hud.showDialogue(ms.dialogue.name, ms.dialogue.text);
    hud.setObjective('', '');
  } else {
    hud.hideDialogue();
    let text = ms.objective;
    if (ms.timer != null && ms.mode === 'active') text = `${text} · ${Math.ceil(ms.timer)}s`;
    const dist = ms.marker ? actorPos().distanceTo(ms.marker) : null;
    hud.setObjective(ms.missionTitle || 'SOLARA BAY', text, dist);
  }
  hud.setWeapon(player.armed, player.ammo, state.reloading > 0);
  hud.setSpeed(state.driving && state.car ? Math.abs(state.car.speed) * 3.6 : null);

  // Context prompt.
  let promptHtml = null;
  if (!missions.dialogueActive && state.screen === 'playing') {
    if (state.driving) promptHtml = '<b>E</b> Exit vehicle';
    else {
      const car = nearestEnterableCar();
      if (car && Math.abs(car.speed) < 2.5) promptHtml = car.everStolen ? '<b>E</b> Get in' : '<b>E</b> Steal vehicle';
    }
  }
  hud.setPrompt(promptHtml);
  hud.update(dt);

  minimap.draw(dt, {
    playerPos: actorPos(),
    playerHeading: state.driving && state.car ? state.car.heading : player.heading,
    marker: ms.marker,
    police: police.cars,
    traffic: traffic.cars,
    guards: combat.guards,
    pickups: pickups.filter((p) => p.active),
  });
}

// --------------------------------------------------------------- the loop ----

function updateCamera(dt) {
  if (state.screen === 'title') {
    const t = state.elapsed * 0.05;
    camera.position.set(Math.sin(t) * 120, 46, Math.cos(t) * 120 - 20);
    camera.lookAt(0, 6, 0);
    return;
  }
  const target = actorPos();
  const driving = state.driving;
  const dist = driving ? 9.2 : 6.4;
  const height = driving ? 3.1 : 2.0;
  const yaw = state.camYaw;
  const pitch = state.camPitch;
  const back = {
    x: Math.sin(yaw) * Math.cos(pitch),
    z: Math.cos(yaw) * Math.cos(pitch),
  };
  const desired = new THREE.Vector3(
    target.x - back.x * dist,
    target.y + height + Math.sin(pitch) * dist,
    target.z - back.z * dist,
  );
  city.collideCircle(desired, 0.5);
  desired.y = Math.max(0.7, desired.y);
  camera.position.lerp(desired, state.screen === 'shot' ? 1 : Math.min(1, dt * 7));
  const look = new THREE.Vector3(
    target.x + Math.sin(yaw) * 5,
    target.y + 1.6,
    target.z + Math.cos(yaw) * 5,
  );
  if (state.shake > 0) {
    look.x += (Math.random() - 0.5) * state.shake;
    look.y += (Math.random() - 0.5) * state.shake;
  }
  camera.lookAt(look);
}

let last = performance.now();
let accumulator = 0;
const MAX_FRAME = 0.25;
let shotFrames = 0;

function frame(now) {
  requestAnimationFrame(frame);
  accumulator += Math.min((now - last) / 1000, MAX_FRAME);
  last = now;
  while (accumulator >= STEP) {
    if (state.screen !== 'paused') step(STEP);
    accumulator -= STEP;
  }
  if (state.screen !== 'shot') updateCamera(STEP);
  refreshHud(STEP);
  renderer.render(scene, camera);
  if (state.screen === 'shot') {
    shotFrames += 1;
    if (shotFrames === 5) window.__shotReady = true;
  }
}

if (shotName) {
  // Screenshot mode: stage the named scene, render it steadily, and say when it is ready.
  titleScreen.classList.add('hidden');
  hud.show();
  stageShot(shotName, {
    scene, camera, city, player, traffic, peds, police, combat, missions, parkedCars, hud,
    minimap, state, renderer, rng,
  });
  requestAnimationFrame(frame);
} else {
  requestAnimationFrame(frame);
}
