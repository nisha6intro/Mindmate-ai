import express from 'express';
import { asyncHandler, integer, text, optionalText, recordBody, ApiError } from '../utils/validate.js';
import { rateLimit } from '../utils/rateLimit.js';
import {
  clearConversation,
  createConversation,
  deleteConversation,
  getConversation,
  listConversations,
  renameConversation,
  summarize,
} from '../services/conversationService.js';

const router = express.Router();

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const limit = req.query.limit === undefined ? 100 : integer(req.query.limit, { field: 'limit', min: 1, max: 500 });
    const offset = req.query.offset === undefined ? 0 : integer(req.query.offset, { field: 'offset', min: 0, max: 100000 });
    const q = optionalText(req.query.q, { field: 'q', max: 200 }) || '';
    const result = await listConversations({ q, limit, offset });
    res.json(result);
  }),
);

router.post(
  '/',
  rateLimit({ windowMs: 60_000, max: 30, keyPrefix: 'conversations-create' }),
  asyncHandler(async (req, res) => {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const title = optionalText(body.title, { field: 'title', max: 80 }) || 'New conversation';
    const conversation = await createConversation({ title });
    res.status(201).json({ conversation });
  }),
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const conversation = await getConversation(String(req.params.id));
    if (!conversation) throw new ApiError(404, 'CONVERSATION_NOT_FOUND', 'That conversation could not be found.');
    res.json({ conversation });
  }),
);

router.patch(
  '/:id',
  rateLimit({ windowMs: 60_000, max: 60, keyPrefix: 'conversations-write' }),
  asyncHandler(async (req, res) => {
    const body = recordBody(req.body);
    const title = text(body.title, { field: 'title', min: 1, max: 80 });
    const conversation = await renameConversation(String(req.params.id), title);
    if (!conversation) throw new ApiError(404, 'CONVERSATION_NOT_FOUND', 'That conversation could not be found.');
    res.json({ conversation, summary: summarize(conversation) });
  }),
);

router.delete(
  '/:id/messages',
  rateLimit({ windowMs: 60_000, max: 30, keyPrefix: 'conversations-clear' }),
  asyncHandler(async (req, res) => {
    const conversation = await getConversation(String(req.params.id));
    if (!conversation) throw new ApiError(404, 'CONVERSATION_NOT_FOUND', 'That conversation could not be found.');
    await clearConversation(conversation.id);
    res.json({ cleared: true, conversationId: conversation.id });
  }),
);

router.delete(
  '/:id',
  rateLimit({ windowMs: 60_000, max: 30, keyPrefix: 'conversations-delete' }),
  asyncHandler(async (req, res) => {
    const conversation = await getConversation(String(req.params.id));
    if (!conversation) throw new ApiError(404, 'CONVERSATION_NOT_FOUND', 'That conversation could not be found.');
    await deleteConversation(conversation.id);
    res.json({ deleted: true, conversationId: conversation.id });
  }),
);

export default router;
