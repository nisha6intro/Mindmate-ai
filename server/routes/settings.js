import express from 'express';
import { asyncHandler, integer, oneOf, recordBody, text, boolean, ApiError } from '../utils/validate.js';
import { rateLimit } from '../utils/rateLimit.js';
import { getSettings, resetSettings, updateSettings } from '../services/settingsService.js';

const router = express.Router();

function validatePatch(body) {
  const patch = {};
  if (body.displayName !== undefined) patch.displayName = text(body.displayName, { field: 'displayName', min: 1, max: 40 });
  if (body.theme !== undefined) patch.theme = oneOf(body.theme, ['light', 'dark', 'system'], 'theme');
  if (body.memoryEnabled !== undefined) patch.memoryEnabled = boolean(body.memoryEnabled, { field: 'memoryEnabled' });
  if (body.reminderNotifications !== undefined) patch.reminderNotifications = boolean(body.reminderNotifications, { field: 'reminderNotifications' });
  if (body.reduceMotion !== undefined) patch.reduceMotion = boolean(body.reduceMotion, { field: 'reduceMotion' });
  if (!Object.keys(patch).length) throw new ApiError(422, 'VALIDATION_ERROR', 'No supported settings were provided.');
  return patch;
}

router.get(
  '/',
  asyncHandler(async (_req, res) => {
    res.json({ settings: await getSettings() });
  }),
);

router.patch(
  '/',
  rateLimit({ windowMs: 60_000, max: 60, keyPrefix: 'settings-write' }),
  asyncHandler(async (req, res) => {
    const body = recordBody(req.body);
    const patch = validatePatch(body);
    const settings = await updateSettings(patch);
    res.json({ settings });
  }),
);

router.post(
  '/reset',
  rateLimit({ windowMs: 60_000, max: 5, keyPrefix: 'settings-reset' }),
  asyncHandler(async (req, res) => {
    const body = recordBody(req.body);
    if (body.confirm !== true) throw new ApiError(400, 'CONFIRMATION_REQUIRED', 'Set "confirm": true to reset settings.');
    const settings = await resetSettings();
    res.json({ reset: true, settings });
  }),
);

export default router;
