// save.js — the localStorage auto-save. Solara Heat keeps one slot: cash, story
// progress, health and where Nico was standing, written when a mission ends and
// every few seconds while playing, so closing the tab loses nothing but the chase
// you were in the middle of.

import { SAVE_KEY } from './config.js';

export function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (typeof data !== 'object' || data === null) return null;
    return data;
  } catch {
    return null;
  }
}

export function writeSave(state) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({ ...state, at: Date.now() }));
  } catch {
    // Private mode or a full store: the game simply plays unsaved.
  }
}

export function clearSave() {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    // Nothing to clear.
  }
}
