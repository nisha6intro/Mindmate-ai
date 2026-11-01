import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import { config } from '../config.js';
import { REMINDER_CATALOG } from '../constants.js';
import { backupFile } from '../utils/jsonStore.js';
import { parseTimestamp, sortableTime } from '../utils/dates.js';
import { stripControlCharacters } from '../utils/text.js';

async function ensureFile() {
  try {
    await fs.access(config.files.reminders);
  } catch {
    await fs.mkdir(config.files.reminders.replace(/[\\/][^\\/]+$/, ''), { recursive: true });
    await fs.writeFile(config.files.reminders, '', 'utf8');
  }
}

function splitLine(line) {
  const match = /^(\d{4}-\d{2}-\d{2}T[^\s]+)\s+-\s+(.*)$/.exec(line);
  if (match) {
    const parsed = parseTimestamp(match[1]);
    return {
      timestamp: parsed ? parsed.iso : match[1],
      rawTimestamp: match[1],
      text: match[2].trim(),
    };
  }
  const dash = line.indexOf(' - ');
  if (dash > 0) {
    const parsed = parseTimestamp(line.slice(0, dash));
    return {
      timestamp: parsed ? parsed.iso : null,
      rawTimestamp: line.slice(0, dash).trim(),
      text: line.slice(dash + 3).trim(),
    };
  }
  return { timestamp: null, rawTimestamp: null, text: line.trim() };
}

export async function readReminders() {
  await ensureFile();
  const text = await fs.readFile(config.files.reminders, 'utf8').catch(() => '');
  const lines = text.split(/\r?\n/);
  const history = [];
  lines.forEach((line, lineIndex) => {
    if (!line.trim()) return;
    const split = splitLine(line);
    history.push({
      id: history.length,
      lineIndex,
      timestamp: split.timestamp,
      rawTimestamp: split.rawTimestamp,
      text: split.text || 'Self-care reminder',
      legacy: !split.timestamp,
    });
  });
  history.sort((a, b) => sortableTime(b.timestamp) - sortableTime(a.timestamp));
  history.forEach((entry, index) => {
    entry.id = index;
  });
  return { history, lines };
}

export async function getReminders({ limit = 50 } = {}) {
  const { history } = await readReminders();
  return {
    catalog: REMINDER_CATALOG,
    history: history.slice(0, limit),
    total: history.length,
    last: history[0] || null,
  };
}

export async function addReminder(text = null) {
  const picked = text
    ? { text: stripControlCharacters(text).replace(/\s+/g, ' ').trim().slice(0, 220), emoji: '🌱', id: 'custom' }
    : REMINDER_CATALOG[crypto.randomInt(0, REMINDER_CATALOG.length)];
  const catalogEntry = REMINDER_CATALOG.find((item) => item.text === picked.text);
  const finalText = catalogEntry?.text || picked.text || REMINDER_CATALOG[0].text;
  const timestamp = new Date().toISOString();
  await fs.appendFile(config.files.reminders, `${timestamp} - ${finalText}\n`, 'utf8');
  return {
    reminder: {
      timestamp,
      text: finalText,
      emoji: catalogEntry?.emoji || '🌱',
      id: catalogEntry?.id || 'custom',
    },
  };
}

export async function deleteReminder(id) {
  const { history, lines } = await readReminders();
  const target = history.find((entry) => entry.id === Number(id));
  if (!target) return false;
  await backupFile(config.files.reminders);
  const nextLines = lines.filter((_, index) => index !== target.lineIndex);
  const output = nextLines.join('\n').replace(/\n{3,}/g, '\n\n');
  await fs.writeFile(config.files.reminders, output.trim() ? `${output.replace(/\n+$/, '')}\n` : '', 'utf8');
  return true;
}

export async function clearReminders() {
  await backupFile(config.files.reminders);
  await fs.writeFile(config.files.reminders, '', 'utf8');
}

export async function lastReminder() {
  const { history } = await readReminders();
  return history[0] || null;
}

export function findCatalogReminder(id) {
  return REMINDER_CATALOG.find((item) => item.id === id) || null;
}
