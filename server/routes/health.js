import express from 'express';
import { asyncHandler } from '../utils/validate.js';
import { checkOllama } from '../services/aiService.js';
import { getVectorStatus, ensureVectorIndex } from '../services/vectorService.js';
import { conversationStats } from '../services/conversationService.js';
import { memoryCounts } from '../services/memoryService.js';
import { getMood } from '../services/moodService.js';
import { getReminders } from '../services/reminderService.js';
import { getSettings } from '../services/settingsService.js';
import { DISCLAIMER } from '../constants.js';

const router = express.Router();

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const force = req.query.refresh === '1';
    const [ollama, vector, conversations, memories, mood, reminders, settings] = await Promise.all([
      checkOllama({ force }),
      getVectorStatus(),
      conversationStats(),
      memoryCounts(),
      getMood({ limit: 1 }),
      getReminders({ limit: 1 }),
      getSettings(),
    ]);

    if (ollama.modelInstalled && vector.mode !== 'embeddings') {
      ensureVectorIndex().catch(() => {});
    }

    const aiReady = ollama.reachable && ollama.modelInstalled;
    res.json({
      status: aiReady ? 'ok' : 'degraded',
      app: { name: 'MindMate AI', version: '1.0.0', uptimeSeconds: Math.round(process.uptime()) },
      ai: {
        ready: aiReady,
        reachable: ollama.reachable,
        model: ollama.model,
        modelInstalled: ollama.modelInstalled,
        models: ollama.models,
        error: ollama.error,
        detail: ollama.detail || null,
        checkedAt: ollama.checkedAt,
      },
      vector,
      storage: {
        conversations: conversations.conversations,
        messages: conversations.messages,
        memories,
        moodCheckins: mood.summary.total,
        reminders: reminders.total,
      },
      settings: { displayName: settings.displayName, memoryEnabled: settings.memoryEnabled, theme: settings.theme },
      disclaimer: DISCLAIMER,
      time: new Date().toISOString(),
    });
  }),
);

export default router;
