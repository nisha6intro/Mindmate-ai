import express from 'express';
import { asyncHandler, optionalText } from '../utils/validate.js';
import { getKnowledgeDocuments, getVectorStatus, retrieve } from '../services/vectorService.js';

const router = express.Router();

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const q = optionalText(req.query.q, { field: 'q', max: 500 }) || '';
    const [docs, status] = await Promise.all([getKnowledgeDocuments(), getVectorStatus()]);
    if (q) {
      const results = await retrieve(q, { k: 5 });
      return res.json({
        query: q,
        results: results.map((item) => ({ ...item.doc, score: Math.round(item.score * 1000) / 1000 })),
        status,
      });
    }
    return res.json({
      documents: docs,
      count: docs.length,
      status,
      note: 'These are the reference notes MindMate can draw on. They are general wellness information, not a diagnosis or treatment plan.',
    });
  }),
);

export default router;
