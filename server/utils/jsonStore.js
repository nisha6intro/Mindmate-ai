import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

const writeQueues = new Map();

function clone(value) {
  return value === undefined ? value : JSON.parse(JSON.stringify(value));
}

/**
 * Serializes read-modify-write cycles for a single JSON file.
 * Prevents two requests from losing each other's changes.
 */
function enqueue(file, task) {
  const previous = writeQueues.get(file) || Promise.resolve();
  const next = previous.then(task, task);
  const settled = next.catch(() => {});
  writeQueues.set(file, settled);
  settled.finally(() => {
    if (writeQueues.get(file) === settled) writeQueues.delete(file);
  });
  return next;
}

export async function readJson(file, fallback) {
  try {
    const raw = await fs.readFile(file, 'utf8');
    if (!raw.trim()) return clone(fallback);
    return JSON.parse(raw);
  } catch (error) {
    if (error.code === 'ENOENT') return clone(fallback);
    if (error instanceof SyntaxError) {
      const backup = `${file}.corrupt-${Date.now()}`;
      await fs.copyFile(file, backup).catch(() => {});
      return clone(fallback);
    }
    throw error;
  }
}

export async function writeJson(file, data) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`;
  await fs.writeFile(temp, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  await fs.rename(temp, file);
}

export function updateJson(file, fallback, updater) {
  return enqueue(file, async () => {
    const current = await readJson(file, fallback);
    const next = await updater(clone(current));
    await writeJson(file, next);
    return next;
  });
}

export async function backupFile(file) {
  try {
    await fs.access(file);
  } catch {
    return null;
  }
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const target = path.join(path.dirname(file), 'backups', `${path.basename(file)}.${stamp}.bak`);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.copyFile(file, target);
  return target;
}

export function newId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${crypto.randomBytes(5).toString('hex')}`;
}
