// Settings persistence and display control: Electron (AppData + window APIs) or browser fallbacks.
import { settings, applySettings, WINDOW_SIZES } from './settings.js';

const KEY = 'drownedsun_settings';
const api = window.settingsApi;
const display = window.displayApi;

export async function loadSettings() {
  let raw = null;
  try { raw = JSON.parse((await (api ? api.read() : localStorage.getItem(KEY))) ?? 'null'); } catch { raw = null; }
  applySettings(raw);
}

export async function saveSettings() {
  const json = JSON.stringify(settings);
  try { if (api) await api.write(json); else localStorage.setItem(KEY, json); } catch { /* non-fatal */ }
}

export const canResizeWindow = !!display;

export async function isFullscreen() {
  return display ? display.get() : !!document.fullscreenElement;
}

export async function setFullscreen(on) {
  if (display) return display.set(on);
  try { if (on) await document.documentElement.requestFullscreen(); else if (document.fullscreenElement) await document.exitFullscreen(); } catch { /* needs a user gesture */ }
  return !!document.fullscreenElement;
}

export async function applyDisplay() {
  if (!display) return;
  await display.set(settings.fullscreen);
  const [w, h] = WINDOW_SIZES[settings.windowSize];
  await display.size(w, h);
}

export async function setWindowSize(index) {
  settings.windowSize = index;
  if (display) { const [w, h] = WINDOW_SIZES[index]; await display.size(w, h); }
}
