import express from 'express';
import { asyncHandler } from '../utils/validate.js';
import { getDashboard } from '../services/dashboardService.js';

const router = express.Router();

router.get(
  '/',
  asyncHandler(async (_req, res) => {
    res.json(await getDashboard());
  }),
);

export default router;
