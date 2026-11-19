// city.js — Solara Bay itself: it builds the whole visible city into the scene and
// remembers the facts the gameplay systems need. An 8×8 grid of blocks on a pitch of
// 60 metres; stucco buildings with painted facades downtown, taller toward the
// centre; the Muelle 9 container docks in the north-east; the Marina Crew's basin
// and the Café Sol in the south-east; Plaza Verde park in the west; Banco Solara
// dead centre; Nico's garage in the south-west; and east of the coast road a
// promenade, a beach, a pier and the sea. Every solid thing registers an AABB in
// `colliders`, the one list the player, the traffic and the police all collide with.

import {
  GRID, PITCH, BLOCK, ROAD, WORLD, HALF, BEACH_X, SEA_X, COLORS, SHOP_NAMES, zoneAt,
  streetX, streetZ, blockX, blockZ,
} from './config.js';
import { facadeTexture, roofTexture, roadTexture, groundTexture, signTexture } from './textures.js';

export function buildCity(scene, rng) {
  const colliders = [];
  const addCollider = (cx, cz, w, d) => {
    colliders.push({ minX: cx - w / 2, maxX: cx + w / 2, minZ: cz - d / 2, maxZ: cz + d / 2 });
  };

  const city = {
    colliders,
    parkedSpots: [],
    guardPosts: [],
    boats: [],
    update: null,
    bankDoor: { x: blockX(4), z: blockZ(4) + BLOCK / 2 + 4 },
    cafeFront: { x: blockX(5) - 10, z: blockZ(6) + BLOCK / 2 + 5 },
    hideoutDoor: { x: blockX(0) + 6, z: blockZ(7) - BLOCK / 2 - 5 },
    docksGate: { x: streetX(6) - 4, z: blockZ(0) },
    docksCase: { x: blockX(7) - 8, z: blockZ(1) + 6 },
    marinaLot: { x: blockX(6) + 4, z: blockZ(7) - 12 },
    parkCentre: { x: blockX(2), z: blockZ(4) },
  };

  // --- Sky, light, ground ------------------------------------------------------
  const skyTex = (() => {
    const c = document.createElement('canvas');
    c.width = 4;
    c.height = 256;
    const g = c.getContext('2d');
    const grad = g.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, '#5f96c4');
    grad.addColorStop(0.45, '#e8a868');
    grad.addColorStop(0.72, '#ffb37a');
    grad.addColorStop(1, '#ff9d6b');
    g.fillStyle = grad;
    g.fillRect(0, 0, 4, 256);
    return new THREE.CanvasTexture(c);
  })();
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(1500, 24, 12),
    new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, fog: false }),
  );
  scene.add(sky);
  scene.fog = new THREE.Fog(COLORS.fog, 400, 1550);

  const hemi = new THREE.HemisphereLight(0xffe3c0, 0x5a6b7a, 0.72);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(COLORS.sun, 1.35);
  sun.position.set(-260, 300, -420);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -170;
  sun.shadow.camera.right = 170;
  sun.shadow.camera.top = 170;
  sun.shadow.camera.bottom = -170;
  sun.shadow.camera.far = 1400;
  sun.shadow.bias = -0.0006;
  scene.add(sun);
  scene.add(sun.target);
  city.sun = sun;

  const base = new THREE.Mesh(
    new THREE.PlaneGeometry(2400, 2400),
    new THREE.MeshLambertMaterial({ color: COLORS.sidewalk }),
  );
  base.rotation.x = -Math.PI / 2;
  base.position.y = -0.05;
  base.receiveShadow = true;
  scene.add(base);

  // --- Streets -------------------------------------------------------------------
  // One road strip geometry, laid flat with geometry rotations (never Euler pairs
  // on the mesh): the texture runs along the strip, tiled every ~31 metres so the
  // centre dashes read at street scale.
  const roadTex = roadTexture();
  roadTex.repeat.set(1, 16);
  const roadMat = new THREE.MeshLambertMaterial({ map: roadTex });
  const roadGeoV = new THREE.PlaneGeometry(ROAD, WORLD + ROAD);
  roadGeoV.rotateX(-Math.PI / 2);
  const roadGeoH = new THREE.PlaneGeometry(ROAD, WORLD + ROAD);
  roadGeoH.rotateX(-Math.PI / 2);
  roadGeoH.rotateY(Math.PI / 2);
  for (let i = 0; i <= GRID; i++) {
    const v = new THREE.Mesh(roadGeoV, roadMat);
    v.position.set(streetX(i), 0.02, 0);
    v.receiveShadow = true;
    scene.add(v);
    const hgeo = new THREE.Mesh(roadGeoH, roadMat);
    hgeo.position.set(0, 0.021, streetZ(i));
    hgeo.receiveShadow = true;
    scene.add(hgeo);
  }

  // --- Shared building materials ---------------------------------------------------
  const facadeMats = [];
  for (let k = 0; k < 10; k++) {
    facadeMats.push(new THREE.MeshLambertMaterial({ map: facadeTexture(rng, {}) }));
  }
  const shopMats = SHOP_NAMES.map(
    (name) => new THREE.MeshLambertMaterial({ map: facadeTexture(rng, { shop: name }) }),
  );
  const roofMat = new THREE.MeshLambertMaterial({ map: roofTexture(rng) });
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);

  function building(cx, cz, w, d, hgt, mat) {
    const mats = [mat, mat, roofMat, roofMat, mat, mat];
    const m = new THREE.Mesh(boxGeo, mats);
    m.scale.set(w, hgt, d);
    m.position.set(cx, hgt / 2, cz);
    m.castShadow = true;
    m.receiveShadow = true;
    scene.add(m);
    addCollider(cx, cz, w, d);
    return m;
  }

  function signBoard(text, x, y, z, ry = 0, bg = '#274b63', fg = '#ffe9b8') {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(13, 2.4),
      new THREE.MeshBasicMaterial({ map: signTexture(text, bg, fg) }),
    );
    m.position.set(x, y, z);
    m.rotation.y = ry;
    scene.add(m);
    return m;
  }

  // --- Ordinary blocks --------------------------------------------------------------
  for (let i = 0; i < GRID; i++) {
    for (let j = 0; j < GRID; j++) {
      const zone = zoneAt(i, j);
      if (zone) continue;
      const cx = blockX(i);
      const cz = blockZ(j);
      const centreDist = Math.hypot(i - 3.5, j - 3.5);
      const tall = Math.max(0, 3.4 - centreDist) * 9;
      const lots = rng.pick([1, 2, 2, 4]);
      if (lots === 1) {
        const w = BLOCK - rng.range(6, 12);
        const d = BLOCK - rng.range(6, 12);
        const hgt = rng.range(11, 20) + tall;
        building(cx, cz, w, d, hgt, rng.chance(0.3) ? rng.pick(shopMats) : rng.pick(facadeMats));
      } else if (lots === 2) {
        for (const s of [-1, 1]) {
          const w = BLOCK / 2 - rng.range(3, 6);
          const d = BLOCK - rng.range(6, 12);
          const hgt = rng.range(9, 17) + tall;
          building(cx + s * (BLOCK / 4), cz, w, d, hgt, rng.chance(0.3) ? rng.pick(shopMats) : rng.pick(facadeMats));
        }
      } else {
        for (const sx of [-1, 1]) {
          for (const sz of [-1, 1]) {
            const w = BLOCK / 2 - rng.range(3, 7);
            const d = BLOCK / 2 - rng.range(3, 7);
            const hgt = rng.range(7, 14) + tall * 0.7;
            building(cx + sx * (BLOCK / 4), cz + sz * (BLOCK / 4), w, d, hgt, rng.chance(0.24) ? rng.pick(shopMats) : rng.pick(facadeMats));
          }
        }
      }
      // Parked-car spots in the parking lane at the block's south and east kerbs:
      // the block face is BLOCK/2 out, the kerb lane centre a breath beyond it —
      // any further and the cars would sit in the driving lane.
      if (rng.chance(0.75)) {
        const n = rng.int(1, 3);
        for (let s = 0; s < n; s++) {
          const along = rng.range(-BLOCK / 2 + 6, BLOCK / 2 - 6);
          if (rng.chance(0.5)) {
            city.parkedSpots.push({ x: cx + along, z: cz + BLOCK / 2 + 1.8, heading: Math.PI / 2 });
          } else {
            city.parkedSpots.push({ x: cx + BLOCK / 2 + 1.8, z: cz + along, heading: 0 });
          }
        }
      }
    }
  }

  buildPark(scene, city, rng, boxGeo);
  buildBank(scene, city, rng, building, signBoard);
  buildDocks(scene, city, rng, boxGeo, addCollider, signBoard);
  buildMarina(scene, city, rng, boxGeo, addCollider, signBoard, building);
  buildHideoutAndCafe(scene, city, rng, building, signBoard);
  buildBeach(scene, city, rng, boxGeo);
  scatterPalmsAndLamps(scene, city, rng);

  return city;
}

// Plaza Verde: grass, crossing paths, a fountain, trees and benches on block (2, 4).
function buildPark(scene, city, rng, boxGeo) {
  const cx = blockX(2);
  const cz = blockZ(4);
  const grass = new THREE.Mesh(
    new THREE.PlaneGeometry(BLOCK + 8, BLOCK + 8),
    new THREE.MeshLambertMaterial({ map: groundTexture('#69a84f', '#3e7d33') }),
  );
  grass.rotation.x = -Math.PI / 2;
  grass.position.set(cx, 0.04, cz);
  grass.receiveShadow = true;
  scene.add(grass);
  const pathMat = new THREE.MeshLambertMaterial({ color: 0xd9c49a });
  for (const rot of [0, Math.PI / 2]) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(BLOCK + 8, 5), pathMat);
    p.rotation.x = -Math.PI / 2;
    p.rotation.z = rot;
    p.position.set(cx, 0.06, cz);
    scene.add(p);
  }
  const basin = new THREE.Mesh(
    new THREE.CylinderGeometry(4.4, 4.8, 1, 20),
    new THREE.MeshLambertMaterial({ color: 0xcfd6d2 }),
  );
  basin.position.set(cx, 0.5, cz);
  basin.castShadow = true;
  scene.add(basin);
  const water = new THREE.Mesh(
    new THREE.CylinderGeometry(4, 4, 0.3, 20),
    new THREE.MeshLambertMaterial({ color: COLORS.sea }),
  );
  water.position.set(cx, 1, cz);
  scene.add(water);
  city.colliders.push({ minX: cx - 5, maxX: cx + 5, minZ: cz - 5, maxZ: cz + 5 });
  const trunkMat = new THREE.MeshLambertMaterial({ color: COLORS.palmTrunk });
  const leafMat = new THREE.MeshLambertMaterial({ color: 0x2e7d32 });
  for (let k = 0; k < 9; k++) {
    const a = (k / 9) * Math.PI * 2;
    const x = cx + Math.cos(a) * rng.range(13, 19);
    const z = cz + Math.sin(a) * rng.range(13, 19);
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.45, 5.6, 6), trunkMat);
    trunk.position.set(x, 2.8, z);
    trunk.castShadow = true;
    scene.add(trunk);
    const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(2.6, 0), leafMat);
    crown.position.set(x, 6.1, z);
    crown.scale.y = 0.75;
    crown.castShadow = true;
    scene.add(crown);
    city.colliders.push({ minX: x - 0.5, maxX: x + 0.5, minZ: z - 0.5, maxZ: z + 0.5 });
  }
  void boxGeo;
}

// Banco Solara: a wide stone block with a columned porch on block (4, 4); the door
// zone on its south face is where the Big Score begins.
function buildBank(scene, city, rng, building, signBoard) {
  const cx = blockX(4);
  const cz = blockZ(4);
  const stone = new THREE.MeshLambertMaterial({ map: facadeTexture(rng, { tint: '#e9e2d2', floors: 4 }) });
  building(cx, cz - 3, 36, 30, 17, stone);
  const colMat = new THREE.MeshLambertMaterial({ color: 0xf3ead6 });
  for (let k = -2; k <= 2; k++) {
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 11, 10), colMat);
    col.position.set(cx + k * 6.4, 5.5, cz + 14.6);
    col.castShadow = true;
    scene.add(col);
  }
  const steps = new THREE.Mesh(
    new THREE.BoxGeometry(34, 1, 5),
    new THREE.MeshLambertMaterial({ color: 0xd8cfb8 }),
  );
  steps.position.set(cx, 0.5, cz + 15.5);
  scene.add(steps);
  signBoard('BANCO SOLARA', cx, 13.4, cz + 12.2, 0, '#5a1f1f', '#ffd98a');
}

// Muelle 9: the container docks. Two blocks of concrete yard behind a fence, rows of
// stacked containers (each a collider and a piece of cover), two cranes, a warehouse,
// and the gate on the west side where the guards watch the street.
function buildDocks(scene, city, rng, boxGeo, addCollider, signBoard) {
  const x0 = streetX(6) + ROAD / 2;
  const x1 = streetX(8) - ROAD / 2;
  const z0 = streetZ(0) + ROAD / 2;
  const z1 = streetZ(2) - ROAD / 2;
  const cx = (x0 + x1) / 2;
  const cz = (z0 + z1) / 2;
  const yard = new THREE.Mesh(
    new THREE.PlaneGeometry(x1 - x0, z1 - z0),
    new THREE.MeshLambertMaterial({ map: groundTexture('#7e7e76', '#5f5f58') }),
  );
  yard.rotation.x = -Math.PI / 2;
  yard.position.set(cx, 0.045, cz);
  yard.receiveShadow = true;
  scene.add(yard);

  const containerMats = [0xb5493a, 0x3a6ea5, 0x4d9e57, 0xd9a441, 0x7a4d9e, 0x3aa6a0].map(
    (c) => new THREE.MeshLambertMaterial({ color: c }),
  );
  const contGeo = new THREE.BoxGeometry(12, 2.9, 2.6);
  for (let row = 0; row < 4; row++) {
    for (let colI = 0; colI < 3; colI++) {
      if (rng.chance(0.18)) continue;
      const x = x0 + 14 + colI * 34 + rng.range(-2, 2);
      const z = z0 + 14 + row * 24;
      const stack = rng.int(1, 2);
      for (let s = 0; s < stack; s++) {
        const m = new THREE.Mesh(contGeo, rng.pick(containerMats));
        m.position.set(x, 1.45 + s * 2.9, z);
        m.castShadow = true;
        m.receiveShadow = true;
        scene.add(m);
      }
      addCollider(x, z, 12.4, 3);
      if (row % 2 === 0) {
        city.guardPosts.push({ x: x + rng.range(-9, 9), z: z + 5.4, coverX: x, coverZ: z + 2.6 });
      }
    }
  }
  // Warehouse along the north edge.
  const wh = new THREE.Mesh(
    boxGeo,
    new THREE.MeshLambertMaterial({ map: facadeTexture(rng, { tint: '#b9c2c6', floors: 2 }) }),
  );
  wh.scale.set(64, 10, 14);
  wh.position.set(cx, 5, z0 + 9);
  wh.castShadow = true;
  scene.add(wh);
  addCollider(cx, z0 + 9, 64, 14);
  // Two dock cranes.
  const craneMat = new THREE.MeshLambertMaterial({ color: 0xd97b2f });
  for (const gx of [x0 + 26, x1 - 26]) {
    for (const gz of [z0 + 30, z1 - 20]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(1.4, 17, 1.4), craneMat);
      leg.position.set(gx, 8.5, gz);
      leg.castShadow = true;
      scene.add(leg);
    }
    const boom = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.2, 52), craneMat);
    boom.position.set(gx, 16.6, cz);
    boom.castShadow = true;
    scene.add(boom);
  }
  // Fence with a gate gap on the west side, at street level with the coast road.
  const fenceMat = new THREE.MeshLambertMaterial({ color: 0x6b7280 });
  const fenceRuns = [
    { x: cx, z: z0, w: x1 - x0, d: 0.4 },
    { x: cx, z: z1, w: x1 - x0, d: 0.4 },
    { x: x1, z: cz, w: 0.4, d: z1 - z0 },
    { x: x0, z: z0 + 12, w: 0.4, d: 24 },
    { x: x0, z: z1 - 12, w: 0.4, d: 24 },
  ];
  for (const f of fenceRuns) {
    const m = new THREE.Mesh(boxGeo, fenceMat);
    m.scale.set(f.w, 2.2, f.d);
    m.position.set(f.x, 1.1, f.z);
    scene.add(m);
    addCollider(f.x, f.z, Math.max(f.w, 0.8), Math.max(f.d, 0.8));
  }
  signBoard('MUELLE 9 · PUERTO DE SOLARA', x0 + 1, 3.4, cz, -Math.PI / 2, '#33393f', '#ffd98a');
}

// The marina basin and the crew's clubhouse on blocks (6..7, 7), plus the lot where
// the coupe of the first mission waits.
function buildMarina(scene, city, rng, boxGeo, addCollider, signBoard, building) {
  const cx = blockX(6) + PITCH / 2;
  const cz = blockZ(7);
  const basin = new THREE.Mesh(
    new THREE.PlaneGeometry(96, 30),
    new THREE.MeshLambertMaterial({ color: COLORS.sea }),
  );
  basin.rotation.x = -Math.PI / 2;
  basin.position.set(cx, 0.06, cz + 6);
  scene.add(basin);
  const deckMat = new THREE.MeshLambertMaterial({ color: 0x9a7a52 });
  for (let k = 0; k < 3; k++) {
    const pier = new THREE.Mesh(boxGeo, deckMat);
    pier.scale.set(3.4, 0.5, 26);
    pier.position.set(cx - 32 + k * 32, 0.35, cz + 6);
    scene.add(pier);
  }
  const hullMats = [0xf2f4f6, 0xd94f3d, 0x3d7bd9, 0xffc933].map(
    (c) => new THREE.MeshLambertMaterial({ color: c }),
  );
  for (let k = 0; k < 6; k++) {
    const boat = new THREE.Group();
    const hull = new THREE.Mesh(new THREE.BoxGeometry(3.2, 1.1, 8.4), rng.pick(hullMats));
    hull.position.y = 0.4;
    boat.add(hull);
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.1, 3), new THREE.MeshLambertMaterial({ color: 0xf7f3e8 }));
    cabin.position.set(0, 1.4, -0.6);
    boat.add(cabin);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 6.4, 5), new THREE.MeshLambertMaterial({ color: 0xdddddd }));
    mast.position.set(0, 3.6, 1.4);
    boat.add(mast);
    boat.position.set(cx - 44 + k * 17 + rng.range(-2, 2), 0.12, cz + 6 + rng.range(-6, 6));
    boat.rotation.y = rng.range(-0.2, 0.2);
    scene.add(boat);
    city.boats.push({ group: boat, baseY: 0.12, phase: rng.range(0, 6) });
  }
  const club = new THREE.MeshLambertMaterial({ map: facadeTexture(rng, { shop: 'MARINA CLUB', floors: 2 }) });
  building(blockX(6) - 6, cz - 16, 30, 12, 8, club);
  signBoard('MARINA CLUB', blockX(6) - 6, 6.4, cz - 9.6, 0);
  // The lot: painted bays on the asphalt in front of the basin.
  const lot = new THREE.Mesh(
    new THREE.PlaneGeometry(38, 14),
    new THREE.MeshLambertMaterial({ color: 0x4a4d52 }),
  );
  lot.rotation.x = -Math.PI / 2;
  lot.position.set(city.marinaLot.x, 0.05, city.marinaLot.z + 4);
  scene.add(lot);
}

// Nico's garage (block 0,7) and Sol's café terrace (block 5,6).
function buildHideoutAndCafe(scene, city, rng, building, signBoard) {
  const hx = blockX(0);
  const hz = blockZ(7);
  const garageMat = new THREE.MeshLambertMaterial({ map: facadeTexture(rng, { tint: '#d9c8a8', floors: 1 }) });
  building(hx + 6, hz - 8, 26, 16, 6.5, garageMat);
  signBoard('TALLER NICO', hx + 6, 5, hz - 16.4, Math.PI, '#3a3f46', '#ffd98a');
  const cx = blockX(5);
  const cz = blockZ(6);
  const cafeMat = new THREE.MeshLambertMaterial({ map: facadeTexture(rng, { shop: 'CAFÉ SOL', floors: 3 }) });
  building(cx - 10, cz - 8, 24, 18, 12, cafeMat);
  signBoard('CAFÉ SOL', cx - 10, 8.6, cz + 1.6, 0);
  // Terrace umbrellas on the pavement in front of the café.
  const umbMat = new THREE.MeshLambertMaterial({ color: 0xe4572e });
  for (let k = 0; k < 3; k++) {
    const x = cx - 18 + k * 7;
    const z = cz + BLOCK / 2 + 3.4;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 2.6, 6), new THREE.MeshLambertMaterial({ color: 0xeeeeee }));
    pole.position.set(x, 1.3, z);
    scene.add(pole);
    const umb = new THREE.Mesh(new THREE.ConeGeometry(2.1, 0.8, 8), umbMat);
    umb.position.set(x, 2.7, z);
    umb.castShadow = true;
    scene.add(umb);
    city.colliders.push({ minX: x - 0.3, maxX: x + 0.3, minZ: z - 0.3, maxZ: z + 0.3 });
  }
}

// Promenade, beach, pier and sea, east of the coast road.
function buildBeach(scene, city, rng, boxGeo) {
  // The sand starts east of the coast road's promenade (x ≈ 254) and runs under
  // the waterline; it must not lap over the asphalt.
  const sand = new THREE.Mesh(
    new THREE.PlaneGeometry(SEA_X - 254 + 24, WORLD + 160),
    new THREE.MeshLambertMaterial({ map: groundTexture('#eed9a4', '#c9ae72') }),
  );
  sand.rotation.x = -Math.PI / 2;
  sand.position.set((254 + SEA_X) / 2 + 4, 0.03, 0);
  sand.receiveShadow = true;
  scene.add(sand);
  const sea = new THREE.Mesh(
    new THREE.PlaneGeometry(1500, WORLD + 700),
    new THREE.MeshLambertMaterial({ color: COLORS.sea, transparent: true, opacity: 0.94 }),
  );
  sea.rotation.x = -Math.PI / 2;
  // The water starts at the shoreline (just past SEA_X) and runs east from there.
  sea.position.set(SEA_X + 730, 0.12, 0);
  scene.add(sea);
  city.sea = sea;
  // The pier: planks on posts reaching into the water at the second street.
  const deckMat = new THREE.MeshLambertMaterial({ color: 0x8a6a48 });
  const deck = new THREE.Mesh(boxGeo, deckMat);
  deck.scale.set(120, 0.7, 7);
  deck.position.set(HALF + 58, 0.9, streetZ(2));
  deck.castShadow = true;
  scene.add(deck);
  const postMat = new THREE.MeshLambertMaterial({ color: 0x6e543a });
  for (let k = 0; k < 7; k++) {
    for (const s of [-3, 3]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 2.2, 6), postMat);
      post.position.set(HALF + 8 + k * 17, 0, streetZ(2) + s);
      scene.add(post);
    }
  }
  let t = 0;
  city.update = (dt) => {
    t += dt;
    for (const b of city.boats) {
      b.group.position.y = b.baseY + Math.sin(t * 1.3 + b.phase) * 0.09;
      b.group.rotation.z = Math.sin(t * 0.9 + b.phase) * 0.02;
    }
  };
  void rng;
}

// Palms along the promenade and scattered on the grass verges, lamp posts on every
// street — both instanced, so the whole set costs two draw calls.
function scatterPalmsAndLamps(scene, city, rng) {
  const palmSpots = [];
  for (let z = -HALF + 12; z < HALF; z += rng.range(17, 26)) {
    palmSpots.push({ x: HALF + 12 + rng.range(-1.5, 1.5), z });
  }
  for (let k = 0; k < 46; k++) {
    const i = rng.int(0, GRID - 1);
    const j = rng.int(0, GRID - 1);
    if (zoneAt(i, j)) continue;
    palmSpots.push({
      x: blockX(i) + rng.range(-BLOCK / 2 - 3, BLOCK / 2 + 3),
      z: blockZ(j) + (rng.chance(0.5) ? -BLOCK / 2 - 3 : BLOCK / 2 + 3),
    });
  }
  const trunkGeo = new THREE.CylinderGeometry(0.22, 0.38, 6.4, 6);
  trunkGeo.translate(0, 3.2, 0);
  const leafGeo = new THREE.IcosahedronGeometry(2.8, 0);
  leafGeo.scale(1, 0.6, 1);
  leafGeo.translate(0, 6.7, 0);
  const trunks = new THREE.InstancedMesh(trunkGeo, new THREE.MeshLambertMaterial({ color: COLORS.palmTrunk }), palmSpots.length);
  const leaves = new THREE.InstancedMesh(leafGeo, new THREE.MeshLambertMaterial({ color: COLORS.palmLeaf }), palmSpots.length);
  const dummy = new THREE.Object3D();
  palmSpots.forEach((p, idx) => {
    dummy.position.set(p.x, 0, p.z);
    dummy.rotation.set(rng.range(-0.06, 0.06), rng.range(0, 6.28), rng.range(-0.06, 0.06));
    dummy.updateMatrix();
    trunks.setMatrixAt(idx, dummy.matrix);
    leaves.setMatrixAt(idx, dummy.matrix);
    city.colliders.push({ minX: p.x - 0.4, maxX: p.x + 0.4, minZ: p.z - 0.4, maxZ: p.z + 0.4 });
  });
  trunks.castShadow = true;
  leaves.castShadow = true;
  scene.add(trunks);
  scene.add(leaves);

  const lampSpots = [];
  for (let i = 0; i <= GRID; i++) {
    for (let s = -HALF + 24; s < HALF; s += 48) {
      lampSpots.push({ x: streetX(i) + ROAD / 2 + 1.2, z: s });
      lampSpots.push({ x: s, z: streetZ(i) + ROAD / 2 + 1.2 });
    }
  }
  const poleGeo = new THREE.CylinderGeometry(0.09, 0.12, 5.4, 5);
  poleGeo.translate(0, 2.7, 0);
  const headGeo = new THREE.SphereGeometry(0.32, 6, 5);
  headGeo.translate(0, 5.5, 0);
  const poles = new THREE.InstancedMesh(poleGeo, new THREE.MeshLambertMaterial({ color: 0x37414a }), lampSpots.length);
  const heads = new THREE.InstancedMesh(headGeo, new THREE.MeshBasicMaterial({ color: 0xffe6a8 }), lampSpots.length);
  lampSpots.forEach((p, idx) => {
    dummy.position.set(p.x, 0, p.z);
    dummy.rotation.set(0, 0, 0);
    dummy.updateMatrix();
    poles.setMatrixAt(idx, dummy.matrix);
    heads.setMatrixAt(idx, dummy.matrix);
  });
  scene.add(poles);
  scene.add(heads);
}
