// The save: one JSON record in localStorage — cash, story progress, earnings, where Nico
// was standing. Written from the pause menu and at every mission's end; read by Continue.

import { SAVE_KEY } from './config.js';

/** The save record, or null when there is none (or it is not one of ours). */
export function loadSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || typeof data.cash !== 'number' || typeof data.missionIndex !== 'number') return null;
    return data;
  } catch {
    return null;
  }
}

/** Store the record. Storage can be off (private windows): then saving quietly does nothing. */
export function storeSave(record) {
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(record));
  } catch { /* the run still continues unsaved */ }
}

/** Wipe the save, for a new game. */
export function clearSave() {
  try {
    window.localStorage.removeItem(SAVE_KEY);
  } catch { /* nothing to wipe */ }
}
