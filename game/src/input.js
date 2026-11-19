// Keyboard and mouse input, read as state rather than events: the loop asks what is held,
// what was pressed this frame, and how far the mouse has moved since it last asked.
// Pointer lock is requested by main when play begins; without it the camera simply follows.

export const ACTION_INTERACT = 1;
export const ACTION_PAUSE = 2;
export const ACTION_RELOAD = 4;

/** Create the input reader bound to the canvas (for pointer lock) and the window (for keys). */
export function createInput(canvas) {
  const held = new Set();
  const pressed = new Set();
  let mouseDX = 0;
  let mouseDY = 0;
  let mouseDown = false;
  let mouseClicked = false;
  let locked = false;

  window.addEventListener('keydown', (event) => {
    if (event.repeat) return;
    held.add(event.code);
    pressed.add(event.code);
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(event.code)) event.preventDefault();
  });
  window.addEventListener('keyup', (event) => held.delete(event.code));
  window.addEventListener('blur', () => { held.clear(); mouseDown = false; });

  canvas.addEventListener('mousedown', (event) => {
    if (event.button === 0) { mouseDown = true; mouseClicked = true; }
  });
  window.addEventListener('mouseup', (event) => { if (event.button === 0) mouseDown = false; });
  document.addEventListener('mousemove', (event) => {
    if (!locked) return;
    mouseDX += event.movementX || 0;
    mouseDY += event.movementY || 0;
  });
  document.addEventListener('pointerlockchange', () => {
    locked = document.pointerLockElement === canvas;
  });

  return {
    /** True while the key with this KeyboardEvent.code is down. */
    down(code) { return held.has(code); },
    /** Forward/strafe axes from WASD and the arrow keys: {x: strafe, z: forward}, each -1..1. */
    axes() {
      const z = (held.has('KeyW') || held.has('ArrowUp') ? 1 : 0) - (held.has('KeyS') || held.has('ArrowDown') ? 1 : 0);
      const x = (held.has('KeyD') || held.has('ArrowRight') ? 1 : 0) - (held.has('KeyA') || held.has('ArrowLeft') ? 1 : 0);
      return { x, z };
    },
    sprint() { return held.has('ShiftLeft') || held.has('ShiftRight'); },
    handbrake() { return held.has('Space'); },
    /** One-shot actions pressed since the last call; asking consumes them. */
    takeActions() {
      let actions = 0;
      if (pressed.has('KeyE') || pressed.has('Enter')) actions |= ACTION_INTERACT;
      if (pressed.has('KeyP') || pressed.has('Escape')) actions |= ACTION_PAUSE;
      if (pressed.has('KeyR')) actions |= ACTION_RELOAD;
      pressed.clear();
      return actions;
    },
    /** Mouse movement since the last call; asking consumes it. */
    takeMouse() {
      const out = { dx: mouseDX, dy: mouseDY };
      mouseDX = 0; mouseDY = 0;
      return out;
    },
    /** True while the left button is held, and whether it went down since the last call. */
    trigger() { return mouseDown; },
    takeClick() { const was = mouseClicked; mouseClicked = false; return was; },
    isLocked() { return locked; },
    /** Ask the browser for pointer lock; a no-op where it is refused (headless shots). */
    lock() {
      if (!locked && canvas.requestPointerLock) {
        try { canvas.requestPointerLock(); } catch { /* screenshots stage their own camera */ }
      }
    },
    unlock() { if (locked) document.exitPointerLock(); },
  };
}
