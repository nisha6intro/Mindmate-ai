import express from 'express';
import { asyncHandler, integer, oneOf, recordBody, text, optionalText } from '../utils/validate.js';
import { rateLimit } from '../utils/rateLimit.js';
import {
  addMemory,
  clearMemories,
  deleteMemory,
  getMemories,
  recallMemories,
  reopenMemory,
  resolveMemory,
} from '../services/memoryService.js';
import { getSettings } from '../services/settingsService.js';

const router = express.Router();

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const status = oneOf(String(req.query.status || 'all'), ['all', 'active', 'resolved'], 'status');
    const q = optionalText(req.query.q, { field: 'q', max: 200 }) || '';
    const [data, settings] = await Promise.all([getMemories({ status, q }), getSettings()]);
    res.json({ ...data, memoryEnabled: settings.memoryEnabled });
  }),
);

router.get(
  '/recall',
  asyncHandler(async (req, res) => {
    const q = optionalText(req.query.q, { field: 'q', max: 500 }) || '';
    const memories = await recallMemories(q, 5);
    res.json({ memories });
  }),
);

router.post(
  '/',
  rateLimit({ windowMs: 60_000, max: 30, keyPrefix: 'memory-write' }),
  asyncHandler(async (req, res) => {
    const body = recordBody(req.body);
    const value = text(body.text, { field: 'text', min: 3, max: 500 });
    const result = await addMemory(value, { source: 'manual' });
    const data = await getMemories();
    res.status(201).json({ ...result, counts: data.counts, active: data.active });
  }),
);

router.patch(
  '/:id',
  rateLimit({ windowMs: 60_000, max: 60, keyPrefix: 'memory-update' }),
  asyncHandler(async (req, res) => {
    const body = recordBody(req.body);
    const status = oneOf(body.status, ['active', 'resolved'], 'status');
    const memory = status === 'resolved' ? await resolveMemory(String(req.params.id)) : await reopenMemory(String(req.params.id));
    if (!memory) return res.status(404).json({ error: { code: 'MEMORY_NOT_FOUND', message: 'That memory could not be found.' } });
    const data = await getMemories();
    return res.json({ memory, counts: data.counts });
  }),
);

router.delete(
  '/:id',
  rateLimit({ windowMs: 60_000, max: 30, keyPrefix: 'memory-delete' }),
  asyncHandler(async (req, res) => {
    const deleted = await deleteMemory(String(req.params.id));
    if (!deleted) return res.status(404).json({ error: { code: 'MEMORY_NOT_FOUND', message: 'That memory could not be found.' } });
    const data = await getMemories();
    return res.json({ deleted: true, counts: data.counts });
  }),
);

router.delete(
  '/',
  rateLimit({ windowMs: 60_000, max: 5, keyPrefix: 'memory-clear' }),
  asyncHandler(async (req, res) => {
    const scope = oneOf(String(req.query.scope || 'all'), ['all', 'active', 'resolved'], 'scope');
    await clearMemories(scope);
    const data = await getMemories();
    res.json({ cleared: true, scope, counts: data.counts });
  }),
);

export default router;
