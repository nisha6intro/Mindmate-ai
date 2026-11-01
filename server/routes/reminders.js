import express from 'express';
import { asyncHandler, integer, optionalText, recordBody, ApiError } from '../utils/validate.js';
import { rateLimit } from '../utils/rateLimit.js';
import { addReminder, clearReminders, deleteReminder, findCatalogReminder, getReminders } from '../services/reminderService.js';

const router = express.Router();

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const limit = req.query.limit === undefined ? 50 : integer(req.query.limit, { field: 'limit', min: 1, max: 300 });
    const data = await getReminders({ limit });
    res.json(data);
  }),
);

router.post(
  '/',
  rateLimit({ windowMs: 60_000, max: 60, keyPrefix: 'reminders-write' }),
  asyncHandler(async (req, res) => {
    const body = recordBody(req.body);
    let selected = null;
    if (body.reminderId !== undefined) {
      selected = findCatalogReminder(String(body.reminderId));
      if (!selected) throw new ApiError(422, 'VALIDATION_ERROR', 'Unknown reminder.');
    }
    if (body.text !== undefined) {
      selected = { text: optionalText(body.text, { field: 'text', max: 220 }) };
      if (!selected.text) throw new ApiError(422, 'VALIDATION_ERROR', 'Reminder text cannot be empty.');
    }
    const result = await addReminder(selected?.text || null);
    const data = await getReminders({ limit: 50 });
    res.status(201).json({ ...result, last: data.last, catalog: data.catalog });
  }),
);

router.delete(
  '/:id',
  rateLimit({ windowMs: 60_000, max: 30, keyPrefix: 'reminders-delete' }),
  asyncHandler(async (req, res) => {
    const id = integer(req.params.id, { field: 'id', min: 0, max: 1000000 });
    const deleted = await deleteReminder(id);
    if (!deleted) throw new ApiError(404, 'REMINDER_NOT_FOUND', 'That reminder could not be found.');
    res.json({ deleted: true });
  }),
);

router.delete(
  '/',
  rateLimit({ windowMs: 60_000, max: 5, keyPrefix: 'reminders-clear' }),
  asyncHandler(async (_req, res) => {
    await clearReminders();
    res.json({ cleared: true });
  }),
);

export default router;
