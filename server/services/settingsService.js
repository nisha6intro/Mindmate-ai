import { config } from '../config.js';
import { readJson, updateJson } from '../utils/jsonStore.js';
import { nowIso } from '../utils/dates.js';

const THEMES = ['light', 'dark', 'system'];

export const DEFAULT_SETTINGS = Object.freeze({
  displayName: 'Friend',
  theme: 'system',
  memoryEnabled: true,
  reminderNotifications: false,
  reduceMotion: false,
  createdAt: null,
  updatedAt: null,
});

function normalize(raw = {}) {
  const merged = { ...DEFAULT_SETTINGS, ...raw };
  if (typeof merged.displayName !== 'string' || !merged.displayName.trim()) merged.displayName = 'Friend';
  merged.displayName = merged.displayName.trim().slice(0, 40);
  if (!THEMES.includes(merged.theme)) merged.theme = 'system';
  merged.memoryEnabled = Boolean(merged.memoryEnabled);
  merged.reminderNotifications = Boolean(merged.reminderNotifications);
  merged.reduceMotion = Boolean(merged.reduceMotion);
  merged.createdAt = merged.createdAt || nowIso();
  merged.updatedAt = merged.updatedAt || merged.createdAt;
  return merged;
}

export async function getSettings() {
  const raw = await readJson(config.files.settings, DEFAULT_SETTINGS);
  const normalized = normalize(raw);
  if (!raw || raw.createdAt === undefined) {
    await updateJson(config.files.settings, normalized, () => normalized);
  }
  return normalized;
}

export async function updateSettings(patch) {
  return updateJson(config.files.settings, DEFAULT_SETTINGS, (current) => {
    const base = normalize(current);
    const next = { ...base, ...patch, updatedAt: nowIso() };
    // Never allow an update to mutate creation metadata or inject unknown fields.
    next.createdAt = base.createdAt;
    return normalize(next);
  });
}

export async function resetSettings() {
  const fresh = normalize({ ...DEFAULT_SETTINGS, createdAt: nowIso(), updatedAt: nowIso() });
  return updateJson(config.files.settings, DEFAULT_SETTINGS, () => fresh);
}

export function themeOptions() {
  return THEMES;
}
