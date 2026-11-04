/**
 * Vercel serverless entry point.
 *
 * Vercel serves `public/` as static assets and forwards `/api/*` here through
 * `vercel.json`. There is no long-running process on Vercel, so the same
 * Express app is exported as the request handler instead of calling listen().
 *
 * Limits to know about:
 * - The filesystem is ephemeral. Only `/tmp` is writable and it resets on cold
 *   starts, so set DATA_DIR=/tmp/mindmate and treat stored data as temporary
 *   unless you replace the JSON storage layer with a database.
 * - Ollama cannot run inside Vercel. OLLAMA_BASE_URL must be a public HTTPS
 *   endpoint (a tunnel to your own machine, or a GPU host).
 * - A reply is streamed for as long as the model takes; keep
 *   OLLAMA_TIMEOUT_MS below the function's maxDuration.
 */
import { config } from '../server/config.js';
import { createApp } from '../server/app.js';
import { ensureDefaults, maybeSeedLegacy } from '../server/services/migrationService.js';

const app = createApp();

// Cold starts get no startup hook, so initialise once per instance and let
// every request await the same promise.
const ready = (async () => {
  await ensureDefaults();
  if (config.seedLegacy) {
    try {
      await maybeSeedLegacy();
    } catch (error) {
      console.warn('[migration] Legacy seed skipped:', error.message);
    }
  }
})();

export default async function handler(req, res) {
  await ready;
  return app(req, res);
}
