import { createApp } from './app.js';
import { config } from './config.js';
import { ensureDefaults, maybeSeedLegacy } from './services/migrationService.js';
import { checkOllama } from './services/aiService.js';
import { ensureVectorIndex } from './services/vectorService.js';

async function main() {
  await ensureDefaults();
  if (config.seedLegacy) {
    try {
      const report = await maybeSeedLegacy();
      if (report?.chats?.conversations) {
        console.log(`[migration] Imported ${report.chats.conversations} legacy conversation(s).`);
      }
    } catch (error) {
      console.warn('[migration] Legacy seed skipped:', error.message);
    }
  }

  const app = createApp();
  const server = app.listen(config.port, config.host, () => {
    const host = config.host === '0.0.0.0' ? 'localhost' : config.host;
    console.log('');
    console.log('  🧠  MindMate AI is ready');
    console.log(`      http://${host}:${config.port}`);
    console.log(`      Model: ${config.ollama.model}  ·  Data: ${config.dataDir}`);
    console.log('');
  });

  server.on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
      console.error(`Port ${config.port} is already in use. Set PORT in .env or stop the other process.`);
      process.exit(1);
    }
    throw error;
  });

  const shutdown = (signal) => {
    console.log(`\n${signal} received — closing MindMate AI.`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 5000).unref();
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  setTimeout(async () => {
    const health = await checkOllama({ force: true }).catch(() => null);
    if (health?.reachable && health.modelInstalled) {
      ensureVectorIndex().catch(() => {});
      console.log(`[ai] Ollama connected · ${config.ollama.model}`);
    } else if (health) {
      console.warn(`[ai] ${health.error}`);
    }
  }, 1200).unref();

  return server;
}

main().catch((error) => {
  console.error('MindMate AI failed to start:', error);
  process.exit(1);
});
