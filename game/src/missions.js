// missions.js — the story of Solara Heat, as a state machine. Nico Vega owes the
// Marina Crew $10,000 by Friday; fixer Sol Marín, holding court outside Café Sol,
// feeds him five jobs that pay it off: steal a coupe, run a hot package under a
// police tail, sprint eight checkpoints down the coast road, clear the Muelle 9
// docks in a shootout, and rob Banco Solara at four stars and live to park the
// money at the hideout. After the debt, the city stays open and the courier fares
// never stop. Each mission is a small ladder of steps with a gold marker on the
// world and the minimap, an objective line on the HUD, and Sol's voice in the
// dialogue box at every turn.

import { STORY, streetX, streetZ, blockX, blockZ, GRID } from './config.js';
import { makePerson } from './people.js';

const TITLES = ['First Wheels', 'Hot Package', 'Costa Sprint', 'Dockside Trouble', 'The Big Score'];

export class Missions {
  constructor(game) {
    this.game = game;
    this.stage = 'meet'; // 'meet' | 0..4 | 'fares'
    this.step = 0;
    this.timer = 0;
    this.coupe = null;
    this.buyer = null;
    this.fare = null;
    this.farePerson = null;
    this.guardsLeft = 0;
    // Sol Marín, waiting outside her café in a white suit.
    this.sol = makePerson(game.rng, { shirt: 0xf7f3e8, pants: 0xf7f3e8, skin: 0xa06a35, hair: 0x14100c });
    this.sol.group.position.set(game.city.cafeFront.x, 0, game.city.cafeFront.z);
    this.sol.group.rotation.y = Math.PI;
    game.scene.add(this.sol.group);
    // The objective marker: a pillar of gold light you can see across the city.
    const geo = new THREE.CylinderGeometry(2.2, 2.2, 26, 18, 1, true);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffd23e, transparent: true, opacity: 0.34, side: THREE.DoubleSide, depthWrite: false,
    });
    this.marker = new THREE.Mesh(geo, mat);
    this.marker.position.y = 13;
    this.marker.visible = false;
    game.scene.add(this.marker);
    this.objective = null; // {x, z} for the minimap
  }

  // --- helpers -------------------------------------------------------------------
  setObjective(x, z, text) {
    this.objective = { x, z };
    this.marker.visible = true;
    this.marker.position.x = x;
    this.marker.position.z = z;
    this.game.hud.setObjective(text);
  }

  clearObjective(text = '') {
    this.objective = null;
    this.marker.visible = false;
    this.game.hud.setObjective(text);
  }

  near(x, z, r) {
    const p = this.game.player.pos;
    return Math.hypot(p.x - x, p.z - z) < r;
  }

  say(lines, onEnd) {
    this.game.hud.say(lines, onEnd);
  }

  completeMission(idx) {
    const g = this.game;
    const reward = STORY.rewards[idx];
    g.addCash(reward);
    g.sound.missionDone();
    g.hud.banner('MISSION COMPLETE', `${TITLES[idx]} — $${reward.toLocaleString('en-US')}`);
    g.saveNow();
    if (idx + 1 < TITLES.length) {
      this.begin(idx + 1);
    } else {
      this.stage = 'fares';
      this.step = 0;
      this.say([
        { who: 'Sol Marín', text: 'Ten thousand. Counted twice, in front of the crew. Nico Vega owes nobody anything.' },
        { who: 'Sol Marín', text: 'The city is yours now, courier. My fares are honest money — mostly. Come see me when you want work.' },
        { who: 'Nico Vega', text: 'Friday came early, Sol. Keep the coffee warm.' },
      ]);
      g.hud.banner('DEBT CLEARED', 'Solara Bay is yours — courier fares forever');
      g.saveNow();
    }
  }

  failMission(reason) {
    const g = this.game;
    g.hud.banner('JOB BLOWN', reason);
    g.combat.clearGuards();
    g.police.addHeat(-g.police.heat);
    this.begin(this.stage);
  }

  // --- flow ------------------------------------------------------------------------
  startNew() {
    this.stage = 'meet';
    this.step = 0;
  }

  startFrom(idx) {
    if (idx === 'fares') {
      this.stage = 'fares';
      this.step = 0;
      return;
    }
    this.begin(idx);
  }

  begin(idx) {
    const g = this.game;
    this.stage = idx;
    this.step = 0;
    this.timer = 0;
    if (idx === 0) {
      // The coupe waits in the marina lot from the moment the job is offered.
      if (!this.coupe) this.coupe = g.spawnCoupe();
      this.say([
        { who: 'Sol Marín', text: 'First job is a gift, Nico. A red coupe, marina lot, keys in the visor — the owner is in Ibiza and his insurance is paid up.' },
        { who: 'Sol Marín', text: 'Bring it to your garage. If the police notice, they notice. Drive like you mean it.' },
      ]);
    } else if (idx === 1) {
      this.say([
        { who: 'Sol Marín', text: 'A package waits at the Muelle 9 gate. Pick it up, carry it to my buyer at Plaza Verde — he pays on sight.' },
        { who: 'Sol Marín', text: 'One thing. Half the harbour police had their coffee early today. Expect company, and do not stop for it.' },
      ]);
    } else if (idx === 2) {
      this.say([
        { who: 'Sol Marín', text: 'The crew runs a sprint down the coast road — eight lights, south to north, one timer. Beat it and the pot is yours.' },
        { who: 'Sol Marín', text: 'Take something quick. The coupe you stole would do nicely. The lights start at the south end of the coast road.' },
      ]);
    } else if (idx === 3) {
      this.spawnDocksGuards();
      this.say([
        { who: 'Sol Marín', text: 'Muelle 9. A rival crew sits on a cash case that belongs to my friends, and they shoot first — I checked.' },
        { who: 'Sol Marín', text: 'Clear the yard, take the case by the north containers. The pistol under your seat is loaded. I would know.' },
      ]);
    } else if (idx === 4) {
      this.say([
        { who: 'Sol Marín', text: 'Last job, and it pays the rest of the debt in one envelope. Banco Solara, midday, a bag by the vault door with your name on it.' },
        { who: 'Sol Marín', text: 'The alarm is not a suggestion — you will have four stars before you reach the street. Lose them or outrun them, and park at the garage.' },
      ]);
    }
  }

  spawnDocksGuards() {
    const g = this.game;
    g.combat.clearGuards();
    const posts = [
      { x: 150, z: -214, coverX: 146, coverZ: -208 },
      { x: 186, z: -198, coverX: 182, coverZ: -204 },
      { x: 216, z: -212, coverX: 212, coverZ: -206 },
      { x: 152, z: -158, coverX: 148, coverZ: -164 },
      { x: 190, z: -148, coverX: 194, coverZ: -154 },
      { x: 220, z: -168, coverX: 216, coverZ: -162 },
    ];
    for (const post of posts) {
      const guard = g.combat.spawnGuard(post);
      guard.armed = true;
    }
    this.guardsLeft = posts.length;
  }

  spawnBankGuards() {
    const g = this.game;
    const cx = blockX(4);
    const cz = blockZ(4);
    for (const s of [-1, 1]) {
      const guard = g.combat.spawnGuard({ x: cx + s * 9, z: cz + 17, coverX: cx + s * 6.4, coverZ: cz + 13.4 });
      guard.armed = true;
      guard.state = 'fight';
    }
  }

  onGuardDown() {
    if (this.stage === 3 && this.step === 0) {
      this.guardsLeft--;
      if (this.guardsLeft <= 0) {
        this.step = 1;
        this.game.hud.toast('The yard is clear — take the case');
      }
    }
  }

  onEnterCar(car) {
    if (this.stage === 0 && this.step === 0 && car === this.coupe) {
      this.step = 1;
      this.game.police.setHeat(1);
      this.say([
        { who: 'Sol Marín', text: 'That engine sounds expensive. Garage, Nico. Now.' },
      ]);
    }
  }

  onPlayerDown() {
    // A blown job restarts at its briefing; the world keeps the cash you had.
    if (typeof this.stage === 'number') {
      this.game.combat.clearGuards();
      if (this.stage === 3) this.spawnDocksGuards();
      this.step = 0;
      this.timer = 0;
    }
    if (this.fare) {
      this.endFare(false);
    }
  }

  // --- the per-frame story ---------------------------------------------------------
  update(dt) {
    const g = this.game;
    const p = g.player;
    if (this.stage === 'shot') {
      // Screenshot staging owns the stage; the story keeps quiet.
      this.clearObjective('');
      return;
    }
    if (this.stage === 'meet') {
      const c = g.city.cafeFront;
      this.setObjective(c.x, c.z, 'Meet Sol Marín outside Café Sol');
      if (p.mode === 'foot' && this.near(c.x, c.z, 3.6) && !g.hud.dialogueActive) {
        this.say([
          { who: 'Sol Marín', text: 'Nico Vega. Sit. You look like a man who owes the Marina Crew ten thousand dollars.' },
          { who: 'Nico Vega', text: 'Friday, Sol. They said Friday. It is Tuesday and already nobody smiles at me on the pier.' },
          { who: 'Sol Marín', text: 'Then we work. I have five jobs that add up to a free man, and you have the hands for all of them.' },
          { who: 'Sol Marín', text: 'Walk when I say walk, drive when I say drive, and when I say run — cariño — you run.' },
        ], () => this.begin(0));
        this.stage = 'briefing';
      }
      return;
    }
    if (this.stage === 'briefing') {
      this.clearObjective('Listen to Sol');
      return;
    }
    if (this.stage === 'fares') {
      this.updateFare(dt);
      return;
    }
    const idx = this.stage;
    if (idx === 0) this.updateFirstWheels();
    else if (idx === 1) this.updateHotPackage(dt);
    else if (idx === 2) this.updateSprint(dt);
    else if (idx === 3) this.updateDocks();
    else if (idx === 4) this.updateBigScore();
  }

  updateFirstWheels() {
    const g = this.game;
    if (this.step === 0) {
      const lot = g.city.marinaLot;
      this.setObjective(lot.x, lot.z, 'Steal the red coupe in the marina lot');
    } else {
      const door = g.city.hideoutDoor;
      this.setObjective(door.x, door.z, 'Deliver the coupe to your garage');
      if (g.player.mode === 'car' && this.near(door.x, door.z, 7)) {
        this.completeMission(0);
      }
    }
  }

  updateHotPackage(dt) {
    const g = this.game;
    const gate = g.city.docksGate;
    if (this.step === 0) {
      this.setObjective(gate.x, gate.z, 'Pick up the package at the Muelle 9 gate');
      if (g.player.mode === 'foot' && this.near(gate.x, gate.z, 3.4)) {
        this.step = 1;
        this.timer = 240;
        g.police.setHeat(2);
        const buyerPos = { x: blockX(2) + 29, z: blockZ(4) + 10 };
        this.buyer = makePerson(g.rng, { shirt: 0xffc933, pants: 0x2b3a4a });
        this.buyer.group.position.set(buyerPos.x, 0, buyerPos.z);
        g.scene.add(this.buyer.group);
        this.say([{ who: 'Sol Marín', text: 'Package in hand, every siren in the harbour awake. Plaza Verde. Go.' }]);
      }
      return;
    }
    this.timer -= dt;
    const buyerPos = { x: blockX(2) + 29, z: blockZ(4) + 10 };
    this.setObjective(buyerPos.x, buyerPos.z, `Deliver the package — ${Math.max(0, Math.ceil(this.timer))}s`);
    if (this.timer <= 0) {
      if (this.buyer) {
        g.scene.remove(this.buyer.group);
        this.buyer = null;
      }
      this.failMission('The buyer walked away');
      return;
    }
    if (this.near(buyerPos.x, buyerPos.z, 5)) {
      if (this.buyer) {
        g.scene.remove(this.buyer.group);
        this.buyer = null;
      }
      this.completeMission(1);
    }
  }

  updateSprint(dt) {
    const g = this.game;
    const coastX = streetX(GRID);
    if (this.step === 0) {
      const start = { x: coastX, z: streetZ(7) };
      this.setObjective(start.x, start.z, 'Reach the start light at the south end of the coast road');
      if (g.player.mode === 'car' && this.near(start.x, start.z, 10)) {
        this.step = 1;
        this.timer = 160;
        this.checkpoint = 0;
        g.hud.banner('COSTA SPRINT', 'Eight lights, one timer');
      }
      return;
    }
    this.timer -= dt;
    const zs = [180, 120, 60, 0, -60, -120, -180, -240];
    const target = { x: coastX, z: zs[this.checkpoint] };
    this.setObjective(target.x, target.z, `Checkpoint ${this.checkpoint + 1} of 8 — ${Math.max(0, Math.ceil(this.timer))}s`);
    if (this.timer <= 0) {
      this.failMission('The sprint clock ran out');
      return;
    }
    if (g.player.mode === 'car' && this.near(target.x, target.z, 11)) {
      this.checkpoint++;
      g.sound.pickup();
      if (this.checkpoint >= 8) this.completeMission(2);
    }
  }

  updateDocks() {
    const g = this.game;
    if (this.step === 0) {
      const gate = g.city.docksGate;
      const alive = g.combat.guards.filter((gd) => gd.alive).length;
      this.setObjective(gate.x, gate.z, `Clear Muelle 9 — ${alive} guards standing`);
    } else {
      const c = g.city.docksCase;
      this.setObjective(c.x, c.z, 'Take the cash case by the north containers');
      if (g.player.mode === 'foot' && this.near(c.x, c.z, 3)) {
        this.completeMission(3);
      }
    }
  }

  updateBigScore() {
    const g = this.game;
    const door = g.city.bankDoor;
    if (this.step === 0) {
      this.setObjective(door.x, door.z, 'Enter Banco Solara and reach the vault door');
      const vault = { x: blockX(4), z: blockZ(4) + 13.2 };
      if (g.player.mode === 'foot' && this.near(vault.x, vault.z, 3.2)) {
        this.step = 1;
        g.police.setHeat(4);
        this.spawnBankGuards();
        g.hud.banner('ALARM', 'Four stars — take the money and run');
        this.say([{ who: 'Nico Vega', text: 'That is a lot of sirens for one envelope.' }]);
      }
      return;
    }
    if (this.step === 1) {
      const vault = { x: blockX(4), z: blockZ(4) + 13.2 };
      this.setObjective(vault.x, vault.z, 'Grab the money bag');
      if (g.player.mode === 'foot' && this.near(vault.x, vault.z, 3)) {
        this.step = 2;
        g.addCash(0); // the reward lands on delivery, like the crew counts it
        g.hud.toast('Money bag taken');
      }
      return;
    }
    const doorH = g.city.hideoutDoor;
    this.setObjective(doorH.x, doorH.z, 'Escape to your garage');
    if (this.near(doorH.x, doorH.z, 7.5)) {
      this.completeMission(4);
    }
  }

  // --- Endless courier fares ---------------------------------------------------------
  updateFare(dt) {
    const g = this.game;
    void dt;
    if (!this.fare) {
      // Offer a new fare from a random street corner.
      const rng = g.rng;
      const px = streetX(rng.int(0, GRID)) + (rng.chance(0.5) ? 10 : -10);
      const pz = streetZ(rng.int(0, GRID)) + (rng.chance(0.5) ? 10 : -10);
      let dx = streetX(rng.int(0, GRID));
      let dz = streetZ(rng.int(0, GRID));
      if (Math.hypot(dx - px, dz - pz) < 150) dx = -dx;
      this.fare = { pickup: { x: px, z: pz }, drop: { x: dx, z: dz }, step: 0, pay: 0 };
      this.farePerson = makePerson(rng, {});
      this.farePerson.group.position.set(px, 0, pz);
      g.scene.add(this.farePerson.group);
      g.hud.toast('New fare — follow the gold light');
    }
    const f = this.fare;
    if (f.step === 0) {
      this.setObjective(f.pickup.x, f.pickup.z, g.player.mode === 'car' ? 'Pick up your passenger' : 'Get a car, then pick up your passenger');
      if (g.player.mode === 'car' && g.player.speed2d < 1.5 && this.near(f.pickup.x, f.pickup.z, 6.5)) {
        f.step = 1;
        if (this.farePerson) {
          g.scene.remove(this.farePerson.group);
          this.farePerson = null;
        }
        const dist = Math.hypot(f.drop.x - f.pickup.x, f.drop.z - f.pickup.z);
        f.pay = Math.round(120 + dist * 0.9);
        g.sound.pickup();
      }
    } else {
      this.setObjective(f.drop.x, f.drop.z, `Drop your passenger — fare $${f.pay}`);
      if (g.player.mode === 'car' && g.player.speed2d < 1.5 && this.near(f.drop.x, f.drop.z, 7)) {
        g.addCash(f.pay);
        g.sound.cashRegister();
        g.hud.toast(`Fare paid — $${f.pay}`);
        this.fare = null;
        g.saveNow();
      }
    }
  }

  endFare() {
    const g = this.game;
    if (this.farePerson) {
      g.scene.remove(this.farePerson.group);
      this.farePerson = null;
    }
    this.fare = null;
  }
}
