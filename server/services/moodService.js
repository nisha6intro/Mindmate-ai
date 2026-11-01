import fs from 'node:fs/promises';
import { config } from '../config.js';
import { MOOD_BY_LEVEL, MOODS } from '../constants.js';
import { appendCsv, csvEscape, parseCsv } from '../utils/csv.js';
import { backupFile } from '../utils/jsonStore.js';
import { dayKey, nowIso, parseTimestamp, sortableTime } from '../utils/dates.js';

const HEADER = ['timestamp', 'mood'];

function localTimestamp(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

async function ensureFile() {
  try {
    await fs.access(config.files.mood);
  } catch {
    await fs.mkdir(config.files.mood.replace(/[\\/][^\\/]+$/, ''), { recursive: true });
    await fs.writeFile(config.files.mood, 'timestamp,mood\n', 'utf8');
  }
}

function looksLikeHeader(row) {
  if (!row || row.length < 2) return false;
  const first = String(row[0] || '').toLowerCase();
  const second = String(row[1] || '').toLowerCase();
  return (first.includes('date') || first.includes('time')) && second.includes('mood');
}

export async function readRawMood() {
  await ensureFile();
  let text = '';
  try {
    text = await fs.readFile(config.files.mood, 'utf8');
  } catch {
    return { header: HEADER, dataRows: [], entries: [] };
  }
  const rows = parseCsv(text);
  let header = HEADER;
  let dataRows = rows;
  if (rows.length && looksLikeHeader(rows[0])) {
    header = rows[0];
    dataRows = rows.slice(1);
  }
  const entries = [];
  dataRows.forEach((row, rawIndex) => {
    if (!row || row.length < 2) return;
    const mood = Number.parseInt(row[1], 10);
    if (!Number.isInteger(mood) || mood < 1 || mood > 5) return;
    const parsed = parseTimestamp(row[0]);
    if (!parsed) return;
    const meta = MOOD_BY_LEVEL[mood];
    entries.push({
      id: entries.length,
      rawIndex,
      timestamp: parsed.iso,
      rawTimestamp: String(row[0]),
      hasTime: parsed.hasTime,
      mood,
      label: meta.label,
      emoji: meta.emoji,
    });
  });
  entries.sort((a, b) => sortableTime(a.timestamp) - sortableTime(b.timestamp));
  // Assign stable ids after sorting so the API returns chronological order.
  entries.forEach((entry, index) => {
    entry.id = index;
  });
  return { header, dataRows, entries };
}

function average(values) {
  if (!values.length) return null;
  return Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10;
}

export function buildSummary(entries) {
  const sorted = [...entries].sort((a, b) => sortableTime(a.timestamp) - sortableTime(b.timestamp));
  const current = sorted.at(-1) || null;
  const previous = sorted.at(-2) || null;
  const last7 = sorted.slice(-7);
  const now = new Date();
  const cutoff = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6, 0, 0, 0, 0);
  const days = new Set(sorted.map((entry) => dayKey(entry.timestamp)));

  let streak = 0;
  const cursor = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (!days.has(dayKey(cursor))) cursor.setDate(cursor.getDate() - 1);
  while (days.has(dayKey(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }

  const lastThree = sorted.slice(-3).map((entry) => entry.mood);
  const beforeThree = sorted.slice(-6, -3).map((entry) => entry.mood);
  const recentAvg = average(lastThree);
  const earlierAvg = average(beforeThree);
  let trend = 'steady';
  if (recentAvg !== null && earlierAvg !== null) {
    if (recentAvg - earlierAvg >= 0.4) trend = 'up';
    else if (recentAvg - earlierAvg <= -0.4) trend = 'down';
  }

  const distribution = Object.fromEntries(MOODS.map((mood) => [mood.level, 0]));
  for (const entry of sorted) distribution[entry.mood] += 1;

  const dayBuckets = new Map();
  for (const entry of sorted) {
    const key = dayKey(entry.timestamp);
    if (!dayBuckets.has(key)) dayBuckets.set(key, []);
    dayBuckets.get(key).push(entry.mood);
  }
  let bestDay = null;
  for (const [key, values] of dayBuckets) {
    const score = average(values);
    if (!bestDay || score > bestDay.average) bestDay = { date: key, average: score, count: values.length };
  }

  return {
    total: sorted.length,
    current,
    previous,
    last7,
    average7: average(last7.map((entry) => entry.mood)),
    averageAll: average(sorted.map((entry) => entry.mood)),
    checkins7Days: sorted.filter((entry) => parseTimestamp(entry.timestamp)?.date >= cutoff).length,
    todayCount: sorted.filter((entry) => dayKey(entry.timestamp) === dayKey(now)).length,
    streak,
    trend,
    distribution,
    bestDay,
    labels: MOODS,
  };
}

export async function getMood({ range = 'all', limit = 0 } = {}) {
  const { entries } = await readRawMood();
  const summary = buildSummary(entries);
  let filtered = entries;
  if (range === '7') {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 7);
    filtered = entries.filter((entry) => sortableTime(entry.timestamp) >= cutoff.getTime());
  } else if (range === '30') {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 30);
    filtered = entries.filter((entry) => sortableTime(entry.timestamp) >= cutoff.getTime());
  }
  if (limit > 0) filtered = filtered.slice(-limit);
  return { entries: filtered, allEntries: entries, summary };
}

export async function addMood(level, timestamp = null) {
  const parsed = timestamp ? parseTimestamp(timestamp) : null;
  const value = parsed?.raw || localTimestamp();
  await appendCsv(config.files.mood, [value, level]);
  const { entries } = await readRawMood();
  return { entry: entries.at(-1) || null, summary: buildSummary(entries) };
}

export async function deleteMood(id) {
  const { header, dataRows, entries } = await readRawMood();
  const target = entries.find((entry) => entry.id === Number(id));
  if (!target) return false;
  await backupFile(config.files.mood);
  const remaining = dataRows.filter((_, index) => index !== target.rawIndex);
  const lines = [header.map(csvEscape).join(','), ...remaining.map((row) => row.map(csvEscape).join(','))];
  await fs.writeFile(config.files.mood, `${lines.join('\n')}\n`, 'utf8');
  return true;
}

export async function clearMoodLog() {
  await backupFile(config.files.mood);
  await fs.writeFile(config.files.mood, `${HEADER.join(',')}\n`, 'utf8');
}

export async function moodContext() {
  const { entries } = await readRawMood();
  const current = entries.at(-1) || null;
  const previous = entries.at(-2) || null;
  return {
    currentMood: current ? current.label : 'Neutral',
    currentLevel: current ? current.mood : 3,
    previousMood: previous ? previous.label : 'Neutral',
    previousLevel: previous ? previous.mood : 3,
    lastLoggedAt: current ? current.timestamp : null,
  };
}

export { localTimestamp, nowIso };
