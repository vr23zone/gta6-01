// input.js — keyboard state and mouse look for the whole game. One shared `keys`
// object the player, vehicle and mission code read each frame, edge-triggered
// "pressed" queries for one-shot actions (enter car, advance dialogue, pause), and
// pointer-lock mouse deltas the camera rig consumes.

export const keys = Object.create(null);
const pressed = Object.create(null);

let lookDX = 0;
let lookDY = 0;
let firing = false;
let lockWanted = false;

export function initInput(canvas) {
  addEventListener('keydown', (e) => {
    if (!keys[e.code]) pressed[e.code] = true;
    keys[e.code] = true;
    if (['ArrowUp', 'ArrowDown', 'Space'].includes(e.code)) e.preventDefault();
  });
  addEventListener('keyup', (e) => {
    keys[e.code] = false;
  });
  addEventListener('blur', () => {
    for (const k of Object.keys(keys)) keys[k] = false;
    firing = false;
  });
  canvas.addEventListener('click', () => {
    if (lockWanted && document.pointerLockElement !== canvas) {
      canvas.requestPointerLock();
    }
  });
  document.addEventListener('pointerlockchange', () => {
    if (document.pointerLockElement !== canvas) firing = false;
  });
  addEventListener('mousemove', (e) => {
    if (document.pointerLockElement === canvas) {
      lookDX += e.movementX || 0;
      lookDY += e.movementY || 0;
    }
  });
  addEventListener('mousedown', (e) => {
    if (e.button === 0 && document.pointerLockElement === canvas) firing = true;
  });
  addEventListener('mouseup', (e) => {
    if (e.button === 0) firing = false;
  });
}

// True once, on the frame after the key went down.
export function justPressed(code) {
  if (pressed[code]) {
    pressed[code] = false;
    return true;
  }
  return false;
}

// Mouse movement accumulated since the last call, then zeroed.
export function takeLook() {
  const out = { dx: lookDX, dy: lookDY };
  lookDX = 0;
  lookDY = 0;
  return out;
}

export function isFiring() {
  return firing;
}

export function setLockWanted(want) {
  lockWanted = want;
  if (!want && document.pointerLockElement) document.exitPointerLock();
}

export function pointerLocked(canvas) {
  return document.pointerLockElement === canvas;
}
