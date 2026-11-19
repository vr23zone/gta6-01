// Solara Bay itself: a grid city of sun-bleached towers and low pastel blocks, built once
// from the seed — streets with painted dashes, sidewalks, palms, lamps, a park, a marina
// pier, a container docks in the south-east and a beach that runs into the sea.
// Everything solid registers an AABB collider here; the rest of the game asks this module
// where the roads are, what blocks a view, and what a circle would bump into.

import { BEACH_Z, EXTENT, GRID, ROAD_HALF, SEA_Z, WALK_HALF } from './config.js';

const STREET_LINES = [];
for (let v = -EXTENT; v <= EXTENT; v += GRID) STREET_LINES.push(v);

/** A canvas texture painted by hand: the game's whole art department lives in these. */
function makeTexture(width, height, paint, repeatX = 1, repeatY = 1) {
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  paint(canvas.getContext('2d'), width, height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeatX, repeatY);
  texture.anisotropy = 4;
  return texture;
}

/** Asphalt with a dashed centre line and worn edges, drawn once and repeated down every street. */
function asphaltTexture() {
  return makeTexture(128, 128, (g, w, h) => {
    g.fillStyle = '#33363d'; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(255,255,255,0.05)';
    for (let i = 0; i < 260; i += 1) g.fillRect(Math.random() * w, Math.random() * h, 2, 2);
    g.fillStyle = '#e8e4da'; g.fillRect(2, 0, 3, h); g.fillRect(w - 5, 0, 3, h);
    g.fillStyle = '#ffb703'; g.fillRect(w / 2 - 2, 8, 4, 44);
  });
}

/** A tower facade: a tinted wall and a grid of windows, some of them lit by the low sun. */
function facadeTexture(rng, base, litRatio) {
  return makeTexture(128, 256, (g, w, h) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    const cols = 5; const rows = 10;
    const cw = w / cols; const ch = h / rows;
    for (let x = 0; x < cols; x += 1) {
      for (let y = 0; y < rows; y += 1) {
        const lit = rng.next() < litRatio;
        g.fillStyle = lit ? '#ffd98a' : '#22303e';
        g.fillRect(x * cw + 3, y * ch + 4, cw - 6, ch - 8);
        g.fillStyle = 'rgba(255,255,255,0.16)';
        g.fillRect(x * cw + 3, y * ch + 4, cw - 6, 3);
      }
    }
  });
}

/** A shopfront sign: the name in bold capitals on a coloured band. */
function signTexture(text, bg, fg) {
  return makeTexture(512, 96, (g, w, h) => {
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    g.fillStyle = fg;
    g.font = '900 52px Verdana, sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, w / 2, h / 2 + 2);
  });
}

/** Merge simple geometries into one, for the palm fronds (three crossed painted planes). */
function mergePlanes(geometry) {
  const parts = [];
  for (let i = 0; i < 3; i += 1) {
    const plane = new THREE.PlaneGeometry(8.0, 3.8);
    plane.translate(0, 0, 1.6);
    plane.rotateX(-0.5);
    plane.rotateY((i * Math.PI) / 3);
    parts.push(plane.toNonIndexed());
  }
  let total = 0;
  for (const part of parts) total += part.attributes.position.count;
  const position = new Float32Array(total * 3);
  const normal = new Float32Array(total * 3);
  const uv = new Float32Array(total * 2);
  let offset = 0;
  for (const part of parts) {
    position.set(part.attributes.position.array, offset * 3);
    normal.set(part.attributes.normal.array, offset * 3);
    uv.set(part.attributes.uv.array, offset * 2);
    offset += part.attributes.position.count;
  }
  geometry.setAttribute('position', new THREE.BufferAttribute(position, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(normal, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geometry;
}

/**
 * Build the whole city into the scene.
 * Returns the road network, the colliders, the sight-line blockers, the named landmarks
 * the story visits, and the small services (collision, road tests, the sun shadow rig).
 */
export function createCity(scene, rng) {
  const colliders = [];
  const losBlockers = [];
  const landmarks = {};

  // --- sky, light, sea air -------------------------------------------------
  const skyGeo = new THREE.SphereGeometry(1500, 16, 10);
  const skyColors = [];
  const skyPos = skyGeo.attributes.position;
  const top = new THREE.Color(0x3d7ac8);
  const horizon = new THREE.Color(0xffc98a);
  for (let i = 0; i < skyPos.count; i += 1) {
    const t = THREE.MathUtils.clamp(skyPos.getY(i) / 900 + 0.25, 0, 1);
    const c = horizon.clone().lerp(top, Math.pow(t, 0.7));
    skyColors.push(c.r, c.g, c.b);
  }
  skyGeo.setAttribute('color', new THREE.Float32BufferAttribute(skyColors, 3));
  const sky = new THREE.Mesh(skyGeo, new THREE.MeshBasicMaterial({ side: THREE.BackSide, vertexColors: true, fog: false }));
  scene.add(sky);

  scene.fog = new THREE.Fog(0xf2c894, 150, 900);
  const hemi = new THREE.HemisphereLight(0xffe3b3, 0x7a5c40, 0.75);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffb36b, 1.35);
  sun.position.set(-260, 300, -150);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -120; sun.shadow.camera.right = 120;
  sun.shadow.camera.top = 120; sun.shadow.camera.bottom = -120;
  sun.shadow.camera.far = 900;
  sun.shadow.bias = -0.0006;
  scene.add(sun);
  scene.add(sun.target);

  // --- ground: sand everywhere, the city slab, streets, beach, sea ---------
  const sand = new THREE.Mesh(
    new THREE.PlaneGeometry(3000, 3000),
    new THREE.MeshLambertMaterial({ color: 0xd9b380 }),
  );
  sand.rotation.x = -Math.PI / 2;
  sand.position.y = -0.05;
  sand.receiveShadow = true;
  scene.add(sand);

  const slab = new THREE.Mesh(
    new THREE.PlaneGeometry(EXTENT * 2 + 60, EXTENT * 2 + 60),
    new THREE.MeshLambertMaterial({ color: 0xb9ac9c }),
  );
  slab.rotation.x = -Math.PI / 2;
  slab.position.y = 0.0;
  slab.receiveShadow = true;
  scene.add(slab);

  const asphalt = asphaltTexture();
  const roadMat = new THREE.MeshLambertMaterial({ map: asphalt });
  for (const v of STREET_LINES) {
    for (const rotate of [false, true]) {
      const road = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_HALF * 2, EXTENT * 2 + 44), roadMat.clone());
      road.material.map = asphalt.clone();
      road.material.map.repeat.set(1, (EXTENT * 2 + 44) / 16);
      road.material.map.needsUpdate = true;
      road.rotation.x = -Math.PI / 2;
      if (rotate) { road.rotation.z = Math.PI / 2; road.position.set(0, 0.03, v); }
      else road.position.set(v, 0.03, 0);
      road.receiveShadow = true;
      scene.add(road);
    }
  }

  // The docks yard: darker concrete over the south-east blocks.
  const yard = new THREE.Mesh(new THREE.PlaneGeometry(150, 150), new THREE.MeshLambertMaterial({ color: 0x8f8a80 }));
  yard.rotation.x = -Math.PI / 2;
  yard.position.set(141, 0.045, 141);
  yard.receiveShadow = true;
  scene.add(yard);

  // The park: one green block north of the centre.
  const park = new THREE.Mesh(new THREE.PlaneGeometry(GRID - 8, GRID - 8), new THREE.MeshLambertMaterial({ color: 0x5d9c59 }));
  park.rotation.x = -Math.PI / 2;
  park.position.set(-GRID / 2 - 0, 0.045, -GRID * 1.5);
  park.receiveShadow = true;
  scene.add(park);
  landmarks.park = new THREE.Vector3(-GRID / 2, 0, -GRID * 1.5);

  const waterTexture = makeTexture(128, 128, (g, w, h) => {
    g.fillStyle = '#1b8aa5'; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(255,255,255,0.13)';
    for (let i = 0; i < 26; i += 1) g.fillRect(Math.random() * w, Math.random() * h, 22, 2);
  }, 40, 10);
  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(3000, 700),
    new THREE.MeshLambertMaterial({ map: waterTexture, transparent: true, opacity: 0.94 }),
  );
  water.rotation.x = -Math.PI / 2;
  water.position.set(0, 0.12, SEA_Z + 350);
  scene.add(water);

  // The marina pier, reaching into the sea on the west beach.
  const pierMat = new THREE.MeshLambertMaterial({ color: 0x8a6a48 });
  const pier = new THREE.Mesh(new THREE.BoxGeometry(8, 1, 64), pierMat);
  pier.position.set(-150, 0.6, SEA_Z + 26);
  pier.castShadow = true;
  scene.add(pier);
  colliders.push({ minX: -154, maxX: -146, minZ: SEA_Z - 6, maxZ: SEA_Z + 58, pier: true });
  landmarks.pier = new THREE.Vector3(-150, 0, SEA_Z + 40);

  // --- buildings ------------------------------------------------------------
  const facadeBases = ['#e8d8b8', '#d9a05b', '#c96f4a', '#9fb8c4', '#e5e0d5', '#b5836d', '#7fa6a3'];
  const facades = facadeBases.map((base) => facadeTexture(rng, base, 0.35));
  const roofMat = new THREE.MeshLambertMaterial({ color: 0x4a4048 });
  const lowMat = new THREE.MeshLambertMaterial({ color: 0xd8c9ae });

  function addBuilding(cx, cz, w, h, d, facade) {
    const side = new THREE.MeshLambertMaterial({ map: facade || facades[rng.int(0, facades.length - 1)] });
    if (side.map) { side.map = side.map.clone(); side.map.repeat.set(Math.max(1, Math.round(w / 10)), Math.max(1, Math.round(h / 22))); side.map.needsUpdate = true; }
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), [side, side, roofMat, roofMat, side, side]);
    mesh.position.set(cx, h / 2, cz);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    const box = { minX: cx - w / 2, maxX: cx + w / 2, minZ: cz - d / 2, maxZ: cz + d / 2 };
    colliders.push(box);
    if (h > 9) losBlockers.push(box);
    return mesh;
  }

  function addSign(x, y, z, ry, text, bg, fg, w = 15) {
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(w, w * 0.19),
      new THREE.MeshBasicMaterial({ map: signTexture(text, bg, fg) }),
    );
    sign.position.set(x, y, z);
    sign.rotation.y = ry;
    scene.add(sign);
  }

  const namedBlocks = new Set();
  function blockKey(bx, bz) { return `${bx},${bz}`; }

  // Landmark buildings first, on their own blocks, so the story always has its stage.
  // Block (bx,bz): streets at -192+48*bx .. -192+48*(bx+1); centre = -192 + 48*bx + 24.
  const blockCentre = (i) => -EXTENT + GRID * i + GRID / 2;

  // Hotel Palmera (spawn, west centre), Banco Solara (downtown), Café Sol, Sol's Garage, dock warehouse.
  const hotelPos = new THREE.Vector3(blockCentre(3), 0, blockCentre(4));
  addBuilding(hotelPos.x, hotelPos.z, 20, 34, 16, facades[0]);
  addSign(hotelPos.x, 26, hotelPos.z + 8.2, 0, 'HOTEL PALMERA', '#0e7c86', '#fff6ea', 17);
  namedBlocks.add(blockKey(3, 4));
  landmarks.hotel = new THREE.Vector3(hotelPos.x + 14, 0, hotelPos.z + 14);

  const bankPos = new THREE.Vector3(blockCentre(4), 0, blockCentre(4));
  addBuilding(bankPos.x, bankPos.z, 22, 46, 18, facades[3]);
  addSign(bankPos.x, 38, bankPos.z + 9.2, 0, 'BANCO SOLARA', '#20303e', '#ffb703', 18);
  namedBlocks.add(blockKey(4, 4));
  landmarks.bank = new THREE.Vector3(bankPos.x, 0, bankPos.z + 16);

  const cafePos = new THREE.Vector3(blockCentre(5), 0, blockCentre(3));
  addBuilding(cafePos.x, cafePos.z, 16, 11, 14, facades[1]);
  addSign(cafePos.x, 8, cafePos.z - 7.2, Math.PI, 'CAFÉ SOL', '#c96f4a', '#fff6ea', 13);
  namedBlocks.add(blockKey(5, 3));
  landmarks.cafe = new THREE.Vector3(cafePos.x - 13, 0, cafePos.z - 12);

  const garagePos = new THREE.Vector3(blockCentre(2), 0, blockCentre(5));
  addBuilding(garagePos.x, garagePos.z, 20, 9, 16, facades[5]);
  addSign(garagePos.x, 6.5, garagePos.z + 8.2, 0, "SOL'S GARAGE", '#33363d', '#ffb703', 16);
  namedBlocks.add(blockKey(2, 5));
  landmarks.garage = new THREE.Vector3(garagePos.x + 15, 0, garagePos.z + 13);

  const hideoutPos = new THREE.Vector3(blockCentre(1), 0, blockCentre(7));
  addBuilding(hideoutPos.x, hideoutPos.z, 15, 8, 12, facades[6]);
  namedBlocks.add(blockKey(1, 7));
  landmarks.hideout = new THREE.Vector3(hideoutPos.x + 12, 0, hideoutPos.z + 4);

  // The dock warehouse: one long shed in the yard.
  const warehouse = new THREE.Mesh(new THREE.BoxGeometry(56, 13, 22), new THREE.MeshLambertMaterial({ color: 0x7d8894 }));
  warehouse.position.set(120, 6.5, 108);
  warehouse.castShadow = true; warehouse.receiveShadow = true;
  scene.add(warehouse);
  colliders.push({ minX: 92, maxX: 148, minZ: 97, maxZ: 119 });
  losBlockers.push({ minX: 92, maxX: 148, minZ: 97, maxZ: 119 });
  addSign(120, 10, 119.2, 0, 'MUELLE 9 — CARGA', '#20303e', '#fff6ea', 22);
  landmarks.warehouse = new THREE.Vector3(120, 0, 128);
  landmarks.docks = new THREE.Vector3(150, 0, 150);

  // Container stacks in the yard: the dock shootout's cover, ribbed steel.
  const ribTexture = makeTexture(128, 64, (g, w, h) => {
    g.fillStyle = '#e8e8e8'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#9a9a9a';
    for (let x = 4; x < w; x += 10) g.fillRect(x, 0, 3, h);
    g.fillStyle = '#6f6f6f'; g.fillRect(0, 0, w, 4); g.fillRect(0, h - 4, w, 4);
  });
  const containerColors = [0xc94f36, 0x2e6da4, 0x3f9142, 0xd9a441, 0x704214, 0x5b5ea6];
  const containerGeo = new THREE.BoxGeometry(12, 4.6, 5);
  for (let i = 0; i < 16; i += 1) {
    const cx = 96 + (i % 4) * 26 + rng.range(-3, 3);
    const cz = 138 + Math.floor(i / 4) * 20 + rng.range(-2, 2);
    const levels = rng.int(1, 2);
    for (let lvl = 0; lvl < levels; lvl += 1) {
      const boxMesh = new THREE.Mesh(containerGeo, new THREE.MeshLambertMaterial({ color: containerColors[rng.int(0, containerColors.length - 1)], map: ribTexture }));
      boxMesh.position.set(cx, 2.3 + lvl * 4.6, cz);
      boxMesh.rotation.y = rng.chance(0.25) ? Math.PI / 2 : 0;
      boxMesh.castShadow = true; boxMesh.receiveShadow = true;
      scene.add(boxMesh);
    }
    colliders.push({ minX: cx - 6, maxX: cx + 6, minZ: cz - 6, maxZ: cz + 6 });
    losBlockers.push({ minX: cx - 6, maxX: cx + 6, minZ: cz - 6, maxZ: cz + 6 });
  }
  // Two dock cranes: legs, a jib, a hanging hook block.
  const craneMat = new THREE.MeshLambertMaterial({ color: 0xd97c2b });
  for (const cx of [104, 176]) {
    const legL = new THREE.Mesh(new THREE.BoxGeometry(1.6, 26, 1.6), craneMat);
    legL.position.set(cx - 6, 13, 168); legL.castShadow = true; scene.add(legL);
    const legR = legL.clone(); legR.position.x = cx + 6; scene.add(legR);
    const jib = new THREE.Mesh(new THREE.BoxGeometry(30, 1.8, 1.8), craneMat);
    jib.position.set(cx, 26, 168); jib.castShadow = true; scene.add(jib);
    const hook = new THREE.Mesh(new THREE.BoxGeometry(2.4, 2.4, 2.4), roofMat);
    hook.position.set(cx + 9, 18, 168); scene.add(hook);
    colliders.push({ minX: cx - 7, maxX: cx - 5, minZ: 167, maxZ: 169 });
    colliders.push({ minX: cx + 5, maxX: cx + 7, minZ: 167, maxZ: 169 });
  }

  // Ordinary blocks: towers downtown, pastel lows toward the edges, none in the yard or park.
  for (let bx = 0; bx < 8; bx += 1) {
    for (let bz = 0; bz < 8; bz += 1) {
      if (namedBlocks.has(blockKey(bx, bz))) continue;
      const cx = blockCentre(bx);
      const cz = blockCentre(bz);
      if (cx > 80 && cz > 80) continue; // the docks yard
      if (bx === 3 && bz === 2) continue; // the park
      const downtown = Math.abs(cx) < 110 && Math.abs(cz) < 110;
      const count = downtown ? rng.int(1, 2) : rng.int(2, 3);
      for (let i = 0; i < count; i += 1) {
        const w = rng.range(9, 15);
        const d = rng.range(9, 15);
        const h = downtown ? rng.range(22, 58) : rng.range(8, 20);
        const ox = count === 1 ? 0 : (i % 2 === 0 ? -7.5 : 7.5) + rng.range(-1.5, 1.5);
        const oz = count === 1 ? 0 : (i < 2 ? -4 : 6) + rng.range(-1.5, 1.5);
        addBuilding(cx + ox, cz + oz, w, h, d);
      }
    }
  }

  // --- palms, trees, lamps (instanced: hundreds of them, two draw calls each) --
  const palmPositions = [];
  for (let v = -EXTENT + GRID / 2; v <= EXTENT; v += GRID / 2) {
    palmPositions.push([v, -ROAD_HALF - 3.4, 0], [v, ROAD_HALF + 3.4, 0]);
    palmPositions.push([0, v, -ROAD_HALF - 3.4], [0, v, ROAD_HALF + 3.4]);
  }
  for (let x = -210; x <= 210; x += 21) palmPositions.push([x + rng.range(-3, 3), BEACH_Z + 8, 1]);
  const trunkGeo = new THREE.CylinderGeometry(0.22, 0.34, 6.4, 6);
  trunkGeo.translate(0, 3.2, 0);
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x8a6a48 });
  const frondTexture = makeTexture(128, 64, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.lineCap = 'round';
    // Three feather fronds fanning from the crown: a spine with thin leaflets.
    const tips = [[6, 20], [64, 2], [122, 20]];
    for (const [ex, ey] of tips) {
      const sx = 64; const sy = h;
      const cx = (sx + ex) / 2; const cy = Math.min(ey + 26, h * 0.72);
      const point = (t) => [
        (1 - t) * (1 - t) * sx + 2 * (1 - t) * t * cx + t * t * ex,
        (1 - t) * (1 - t) * sy + 2 * (1 - t) * t * cy + t * t * ey,
      ];
      g.strokeStyle = '#2e7d32'; g.lineWidth = 2;
      for (let i = 1; i <= 9; i += 1) {
        const t = i / 10;
        const [px, py] = point(t);
        const [qx, qy] = point(Math.min(1, t + 0.05));
        const ang = Math.atan2(qy - py, qx - px);
        const len = 15 * (1 - t * 0.5);
        for (const side of [-1, 1]) {
          const a = ang + side * 1.15;
          g.beginPath(); g.moveTo(px, py);
          g.lineTo(px + Math.cos(a) * len, py + Math.sin(a) * len + 3);
          g.stroke();
        }
      }
      g.strokeStyle = '#256b2a'; g.lineWidth = 2.5;
      g.beginPath(); g.moveTo(sx, sy); g.quadraticCurveTo(cx, cy, ex, ey); g.stroke();
    }
  });
  const frondGeo = mergePlanes(new THREE.BufferGeometry());
  frondGeo.translate(0, 6.3, 0);
  const frondMat = new THREE.MeshLambertMaterial({ map: frondTexture, transparent: true, alphaTest: 0.35, side: THREE.DoubleSide });
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, palmPositions.length);
  const fronds = new THREE.InstancedMesh(frondGeo, frondMat, palmPositions.length);
  const dummy = new THREE.Object3D();
  palmPositions.forEach(([px, pz], i) => {
    dummy.position.set(px, 0, pz);
    dummy.rotation.set(rng.range(-0.05, 0.05), rng.range(0, Math.PI * 2), rng.range(-0.05, 0.05));
    const s = rng.range(0.85, 1.25);
    dummy.scale.set(s, s, s);
    dummy.updateMatrix();
    trunks.setMatrixAt(i, dummy.matrix);
    fronds.setMatrixAt(i, dummy.matrix);
  });
  trunks.castShadow = true;
  scene.add(trunks); scene.add(fronds);

  // Park trees: green blobs on short trunks, plus a fountain.
  const blobGeo = new THREE.IcosahedronGeometry(2.6, 0);
  const blobMat = new THREE.MeshLambertMaterial({ color: 0x4e8c4a });
  const blobs = new THREE.InstancedMesh(blobGeo, blobMat, 14);
  for (let i = 0; i < 14; i += 1) {
    dummy.position.set(landmarks.park.x + rng.range(-17, 17), 4.4, landmarks.park.z + rng.range(-17, 17));
    dummy.rotation.set(0, rng.range(0, 3), 0);
    const s = rng.range(0.8, 1.5);
    dummy.scale.set(s, s * 1.15, s);
    dummy.updateMatrix();
    blobs.setMatrixAt(i, dummy.matrix);
  }
  blobs.castShadow = true;
  scene.add(blobs);
  const fountain = new THREE.Mesh(new THREE.CylinderGeometry(4.4, 4.8, 1.1, 18), new THREE.MeshLambertMaterial({ color: 0xcfd6da }));
  fountain.position.set(landmarks.park.x, 0.55, landmarks.park.z);
  fountain.castShadow = true;
  scene.add(fountain);
  colliders.push({ minX: landmarks.park.x - 4.8, maxX: landmarks.park.x + 4.8, minZ: landmarks.park.z - 4.8, maxZ: landmarks.park.z + 4.8 });

  // Street lamps along every second intersection.
  const lampPoleGeo = new THREE.CylinderGeometry(0.09, 0.12, 5.4, 5);
  lampPoleGeo.translate(0, 2.7, 0);
  const lampHeadGeo = new THREE.SphereGeometry(0.34, 8, 6);
  lampHeadGeo.translate(0, 5.5, 0);
  const lampPositions = [];
  for (const sx of STREET_LINES) for (const sz of STREET_LINES) {
    if ((sx + sz) % (GRID * 2) !== 0) continue;
    lampPositions.push([sx + ROAD_HALF + 1.4, sz + ROAD_HALF + 1.4]);
  }
  const lampPoles = new THREE.InstancedMesh(lampPoleGeo, new THREE.MeshLambertMaterial({ color: 0x3c4148 }), lampPositions.length);
  const lampHeads = new THREE.InstancedMesh(lampHeadGeo, new THREE.MeshBasicMaterial({ color: 0xffe9b0 }), lampPositions.length);
  lampPositions.forEach(([px, pz], i) => {
    dummy.position.set(px, 0, pz);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    lampPoles.setMatrixAt(i, dummy.matrix);
    lampHeads.setMatrixAt(i, dummy.matrix);
  });
  scene.add(lampPoles); scene.add(lampHeads);

  // Beach umbrellas: a pole and a bright cone.
  const umbrellaMat = new THREE.MeshLambertMaterial({ color: 0xff6b4a });
  for (let i = 0; i < 12; i += 1) {
    const ux = -200 + i * 36 + rng.range(-6, 6);
    const cone = new THREE.Mesh(new THREE.ConeGeometry(2.6, 1.1, 8), umbrellaMat);
    cone.position.set(ux, 2.5, BEACH_Z + rng.range(2, 16));
    cone.castShadow = true;
    scene.add(cone);
  }

  // --- services the rest of the game uses ------------------------------------
  const HALF = EXTENT + 34;

  function collideCircle(pos, radius) {
    pos.x = THREE.MathUtils.clamp(pos.x, -HALF, HALF);
    pos.z = THREE.MathUtils.clamp(pos.z, -HALF, SEA_Z + 30);
    for (const box of colliders) {
      const nearX = THREE.MathUtils.clamp(pos.x, box.minX, box.maxX);
      const nearZ = THREE.MathUtils.clamp(pos.z, box.minZ, box.maxZ);
      const dx = pos.x - nearX;
      const dz = pos.z - nearZ;
      const d2 = dx * dx + dz * dz;
      if (d2 > radius * radius) continue;
      if (d2 > 0.0001) {
        const d = Math.sqrt(d2);
        pos.x = nearX + (dx / d) * radius;
        pos.z = nearZ + (dz / d) * radius;
      } else {
        // Centre inside the box: leave by the shallowest face.
        const left = pos.x - box.minX; const right = box.maxX - pos.x;
        const top = pos.z - box.minZ; const bottom = box.maxZ - pos.z;
        const min = Math.min(left, right, top, bottom);
        if (min === left) pos.x = box.minX - radius;
        else if (min === right) pos.x = box.maxX + radius;
        else if (min === top) pos.z = box.minZ - radius;
        else pos.z = box.maxZ + radius;
      }
    }
    return pos;
  }

  /** True when (x,z) is on asphalt (either street direction, within the road's half width). */
  function isRoad(x, z) {
    for (const v of STREET_LINES) {
      if (Math.abs(x - v) <= ROAD_HALF || Math.abs(z - v) <= ROAD_HALF) return true;
    }
    return false;
  }

  /** True when a building (or container stack) stands between two points at street level. */
  function segmentBlocked(x1, z1, x2, z2) {
    for (const box of losBlockers) {
      if (segmentHitsBox(x1, z1, x2, z2, box)) return true;
    }
    return false;
  }

  function segmentHitsBox(x1, z1, x2, z2, box) {
    let tmin = 0; let tmax = 1;
    const dx = x2 - x1; const dz = z2 - z1;
    if (Math.abs(dx) < 1e-9) { if (x1 < box.minX || x1 > box.maxX) return false; }
    else {
      let t1 = (box.minX - x1) / dx; let t2 = (box.maxX - x1) / dx;
      if (t1 > t2) [t1, t2] = [t2, t1];
      tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
      if (tmin > tmax) return false;
    }
    if (Math.abs(dz) < 1e-9) { if (z1 < box.minZ || z1 > box.maxZ) return false; }
    else {
      let t1 = (box.minZ - z1) / dz; let t2 = (box.maxZ - z1) / dz;
      if (t1 > t2) [t1, t2] = [t2, t1];
      tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
      if (tmin > tmax) return false;
    }
    return true;
  }

  /** Keep the sun's shadow box centred on the action. */
  function followSun(target) {
    sun.position.set(target.x - 260, 300, target.z - 150);
    sun.target.position.set(target.x, 0, target.z);
  }

  let elapsed = 0;
  function update(dt) {
    elapsed += dt;
    waterTexture.offset.y = elapsed * 0.008;
    waterTexture.offset.x = Math.sin(elapsed * 0.11) * 0.02;
  }

  return {
    colliders, losBlockers, landmarks, streetLines: STREET_LINES,
    collideCircle, isRoad, segmentBlocked, followSun, update,
  };
}
