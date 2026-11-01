import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startMockOllama } from './mockOllama.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

async function waitFor(url, attempts = 80) {
  let lastError;
  for (let i = 0; i < attempts; i += 1) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(1000) });
      if (res.ok) return res;
      lastError = new Error(`HTTP ${res.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw lastError || new Error('Server did not start');
}

async function stop(child) {
  if (!child || child.exitCode !== null) return;
  child.kill('SIGTERM');
  await Promise.race([
    new Promise((resolve) => child.once('exit', resolve)),
    new Promise((resolve) => setTimeout(resolve, 3000)),
  ]);
  if (child.exitCode === null) child.kill('SIGKILL');
}

test('MindMate REST API works end-to-end with a mocked Ollama', async (t) => {
  const mock = await startMockOllama();
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mindmate-test-'));
  const port = await freePort();
  const base = `http://127.0.0.1:${port}`;
  const logs = [];
  const child = spawn(process.execPath, ['server/server.js'], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(port),
      HOST: '127.0.0.1',
      NODE_ENV: 'test',
      DATA_DIR: dataDir,
      SEED_LEGACY: 'false',
      OLLAMA_BASE_URL: `http://127.0.0.1:${mock.port}`,
      OLLAMA_MODEL: 'phi-mindmate',
      OLLAMA_EMBED_MODEL: 'nomic-embed-text',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', (chunk) => logs.push(String(chunk)));
  child.stderr.on('data', (chunk) => logs.push(String(chunk)));

  t.after(async () => {
    await stop(child);
    await new Promise((resolve) => mock.server.close(resolve));
    await fs.rm(dataDir, { recursive: true, force: true });
  });

  try {
    await waitFor(`${base}/api/health`);
  } catch (error) {
    console.error(logs.join(''));
    throw error;
  }

  async function request(route, { method = 'GET', body, headers = {} } = {}) {
    const res = await fetch(`${base}${route}`, {
      method,
      headers: body !== undefined ? { 'Content-Type': 'application/json', ...headers } : headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(15000),
    });
    const type = res.headers.get('content-type') || '';
    const data = type.includes('application/json') ? await res.json() : await res.text();
    return { res, data };
  }

  async function chat(message, conversationId = undefined) {
    const res = await fetch(`${base}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, conversationId }),
      signal: AbortSignal.timeout(20000),
    });
    const text = await res.text();
    const events = text
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch {
          return { type: 'parse-error', line };
        }
      });
    return { res, events };
  }

  // Health
  const health = await request('/api/health');
  assert.equal(health.res.status, 200);
  assert.equal(health.data.status, 'ok');
  assert.equal(health.data.ai.modelInstalled, true);
  assert.equal(health.data.storage.conversations, 0);

  // Dashboard empty state
  const dashboard = await request('/api/dashboard');
  assert.equal(dashboard.res.status, 200);
  assert.equal(dashboard.data.mood.total, 0);
  assert.equal(dashboard.data.conversations.total, 0);
  assert.equal(dashboard.data.suggestions.length, 3);

  // Mood
  const moodPost = await request('/api/mood', { method: 'POST', body: { mood: 4 } });
  assert.equal(moodPost.res.status, 201);
  assert.equal(moodPost.data.entry.label, 'Happy');
  assert.equal(moodPost.data.summary.total, 1);
  const moodGet = await request('/api/mood');
  assert.equal(moodGet.data.summary.current.mood, 4);
  assert.equal(moodGet.data.entries.length, 1);

  // Self-care reminder
  const reminder = await request('/api/reminders', { method: 'POST', body: { reminderId: 'music' } });
  assert.equal(reminder.res.status, 201);
  assert.equal(reminder.data.last.text, 'Listen to your favourite music.');
  const reminderGet = await request('/api/reminders');
  assert.equal(reminderGet.data.total, 1);

  // Settings
  const settings = await request('/api/settings', { method: 'PATCH', body: { displayName: 'Nisha', theme: 'dark' } });
  assert.equal(settings.res.status, 200);
  assert.equal(settings.data.settings.displayName, 'Nisha');
  assert.equal(settings.data.settings.theme, 'dark');

  // Chat streaming
  const first = await chat('I feel stressed about my exam');
  assert.equal(first.res.status, 200);
  const meta = first.events.find((event) => event.type === 'meta');
  const done = first.events.find((event) => event.type === 'done');
  const deltas = first.events.filter((event) => event.type === 'delta').map((event) => event.content).join('');
  assert.ok(meta?.conversationId);
  assert.ok(meta?.userMessage?.id);
  assert.ok(done?.message?.content.includes('I hear you'));
  assert.ok(deltas.includes('one gentle step'));
  assert.equal(mock.stats.chatCalls, 1);

  const conversationId = meta.conversationId;
  const conversation = await request(`/api/conversations/${conversationId}`);
  assert.equal(conversation.data.conversation.messages.length, 2);
  assert.match(conversation.data.conversation.title, /stressed/);
  assert.equal(conversation.data.conversation.messages[1].role, 'assistant');

  // Memory capture
  const memories = await request('/api/memory');
  assert.equal(memories.data.counts.active, 1);
  assert.match(memories.data.active[0].text, /exam/i);

  // Follow-up turn uses history and recalls memory
  const second = await chat("I'm feeling overwhelmed again", conversationId);
  assert.equal(second.res.status, 200);
  const secondMeta = second.events.find((event) => event.type === 'meta');
  assert.ok(secondMeta.recalled.length >= 1);
  const conversationAfter = await request(`/api/conversations/${conversationId}`);
  assert.equal(conversationAfter.data.conversation.messages.length, 4);
  assert.equal(mock.stats.chatCalls, 2);

  // Resolution clears active memories
  const third = await chat('I solved it and no longer feel stressed', conversationId);
  const thirdDone = third.events.find((event) => event.type === 'done');
  assert.equal(thirdDone.memory.resolved, 1);
  const afterResolve = await request('/api/memory');
  assert.equal(afterResolve.data.counts.active, 0);
  assert.ok(afterResolve.data.counts.resolved >= 1);

  // Crisis override bypasses AI and includes human resources
  const beforeSafetyCalls = mock.stats.chatCalls;
  const crisis = await chat('I want to kill myself');
  const crisisMeta = crisis.events.find((event) => event.type === 'meta');
  const crisisDone = crisis.events.find((event) => event.type === 'done');
  assert.equal(crisisMeta.safety.reason, 'self-harm language');
  assert.match(crisisDone.message.content, /988/);
  assert.match(crisisDone.message.content, /findahelpline\.com/);
  assert.equal(mock.stats.chatCalls, beforeSafetyCalls);

  // Delete mood + reminder + conversation
  const moodDelete = await request('/api/mood/0', { method: 'DELETE' });
  assert.equal(moodDelete.res.status, 200);
  assert.equal(moodDelete.data.summary.total, 0);
  const reminderDelete = await request('/api/reminders/0', { method: 'DELETE' });
  assert.equal(reminderDelete.res.status, 200);
  const reminderAfter = await request('/api/reminders');
  assert.equal(reminderAfter.data.total, 0);

  const clear = await request(`/api/conversations/${conversationId}/messages`, { method: 'DELETE' });
  assert.equal(clear.res.status, 200);
  const deleted = await request(`/api/conversations/${conversationId}`, { method: 'DELETE' });
  assert.equal(deleted.res.status, 200);
  const list = await request('/api/conversations');
  assert.equal(list.data.total, 1);

  const crisisConversation = await request(`/api/conversations/${crisisDone.conversation.id}`);
  assert.equal(crisisConversation.res.status, 200);
  const crisisDeleted = await request(`/api/conversations/${crisisDone.conversation.id}`, { method: 'DELETE' });
  assert.equal(crisisDeleted.res.status, 200);
  const afterCrisisDelete = await request('/api/conversations');
  assert.equal(afterCrisisDelete.data.total, 0);

  // Manual memory + clear
  const memoryPost = await request('/api/memory', { method: 'POST', body: { text: 'I am worried about my thesis deadline' } });
  assert.equal(memoryPost.res.status, 201);
  const memoryClear = await request('/api/memory?scope=all', { method: 'DELETE' });
  assert.equal(memoryClear.data.counts.active, 0);

  // Export
  const exported = await fetch(`${base}/api/data/export`);
  assert.equal(exported.status, 200);
  assert.match(exported.headers.get('content-disposition') || '', /mindmate-export/);
  const exportJson = await exported.json();
  assert.equal(exportJson.app, 'MindMate AI');
  assert.ok(exportJson.settings.displayName === 'Nisha');

  // Validation + 404
  const empty = await request('/api/chat', { method: 'POST', body: { message: '   ' } });
  assert.equal(empty.res.status, 422);
  const badMood = await request('/api/mood', { method: 'POST', body: { mood: 9 } });
  assert.equal(badMood.res.status, 422);
  const badSetting = await request('/api/settings', { method: 'PATCH', body: { unknown: true } });
  assert.equal(badSetting.res.status, 422);
  const missing = await request('/api/does-not-exist');
  assert.equal(missing.res.status, 404);
  assert.equal(missing.data.error.code, 'NOT_FOUND');

  // Frontend shell
  const index = await fetch(`${base}/`);
  assert.equal(index.status, 200);
  assert.match(index.headers.get('content-type') || '', /text\/html/);
  const html = await index.text();
  assert.match(html, /MindMate AI/);

  // Settings reset
  const reset = await request('/api/settings/reset', { method: 'POST', body: { confirm: true } });
  assert.equal(reset.res.status, 200);
  assert.equal(reset.data.settings.displayName, 'Friend');
});
