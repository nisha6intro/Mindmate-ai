import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

export const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: path.join(PROJECT_ROOT, '.env') });

const resolveFromRoot = (value, fallback) => {
  const candidate = value && value.trim() ? value.trim() : fallback;
  return path.isAbsolute(candidate) ? candidate : path.resolve(PROJECT_ROOT, candidate);
};

const bool = (value, fallback) => {
  if (value === undefined || value === '') return fallback;
  return !['0', 'false', 'no', 'off'].includes(String(value).toLowerCase());
};

const int = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

// On Vercel the deployment bundle is read-only; only /tmp is writable. Use it
// automatically so a missing DATA_DIR does not break the first request.
const defaultDataDir = process.env.VERCEL ? '/tmp/mindmate' : path.join(PROJECT_ROOT, 'data');

export const DATA_DIR = resolveFromRoot(process.env.DATA_DIR, defaultDataDir);
export const PUBLIC_DIR = path.join(PROJECT_ROOT, 'public');
export const BACKUP_DIR = path.join(DATA_DIR, 'backups');

export const config = {
  projectRoot: PROJECT_ROOT,
  publicDir: PUBLIC_DIR,
  dataDir: DATA_DIR,
  backupDir: BACKUP_DIR,
  host: process.env.HOST || '127.0.0.1',
  port: int(process.env.PORT, 3000),
  env: process.env.NODE_ENV || 'development',
  isTest: process.env.NODE_ENV === 'test' || process.env.MINDMATE_TEST === '1',
  seedLegacy: bool(process.env.SEED_LEGACY, true),
  maxContextMessages: Math.max(4, int(process.env.MAX_CONTEXT_MESSAGES, 12)),
  ollama: {
    baseUrl: (process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434').replace(/\/+$/, ''),
    model: process.env.OLLAMA_MODEL || 'phi-mindmate',
    embedModel: process.env.OLLAMA_EMBED_MODEL || 'nomic-embed-text',
    timeoutMs: Math.max(5000, int(process.env.OLLAMA_TIMEOUT_MS, 60000)),
  },
  files: {
    conversations: path.join(DATA_DIR, 'conversations.json'),
    memory: path.join(DATA_DIR, 'memory.json'),
    mood: path.join(DATA_DIR, 'mood_logs.csv'),
    reminders: path.join(DATA_DIR, 'reminders.txt'),
    settings: path.join(DATA_DIR, 'settings.json'),
    knowledge: path.join(DATA_DIR, 'knowledge.json'),
    vectorIndex: path.join(DATA_DIR, 'vector_index.json'),
    legacy: path.join(DATA_DIR, 'legacy'),
  },
};

export function ensureDataDirs() {
  for (const dir of [config.dataDir, config.backupDir, config.files.legacy]) {
    fs.mkdirSync(dir, { recursive: true });
  }
}
