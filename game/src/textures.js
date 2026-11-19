// textures.js — every surface in Solara Bay is painted, not photographed: this file
// draws the game's textures onto canvases at boot. Building facades get a stucco
// base, a grid of windows (some lit, warm against the sunset), a shopfront band with
// the shop's name lettered on it, and a cornice line; the roads get asphalt with a
// dashed centre line and worn edges; the ground gets sand, grass and plaza stone.
// Nothing is loaded from disk or the network — a texture is a function call away.

function canvasTexture(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 4;
  return tex;
}

// Warm stucco tints the city's buildings cycle through.
const STUCCO = ['#f4e3c2', '#eec9a3', '#f7d9b0', '#e8b48c', '#f2e6d8', '#dfa06f', '#cfe0e2', '#f0c4c4'];

export function facadeTexture(rng, opts = {}) {
  const floors = opts.floors || rng.int(3, 7);
  const tint = opts.tint || rng.pick(STUCCO);
  const shop = opts.shop || null;
  return canvasTexture(256, 256, (g, w, h) => {
    g.fillStyle = tint;
    g.fillRect(0, 0, w, h);
    // Weathering: soft vertical streaks and a darker base.
    for (let i = 0; i < 26; i++) {
      g.fillStyle = `rgba(120,80,40,${rng.range(0.02, 0.07)})`;
      const x = rng.range(0, w);
      g.fillRect(x, 0, rng.range(2, 9), h);
    }
    g.fillStyle = 'rgba(90,60,30,0.18)';
    g.fillRect(0, h - 14, w, 14);
    // Cornice.
    g.fillStyle = 'rgba(255,255,255,0.5)';
    g.fillRect(0, 0, w, 6);
    // Windows: a regular grid, shutters on some, warm light in a few.
    const cols = 5;
    const rows = floors;
    const ww = w / cols;
    const wh = (h - 52) / rows;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = c * ww + ww * 0.24;
        const y = 14 + r * wh + wh * 0.18;
        const lit = rng.chance(0.34);
        g.fillStyle = lit ? '#ffd98a' : '#33505e';
        g.fillRect(x, y, ww * 0.52, wh * 0.6);
        g.fillStyle = 'rgba(255,255,255,0.35)';
        g.fillRect(x, y, ww * 0.52, 3);
        if (rng.chance(0.4)) {
          g.fillStyle = 'rgba(70,110,90,0.85)';
          g.fillRect(x - 4, y, 3, wh * 0.6);
          g.fillRect(x + ww * 0.52 + 1, y, 3, wh * 0.6);
        }
      }
    }
    // Shopfront band with the shop's name, or a plain awning line of windows.
    const bandY = h - 46;
    g.fillStyle = shop ? '#274b63' : 'rgba(60,50,40,0.55)';
    g.fillRect(0, bandY, w, 46);
    g.fillStyle = 'rgba(255,255,255,0.16)';
    for (let c = 0; c < cols; c++) g.fillRect(c * ww + 6, bandY + 22, ww - 12, 18);
    if (shop) {
      g.fillStyle = '#ffe9b8';
      g.font = 'bold 21px Georgia, serif';
      g.textAlign = 'center';
      g.fillText(shop, w / 2, bandY + 19, w - 12);
    }
  });
}

export function roofTexture(rng) {
  return canvasTexture(128, 128, (g, w, h) => {
    g.fillStyle = '#9c6b52';
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 300; i++) {
      g.fillStyle = `rgba(60,35,20,${rng.range(0.05, 0.16)})`;
      g.fillRect(rng.range(0, w), rng.range(0, h), rng.range(2, 7), rng.range(2, 5));
    }
    g.strokeStyle = 'rgba(70,45,28,0.5)';
    for (let y = 0; y <= h; y += 16) {
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(w, y);
      g.stroke();
    }
  });
}

export function roadTexture() {
  const tex = canvasTexture(128, 256, (g, w, h) => {
    g.fillStyle = '#33373d';
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 500; i++) {
      g.fillStyle = `rgba(255,255,255,${Math.random() * 0.05})`;
      g.fillRect(Math.random() * w, Math.random() * h, 2, 2);
    }
    // Worn edges and a dashed centre line (the texture runs along the street).
    g.fillStyle = 'rgba(230,230,220,0.75)';
    g.fillRect(3, 0, 3, h);
    g.fillRect(w - 6, 0, 3, h);
    g.fillStyle = '#f7d774';
    g.fillRect(w / 2 - 2, 10, 4, 62);
    g.fillRect(w / 2 - 2, 138, 4, 62);
  });
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

export function groundTexture(base, fleck, flecks = 380) {
  return canvasTexture(128, 128, (g, w, h) => {
    g.fillStyle = base;
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < flecks; i++) {
      g.fillStyle = fleck;
      g.globalAlpha = Math.random() * 0.14;
      g.fillRect(Math.random() * w, Math.random() * h, 2.4, 2.4);
    }
    g.globalAlpha = 1;
  });
}

// A name sign that stands proud of a building — the bank, the café, the docks gate.
export function signTexture(text, bg, fg) {
  return canvasTexture(512, 96, (g, w, h) => {
    g.fillStyle = bg;
    g.fillRect(0, 0, w, h);
    g.strokeStyle = fg;
    g.lineWidth = 4;
    g.strokeRect(6, 6, w - 12, h - 12);
    g.fillStyle = fg;
    g.font = 'bold 44px Georgia, serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, w / 2, h / 2 + 2, w - 30);
  });
}
