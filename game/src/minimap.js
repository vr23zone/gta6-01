// The minimap: a round north-up canvas map, player-centred, drawn from the same data
// the city was built from — streets, blocks, the park, the docks, the beach — with blips
// for the mission marker, the police, traffic, guards and pickups. It is the genre's
// signature HUD piece, so it is drawn properly every frame, not faked.

import { BEACH_Z, EXTENT, GRID, ROAD_HALF, WALK_HALF } from './config.js';

/** How much world the map shows from centre to edge, in world units. */
const RANGE = 125;

export function createMinimap(canvas, city) {
  const g = canvas.getContext('2d');
  const SIZE = canvas.width;
  const scale = (SIZE / 2) / RANGE;
  let elapsed = 0;

  /**
   * Draw one frame. view: {playerPos, playerHeading, marker, police, traffic, guards,
   * pickups, inCar}. Everything outside the range is simply not drawn.
   */
  function draw(dt, view) {
    elapsed += dt;
    const px = view.playerPos.x;
    const pz = view.playerPos.z;
    const toMapX = (x) => SIZE / 2 + (x - px) * scale;
    const toMapY = (z) => SIZE / 2 + (z - pz) * scale;

    g.clearRect(0, 0, SIZE, SIZE);
    g.fillStyle = '#1d3a4a';
    g.fillRect(0, 0, SIZE, SIZE);

    // Land: the city slab and the beach.
    g.fillStyle = '#66705f';
    g.fillRect(toMapX(-EXTENT - 30), toMapY(-EXTENT - 30), (EXTENT * 2 + 60) * scale, (EXTENT * 2 + 60) * scale);
    g.fillStyle = '#d9b380';
    g.fillRect(toMapX(-EXTENT - 30), toMapY(BEACH_Z), (EXTENT * 2 + 60) * scale, 40 * scale);

    // Blocks, park, docks yard.
    const inner = GRID - WALK_HALF * 2;
    for (let bx = 0; bx < 8; bx += 1) {
      for (let bz = 0; bz < 8; bz += 1) {
        const cx = -EXTENT + GRID * bx + GRID / 2;
        const cz = -EXTENT + GRID * bz + GRID / 2;
        const isPark = bx === 3 && bz === 2;
        const isYard = cx > 80 && cz > 80;
        g.fillStyle = isPark ? '#4e8c4a' : isYard ? '#55524c' : '#7d8478';
        g.fillRect(toMapX(cx - inner / 2), toMapY(cz - inner / 2), inner * scale, inner * scale);
      }
    }

    // Streets.
    g.strokeStyle = '#2e3238';
    g.lineWidth = ROAD_HALF * 2 * scale;
    g.beginPath();
    for (const v of city.streetLines) {
      g.moveTo(toMapX(v), toMapY(-EXTENT - 22));
      g.lineTo(toMapX(v), toMapY(EXTENT + 22));
      g.moveTo(toMapX(-EXTENT - 22), toMapY(v));
      g.lineTo(toMapX(EXTENT + 22), toMapY(v));
    }
    g.stroke();

    const blip = (x, z, color, r = 3) => {
      const mx = toMapX(x); const my = toMapY(z);
      if (mx < -6 || my < -6 || mx > SIZE + 6 || my > SIZE + 6) return;
      g.fillStyle = color;
      g.beginPath(); g.arc(mx, my, r, 0, Math.PI * 2); g.fill();
    };

    for (const car of view.traffic || []) blip(car.mesh.position.x, car.mesh.position.z, '#c8ccd0', 2.2);
    for (const p of view.pickups || []) blip(p.pos.x, p.pos.z, p.color, 3);
    for (const guard of view.guards || []) if (guard.alive) blip(guard.mesh.position.x, guard.mesh.position.z, '#ff5252', 3);
    const flash = Math.sin(elapsed * 9) > 0;
    for (const car of view.police || []) {
      blip(car.mesh.position.x, car.mesh.position.z, flash ? '#ff4040' : '#4cc9f0', 3.6);
    }

    // The mission marker: a gold diamond that breathes, clamped to the rim when far.
    if (view.marker) {
      let mx = toMapX(view.marker.x);
      let my = toMapY(view.marker.z);
      const dx = mx - SIZE / 2; const dy = my - SIZE / 2;
      const d = Math.hypot(dx, dy);
      const rim = SIZE / 2 - 10;
      if (d > rim) { mx = SIZE / 2 + (dx / d) * rim; my = SIZE / 2 + (dy / d) * rim; }
      const r = 5 + Math.sin(elapsed * 4) * 1.2;
      g.fillStyle = '#ffb703';
      g.save();
      g.translate(mx, my);
      g.rotate(Math.PI / 4);
      g.fillRect(-r / 1.6, -r / 1.6, r * 1.25, r * 1.25);
      g.restore();
    }

    // The player: a white arrow that turns with them (or with their car).
    g.save();
    g.translate(SIZE / 2, SIZE / 2);
    g.rotate(Math.PI - view.playerHeading);
    g.fillStyle = '#ffffff';
    g.strokeStyle = 'rgba(0,0,0,0.6)';
    g.beginPath();
    g.moveTo(0, -7); g.lineTo(4.6, 5.5); g.lineTo(0, 2.6); g.lineTo(-4.6, 5.5);
    g.closePath(); g.fill(); g.stroke();
    g.restore();

    // North.
    g.fillStyle = 'rgba(255,246,234,0.9)';
    g.font = '800 11px Verdana, sans-serif';
    g.textAlign = 'center';
    g.fillText('N', SIZE / 2, 13);
  }

  return { draw };
}
