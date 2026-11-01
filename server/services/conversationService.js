import { config } from '../config.js';
import { newId, readJson, updateJson } from '../utils/jsonStore.js';
import { nowIso, sortableTime } from '../utils/dates.js';
import { titleFromMessage, truncate } from '../utils/text.js';

const DEFAULT_STORE = { version: 1, conversations: [] };

function sortByUpdated(conversations) {
  return [...conversations].sort((a, b) => sortableTime(b.updatedAt) - sortableTime(a.updatedAt));
}

function normalizeConversation(conversation) {
  return {
    id: conversation.id,
    title: conversation.title || 'Conversation',
    createdAt: conversation.createdAt || nowIso(),
    updatedAt: conversation.updatedAt || conversation.createdAt || nowIso(),
    messages: Array.isArray(conversation.messages) ? conversation.messages : [],
    legacy: Boolean(conversation.legacy),
    source: conversation.source || null,
    importedAt: conversation.importedAt || null,
  };
}

export function summarize(conversation) {
  const messages = Array.isArray(conversation.messages) ? conversation.messages : [];
  const last = messages[messages.length - 1];
  return {
    id: conversation.id,
    title: conversation.title,
    createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt,
    messageCount: messages.length,
    preview: last ? truncate(last.content, 130) : 'No messages yet',
    lastRole: last?.role || null,
    legacy: Boolean(conversation.legacy),
    source: conversation.source || null,
  };
}

export async function listConversations({ q = '', limit = 100, offset = 0 } = {}) {
  const store = await readJson(config.files.conversations, DEFAULT_STORE);
  const conversations = (store.conversations || []).map(normalizeConversation);
  const query = String(q || '').toLowerCase().trim();
  const filtered = query
    ? conversations.filter((conversation) => {
        const haystack = `${conversation.title} ${conversation.messages.map((m) => m.content).join(' ')}`.toLowerCase();
        return haystack.includes(query);
      })
    : conversations;
  const sorted = sortByUpdated(filtered);
  const total = sorted.length;
  return {
    conversations: sorted.slice(offset, offset + limit).map(summarize),
    total,
    hasMore: offset + limit < total,
  };
}

export async function getConversation(id) {
  const store = await readJson(config.files.conversations, DEFAULT_STORE);
  const found = (store.conversations || []).find((conversation) => conversation.id === id);
  return found ? normalizeConversation(found) : null;
}

export async function createConversation({ title = '', legacy = false, source = null, createdAt = null } = {}) {
  const now = createdAt || nowIso();
  const conversation = normalizeConversation({
    id: newId('conv'),
    title: title || 'New conversation',
    createdAt: now,
    updatedAt: now,
    messages: [],
    legacy,
    source,
    importedAt: legacy ? nowIso() : null,
  });
  await updateJson(config.files.conversations, DEFAULT_STORE, (store) => {
    store.version = 1;
    store.conversations = store.conversations || [];
    store.conversations.push(conversation);
    return store;
  });
  return conversation;
}

export async function appendMessage(conversationId, { role, content, createdAt = null, meta = null }) {
  const message = {
    id: newId('msg'),
    role,
    content,
    createdAt: createdAt || nowIso(),
    ...(meta ? { meta } : {}),
  };
  const result = await updateJson(config.files.conversations, DEFAULT_STORE, (store) => {
    store.conversations = store.conversations || [];
    const conversation = store.conversations.find((item) => item.id === conversationId);
    if (!conversation) return store;
    conversation.messages = conversation.messages || [];
    conversation.messages.push(message);
    conversation.updatedAt = message.createdAt;
    if (role === 'user' && (!conversation.title || conversation.title === 'New conversation')) {
      conversation.title = titleFromMessage(content);
    }
    return store;
  });
  const exists = (result.conversations || []).some((item) => item.id === conversationId);
  return exists ? message : null;
}

export async function removeMessages(conversationId, messageIds) {
  const ids = new Set(messageIds);
  return updateJson(config.files.conversations, DEFAULT_STORE, (store) => {
    const conversation = (store.conversations || []).find((item) => item.id === conversationId);
    if (!conversation) return store;
    conversation.messages = (conversation.messages || []).filter((message) => !ids.has(message.id));
    conversation.updatedAt = conversation.messages.at(-1)?.createdAt || conversation.updatedAt;
    return store;
  });
}

export async function updateLastMessage(conversationId, messageId, patch) {
  return updateJson(config.files.conversations, DEFAULT_STORE, (store) => {
    const conversation = (store.conversations || []).find((item) => item.id === conversationId);
    if (!conversation) return store;
    const message = (conversation.messages || []).find((item) => item.id === messageId);
    if (message) Object.assign(message, patch);
    return store;
  });
}

export async function clearConversation(conversationId) {
  return updateJson(config.files.conversations, DEFAULT_STORE, (store) => {
    const conversation = (store.conversations || []).find((item) => item.id === conversationId);
    if (conversation) {
      conversation.messages = [];
      conversation.updatedAt = nowIso();
    }
    return store;
  });
}

export async function renameConversation(conversationId, title) {
  const result = await updateJson(config.files.conversations, DEFAULT_STORE, (store) => {
    const conversation = (store.conversations || []).find((item) => item.id === conversationId);
    if (conversation) {
      conversation.title = title;
      conversation.updatedAt = nowIso();
    }
    return store;
  });
  const found = (result.conversations || []).find((item) => item.id === conversationId);
  return found ? normalizeConversation(found) : null;
}

export async function deleteConversation(conversationId) {
  const result = await updateJson(config.files.conversations, DEFAULT_STORE, (store) => {
    store.conversations = (store.conversations || []).filter((item) => item.id !== conversationId);
    return store;
  });
  return (result.conversations || []).every((item) => item.id !== conversationId);
}

export async function deleteAllConversations() {
  await updateJson(config.files.conversations, DEFAULT_STORE, (store) => {
    store.version = 1;
    store.conversations = [];
    return store;
  });
}

export async function conversationStats() {
  const store = await readJson(config.files.conversations, DEFAULT_STORE);
  const conversations = store.conversations || [];
  return {
    conversations: conversations.length,
    messages: conversations.reduce((sum, item) => sum + (item.messages?.length || 0), 0),
  };
}

export async function getAllConversations() {
  const store = await readJson(config.files.conversations, DEFAULT_STORE);
  return (store.conversations || []).map(normalizeConversation);
}
