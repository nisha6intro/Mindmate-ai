/**
 * Thin REST client for the MindMate API.
 * No frameworks, no build step.
 */

export class ApiError extends Error {
  constructor(message, { code = 'REQUEST_FAILED', status = 0, hint = null } = {}) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.hint = hint;
  }
}

async function parseError(response) {
  let payload = null;
  try {
    payload = await response.json();
  } catch {
    // Non-JSON error body.
  }
  const error = payload?.error || {};
  return new ApiError(error.message || `Request failed (${response.status}).`, {
    code: error.code || 'REQUEST_FAILED',
    status: response.status,
    hint: error.hint || null,
  });
}

export async function request(path, { method = 'GET', body, timeout = 20000, signal } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  const combined = signal ? AbortSignal.any([signal, controller.signal]) : controller.signal;
  try {
    const response = await fetch(path, {
      method,
      headers: body === undefined ? { Accept: 'application/json' } : { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: combined,
    });
    if (!response.ok) throw await parseError(response);
    if (response.status === 204) return null;
    return await response.json();
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (error.name === 'AbortError') throw new ApiError('The request timed out. Please try again.', { code: 'TIMEOUT' });
    throw new ApiError('MindMate could not reach the local server. Is it still running?', { code: 'NETWORK_ERROR', hint: error.message });
  } finally {
    clearTimeout(timer);
  }
}

const json = (method) => (path, body, options = {}) => request(path, { method, body, ...options });

export const api = {
  health: (options = {}) => request(`/api/health${options.refresh ? '?refresh=1' : ''}`, { timeout: 12000 }),
  dashboard: () => request('/api/dashboard'),

  conversations: {
    list: (params = {}) => {
      const search = new URLSearchParams();
      if (params.q) search.set('q', params.q);
      if (params.limit) search.set('limit', params.limit);
      if (params.offset) search.set('offset', params.offset);
      const query = search.toString();
      return request(`/api/conversations${query ? `?${query}` : ''}`);
    },
    get: (id) => request(`/api/conversations/${encodeURIComponent(id)}`),
    create: (body = {}) => request('/api/conversations', { method: 'POST', body }),
    rename: (id, title) => request(`/api/conversations/${encodeURIComponent(id)}`, { method: 'PATCH', body: { title } }),
    clear: (id) => request(`/api/conversations/${encodeURIComponent(id)}/messages`, { method: 'DELETE' }),
    remove: (id) => request(`/api/conversations/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  },

  mood: {
    list: (range = 'all') => request(`/api/mood?range=${encodeURIComponent(range)}`),
    add: (mood, timestamp) => request('/api/mood', { method: 'POST', body: timestamp ? { mood, timestamp } : { mood } }),
    remove: (id) => request(`/api/mood/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  },

  reminders: {
    list: () => request('/api/reminders'),
    add: (payload) => request('/api/reminders', { method: 'POST', body: payload }),
    remove: (id) => request(`/api/reminders/${encodeURIComponent(id)}`, { method: 'DELETE' }),
    clear: () => request('/api/reminders', { method: 'DELETE', timeout: 30000 }),
  },

  memory: {
    list: (params = {}) => {
      const search = new URLSearchParams();
      if (params.status && params.status !== 'all') search.set('status', params.status);
      if (params.q) search.set('q', params.q);
      const query = search.toString();
      return request(`/api/memory${query ? `?${query}` : ''}`);
    },
    add: (text) => request('/api/memory', { method: 'POST', body: { text } }),
    setStatus: (id, status) => request(`/api/memory/${encodeURIComponent(id)}`, { method: 'PATCH', body: { status } }),
    remove: (id) => request(`/api/memory/${encodeURIComponent(id)}`, { method: 'DELETE' }),
    clear: (scope = 'all') => request(`/api/memory?scope=${encodeURIComponent(scope)}`, { method: 'DELETE', timeout: 30000 }),
  },

  settings: {
    get: () => request('/api/settings'),
    update: (patch) => request('/api/settings', { method: 'PATCH', body: patch }),
    reset: () => request('/api/settings/reset', { method: 'POST', body: { confirm: true } }),
  },

  safety: () => request('/api/safety'),
  knowledge: (q) => request(`/api/knowledge${q ? `?q=${encodeURIComponent(q)}` : ''}`),

  data: {
    reset: (scope) => request('/api/data/reset', { method: 'POST', body: { confirm: true, scope }, timeout: 30000 }),
  },
};

export function downloadExport() {
  const link = document.createElement('a');
  link.href = `/api/data/export?t=${Date.now()}`;
  link.download = '';
  document.body.appendChild(link);
  link.click();
  link.remove();
}

/**
 * Streams a chat reply as NDJSON events: meta, delta, done, error.
 * Resolves with { completed: true } when the stream finishes cleanly.
 * Rejects with ApiError for transport/protocol failures. A server-sent
 * `error` event is delivered through onEvent and ends the stream.
 */
export async function streamChat({ message, conversationId = null, moodLevel = null, turnId = null, signal, onEvent }) {
  const body = { message };
  if (conversationId) body.conversationId = conversationId;
  if (Number.isInteger(moodLevel)) body.moodLevel = moodLevel;
  if (turnId) body.turnId = turnId;

  let response;
  try {
    response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/x-ndjson' },
      body: JSON.stringify(body),
      signal,
    });
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    throw new ApiError('MindMate could not reach the local server.', { code: 'NETWORK_ERROR' });
  }

  if (!response.ok) throw await parseError(response);
  if (!response.body) throw new ApiError('The reply stream is unavailable in this browser.', { code: 'STREAM_UNSUPPORTED' });

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  const dispatch = (line) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    let event;
    try {
      event = JSON.parse(trimmed);
    } catch {
      return;
    }
    onEvent(event);
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let index = buffer.indexOf('\n');
    while (index !== -1) {
      dispatch(buffer.slice(0, index));
      buffer = buffer.slice(index + 1);
      index = buffer.indexOf('\n');
    }
  }
  buffer += decoder.decode();
  if (buffer.trim()) dispatch(buffer);
  return { completed: true };
}
