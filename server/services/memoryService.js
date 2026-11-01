import { config } from '../config.js';
import { EMOTIONAL_KEYWORDS, MOOD_BY_LEVEL, RESOLUTION_PATTERNS } from '../constants.js';
import { newId, readJson, updateJson } from '../utils/jsonStore.js';
import { nowIso, sortableTime } from '../utils/dates.js';
import { containsAny, sharedThemeCount, truncate, uniqueTokens } from '../utils/text.js';

const DEFAULT_STORE = { version: 2, memories: [] };
const MAX_ACTIVE = 50;
const MAX_RESOLVED = 100;
const RECURRENCE_PATTERN = /\b(again|still|same|back to|as before|like before|lately)\b/i;

function normalizeText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, 500);
}

function normalizeStore(raw) {
  if (raw && Array.isArray(raw.memories)) {
    return {
      version: 2,
      memories: raw.memories
        .filter((item) => item && typeof item.text === 'string' && item.text.trim())
        .map((item) => ({
          id: item.id || newId('mem'),
          text: normalizeText(item.text),
          createdAt: item.createdAt || nowIso(),
          updatedAt: item.updatedAt || item.createdAt || nowIso(),
          status: item.status === 'resolved' ? 'resolved' : 'active',
          source: item.source || 'manual',
          conversationId: item.conversationId || null,
          count: Number.isInteger(item.count) && item.count > 0 ? item.count : 1,
          keywords: Array.isArray(item.keywords) ? item.keywords.slice(0, 12) : [],
          resolvedAt: item.resolvedAt || null,
          legacy: Boolean(item.legacy),
        })),
    };
  }
  // Original memory.json shape: { "context": ["..."] }
  if (raw && Array.isArray(raw.context)) {
    const seen = new Map();
    for (const value of raw.context) {
      const text = normalizeText(value);
      if (!text) continue;
      const key = text.toLowerCase();
      if (seen.has(key)) {
        seen.get(key).count += 1;
      } else {
        seen.set(key, {
          id: newId('mem'),
          text,
          createdAt: nowIso(),
          updatedAt: nowIso(),
          status: 'active',
          source: 'legacy',
          conversationId: null,
          count: 1,
          keywords: EMOTIONAL_KEYWORDS.filter((keyword) => text.toLowerCase().includes(keyword)).slice(0, 8),
          resolvedAt: null,
          legacy: true,
        });
      }
    }
    return { version: 2, memories: [...seen.values()] };
  }
  return { ...DEFAULT_STORE, memories: [] };
}

async function loadStore() {
  const raw = await readJson(config.files.memory, DEFAULT_STORE);
  const normalized = normalizeStore(raw);
  const needsWrite = !raw || raw.version !== 2 || !Array.isArray(raw.memories);
  if (needsWrite) {
    await updateJson(config.files.memory, DEFAULT_STORE, () => normalized);
  }
  return normalized;
}

function sortMemories(list) {
  return [...list].sort((a, b) => sortableTime(b.updatedAt) - sortableTime(a.updatedAt));
}

export async function getMemories({ status = 'all', q = '' } = {}) {
  const store = await loadStore();
  const query = String(q || '').toLowerCase().trim();
  let memories = store.memories;
  if (status === 'active' || status === 'resolved') memories = memories.filter((item) => item.status === status);
  if (query) memories = memories.filter((item) => item.text.toLowerCase().includes(query));
  memories = sortMemories(memories);
  const active = store.memories.filter((item) => item.status === 'active');
  const resolved = store.memories.filter((item) => item.status === 'resolved');
  return {
    memories,
    active: sortMemories(active),
    resolved: sortMemories(resolved),
    counts: { active: active.length, resolved: resolved.length, total: store.memories.length },
  };
}

export async function captureFromMessage(message, { conversationId = null } = {}) {
  const clean = normalizeText(message);
  if (!clean) return null;
  const lower = clean.toLowerCase();
  const keywords = EMOTIONAL_KEYWORDS.filter((keyword) => lower.includes(keyword)).slice(0, 8);
  if (!keywords.length) return null;

  const store = await loadStore();
  const normalized = lower;
  const existing = store.memories.find(
    (item) => item.status === 'active' && item.text.toLowerCase() === normalized,
  );
  if (existing) {
    existing.count += 1;
    existing.updatedAt = nowIso();
    await updateJson(config.files.memory, DEFAULT_STORE, () => store);
    return { memory: existing, created: false, keywords };
  }

  // "I'm feeling overwhelmed again" continues an earlier emotional thread.
  // Refresh that note instead of storing a near-duplicate one.
  if (RECURRENCE_PATTERN.test(lower)) {
    const tokens = uniqueTokens(clean);
    const related = store.memories
      .filter((item) => item.status === 'active')
      .map((item) => ({ item, themes: sharedThemeCount(tokens, uniqueTokens(item.text)) }))
      .filter((entry) => entry.themes > 0)
      .sort((a, b) => sortableTime(b.item.updatedAt) - sortableTime(a.item.updatedAt))[0];
    if (related) {
      const target = related.item;
      target.count += 1;
      target.updatedAt = nowIso();
      target.keywords = [...new Set([...(target.keywords || []), ...keywords])].slice(0, 12);
      await updateJson(config.files.memory, DEFAULT_STORE, () => store);
      return { memory: target, created: false, keywords };
    }
  }

  const memory = {
    id: newId('mem'),
    text: clean,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    status: 'active',
    source: 'conversation',
    conversationId,
    count: 1,
    keywords,
    resolvedAt: null,
    legacy: false,
  };
  store.memories.push(memory);

  const active = store.memories.filter((item) => item.status === 'active');
  if (active.length > MAX_ACTIVE) {
    const overflow = active.sort((a, b) => sortableTime(a.updatedAt) - sortableTime(b.updatedAt)).slice(0, active.length - MAX_ACTIVE);
    for (const item of overflow) {
      item.status = 'resolved';
      item.resolvedAt = nowIso();
    }
  }
  const resolved = store.memories.filter((item) => item.status === 'resolved');
  if (resolved.length > MAX_RESOLVED) {
    const keep = new Set(resolved.sort((a, b) => sortableTime(b.updatedAt) - sortableTime(a.updatedAt)).slice(0, MAX_RESOLVED).map((item) => item.id));
    store.memories = store.memories.filter((item) => item.status === 'active' || keep.has(item.id));
  }

  await updateJson(config.files.memory, DEFAULT_STORE, () => store);
  return { memory, created: true, keywords };
}

export async function addMemory(text, { source = 'manual' } = {}) {
  const clean = normalizeText(text);
  if (!clean) throw new Error('Memory text is required.');
  const store = await loadStore();
  const existing = store.memories.find((item) => item.text.toLowerCase() === clean.toLowerCase());
  if (existing) {
    existing.updatedAt = nowIso();
    existing.status = 'active';
    existing.resolvedAt = null;
    existing.count += 1;
    await updateJson(config.files.memory, DEFAULT_STORE, () => store);
    return { memory: existing, created: false };
  }
  const memory = {
    id: newId('mem'),
    text: clean,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    status: 'active',
    source,
    conversationId: null,
    count: 1,
    keywords: EMOTIONAL_KEYWORDS.filter((keyword) => clean.toLowerCase().includes(keyword)).slice(0, 8),
    resolvedAt: null,
    legacy: source === 'legacy',
  };
  store.memories.push(memory);
  await updateJson(config.files.memory, DEFAULT_STORE, () => store);
  return { memory, created: true };
}

export function detectResolution(message) {
  const clean = String(message || '');
  return RESOLUTION_PATTERNS.some((pattern) => pattern.test(clean));
}

export async function resolveAllMemories() {
  const store = await loadStore();
  const active = store.memories.filter((item) => item.status === 'active');
  if (!active.length) return 0;
  const now = nowIso();
  for (const memory of active) {
    memory.status = 'resolved';
    memory.resolvedAt = now;
    memory.updatedAt = now;
  }
  await updateJson(config.files.memory, DEFAULT_STORE, () => store);
  return active.length;
}

export async function resolveMemory(id) {
  const store = await loadStore();
  const memory = store.memories.find((item) => item.id === id);
  if (!memory) return null;
  memory.status = 'resolved';
  memory.resolvedAt = nowIso();
  memory.updatedAt = memory.resolvedAt;
  await updateJson(config.files.memory, DEFAULT_STORE, () => store);
  return memory;
}

export async function reopenMemory(id) {
  const store = await loadStore();
  const memory = store.memories.find((item) => item.id === id);
  if (!memory) return null;
  memory.status = 'active';
  memory.resolvedAt = null;
  memory.updatedAt = nowIso();
  await updateJson(config.files.memory, DEFAULT_STORE, () => store);
  return memory;
}

export async function deleteMemory(id) {
  const store = await loadStore();
  const before = store.memories.length;
  store.memories = store.memories.filter((item) => item.id !== id);
  if (store.memories.length === before) return false;
  await updateJson(config.files.memory, DEFAULT_STORE, () => store);
  return true;
}

export async function clearMemories(scope = 'all') {
  const store = await loadStore();
  if (scope === 'active') store.memories = store.memories.filter((item) => item.status !== 'active');
  else if (scope === 'resolved') store.memories = store.memories.filter((item) => item.status !== 'resolved');
  else store.memories = [];
  await updateJson(config.files.memory, DEFAULT_STORE, () => store);
  return store.memories.length;
}

export async function recallMemories(query, limit = 3) {
  const store = await loadStore();
  const active = store.memories.filter((item) => item.status === 'active');
  if (!active.length) return [];
  const queryTokens = uniqueTokens(query);
  if (!queryTokens.length) return [];
  const lowerQuery = String(query || '').toLowerCase();
  const scored = active
    .map((memory) => {
      const memTokens = [...new Set(uniqueTokens(memory.text))];
      const memTokenSet = new Set(memTokens);
      let overlap = 0;
      for (const token of queryTokens) {
        if (memTokenSet.has(token)) overlap += 1;
        else if (token.length > 4 && memory.text.toLowerCase().includes(token)) overlap += 0.5;
      }
      // A different word for a similar feeling still deserves a gentle recall.
      const themeOverlap = overlap > 0 ? 0 : Math.min(1, sharedThemeCount(queryTokens, memTokens));
      const phraseBonus = memory.text.length > 12 && lowerQuery.includes(memory.text.toLowerCase()) ? 3 : 0;
      const recencyBonus = Math.min(0.5, memory.count * 0.05);
      return { memory, score: overlap + themeOverlap * 0.8 + phraseBonus + recencyBonus };
    })
    .filter((item) => item.score > 0.4)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
  return scored.map((item) => item.memory);
}

export function formatRecallForPrompt(memories) {
  if (!memories.length) return '';
  return memories
    .map((memory) => `- Earlier, the user shared: "${truncate(memory.text, 160)}"`)
    .join('\n');
}

export function followUpFor(memories, moodLevel = 3) {
  if (memories.length) {
    const short = truncate(memories[0].text, 80);
    return `Earlier you mentioned “${short}”. How are you feeling about that now?`;
  }
  const templates = {
    1: 'What would feel like the gentlest next step for you right now?',
    2: 'Would it help to talk about what is weighing on you most?',
    3: 'What has been on your mind the most today?',
    4: 'What helped make today feel a little brighter?',
    5: 'What would you like to savour about this moment?',
  };
  return templates[moodLevel] || templates[3];
}

export function memoryMoodLabel(level) {
  return MOOD_BY_LEVEL[level]?.label || 'Neutral';
}

export async function memoryCounts() {
  const store = await loadStore();
  const active = store.memories.filter((item) => item.status === 'active').length;
  return { active, resolved: store.memories.length - active, total: store.memories.length };
}

export { containsAny };
