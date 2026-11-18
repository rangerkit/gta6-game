// The save game: one localStorage record holding where Jett's story stands — money,
// missions done, the pistol, position and health — written when a mission lands, when the
// player asks, and read back by Continue on the title screen. Storage failures (private
// windows, quotas) are swallowed: the game simply plays unsaved.
import { SAVE_KEY } from './config.js';

export function hasSave() {
  try {
    return window.localStorage.getItem(SAVE_KEY) !== null;
  } catch {
    return false;
  }
}

export function writeSave(state) {
  try {
    const p = state.player;
    const data = {
      v: 1,
      money: p.money,
      storyIndex: state.storyIndex,
      storyDone: state.storyDone,
      hasPistol: p.hasPistol,
      hp: Math.round(p.hp),
      x: Math.round(p.inCar ? p.car.x : p.x),
      y: Math.round(p.inCar ? p.car.y : p.y),
      missionsPassed: state.stats.missionsPassed,
      bestRace: state.stats.bestRace,
      clockMin: Math.round(state.clockMin),
    };
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

export function readSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || data.v !== 1 || typeof data.money !== 'number') return null;
    return data;
  } catch {
    return null;
  }
}

export function clearSave() {
  try {
    window.localStorage.removeItem(SAVE_KEY);
  } catch {
    // Nothing to clear if storage is unavailable.
  }
}
