import fs from 'node:fs/promises';
import path from 'node:path';
import { config, ensureDataDirs } from '../config.js';
import { CURATED_KNOWLEDGE, ORIGINAL_VECTOR_DOCS, TRAINING_DOCS } from '../data/knowledgeSeed.js';
import { backupFile, newId, readJson, writeJson } from '../utils/jsonStore.js';
import { csvEscape, parseCsv } from '../utils/csv.js';
import { nowIso, parseTimestamp, shortDate, sortableTime } from '../utils/dates.js';
import { titleFromMessage } from '../utils/text.js';
import { appendMessage, createConversation, getAllConversations } from './conversationService.js';
import { getMemories, addMemory, clearMemories } from './memoryService.js';
import { getSettings } from './settingsService.js';

async function exists(target) {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

async function copyIfMissing(source, target) {
  if (await exists(target)) return false;
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.copyFile(source, target);
  return true;
}

async function extractChromaDocs(dbPath) {
  if (!(await exists(dbPath))) return [];
  try {
    const { DatabaseSync } = await import('node:sqlite');
    const db = new DatabaseSync(dbPath, { readOnly: true });
    const rows = db
      .prepare(
        `SELECT e.embedding_id AS embedding_id, m.string_value AS document
         FROM embedding_metadata m
         JOIN embeddings e ON e.id = m.id
         WHERE m.key = 'chroma:document'`,
      )
      .all();
    db.close();
    return rows
      .filter((row) => row.document && String(row.document).trim())
      .map((row, index) => ({
        id: `chroma-${row.embedding_id || index}`,
        title: `Migrated memory ${index + 1}`,
        text: String(row.document).trim(),
        source: 'chroma:original',
        tags: ['migrated', 'encouragement'],
      }));
  } catch (error) {
    console.warn('[migration] Chroma extraction skipped:', error.message);
    return [];
  }
}

function trainingDocsFromJsonl(content) {
  return String(content || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      try {
        const item = JSON.parse(line);
        const prompt = String(item.prompt || '').replace(/^User:\s*/i, '').replace(/\nAI:\s*$/i, '').trim();
        const completion = String(item.completion || '').trim();
        if (!prompt || !completion) return null;
        return {
          title: prompt.slice(0, 100),
          text: completion,
          source: 'training:phi-mindmate',
          tags: ['training'],
        };
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .map((doc, index) => ({ ...doc, id: `train-${index + 1}` }));
}

function dedupeDocs(docs) {
  const seen = new Set();
  return docs.filter((doc) => {
    const key = String(doc.text || '').toLowerCase().replace(/\s+/g, ' ').trim();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function buildKnowledgeFile(sourceDir = null) {
  const originals = sourceDir
    ? await extractChromaDocs(path.join(sourceDir, 'vectorstore', 'chroma.sqlite3'))
    : [];
  const chroma = originals.length ? originals : ORIGINAL_VECTOR_DOCS;
  let training = TRAINING_DOCS;
  if (sourceDir) {
    const trainingPath = path.join(sourceDir, 'training', 'training-data.jsonl');
    try {
      const raw = await fs.readFile(trainingPath, 'utf8');
      const parsed = trainingDocsFromJsonl(raw);
      if (parsed.length) training = parsed;
    } catch {
      // Seed training docs are already available.
    }
  }
  const documents = dedupeDocs([...chroma, ...training, ...CURATED_KNOWLEDGE]);
  const data = {
    version: 1,
    generatedAt: nowIso(),
    notes:
      'Migrated from the original Chroma store and training data, plus general wellness reference notes. Used for optional retrieval only.',
    documents,
  };
  await writeJson(config.files.knowledge, data);
  return documents;
}

async function mergeMood(sourcePath) {
  const target = config.files.mood;
  if (!(await exists(target))) {
    await copyIfMissing(sourcePath, target);
    return { copied: true, added: 0 };
  }
  const sourceText = await fs.readFile(sourcePath, 'utf8');
  const targetText = await fs.readFile(target, 'utf8');
  const sourceRows = parseCsv(sourceText);
  const targetRows = parseCsv(targetText);
  const sourceHasHeader = /mood/i.test(sourceRows[0]?.join(',') || '');
  const targetHasHeader = /mood/i.test(targetRows[0]?.join(',') || '');
  const sourceData = sourceHasHeader ? sourceRows.slice(1) : sourceRows;
  const targetData = targetHasHeader ? targetRows.slice(1) : targetRows;
  const keys = new Set(targetData.map((row) => `${row[0]}|${row[1]}`));
  const additions = sourceData.filter((row) => row.length >= 2 && !keys.has(`${row[0]}|${row[1]}`));
  if (!additions.length) return { copied: false, added: 0 };
  const header = targetHasHeader ? targetRows[0] : ['timestamp', 'mood'];
  const lines = [header.map(csvEscape).join(','), ...targetData.map((row) => row.map(csvEscape).join(','))];
  for (const row of additions) lines.push(row.map(csvEscape).join(','));
  await backupFile(target);
  await fs.writeFile(target, `${lines.join('\n')}\n`, 'utf8');
  return { copied: false, added: additions.length };
}

async function mergeReminderFile(sourcePath) {
  const target = config.files.reminders;
  if (!(await exists(target))) {
    await copyIfMissing(sourcePath, target);
    return { copied: true, added: 0 };
  }
  const sourceLines = (await fs.readFile(sourcePath, 'utf8')).split(/\r?\n/).filter((line) => line.trim());
  const targetText = await fs.readFile(target, 'utf8');
  const targetLines = targetText.split(/\r?\n/).filter((line) => line.trim());
  const keys = new Set(targetLines);
  const additions = sourceLines.filter((line) => !keys.has(line));
  if (!additions.length) return { copied: false, added: 0 };
  await backupFile(target);
  const output = [...targetLines, ...additions].join('\n');
  await fs.writeFile(target, `${output}\n`, 'utf8');
  return { copied: false, added: additions.length };
}

function importTitle(dateIso, index) {
  const parsed = parseTimestamp(dateIso);
  return parsed ? `Past conversation · ${shortDate(parsed.iso).split(',')[0]}` : `Past conversation ${index + 1}`;
}

async function importChatLogs(sourceChatDir) {
  const report = { files: 0, conversations: 0, messages: 0, skipped: 0 };
  if (!(await exists(sourceChatDir))) return report;
  const files = (await fs.readdir(sourceChatDir, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
    .map((entry) => entry.name)
    .sort();
  const existing = await getAllConversations();
  const importedSources = new Set(existing.map((conversation) => conversation.source).filter(Boolean));

  for (const file of files) {
    report.files += 1;
    const sourcePath = path.join(sourceChatDir, file);
    const sourceKey = `chat_logs/${file}`;
    if (importedSources.has(sourceKey)) {
      report.skipped += 1;
      continue;
    }
    let logs;
    try {
      logs = JSON.parse(await fs.readFile(sourcePath, 'utf8'));
    } catch {
      report.skipped += 1;
      continue;
    }
    if (!Array.isArray(logs) || !logs.length) {
      report.skipped += 1;
      continue;
    }
    const valid = logs.filter((item) => item && typeof item.user === 'string' && typeof item.bot === 'string');
    if (!valid.length) {
      report.skipped += 1;
      continue;
    }
    const firstTime = parseTimestamp(valid[0].timestamp)?.iso || nowIso();
    const conversation = await createConversation({
      title: importTitle(firstTime, report.conversations),
      legacy: true,
      source: sourceKey,
      createdAt: firstTime,
    });
    for (const item of valid) {
      const millis = parseTimestamp(item.timestamp);
      const timestamp = millis ? millis.iso : null;
      await appendMessage(conversation.id, { role: 'user', content: item.user.trim(), createdAt: timestamp });
      if (item.bot.trim()) {
        await appendMessage(conversation.id, {
          role: 'assistant',
          content: item.bot.trim(),
          createdAt: timestamp,
          meta: { imported: true },
        });
      }
      report.messages += item.bot.trim() ? 2 : 1;
    }
    report.conversations += 1;
  }
  return report;
}

async function importMemory(sourcePath) {
  if (!(await exists(sourcePath))) return { imported: 0 };
  let raw;
  try {
    raw = JSON.parse(await fs.readFile(sourcePath, 'utf8'));
  } catch {
    return { imported: 0 };
  }
  const texts = Array.isArray(raw?.context)
    ? raw.context
    : Array.isArray(raw?.memories)
      ? raw.memories.map((item) => item.text)
      : [];
  const existing = await getMemories();
  const known = new Set(existing.memories.map((item) => item.text.toLowerCase()));
  let imported = 0;
  for (const value of texts) {
    const text = String(value || '').trim();
    if (!text || known.has(text.toLowerCase())) continue;
    await addMemory(text, { source: 'legacy' });
    known.add(text.toLowerCase());
    imported += 1;
  }
  return { imported };
}

async function preserveSourceFiles(sourceDir) {
  const report = { files: 0 };
  const legacyDir = config.files.legacy;
  const copyMap = [
    ['mood_logs.csv', 'mood_logs.csv', true],
    ['reminders.txt', 'reminders.txt', true],
    ['memory.json', 'memory.json', true],
    ['chat_logs', 'chat_logs', true],
    ['training', 'training', true],
    ['ai_modules', 'ai_modules', true],
    ['src', 'src', true],
    ['ui', 'ui', true],
    ['requirements.txt', 'requirements.txt', true],
    ['vectorstore/chroma.sqlite3', 'vectorstore/chroma.sqlite3', true],
  ];
  for (const [from, to, recursive] of copyMap) {
    const source = path.join(sourceDir, from);
    const target = path.join(legacyDir, to);
    if (!(await exists(source)) || (await exists(target))) continue;
    await fs.mkdir(path.dirname(target), { recursive: true });
    if (recursive) {
      await fs.cp(source, target, { recursive: true, errorOnExist: false, force: false });
    } else {
      await fs.copyFile(source, target);
    }
    report.files += 1;
  }
  const manifestPath = path.join(legacyDir, 'manifest.json');
  const previous = await readJson(manifestPath, { imports: [] });
  previous.imports = previous.imports || [];
  previous.imports.push({
    importedAt: nowIso(),
    sourceDir,
    note: 'Original Python/Streamlit files were copied here for provenance. Working app data lives in the parent data folder.',
  });
  await writeJson(manifestPath, previous);
  return report;
}

function normalizeSourceDir(sourceDir) {
  return path.basename(sourceDir).toLowerCase() === 'mindmate_ai' ? sourceDir : sourceDir;
}

/**
 * Safely imports a legacy MindMate Python project. Never deletes original files.
 * Existing working data is merged, not overwritten.
 */
export async function importLegacy(sourceDir, { copySource = true, includeMemory = true, resetKnowledge = false } = {}) {
  ensureDataDirs();
  const resolved = path.resolve(sourceDir);
  if (!(await exists(resolved))) throw new Error(`Legacy folder not found: ${resolved}`);
  const report = {
    source: resolved,
    importedAt: nowIso(),
    preserved: { files: 0 },
    knowledge: { documents: 0 },
    mood: null,
    reminders: null,
    memory: null,
    chats: null,
    warnings: [],
  };

  const nested = path.join(resolved, 'mindmate_ai');
  const root = (await exists(nested)) ? nested : resolved;

  if (copySource) {
    try {
      report.preserved = await preserveSourceFiles(root);
    } catch (error) {
      report.warnings.push(`Could not preserve source files: ${error.message}`);
    }
  }

  try {
    const knowledgePath = config.files.knowledge;
    if (resetKnowledge || !(await exists(knowledgePath))) {
      const docs = await buildKnowledgeFile(root);
      report.knowledge.documents = docs.length;
    } else {
      const existing = await readJson(knowledgePath, { documents: [] });
      report.knowledge.documents = existing.documents?.length || 0;
    }
  } catch (error) {
    report.warnings.push(`Knowledge import warning: ${error.message}`);
  }

  const moodPath = path.join(root, 'data', 'mood_logs.csv');
  if (await exists(moodPath)) {
    try {
      report.mood = await mergeMood(moodPath);
    } catch (error) {
      report.warnings.push(`Mood import failed: ${error.message}`);
    }
  }

  const reminderPath = path.join(root, 'reminders.txt');
  if (await exists(reminderPath)) {
    try {
      report.reminders = await mergeReminderFile(reminderPath);
    } catch (error) {
      report.warnings.push(`Reminder import failed: ${error.message}`);
    }
  }

  const memoryPath = path.join(root, 'memory.json');
  if (includeMemory && (await exists(memoryPath))) {
    try {
      report.memory = await importMemory(memoryPath);
    } catch (error) {
      report.warnings.push(`Memory import failed: ${error.message}`);
    }
  }

  const chatDir = path.join(root, 'chat_logs');
  if (await exists(chatDir)) {
    try {
      report.chats = await importChatLogs(chatDir);
    } catch (error) {
      report.warnings.push(`Chat import failed: ${error.message}`);
    }
  }

  await getSettings();
  await writeJson(path.join(config.files.legacy, 'import-report.json'), report);
  return report;
}

/** Create safe, empty defaults when a file is missing. */
export async function ensureDefaults() {
  ensureDataDirs();
  await getSettings();
  if (!(await exists(config.files.knowledge))) {
    await buildKnowledgeFile(null);
  }
  if (!(await exists(config.files.memory))) {
    await writeJson(config.files.memory, { version: 2, memories: [] });
  }
  if (!(await exists(config.files.mood))) {
    await fs.writeFile(config.files.mood, 'timestamp,mood\n', 'utf8');
  }
  if (!(await exists(config.files.reminders))) {
    await fs.writeFile(config.files.reminders, '', 'utf8');
  }
  if (!(await exists(config.files.conversations))) {
    await writeJson(config.files.conversations, { version: 1, conversations: [] });
  }
}

export async function maybeSeedLegacy() {
  if (!config.seedLegacy) return null;
  const legacyChats = path.join(config.files.legacy, 'chat_logs');
  if (!(await exists(legacyChats))) return null;
  const store = await readJson(config.files.conversations, { conversations: [] });
  if (store.conversations?.length) return null;
  return importLegacy(config.files.legacy, { copySource: false, includeMemory: true, resetKnowledge: false });
}

/** Replace all memories with a fresh copy of the legacy context (used only by an explicit reset). */
export async function restoreLegacyMemories() {
  const memoryPath = path.join(config.files.legacy, 'memory.json');
  if (!(await exists(memoryPath))) return 0;
  await clearMemories('all');
  const result = await importMemory(memoryPath);
  return result.imported;
}
