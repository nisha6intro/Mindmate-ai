import http from 'node:http';

/**
 * Minimal Ollama-compatible mock used only by the automated tests.
 * It is never used by the application itself.
 */
export function startMockOllama() {
  const stats = { chatCalls: 0, embeddingCalls: 0, lastBody: null };
  const server = http.createServer((req, res) => {
    if (req.url === '/__stats') {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(stats));
      return;
    }
    if (req.url === '/api/tags') {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ models: [{ name: 'phi-mindmate:latest' }, { name: 'nomic-embed-text:latest' }] }));
      return;
    }
    if (req.url === '/api/embeddings') {
      stats.embeddingCalls += 1;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ embedding: [0.1, 0.2, 0.3, 0.4] }));
      return;
    }
    if (req.url === '/api/chat' && req.method === 'POST') {
      let body = '';
      req.on('data', (chunk) => { body += chunk; });
      req.on('end', () => {
        stats.chatCalls += 1;
        let parsed = {};
        try {
          parsed = JSON.parse(body);
        } catch {
          // ignore
        }
        stats.lastBody = parsed;
        const last = parsed.messages?.at(-1)?.content || '';
        const chunks = [
          'I hear you, and what you are feeling makes sense. ',
          `You shared: "${String(last).slice(0, 60)}". `,
          'Let us take this one gentle step at a time.',
        ];
        res.writeHead(200, { 'Content-Type': 'application/x-ndjson' });
        let index = 0;
        const timer = setInterval(() => {
          res.write(`${JSON.stringify({ model: 'phi-mindmate', message: { role: 'assistant', content: chunks[index] }, done: false })}\n`);
          index += 1;
          if (index >= chunks.length) {
            clearInterval(timer);
            res.write(`${JSON.stringify({ model: 'phi-mindmate', message: { role: 'assistant', content: '' }, done: true })}\n`);
            res.end();
          }
        }, 5);
      });
      return;
    }
    res.statusCode = 404;
    res.end('not found');
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({ server, port, stats });
    });
  });
}
