import express from 'express';
import { asyncHandler, text, recordBody } from '../utils/validate.js';
import { rateLimit } from '../utils/rateLimit.js';
import { assessRisk, safetyResources } from '../services/safetyService.js';

const router = express.Router();

router.get(
  '/',
  asyncHandler(async (_req, res) => {
    res.json(safetyResources());
  }),
);

router.post(
  '/check',
  rateLimit({ windowMs: 60_000, max: 60, keyPrefix: 'safety-check' }),
  asyncHandler(async (req, res) => {
    const body = recordBody(req.body);
    const message = text(body.message, { field: 'message', max: 4000 });
    const risk = assessRisk(message);
    res.json({ isCrisis: risk.isCrisis, reason: risk.reason, ...(risk.isCrisis ? { resources: safetyResources().resources } : {}) });
  }),
);

export default router;
