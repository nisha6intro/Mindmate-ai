import express from 'express';
import { config } from '../config.js';
import { CRISIS_RESOURCES } from '../constants.js';
import { asyncHandler, ApiError, integer, optionalText, text, recordBody } from '../utils/validate.js';
import { rateLimit } from '../utils/rateLimit.js';
import { titleFromMessage } from '../utils/text.js';
import {
  appendMessage,
  createConversation,
  deleteConversation,
  getConversation,
  removeMessages,
  summarize,
} from '../services/conversationService.js';
import { moodContext } from '../services/moodService.js';
import { getSettings, } from '../services/settingsService.js';
import {
  captureFromMessage,
  detectResolution,
  followUpFor,
  recallMemories,
  resolveAllMemories,
} from '../services/memoryService.js';
import { buildSystemPrompt, openChatStream, streamOllama, toneForLevel } from '../services/aiService.js';
import { buildContext } from '../services/vectorService.js';
import { assessRisk, safetyResources } from '../services/safetyService.js';

const router = express.Router();

function startStream(req, res, signalController) {
  res.status(200);
  res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  let closed = false;
  const noteClosed = () => {
    if (!res.writableEnded) {
      closed = true;
      signalController.abort();
    }
  };
  res.on('close', noteClosed);
  // Some browsers stop reading without closing the response immediately.
  // `req` emits `aborted` as soon as the client cancels, which keeps rollback prompt.
  req.on('aborted', noteClosed);

  return {
    send(event) {
      if (closed || res.writableEnded) return false;
      res.write(`${JSON.stringify(event)}\n`);
      return true;
    },
    end() {
      if (!res.writableEnded) res.end();
    },
    isClosed() {
      return closed;
    },
  };
}

async function finish({ conversationId, assistantContent, meta, memoryInfo, mood, followUp, safety = null }) {
  const assistantMessage = await appendMessage(conversationId, {
    role: 'assistant',
    content: assistantContent,
    meta: {
      tone: toneForLevel(mood.currentLevel),
      model: config.ollama.model,
      ...meta,
    },
  });
  const conversation = await getConversation(conversationId);
  return {
    message: assistantMessage,
    conversation: conversation ? summarize(conversation) : null,
    memory: memoryInfo,
    mood,
    followUp,
    safety,
  };
}

router.post(
  '/',
  rateLimit({ windowMs: 60_000, max: 30, keyPrefix: 'chat' }),
  asyncHandler(async (req, res) => {
    const body = recordBody(req.body);
    const message = text(body.message, { field: 'message', min: 1, max: 4000 });
    const requestedId = body.conversationId ? String(body.conversationId).slice(0, 80) : null;
    const turnId = optionalText(body.turnId, { field: 'turnId', max: 80 }) || null;
    const suppliedMood = body.moodLevel === undefined ? null : integer(body.moodLevel, { field: 'moodLevel', min: 1, max: 5 });

    const settings = await getSettings();
    const existing = requestedId ? await getConversation(requestedId) : null;
    if (requestedId && !existing) throw new ApiError(404, 'CONVERSATION_NOT_FOUND', 'That conversation no longer exists.');

    const [mood, recalled] = await Promise.all([
      moodContext(),
      settings.memoryEnabled ? recallMemories(message) : Promise.resolve([]),
    ]);
    const currentLevel = suppliedMood || mood.currentLevel || 3;
    const tone = toneForLevel(currentLevel);
    const followUp = followUpFor(recalled, currentLevel);
    const risk = assessRisk(message);

    // ── Safety override: immediate, human-centred crisis support. ─────────────
    if (risk.isCrisis) {
      let conversation = existing;
      let createdNow = false;
      if (!conversation) {
        conversation = await createConversation({ title: titleFromMessage(message) });
        createdNow = true;
      }
      const userMessage = await appendMessage(conversation.id, {
        role: 'user',
        content: message,
        meta: { moodLevel: currentLevel, safety: true, turnId },
      });
      if (settings.memoryEnabled) {
        try {
          await captureFromMessage(message, { conversationId: conversation.id });
        } catch {
          // Memory capture must never block urgent support.
        }
      }
      const safety = safetyResources();
      const payload = await finish({
        conversationId: conversation.id,
        assistantContent: risk.response,
        meta: { safety: true, override: 'crisis', reason: risk.reason, recalled: recalled.map((item) => item.id) },
        memoryInfo: null,
        mood: { currentLevel, currentMood: mood.currentMood, previousMood: mood.previousMood },
        followUp: 'Are you safe right now?',
        safety: { reason: risk.reason, ...safety, resources: CRISIS_RESOURCES },
      });

      const refreshed = await getConversation(conversation.id);
      const stream = startStream(req, res, new AbortController());
      stream.send({
        type: 'meta',
        conversationId: conversation.id,
        conversation: refreshed ? summarize(refreshed) : null,
        userMessage,
        tone,
        turnId,
        recalled: recalled.map((item) => ({ id: item.id, text: item.text })),
        followUp: 'Are you safe right now?',
        safety: payload.safety,
        override: 'crisis',
      });
      stream.send({ type: 'delta', content: risk.response });
      stream.send({ type: 'done', ...payload });
      stream.end();
      return;
    }

    // ── Normal AI path ────────────────────────────────────────────────────────
    const context = await buildContext(message, { k: 2 });
    const system = buildSystemPrompt({
      moodLevel: currentLevel,
      previousMoodLabel: mood.previousMood,
      recalled,
      context,
      displayName: settings.displayName,
      followUp,
    });

    const priorMessages = (existing?.messages || [])
      .slice(-config.maxContextMessages)
      .filter((item) => item.role === 'user' || item.role === 'assistant')
      .map((item) => ({ role: item.role, content: item.content.slice(0, 4000) }));

    const controller = new AbortController();
    let upstream;
    try {
      upstream = await openChatStream({
        system,
        messages: [...priorMessages, { role: 'user', content: message }],
        signal: controller.signal,
      });
    } catch (error) {
      controller.abort();
      throw error;
    }

    let conversation = existing;
    let createdNow = false;
    try {
      if (!conversation) {
        conversation = await createConversation({ title: titleFromMessage(message) });
        createdNow = true;
      }
      const userMessage = await appendMessage(conversation.id, {
        role: 'user',
        content: message,
        meta: { moodLevel: currentLevel, turnId },
      });

      const stream = startStream(req, res, controller);
      const refreshed = await getConversation(conversation.id);
      stream.send({
        type: 'meta',
        conversationId: conversation.id,
        conversation: refreshed ? summarize(refreshed) : null,
        userMessage,
        assistantMessageId: null,
        tone,
        turnId,
        recalled: recalled.map((item) => ({ id: item.id, text: item.text })),
        followUp,
        safety: null,
      });

      let assistantContent = '';
      try {
        for await (const chunk of streamOllama(upstream)) {
          assistantContent += chunk;
          if (!stream.send({ type: 'delta', content: chunk })) break;
        }
      } catch (error) {
        stream.send({
          type: 'error',
          code: error.code || 'AI_STREAM_ERROR',
          message: error.message || 'The response was interrupted.',
          hint: error.details || 'Try again. If this keeps happening, check that Ollama is running.',
          retryable: true,
        });
        // Roll back this turn so retrying does not duplicate the message.
        await removeMessages(conversation.id, [userMessage.id]).catch(() => {});
        if (createdNow) {
          const check = await getConversation(conversation.id).catch(() => null);
          if (check && check.messages.length === 0) await deleteConversation(conversation.id).catch(() => {});
        }
        stream.end();
        return;
      }

      // The reader left before the reply was complete: leave no half-turn behind.
      if (stream.isClosed()) {
        await removeMessages(conversation.id, [userMessage.id]).catch(() => {});
        if (createdNow) {
          const check = await getConversation(conversation.id).catch(() => null);
          if (check && check.messages.length === 0) await deleteConversation(conversation.id).catch(() => {});
        }
        return;
      }

      const clean = assistantContent.trim();
      if (!clean) {
        stream.send({
          type: 'error',
          code: 'EMPTY_RESPONSE',
          message: 'MindMate did not return a response.',
          hint: 'Try again, or check the model in Ollama.',
          retryable: true,
        });
        await removeMessages(conversation.id, [userMessage.id]).catch(() => {});
        stream.end();
        return;
      }

      let memoryInfo = { added: null, resolved: 0 };
      if (settings.memoryEnabled) {
        try {
          if (detectResolution(message)) {
            const resolved = await resolveAllMemories();
            memoryInfo = { added: null, resolved };
          } else {
            const captured = await captureFromMessage(message, { conversationId: conversation.id });
            memoryInfo = { added: captured?.created ? captured.memory : null, resolved: 0 };
          }
        } catch {
          memoryInfo = { added: null, resolved: 0 };
        }
      }

      let payload;
      try {
        payload = await finish({
          conversationId: conversation.id,
          assistantContent: clean,
          meta: { recalled: recalled.map((item) => item.id), incomplete: false },
          memoryInfo,
          mood: { currentLevel, currentMood: mood.currentMood, previousMood: mood.previousMood },
          followUp,
        });
      } catch (error) {
        stream.send({
          type: 'error',
          code: 'SAVE_FAILED',
          message: 'Your message was received, but the reply could not be saved.',
          hint: error.message,
          retryable: false,
        });
        stream.end();
        return;
      }
      stream.send({ type: 'done', ...payload });
      stream.end();
    } catch (error) {
      try {
        await upstream.body?.cancel();
      } catch {
        // ignore
      }
      controller.abort();
      throw error;
    }
  }),
);

export default router;
