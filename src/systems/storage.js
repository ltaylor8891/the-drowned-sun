// Picks the save backend: Electron's AppData (via preload bridge) or localStorage in a plain browser.
import { SaveStore } from './save.js';

const local = {
  async read(slot) { try { return localStorage.getItem(`drownedsun_slot${slot}`); } catch { return null; } },
  async write(slot, json) { localStorage.setItem(`drownedsun_slot${slot}`, json); },
};

export const saves = new SaveStore(window.saveApi ?? local);
