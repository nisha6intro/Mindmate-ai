import express from 'express';
import { MOODS } from '../constants.js';
import { asyncHandler, integer, recordBody, ApiError, oneOf } from '../utils/validate.js';
import { rateLimit } from '../utils/rateLimit.js';
import { addMood, buildSummary, deleteMood, getMood, readRawMood } from '../services/moodService.js';

const router = express.Router();

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const range = oneOf(String(req.query.range || 'all'), ['7', '30', 'all'], 'range');
    const limit = req.query.limit === undefined ? 0 : integer(req.query.limit, { field: 'limit', min: 0, max: 5000 });
    const { entries, summary } = await getMood({ range, limit });
    res.json({
      entries,
      summary,
      labels: MOODS,
      range,
      generatedAt: new Date().toISOString(),
    });
  }),
);

router.post(
  '/',
  rateLimit({ windowMs: 60_000, max: 30, keyPrefix: 'mood-write' }),
  asyncHandler(async (req, res) => {
    const body = recordBody(req.body);
    const level = integer(body.mood, { field: 'mood', min: 1, max: 5 });
    const timestamp = body.timestamp === undefined ? null : String(body.timestamp);
    const result = await addMood(level, timestamp);
    res.status(201).json(result);
  }),
);

router.delete(
  '/:id',
  rateLimit({ windowMs: 60_000, max: 30, keyPrefix: 'mood-delete' }),
  asyncHandler(async (req, res) => {
    const id = integer(req.params.id, { field: 'id', min: 0, max: 1000000 });
    const deleted = await deleteMood(id);
    if (!deleted) throw new ApiError(404, 'MOOD_NOT_FOUND', 'That mood check-in could not be found.');
    const { entries } = await readRawMood();
    res.json({ deleted: true, summary: buildSummary(entries) });
  }),
);

export default router;
