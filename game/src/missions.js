// The story: five jobs for Sol Marín, the fixer who holds Nico's debt, plus the courier
// work she unlocks afterwards. A mission is a list of stages — talk, go, steal, deliver,
// checkpoints against the clock, a shootout, an escape — and this module runs them:
// markers, dialogue, timers, rewards. It never touches the HUD or the save directly;
// main reads `state` every frame and answers for the money.

import { buildHumanoid } from './player.js';

/** Where each story mission begins; the next one waits at its marker with a gold beacon. */
export const MISSION_STARTS = ['hotel', 'garage', 'raceStart', 'cafe', 'bank'];

/** The story's rewards in order, so main can total what the debt has shrunk by. */
export const MISSION_REWARDS = [500, 800, 700, 1200, 2500];

const STORY = [
  {
    id: 'first-wheels',
    title: 'FIRST WHEELS',
    reward: 500,
    stages: [
      {
        type: 'talk', at: 'hotel',
        lines: [
          ['SOL', 'Nico Vega. Ten thousand owed to the Marina Crew, due Friday, and you arrive on foot.'],
          ['NICO', 'I work better with a car, Sol. You know that.'],
          ['SOL', 'Then take one. Blue coupe, parked by the Palmera, keys in the visor. Bring it to my garage — clean, no stars, no dents you can see.'],
        ],
      },
      { type: 'steal', intro: [['SOL (PHONE)', 'The blue coupe by the hotel. E to get in. Try to look like you own it.']] },
      {
        type: 'deliverCar', at: 'garage',
        intro: [['SOL (PHONE)', 'Good wheels. Now bring her home to the garage, west side.']],
      },
    ],
    outro: [
      ['SOL (PHONE)', 'She purrs. Five hundred, off your debt and into your pocket. More work at the garage when you want it.'],
    ],
  },
  {
    id: 'hot-package',
    title: 'HOT PACKAGE',
    reward: 800,
    stages: [
      {
        type: 'talk', at: 'garage',
        lines: [
          ['SOL', 'A package waits at Muelle 9, the dock warehouse. Customs never stamped it, and the port police watch that yard.'],
          ['NICO', 'So I walk in, take it, and the whole port lights up.'],
          ['SOL', 'Then you drive like the tide is behind you. Café Sol, north side. My buyer does not wait.'],
        ],
      },
      {
        type: 'pickup', at: 'warehouse', setWanted: 2,
        intro: [['SOL (PHONE)', 'The case is by the warehouse door. On foot, quick hands.']],
        outro: [['NICO', 'Got it — and every siren in Solara just woke up.']],
      },
      {
        type: 'goto', at: 'cafe', radius: 8,
        intro: [['SOL (PHONE)', 'Café Sol. Lose them or outrun them, just get here.']],
      },
    ],
    outro: [
      ['SOL (PHONE)', 'Delivered, and the buyer pays in clean bills. Eight hundred. The Crew is starting to like you.'],
    ],
  },
  {
    id: 'costa-sprint',
    title: 'COSTA SPRINT',
    reward: 700,
    stages: [
      {
        type: 'talk', at: 'raceStart',
        lines: [
          ['SOL', 'A street kid named Rafa swears no driver can run the Costa in a hundred seconds. His money says otherwise.'],
          ['NICO', 'Checkpoints along the shore road, then up the east side?'],
          ['SOL', 'Every gold ring, in order, against the clock. Any car you like. Try the one you are standing next to.'],
        ],
      },
      {
        type: 'checkpoints', timer: 100,
        points: [[-96, 192], [-48, 192], [0, 192], [48, 192], [96, 192], [144, 192], [192, 144], [192, 96]],
        intro: [['SOL (PHONE)', 'Clock is running. Gold rings, in order — go!']],
      },
    ],
    outro: [
      ['SOL (PHONE)', 'Rafa just paid up and asked for your number. Seven hundred. I told him you are expensive now.'],
    ],
  },
  {
    id: 'dockside-trouble',
    title: 'DOCKSIDE TROUBLE',
    reward: 1200,
    stages: [
      {
        type: 'talk', at: 'cafe', givePistol: true,
        lines: [
          ['SOL', 'The Marina Crew keeps its cash in a case at Muelle 9, guarded by four men who shoot first.'],
          ['NICO', 'You want me to rob the people I owe?'],
          ['SOL', 'I want you to be owed nothing. Take this pistol — click to aim and fire, R to reload. The case sits between the containers.'],
        ],
      },
      {
        type: 'shootout', at: 'docks',
        guards: [[128, 148], [158, 138], [112, 164], [152, 172]],
        intro: [['SOL (PHONE)', 'Four guards, one case. Quiet is not an option anymore.']],
      },
      {
        type: 'pickup', at: 'caseSpot',
        intro: [['NICO', 'Case is mine. Now to get it somewhere safe.']],
      },
      {
        type: 'goto', at: 'garage', radius: 9,
        intro: [['SOL (PHONE)', 'Bring the case to the garage. Careful — they will be looking for you.']],
      },
    ],
    outro: [
      ['SOL (PHONE)', 'That is the Crew\u2019s own money paying the Crew\u2019s own debt. Twelve hundred for you. Poetry.'],
    ],
  },
  {
    id: 'the-big-score',
    title: 'THE BIG SCORE',
    reward: 2500,
    stages: [
      {
        type: 'talk', at: 'bank',
        lines: [
          ['SOL', 'Last job, Nico. Banco Solara moves its weekend take in one case, out the back door, at noon.'],
          ['NICO', 'And the whole police force will come to say goodbye.'],
          ['SOL', 'Take the case, lose the sirens, and reach the beach house west. Then you owe nobody anything. Ever.'],
        ],
      },
      {
        type: 'pickup', at: 'bankBack', setWanted: 4,
        intro: [['SOL (PHONE)', 'Back door of the bank. Grab it and run.']],
        outro: [['NICO', 'Four stars. The whole city is coming. Beach house — just get there and disappear.']],
      },
      {
        type: 'escape', at: 'hideout', radius: 11, maxWanted: 1,
        intro: [['SOL (PHONE)', 'Break their line of sight. Alleys, side streets — let the stars die, then slip home.']],
      },
    ],
    outro: [
      ['SOL', 'Debt paid in full, with interest, and a bonus for the show. Solara is yours now, Nico.'],
      ['NICO', 'Then I am staying. The heat here suits me.'],
    ],
  },
];

/** Named spots the stages point at, resolved against the city's landmarks. */
function spotOf(name, city, extra) {
  const L = city.landmarks;
  switch (name) {
    case 'hotel': return L.hotel;
    case 'garage': return L.garage;
    case 'cafe': return L.cafe;
    case 'bank': return L.bank;
    case 'bankBack': return new THREE.Vector3(L.bank.x, 0, L.bank.z - 18);
    case 'warehouse': return L.warehouse;
    case 'docks': return L.docks;
    case 'hideout': return L.hideout;
    case 'raceStart': return new THREE.Vector3(-156, 0, 192);
    case 'caseSpot': return new THREE.Vector3(138, 0, 156);
    default: return extra || L.hotel;
  }
}

/**
 * Run the story. ctx (from main) carries the world: {city, player, playerCar(), inCar(),
 * parkedCars, police, combat, peds, audio, rng, onCash(amount), onToast(t, sub),
 * onMissionDone(index), onStoryDone(), setArmed()}.
 */
export function createMissions(scene, city, rng, ctx) {
  // The gold beacon: a column of light and a ring, visible across the city.
  const beaconMat = new THREE.MeshBasicMaterial({
    color: 0xffb703, transparent: true, opacity: 0.34, depthWrite: false, side: THREE.DoubleSide,
  });
  const beacon = new THREE.Mesh(new THREE.CylinderGeometry(1.7, 1.7, 42, 14, 1, true), beaconMat);
  beacon.name = 'mission-beacon';
  beacon.position.y = 21;
  beacon.visible = false;
  scene.add(beacon);
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(2.1, 2.9, 26),
    new THREE.MeshBasicMaterial({ color: 0xffb703, transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.15;
  ring.visible = false;
  scene.add(ring);

  // The cash case the pickups revolve around.
  const caseMesh = new THREE.Mesh(
    new THREE.BoxGeometry(0.9, 0.35, 0.6),
    new THREE.MeshLambertMaterial({ color: 0x8a5a2b, emissive: 0x2a1a05 }),
  );
  caseMesh.visible = false;
  scene.add(caseMesh);

  let solNpc = null;
  function showSol(pos) {
    hideSol();
    solNpc = buildHumanoid(rng, { shirt: 0x0e7c86, pants: 0x20303e, cap: null });
    solNpc.position.copy(pos);
    solNpc.position.x += 1.6;
    scene.add(solNpc);
  }
  function hideSol() {
    if (solNpc) { scene.remove(solNpc); solNpc = null; }
  }

  const state = {
    mode: 'idle', // idle | dialogue | active | done
    missionIndex: 0,
    stageIndex: 0,
    dialogue: null, // {name, text, lines, index}
    objective: '',
    missionTitle: '',
    marker: null, // THREE.Vector3 | null
    timer: null,
    storyDone: false,
    courierUnlocked: false,
    courier: null, // {phase: 'offer'|'pickup'|'deliver', target, timer, reward}
  };
  let stage = null;
  let stageState = {};
  let dialogueDone = null;
  let elapsed = 0;

  function setMarker(pos) {
    state.marker = pos;
    if (pos) {
      beacon.visible = true; ring.visible = true;
      beacon.position.x = pos.x; beacon.position.z = pos.z;
      ring.position.x = pos.x; ring.position.z = pos.z;
    } else {
      beacon.visible = false; ring.visible = false;
    }
  }

  function playDialogue(lines, onDone) {
    state.dialogue = { lines, index: 0, name: lines[0][0], text: lines[0][1] };
    state.mode = 'dialogue';
    dialogueDone = onDone || null;
    setMarker(null);
  }

  /** Advance the open dialogue; returns true when it just closed. */
  function advanceDialogue() {
    if (!state.dialogue) return false;
    const d = state.dialogue;
    d.index += 1;
    ctx.audio.click();
    if (d.index >= d.lines.length) {
      state.dialogue = null;
      state.mode = 'active';
      const done = dialogueDone;
      dialogueDone = null;
      if (done) done();
      return true;
    }
    d.name = d.lines[d.index][0];
    d.text = d.lines[d.index][1];
    return false;
  }

  function currentMission() { return STORY[state.missionIndex] || null; }

  function beginStage() {
    const mission = currentMission();
    stage = mission.stages[state.stageIndex];
    stageState = {};
    state.missionTitle = mission.title;
    const start = () => activateStage(mission, stage);
    if (stage.intro) playDialogue(stage.intro, start);
    else start();
  }

  function activateStage(mission, st) {
    state.mode = 'active';
    if (st.givePistol) ctx.setArmed();
    switch (st.type) {
      case 'talk': {
        const pos = spotOf(st.at, city);
        showSol(pos);
        setMarker(pos);
        state.objective = `Meet Sol — ${mission.title}`;
        stageState.awaitTalk = true;
        break;
      }
      case 'steal': {
        // Pick the parked car nearest the hotel and mark it as the one.
        let best = null; let bestD = Infinity;
        for (const car of ctx.parkedCars) {
          if (car.kind !== 'parked') continue;
          const d = car.mesh.position.distanceTo(city.landmarks.hotel);
          if (d < bestD) { bestD = d; best = car; }
        }
        stageState.targetCar = best;
        if (best) {
          best.highlighted = true;
          state.objective = 'Steal the marked coupe';
        }
        break;
      }
      case 'deliverCar': {
        setMarker(spotOf(st.at, city));
        state.objective = `Deliver the car — ${st.at === 'garage' ? "Sol's Garage" : st.at}`;
        break;
      }
      case 'goto': {
        setMarker(spotOf(st.at, city));
        state.objective = `Get to the marker`;
        break;
      }
      case 'pickup': {
        const pos = spotOf(st.at, city);
        setMarker(pos);
        caseMesh.position.copy(pos);
        caseMesh.position.y = 0.4;
        caseMesh.visible = true;
        state.objective = 'Take the case';
        break;
      }
      case 'checkpoints': {
        stageState.idx = 0;
        state.timer = st.timer;
        const p = st.points[0];
        setMarker(new THREE.Vector3(p[0], 0, p[1]));
        state.objective = `Checkpoint 1 of ${st.points.length}`;
        break;
      }
      case 'shootout': {
        for (const [gx, gz] of st.guards) ctx.combat.spawnGuard(gx, gz, rng.range(0, 6));
        setMarker(spotOf(st.at, city));
        state.objective = 'Clear the dock crew';
        break;
      }
      case 'escape': {
        setMarker(spotOf(st.at, city));
        state.objective = 'Reach the beach house with at most 1 star';
        break;
      }
      default: break;
    }
  }

  function completeStage() {
    const mission = currentMission();
    const finished = stage;
    if (stageState.targetCar) stageState.targetCar.highlighted = false;
    caseMesh.visible = false;
    hideSol();
    const next = () => {
      state.stageIndex += 1;
      if (state.stageIndex >= mission.stages.length) completeMission();
      else beginStage();
    };
    if (finished.outro) playDialogue(finished.outro, next);
    else next();
  }

  function completeMission() {
    const mission = currentMission();
    ctx.onCash(mission.reward);
    ctx.audio.missionPass();
    ctx.onToast('MISSION PASSED', `${mission.title} · +$${mission.reward.toLocaleString('en-US')}`);
    const finish = () => {
      state.missionIndex += 1;
      state.stageIndex = 0;
      stage = null;
      if (mission.id === 'costa-sprint') {
        state.courierUnlocked = true;
        ctx.onToast('COURIER WORK PROMISED', 'Sol will open courier runs once the debt is settled');
      }
      if (state.missionIndex >= STORY.length) {
        state.storyDone = true;
        ctx.onStoryDone();
      }
      ctx.onMissionDone(state.missionIndex);
      idleMarker();
    };
    if (mission.outro) playDialogue(mission.outro, finish);
    else finish();
  }

  function failMission(reason) {
    ctx.audio.missionFail();
    ctx.onToast('MISSION FAILED', reason);
    state.timer = null;
    ctx.combat.clearGuards();
    caseMesh.visible = false;
    hideSol();
    if (stageState.targetCar) stageState.targetCar.highlighted = false;
    stage = null;
    state.stageIndex = 0;
    idleMarker();
  }

  /** Between missions, the beacon waits at the next job's start (or a courier offer). */
  function idleMarker() {
    state.mode = 'idle';
    state.objective = '';
    state.timer = null;
    if (state.storyDone) { setMarker(null); return; }
    const mission = currentMission();
    if (mission) {
      setMarker(spotOf(MISSION_STARTS[state.missionIndex], city));
      state.objective = `Next job: ${mission.title}`;
    }
  }

  /** Start the story mission whose start marker the player just walked into. */
  function tryStartMission(playerPos) {
    if (state.mode !== 'idle' || state.storyDone) return false;
    const startPos = spotOf(MISSION_STARTS[state.missionIndex], city);
    if (playerPos.distanceTo(startPos) > 6) return false;
    state.stageIndex = 0;
    beginStage();
    return true;
  }

  // --- courier work -----------------------------------------------------------
  function offerCourier() {
    const spots = [
      [-120, -96], [72, -144], [144, 24], [-168, 72], [24, 144], [-72, 168], [168, -72], [-24, -168],
    ];
    const [x, z] = spots[rng.int(0, spots.length - 1)];
    state.courier = { phase: 'offer', target: new THREE.Vector3(x, 0, z) };
    setMarker(state.courier.target);
    state.objective = 'Courier fare waiting — reach the $ marker';
  }

  function updateCourier(dt, playerPos) {
    // Courier work is endgame content: while a story job waits, its beacon owns the map.
    if (!state.courierUnlocked || !state.storyDone) return;
    if (state.mode !== 'idle') return;
    if (!state.courier) { offerCourier(); return; }
    const c = state.courier;
    const dist = playerPos.distanceTo(c.target);
    if (c.phase === 'offer' && dist < 6) {
      const [dx, dz] = [[120, -48], [-144, -120], [48, 168], [-96, 48], [168, 120], [-168, -24]][rng.int(0, 5)];
      const target = new THREE.Vector3(dx, 0, dz);
      const d = playerPos.distanceTo(target);
      c.phase = 'deliver';
      c.target = target;
      c.timer = Math.round(d / 13) + 30;
      c.reward = Math.round(120 + d * 0.7);
      setMarker(target);
      ctx.onToast('COURIER FARE', `Deliver across town · $${c.reward} · ${c.timer}s`);
      ctx.audio.pickup();
    } else if (c.phase === 'deliver') {
      c.timer -= dt;
      state.timer = Math.ceil(c.timer);
      state.objective = `Courier delivery — $${c.reward}`;
      if (dist < 8) {
        ctx.onCash(c.reward);
        ctx.audio.cash();
        ctx.onToast('FARE PAID', `+$${c.reward.toLocaleString('en-US')}`);
        state.courier = null;
        state.timer = null;
        idleMarker();
      } else if (c.timer <= 0) {
        ctx.onToast('FARE LOST', 'Too slow — the passenger walked');
        ctx.audio.missionFail();
        state.courier = null;
        state.timer = null;
        idleMarker();
      }
    }
  }

  // --- the per-step driver ------------------------------------------------------
  function update(dt, playerPos) {
    elapsed += dt;
    beaconMat.opacity = 0.26 + Math.sin(elapsed * 3.2) * 0.1;
    ring.scale.setScalar(1 + Math.sin(elapsed * 3.2) * 0.07);
    if (caseMesh.visible) caseMesh.rotation.y += dt * 1.4;
    if (stage && stage.type === 'steal' && stageState.targetCar) {
      setMarker(stageState.targetCar.mesh.position);
    }
    if (state.mode === 'dialogue' || state.mode !== 'active') {
      if (state.mode === 'idle') updateCourier(dt, playerPos);
      return;
    }
    if (!stage) return;
    const st = stage;
    switch (st.type) {
      case 'talk': {
        if (stageState.awaitTalk && playerPos.distanceTo(spotOf(st.at, city)) < 4.2) {
          stageState.awaitTalk = false;
          playDialogue(st.lines, () => completeStage());
        }
        break;
      }
      case 'steal': {
        if (ctx.inCar() && ctx.playerCar() === stageState.targetCar) completeStage();
        break;
      }
      case 'deliverCar': {
        if (ctx.inCar() && playerPos.distanceTo(spotOf(st.at, city)) < 9) completeStage();
        break;
      }
      case 'goto': {
        if (playerPos.distanceTo(spotOf(st.at, city)) < (st.radius || 7)) completeStage();
        break;
      }
      case 'pickup': {
        if (!ctx.inCar() && playerPos.distanceTo(spotOf(st.at, city)) < 2.6) {
          if (st.setWanted) ctx.police.commitCrime(st.setWanted);
          completeStage();
        }
        break;
      }
      case 'checkpoints': {
        state.timer -= dt;
        if (state.timer <= 0) { failMission('Out of time on the Costa run'); break; }
        const p = st.points[stageState.idx];
        if (ctx.inCar() && playerPos.distanceTo(new THREE.Vector3(p[0], 0, p[1])) < 10) {
          stageState.idx += 1;
          ctx.audio.checkpoint();
          if (stageState.idx >= st.points.length) { state.timer = null; completeStage(); }
          else {
            const np = st.points[stageState.idx];
            setMarker(new THREE.Vector3(np[0], 0, np[1]));
            state.objective = `Checkpoint ${stageState.idx + 1} of ${st.points.length}`;
          }
        }
        break;
      }
      case 'shootout': {
        const left = ctx.combat.guards.filter((g) => g.alive).length;
        state.objective = `Clear the dock crew — ${left} left`;
        if (left === 0) completeStage();
        break;
      }
      case 'escape': {
        const inZone = playerPos.distanceTo(spotOf(st.at, city)) < st.radius;
        state.objective = inZone
          ? (ctx.police.wanted <= st.maxWanted ? 'Home free…' : `Lose the heat — ${ctx.police.wanted} stars still burning`)
          : 'Reach the beach house with at most 1 star';
        if (inZone && ctx.police.wanted <= st.maxWanted) completeStage();
        break;
      }
      default: break;
    }
  }

  idleMarker();

  return {
    state, update, advanceDialogue, tryStartMission,
    /** End the running mission without a reward: the player woke up somewhere else. */
    abortMission(reason) { if (state.mode === 'active' || state.mode === 'dialogue') failMission(reason); },
    get dialogueActive() { return state.mode === 'dialogue'; },
    get activeStage() { return stage; },
    startFromSave(missionIndex) {
      state.missionIndex = missionIndex;
      if (missionIndex >= 3) state.courierUnlocked = true;
      if (missionIndex >= STORY.length) state.storyDone = true;
      idleMarker();
    },
  };
}
