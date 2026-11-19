// shots.js — staged scenes for the entry's screenshots. The game is deterministic
// (seeded city, seeded traffic), so a shot is just a saved moment: this module
// poses one when the page is opened with ?shot=<name>&seed=7, the way shots.json
// names them. cover: the stolen coupe running south down the coast road at golden
// hour. chase: a three-star pursuit through a downtown intersection. docks: the
// Muelle 9 shootout, mid-firefight. boulevard: the opening conversation with Sol
// outside Café Sol, dialogue box and all. Each returns a tick that holds the pose
// — speeds pinned, cameras placed — while the capture tool takes the picture.

import { streetX, streetZ, GRID, LANE } from './config.js';

export function setupShot(game, name) {
  const { player, police, hud } = game;
  hud.dialogueQueue.length = 0;

  if (name === 'cover') {
    const coupe = game.spawnCoupe();
    const x = streetX(GRID) - LANE;
    // Give the coupe a clear coast road: move any traffic off its corridor.
    for (const car of game.traffic.cars) {
      if (Math.abs(car.pos.x - streetX(GRID)) < 26) {
        car.place(streetX(1), car.pos.z, car.heading);
        car.traffic.axis = 'z';
        car.traffic.index = 1;
        car.traffic.wp = null;
      }
    }
    coupe.place(x, 30, 0);
    player.enterCar(coupe, false);
    silenceStory(game);
    return (dt, camera) => {
      coupe.speed = 19;
      coupe.pos.x = x;
      // From the beach side: the west kerb is building faces, which swallow a low
      // camera; from the sand the coupe reads against the whole skyline.
      camera.position.set(coupe.pos.x + 9.5, 2.4, coupe.pos.z + 12.5);
      camera.lookAt(coupe.pos.x - 3, 1.0, coupe.pos.z - 9);
    };
  }

  if (name === 'chase') {
    // Eastbound along the bank row, buildings on both sides, the camera pre-aligned
    // behind the car so the frame opens already composed.
    const startX = streetX(2) - 24;
    const laneZ = streetZ(4) + LANE;
    const car = game.spawnCarAt('coupe', startX, laneZ, Math.PI / 2);
    player.enterCar(car, false);
    player.camYaw = Math.PI / 2;
    silenceStory(game);
    police.setHeat(3.2);
    // Three interceptors on the tail, held at the hero car's pace by the tick so
    // the pack reads as a pursuit instead of a pile-up.
    const spots = [
      { x: startX - 16, z: laneZ },
      { x: startX - 25, z: laneZ + 1.6 },
      { x: startX - 34, z: laneZ - 1.2 },
    ];
    for (const s of spots) police.spawnCar(player.pos);
    police.cars.forEach((unit, i) => {
      const s = spots[i % spots.length];
      unit.car.place(s.x, s.z, Math.PI / 2);
      unit.car.speed = 15;
    });
    return (dt, camera) => {
      car.speed = 15;
      for (const unit of police.cars) {
        if (unit.car.speed > 16) unit.car.speed = 16;
      }
      void dt;
      void camera;
    };
  }

  if (name === 'docks') {
    const m = game.missions;
    m.stage = 3;
    m.step = 0;
    m.spawnDocksGuards();
    player.placeAt(168, -186);
    player.person.group.rotation.y = -0.7;
    player.person.setAim(true);
    for (const gd of game.combat.guards) gd.state = 'fight';
    m.setObjective(game.city.docksGate.x, game.city.docksGate.z, 'Clear Muelle 9 — 6 guards standing');
    let tracerClock = 0;
    return (dt, camera) => {
      camera.position.set(157, 3.1, -171);
      camera.lookAt(186, 1.2, -201);
      tracerClock -= dt;
      if (tracerClock <= 0) {
        // Near-continuous two-way fire so the captured frame catches a tracer.
        tracerClock = 0.05;
        const a = new THREE.Vector3(player.pos.x + 0.4, 1.35, player.pos.z - 0.3);
        const b = new THREE.Vector3(186, 1.25, -198);
        game.combat.spawnTracer(a, b);
        game.combat.spawnTracer(b, a);
      }
    };
  }

  // boulevard: the opening dialogue.
  game.missions.stage = 'shot';
  const c = game.city.cafeFront;
  player.placeAt(c.x + 1.5, c.z + 2.5);
  player.person.group.rotation.y = Math.atan2(c.x - player.pos.x, c.z - player.pos.z);
  hud.say([
    { who: 'Sol Marín', text: 'Nico Vega. Sit. You look like a man who owes the Marina Crew ten thousand dollars.' },
    { who: 'Nico Vega', text: 'Friday, Sol. They said Friday.' },
  ]);
  hud.dialogueTimer = 1e9; // hold the first line for the camera
  return (dt, camera) => {
    void dt;
    camera.position.set(c.x + 6.5, 2.0, c.z + 8.5);
    camera.lookAt(c.x - 1, 1.4, c.z);
  };
}

// Shots are portraits of systems, not of the story: hush the dialogue, the heat
// and the mission state the enter-car hook may have triggered.
function silenceStory(game) {
  game.hud.dialogueQueue.length = 0;
  game.hud.dialogueEl.classList.remove('show');
  game.police.heat = 0;
  game.missions.stage = 'shot';
  game.missions.clearObjective('');
}
