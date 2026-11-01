import express from 'express';
import { asyncHandler, oneOf, recordBody } from '../utils/validate.js';
import { rateLimit } from '../utils/rateLimit.js';
import { backupFile } from '../utils/jsonStore.js';
import { config } from '../config.js';
import { getAllConversations, deleteAllConversations } from '../services/conversationService.js';
import { clearMemories, getMemories } from '../services/memoryService.js';
import { clearMoodLog, getMood } from '../services/moodService.js';
import { clearReminders, getReminders } from '../services/reminderService.js';
import { getSettings, resetSettings } from '../services/settingsService.js';
import { getVectorStatus } from '../services/vectorService.js';
import { nowIso } from '../utils/dates.js';

const router = express.Router();

router.get(
  '/export',
  asyncHandler(async (_req, res) => {
    const [conversations, mood, reminders, memories, settings, vector] = await Promise.all([
      getAllConversations(),
      getMood(),
      getReminders({ limit: 10000 }),
      getMemories(),
      getSettings(),
      getVectorStatus(),
    ]);
    const payload = {
      app: 'MindMate AI',
      version: '1.0.0',
      exportedAt: nowIso(),
      note: 'This export contains your private wellness data. Store it somewhere safe.',
      settings,
      conversations,
      mood: { entries: mood.allEntries, summary: mood.summary },
      reminders: reminders.history,
      memories,
      knowledge: { documents: vector.documents, mode: vector.mode },
    };
    const stamp = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="mindmate-export-${stamp}.json"`);
    res.send(JSON.stringify(payload, null, 2));
  }),
);

router.post(
  '/reset',
  rateLimit({ windowMs: 60_000, max: 5, keyPrefix: 'data-reset' }),
  asyncHandler(async (req, res) => {
    const body = recordBody(req.body);
    if (body.confirm !== true) {
      return res.status(400).json({ error: { code: 'CONFIRMATION_REQUIRED', message: 'Set "confirm": true to erase data.' } });
    }
    const scope = oneOf(body.scope, ['conversations', 'memories', 'mood', 'reminders', 'settings', 'all'], 'scope');
    const files = [
      config.files.conversations,
      config.files.memory,
      config.files.mood,
      config.files.reminders,
      config.files.settings,
    ];
    for (const file of files) await backupFile(file).catch(() => {});

    const cleared = [];
    if (scope === 'conversations' || scope === 'all') {
      await deleteAllConversations();
      cleared.push('conversations');
    }
    if (scope === 'memories' || scope === 'all') {
      await clearMemories('all');
      cleared.push('memories');
    }
    if (scope === 'mood' || scope === 'all') {
      await clearMoodLog();
      cleared.push('mood');
    }
    if (scope === 'reminders' || scope === 'all') {
      await clearReminders();
      cleared.push('reminders');
    }
    if (scope === 'settings') {
      await resetSettings();
      cleared.push('settings');
    }
    return res.json({
      reset: true,
      scope,
      cleared,
      settings: await getSettings(),
      note: 'A backup was created in data/backups before erasing anything.',
    });
  }),
);

export default router;
