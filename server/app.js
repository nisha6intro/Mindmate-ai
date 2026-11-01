import path from 'node:path';
import express from 'express';
import { config } from './config.js';
import { ApiError } from './utils/validate.js';
import { requireJson } from './utils/validate.js';
import { rateLimit } from './utils/rateLimit.js';
import chatRoutes from './routes/chat.js';
import conversationRoutes from './routes/conversations.js';
import moodRoutes from './routes/mood.js';
import reminderRoutes from './routes/reminders.js';
import memoryRoutes from './routes/memory.js';
import settingsRoutes from './routes/settings.js';
import dashboardRoutes from './routes/dashboard.js';
import healthRoutes from './routes/health.js';
import safetyRoutes from './routes/safety.js';
import knowledgeRoutes from './routes/knowledge.js';
import dataRoutes from './routes/data.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('etag', 'strong');

  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), interest-cohort=()');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    res.setHeader(
      'Content-Security-Policy',
      [
        "default-src 'self'",
        "script-src 'self'",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data:",
        "font-src 'self'",
        "connect-src 'self'",
        "media-src 'self'",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
        "frame-ancestors 'none'",
      ].join('; '),
    );
    if (req.path.startsWith('/api/')) res.setHeader('Cache-Control', 'no-store');
    next();
  });

  app.use(express.json({ limit: '64kb', strict: true }));
  app.use('/api', requireJson);
  app.use('/api', rateLimit({ windowMs: 60_000, max: config.isTest ? 10_000 : 360, keyPrefix: 'api' }));

  app.use('/api/chat', chatRoutes);
  app.use('/api/conversations', conversationRoutes);
  app.use('/api/mood', moodRoutes);
  app.use('/api/reminders', reminderRoutes);
  app.use('/api/memory', memoryRoutes);
  app.use('/api/settings', settingsRoutes);
  app.use('/api/dashboard', dashboardRoutes);
  app.use('/api/health', healthRoutes);
  app.use('/api/safety', safetyRoutes);
  app.use('/api/knowledge', knowledgeRoutes);
  app.use('/api/data', dataRoutes);

  app.get('/api', (_req, res) => {
    res.json({
      name: 'MindMate AI API',
      version: '1.0.0',
      endpoints: [
        'POST /api/chat',
        'GET /api/conversations',
        'GET /api/conversations/:id',
        'DELETE /api/conversations/:id',
        'GET /api/mood',
        'POST /api/mood',
        'GET /api/reminders',
        'POST /api/reminders',
        'GET /api/memory',
        'DELETE /api/memory',
        'GET /api/dashboard',
        'GET /api/settings',
        'PATCH /api/settings',
        'GET /api/health',
        'GET /api/safety',
        'GET /api/knowledge',
        'GET /api/data/export',
        'POST /api/data/reset',
      ],
    });
  });

  app.use('/api', (req, _res, next) => {
    next(new ApiError(404, 'NOT_FOUND', `No API route matches ${req.method} ${req.originalUrl}.`));
  });

  const staticOptions = {
    index: false,
    maxAge: config.env === 'production' ? '1h' : 0,
    setHeaders(res, filePath) {
      if (filePath.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache');
      if (filePath.includes(`${path.sep}vendor${path.sep}`)) res.setHeader('Cache-Control', 'public, max-age=604800, immutable');
    },
  };
  app.use(express.static(config.publicDir, staticOptions));

  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    if (!req.accepts('html')) return next();
    res.setHeader('Cache-Control', 'no-cache');
    return res.sendFile(path.join(config.publicDir, 'index.html'));
  });

  app.use((req, res) => {
    res.status(404).type('text/plain').send('Not found');
  });

  app.use((error, req, res, next) => {
    if (res.headersSent) {
      if (!res.writableEnded) res.end();
      return;
    }
    const status = error instanceof ApiError ? error.status : error.status || 500;
    const code = error instanceof ApiError ? error.code : 'INTERNAL_ERROR';
    const message =
      error instanceof ApiError
        ? error.message
        : status >= 500
          ? 'Something went wrong on the server. Please try again.'
          : error.message;

    if (status >= 500 && !config.isTest) {
      console.error(`[${req.method} ${req.originalUrl}]`, error);
    }

    const payload = {
      error: {
        code,
        message,
        ...(error instanceof ApiError && error.details ? { hint: error.details } : {}),
      },
    };
    if (req.path.startsWith('/api')) res.status(status).json(payload);
    else res.status(status).type('text/plain').send(message);
  });

  return app;
}
