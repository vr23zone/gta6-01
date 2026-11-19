// main.js — Solara Heat, assembled. This module builds the world and wires every
// system together: the city, the traffic, the crowd, Nico, the police, the guns,
// the story, the HUD, the sound. It owns the frame loop and the rules that live
// between systems — stealing a car is a crime if it is witnessed, running a
// pedestrian down is a worse one, getting caught or killed costs money and a
// morning — plus the start, pause, wasted and busted screens, the auto-save, and
// the screenshot staging hook (?shot=) the entry's pictures are taken with.

import { makeRng, worldSeed } from './rng.js';
import { STORY } from './config.js';
import { buildCity } from './city.js';
import { Traffic, Car } from './vehicles.js';
import { Pedestrians } from './people.js';
import { Player } from './player.js';
import { Police } from './police.js';
import { Combat } from './combat.js';
import { Missions } from './missions.js';
import { Hud } from './hud.js';
import { Minimap } from './minimap.js';
import { SoundEngine } from './audio.js';
import { initInput, justPressed, isFiring, setLockWanted } from './input.js';
import { loadSave, writeSave } from './save.js';
import { setupShot } from './shots.js';

const params = new URLSearchParams(location.search);
const shotName = params.get('shot');

class Game {
  constructor() {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputEncoding = THREE.sRGBEncoding;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.06;
    document.getElementById('app').appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 2600);
    this.camera.position.set(-230, 60, 260);

    this.rng = makeRng(worldSeed());
    this.city = buildCity(this.scene, this.rng);
    this.traffic = new Traffic(this.scene, this.rng, this.city);
    this.peds = new Pedestrians(this.scene, this.rng, 40);
    this.player = new Player(this.scene, this.rng);
    this.police = new Police(this.scene, this.rng);
    this.combat = new Combat(this.scene, this.rng);
    this.combat.spawnCityPickups();
    this.sound = new SoundEngine();
    this.hud = new Hud();
    this.minimap = new Minimap(document.getElementById('minimap'));
    this.missions = new Missions(this);

    this.cash = 120;
    this.storyDone = 0;
    this.extraCars = [];
    this.coupeCar = null;
    this.lastPlayerCar = null;
    this.started = false;
    this.paused = false;
    this.over = false; // wasted/busted overlay is up
    this.saveTimer = 0;
    this.shotTimer = 0;
    this.shotTick = null;
    this.crimeShotCooldown = 0;
    this.frame = 0;

    this.wireEvents();
    initInput(this.renderer.domElement);
    addEventListener('resize', () => {
      this.camera.aspect = innerWidth / innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(innerWidth, innerHeight);
    });
    this.setupScreens();
    if (shotName) this.beginShot(shotName);
  }

  // --- construction helpers the missions and shots use -----------------------------
  spawnCoupe() {
    if (this.coupeCar) return this.coupeCar;
    const car = new Car(this.scene, this.rng, 'coupe');
    car.place(this.city.marinaLot.x, this.city.marinaLot.z, -Math.PI / 2);
    this.traffic.parked.push(car);
    this.coupeCar = car;
    return car;
  }

  spawnCarAt(kind, x, z, heading) {
    const car = new Car(this.scene, this.rng, kind);
    car.place(x, z, heading);
    this.extraCars.push(car);
    return car;
  }

  allCars() {
    const out = [...this.traffic.cars, ...this.traffic.parked, ...this.extraCars];
    for (const unit of this.police.cars) out.push(unit.car);
    return out;
  }

  addCash(n) {
    this.cash = Math.max(0, this.cash + n);
  }

  debtLeft() {
    let paid = 0;
    for (let i = 0; i < this.storyDone; i++) paid += STORY.rewards[i];
    return Math.max(0, STORY.debt - paid);
  }

  saveNow() {
    const stage = this.missions.stage;
    writeSave({
      cash: this.cash,
      storyDone: this.storyDone,
      stage: typeof stage === 'number' || stage === 'fares' ? stage : 'meet',
      health: Math.round(this.player.health),
      x: Math.round(this.player.pos.x),
      z: Math.round(this.player.pos.z),
    });
  }

  // --- events between systems ---------------------------------------------------------
  wireEvents() {
    const colliders = this.city.colliders;
    this.player.events = {
      tryEnterCar: (car) => {
        if (this.over) return false;
        const wasTraffic = this.traffic.cars.includes(car);
        if (wasTraffic) {
          this.traffic.cars.splice(this.traffic.cars.indexOf(car), 1);
        }
        const parkedIdx = this.traffic.parked.indexOf(car);
        if (parkedIdx >= 0) this.traffic.parked.splice(parkedIdx, 1);
        const extraIdx = this.extraCars.indexOf(car);
        if (extraIdx >= 0) this.extraCars.splice(extraIdx, 1);
        if (car !== this.lastPlayerCar && !shotName) {
          this.police.reportCrime('jack', car.pos.x, car.pos.z, { colliders, peds: this.peds });
          this.peds.panicAt(car.pos.x, car.pos.z, 9);
        }
        this.player.enterCar(car, wasTraffic);
        return true;
      },
      onEnterCar: (car) => {
        this.missions.onEnterCar(car);
        this.sound.uiClick();
      },
      onExitCar: (car) => {
        this.lastPlayerCar = car;
        if (!this.extraCars.includes(car) && car !== this.player.car) this.extraCars.push(car);
      },
      onCrash: (car) => {
        if (Math.abs(car.speed) > 10 && !shotName) {
          for (const unit of this.police.cars) {
            if (Math.hypot(unit.car.pos.x - car.pos.x, unit.car.pos.z - car.pos.z) < 4) {
              this.police.reportCrime('hitCop', car.pos.x, car.pos.z, { colliders, peds: this.peds });
            }
          }
        }
      },
    };
    this.combat.events = {
      onGuardDown: () => {
        this.missions.onGuardDown();
        if (!shotName) {
          this.police.reportCrime('killGuard', this.player.pos.x, this.player.pos.z, { colliders, peds: this.peds });
        }
      },
      onPlayerHit: (dmg) => {
        if (shotName) {
          this.player.health = Math.max(12, this.player.health - dmg * 0.3);
          return;
        }
        this.player.damage(dmg);
        this.hud.hitFlash();
        if (this.player.dead) this.wasted();
      },
      onShoot: (x, z) => {
        this.peds.panicAt(x, z, 16);
        this.combat.alertGuardsNear(x, z, 34);
        if (!shotName && this.crimeShotCooldown <= 0) {
          this.crimeShotCooldown = 1.4;
          this.police.reportCrime('shot', x, z, { colliders, peds: this.peds });
        }
      },
      onPickup: (p) => {
        this.sound.pickup();
        if (p.kind === 'cash') {
          this.addCash(p.amount);
          this.hud.toast(`+$${p.amount}`);
        } else if (p.kind === 'health') {
          this.player.heal(45);
          this.hud.toast('Patched up — +45 health');
        } else if (p.kind === 'armor') {
          this.player.armor = Math.min(100, this.player.armor + 60);
          this.hud.toast('Armour vest — +60');
        }
      },
    };
  }

  // --- screens ----------------------------------------------------------------------
  setupScreens() {
    const startEl = document.getElementById('start-screen');
    const save = loadSave();
    const continueBtn = document.getElementById('btn-continue');
    if (save && typeof save.cash === 'number') {
      continueBtn.style.display = 'block';
      continueBtn.addEventListener('click', () => {
        this.restoreSave(save);
        this.beginPlay();
      });
    }
    document.getElementById('btn-new').addEventListener('click', () => {
      this.missions.startNew();
      this.beginPlay();
    });
    document.getElementById('btn-resume').addEventListener('click', () => {
      this.paused = false;
      document.getElementById('pause-screen').classList.remove('show');
      setLockWanted(true);
    });
    if (shotName) startEl.style.display = 'none';
  }

  restoreSave(save) {
    this.cash = save.cash;
    this.storyDone = save.storyDone || 0;
    this.player.health = save.health || 100;
    if (typeof save.x === 'number') this.player.placeAt(save.x, save.z);
    this.missions.startFrom(save.stage === undefined ? 'meet' : save.stage);
    if (save.stage === 'meet') this.missions.startNew();
  }

  beginPlay() {
    document.getElementById('start-screen').style.display = 'none';
    this.sound.start();
    this.started = true;
    setLockWanted(true);
    this.hud.toast('Solara Bay — Tuesday, golden hour');
  }

  beginShot(name) {
    this.started = true;
    try {
      this.sound.start();
    } catch {
      // Captures run muted; audio is not the picture.
    }
    this.shotTick = setupShot(this, name);
    window.__SHOT_NAME__ = name;
  }

  wasted() {
    if (this.over) return;
    this.over = true;
    this.finishRun('WASTED', 'The Clínica Brisa patched you up and sent the bill.', STORY.wastedFine, { x: -60, z: -120 });
  }

  busted() {
    if (this.over) return;
    this.over = true;
    this.sound.busted();
    this.finishRun('BUSTED', 'The harbour police kept the car and most of your dignity.', STORY.bustFine, { x: 60, z: -180 });
  }

  finishRun(title, sub, fine, respawn) {
    const el = document.getElementById('end-screen');
    document.getElementById('end-title').textContent = title;
    document.getElementById('end-sub').textContent = `${sub} Fine: $${fine}.`;
    el.classList.add('show');
    setLockWanted(false);
    this.addCash(-fine);
    setTimeout(() => {
      el.classList.remove('show');
      this.over = false;
      this.police.clearAll();
      if (this.player.mode === 'car') this.player.exitCar();
      this.player.dead = false;
      this.player.health = 100;
      this.player.armor = 0;
      this.player.placeAt(respawn.x, respawn.z);
      this.missions.onPlayerDown();
      this.saveNow();
      if (!shotName) setLockWanted(true);
    }, 3400);
  }

  // --- the frame ----------------------------------------------------------------------
  run() {
    const clock = new THREE.Clock();
    const loop = () => {
      requestAnimationFrame(loop);
      const dt = Math.min(0.05, clock.getDelta());
      this.frame++;
      if (this.started && !this.paused && !this.over) this.update(dt);
      else if (!this.started) {
        // The start screen floats over a slow orbit of the marina.
        const t = performance.now() * 0.00005;
        this.camera.position.set(Math.sin(t) * 190, 55, Math.cos(t) * 190 + 60);
        this.camera.lookAt(40, 6, 40);
      }
      if (this.shotTick) this.shotTick(dt, this.camera);
      this.renderer.render(this.scene, this.camera);
      if (shotName && this.frame > 60) {
        window.__SHOT_READY__ = true;
        // The capture tool polls the DOM (its script world cannot see page
        // globals), so readiness is mirrored onto the document element.
        document.documentElement.dataset.shotReady = '1';
      }
      if (params.get('debug') && this.frame % 30 === 0) {
        document.documentElement.dataset.debug = JSON.stringify({
          frame: this.frame,
          coupe: this.coupeCar ? [Math.round(this.coupeCar.pos.x), Math.round(this.coupeCar.pos.z)] : null,
          traffic: this.traffic.cars.map((c) => [Math.round(c.pos.x), Math.round(c.pos.z), c.kind, Math.round(c.speed)]),
        });
      }
    };
    loop();
  }

  update(dt) {
    const colliders = this.city.colliders;
    this.crimeShotCooldown -= dt;

    // Dialogue first: E steps the conversation before it can steal a car.
    if (this.hud.dialogueActive && justPressed('KeyE')) this.hud.advanceDialogue();
    if (justPressed('KeyP')) {
      this.paused = true;
      document.getElementById('pause-screen').classList.add('show');
      setLockWanted(false);
    }

    this.player.update(dt, {
      colliders,
      allCars: this.allCars(),
      events: this.player.events,
    });

    // The pistol.
    if (this.player.mode === 'foot' && isFiring() && !this.hud.dialogueActive) {
      this.combat.tryShoot(dt, this.camera, this.player, this.sound, colliders);
    } else {
      this.combat.fireCooldown = Math.max(0, this.combat.fireCooldown - dt);
    }
    this.combat.update(dt, { player: this.player, colliders, sound: this.sound });

    // Traffic, with the player and the law as obstacles to brake for.
    const obstacles = [this.player, ...this.police.cars.map((u) => u.car)];
    this.traffic.update(dt, obstacles);
    for (const car of this.traffic.cars) car.collideWorld(colliders);
    this.separateCars();

    // The crowd, and what the traffic does to it.
    const moving = [...this.traffic.cars, ...this.police.cars.map((u) => u.car)];
    if (this.player.mode === 'car' && this.player.car) moving.push(this.player.car);
    this.peds.update(dt, moving);
    this.checkPedHits(moving);

    this.police.update(dt, {
      player: this.player,
      colliders,
      events: { onBusted: () => this.busted() },
    });
    for (const unit of this.police.cars) {
      // Cop cars shove and are shoved like any other car.
      if (this.player.mode === 'car' && this.player.car) this.bumpCars(unit.car, this.player.car);
    }

    this.missions.update(dt);
    this.city.update(dt);
    this.player.updateCamera(this.camera, dt);

    // The sun and its shadows follow the player so the light stays crisp.
    const sp = this.player.pos;
    this.city.sun.position.set(sp.x - 260, 300, sp.z - 420);
    this.city.sun.target.position.set(sp.x, 0, sp.z);

    // Sound: the engine under you, the sirens around you, the pad under everything.
    if (this.player.mode === 'car' && this.player.car) {
      const spec = this.player.car.spec;
      this.sound.engine(Math.abs(this.player.car.speed) / spec.topSpeed, 0.6, dt);
    } else {
      this.sound.engine(0, 0, dt);
    }
    this.sound.siren(this.police.nearestCopDist(sp.x, sp.z), dt);
    this.sound.pad(dt);

    // HUD.
    this.hud.setCash(this.cash, this.debtLeft());
    this.hud.setStars(this.police.stars);
    this.hud.setVitals(this.player.health, this.player.armor);
    this.hud.setSpeed(this.player.mode === 'car' && this.player.car ? Math.abs(this.player.car.speed) * 3.6 : null);
    this.hud.setBust(this.player.mode === 'foot' ? this.police.bust : 0);
    this.hud.update(dt);
    const facing = this.player.mode === 'car' && this.player.car
      ? this.player.car.forward()
      : { x: -Math.sin(this.player.camYaw), z: -Math.cos(this.player.camYaw) };
    this.minimap.draw({
      player: this.player,
      traffic: this.traffic.cars,
      parked: this.traffic.parked,
      police: this.police,
      guards: this.combat.guards,
      objective: this.missions.objective,
      npc: this.missions.stage === 'meet' ? this.city.cafeFront : null,
      facing,
    });

    // completeMission counts the story: keep storyDone in step with the stage.
    const stage = this.missions.stage;
    if (typeof stage === 'number') this.storyDone = Math.max(this.storyDone, stage);
    if (stage === 'fares') this.storyDone = TITLES_COUNT;

    this.saveTimer -= dt;
    if (this.saveTimer <= 0) {
      this.saveTimer = 8;
      if (!shotName) this.saveNow();
    }
  }

  // Gentle car-to-car separation: bumpers push, speeds bleed, nobody tunnels.
  separateCars() {
    const cars = this.allCars();
    for (let i = 0; i < cars.length; i++) {
      for (let j = i + 1; j < cars.length; j++) {
        this.bumpCars(cars[i], cars[j]);
      }
    }
  }

  bumpCars(a, b) {
    const dx = b.pos.x - a.pos.x;
    const dz = b.pos.z - a.pos.z;
    const d = Math.hypot(dx, dz);
    const min = 2.7;
    if (d > 0.01 && d < min) {
      const push = (min - d) / 2;
      const nx = dx / d;
      const nz = dz / d;
      a.pos.x -= nx * push;
      a.pos.z -= nz * push;
      b.pos.x += nx * push;
      b.pos.z += nz * push;
      const impact = Math.abs(a.speed - b.speed);
      if (impact > 6) {
        a.crashed = true;
        b.crashed = true;
      }
      a.speed *= 0.82;
      b.speed *= 0.82;
    }
  }

  checkPedHits(moving) {
    for (const car of moving) {
      if (Math.abs(car.speed) < 4) continue;
      for (const p of this.peds.list) {
        const gp = p.person.group.position;
        if (Math.hypot(gp.x - car.pos.x, gp.z - car.pos.z) < 1.5) {
          if (this.peds.hitByCar(p)) {
            this.peds.panicAt(gp.x, gp.z, 14);
            if (!shotName && this.player.car === car) {
              this.police.reportCrime('hitPed', gp.x, gp.z, { colliders: this.city.colliders, peds: this.peds });
            }
          }
        }
      }
    }
  }
}

const TITLES_COUNT = 5;

const game = new Game();
window.__game = game; // the screenshot tooling poses the camera through this
game.run();
