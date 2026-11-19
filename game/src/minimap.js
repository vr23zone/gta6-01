// minimap.js — the round map in the corner of the HUD, drawn fresh each frame on a
// 2D canvas: the streets around the player as pale lines on dark asphalt-blue, the
// sea bright to the east, and blips for everything that matters — traffic in grey,
// the law in flashing blue, guards in red, Sol and the job in green and gold. The
// objective marker clamps to the rim when the job is off the map, so it always
// points the way. North is up; the player arrow turns with the camera.

import { GRID, HALF, SEA_X, streetX, streetZ } from './config.js';

const RANGE = 135; // metres from centre to rim

export class Minimap {
  constructor(canvas) {
    this.canvas = canvas;
    this.g = canvas.getContext('2d');
    this.size = canvas.width;
  }

  draw(state) {
    const { player, traffic, parked, police, guards, objective, npc } = state;
    const g = this.g;
    const S = this.size;
    const C = S / 2;
    const scale = C / RANGE;
    const px = player.pos.x;
    const pz = player.pos.z;
    const toMap = (x, z) => ({ x: C + (x - px) * scale, y: C + (z - pz) * scale });

    g.clearRect(0, 0, S, S);
    g.save();
    g.beginPath();
    g.arc(C, C, C - 1, 0, Math.PI * 2);
    g.clip();
    // Land, then the sea where the world runs out to the east.
    g.fillStyle = '#2e3d47';
    g.fillRect(0, 0, S, S);
    const seaEdge = toMap(SEA_X - 26, 0).x;
    g.fillStyle = '#2e7f9e';
    g.fillRect(seaEdge, 0, S - seaEdge, S);
    const sandEdge = toMap(HALF, 0).x;
    g.fillStyle = '#c9ae72';
    g.fillRect(sandEdge, 0, Math.max(0, seaEdge - sandEdge), S);
    // Blocks as faint squares, streets left as the dark gaps between them.
    g.fillStyle = 'rgba(240,230,200,0.13)';
    for (let i = 0; i < GRID; i++) {
      for (let j = 0; j < GRID; j++) {
        const a = toMap(streetX(i) + 8, streetZ(j) + 8);
        const w = 44 * scale;
        if (a.x + w < 0 || a.y + w < 0 || a.x > S || a.y > S) continue;
        g.fillRect(a.x, a.y, w, w);
      }
    }
    // Streets.
    g.strokeStyle = 'rgba(250,246,230,0.4)';
    g.lineWidth = Math.max(1, 3.4 * scale);
    g.beginPath();
    for (let i = 0; i <= GRID; i++) {
      const v = toMap(streetX(i), 0);
      if (v.x > -4 && v.x < S + 4) {
        g.moveTo(v.x, 0);
        g.lineTo(v.x, S);
      }
      const h = toMap(0, streetZ(i));
      if (h.y > -4 && h.y < S + 4) {
        g.moveTo(0, h.y);
        g.lineTo(S, h.y);
      }
    }
    g.stroke();

    const blip = (x, z, color, r = 3) => {
      const p = toMap(x, z);
      if (p.x < -6 || p.y < -6 || p.x > S + 6 || p.y > S + 6) return;
      g.fillStyle = color;
      g.beginPath();
      g.arc(p.x, p.y, r, 0, Math.PI * 2);
      g.fill();
    };
    for (const car of traffic) blip(car.pos.x, car.pos.z, '#b9c2c9', 2.2);
    for (const car of parked) blip(car.pos.x, car.pos.z, '#7d8891', 1.8);
    if (guards) for (const gd of guards) if (gd.alive) blip(gd.pos.x, gd.pos.z, '#ff5347', 3);
    const flash = Math.floor(performance.now() / 280) % 2 === 0;
    for (const unit of police.cars) blip(unit.car.pos.x, unit.car.pos.z, flash ? '#3d8bff' : '#eaf4ff', 3.4);
    for (const o of police.officers) blip(o.person.group.position.x, o.person.group.position.z, '#3d8bff', 2.6);
    if (npc) blip(npc.x, npc.z, '#59e08a', 3.6);
    // The objective: a gold diamond, clamped to the rim when it is off the map.
    if (objective) {
      let p = toMap(objective.x, objective.z);
      const dx = p.x - C;
      const dy = p.y - C;
      const d = Math.hypot(dx, dy);
      if (d > C - 12) {
        p = { x: C + (dx / d) * (C - 12), y: C + (dy / d) * (C - 12) };
      }
      g.fillStyle = '#ffd23e';
      g.save();
      g.translate(p.x, p.y);
      g.rotate(Math.PI / 4);
      g.fillRect(-4.6, -4.6, 9.2, 9.2);
      g.restore();
    }
    // The player: a white arrow turned toward his facing (state.facing, a world
    // direction); the canvas rotation that takes "up" to that direction is below.
    const f = state.facing || { x: 0, z: -1 };
    g.save();
    g.translate(C, C);
    g.rotate(Math.atan2(f.x, -f.z));
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.moveTo(0, -6.4);
    g.lineTo(4.4, 5);
    g.lineTo(0, 2.6);
    g.lineTo(-4.4, 5);
    g.closePath();
    g.fill();
    g.restore();
    g.restore();
    // Rim.
    g.strokeStyle = 'rgba(10,14,18,0.85)';
    g.lineWidth = 3;
    g.beginPath();
    g.arc(C, C, C - 2, 0, Math.PI * 2);
    g.stroke();
  }
}
