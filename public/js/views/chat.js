/**
 * Chat view: streaming conversation, history rail, stop/retry and safety.
 */

import { api, streamChat } from '../api.js';
import { moodByLevel } from '../constants.js';
import { store } from '../store.js';
import { navigate } from '../router.js';
import {
  $,
  $$,
  confirmDialog,
  debounce,
  escapeHtml,
  focusChatInput,
  formatTime,
  icon,
  refreshIcons,
  relativeDay,
  renderMarkdown,
  toast,
  truncate,
} from '../ui.js';

const state = {
  activeId: null,
  conversation: null,
  conversations: [],
  search: '',
  moodLevel: null,
  streaming: false,
  controller: null,
  followUp: null,
  lastText: '',
  lastUserEl: null,
  bound: false,
};

const TYPING = `
  <span class="message-typing" role="status" aria-label="MindMate is writing">
    <span></span><span></span><span></span>
  </span>`;

function displayName() {
  return store.get('settings')?.displayName || 'You';
}

function assistantName() {
  return 'MindMate';
}

function scrollToBottom() {
  const box = $('#chatMessages');
  if (!box) return;
  box.scrollTop = box.scrollHeight;
}

function showEmpty(show) {
  const empty = $('#chatEmpty');
  if (empty) empty.hidden = !show;
}

function setTitle(title, subtitle = null) {
  const titleNode = $('#chatTitle');
  if (titleNode) titleNode.textContent = title || 'New conversation';
  const sub = $('#chatSubtitle');
  if (sub) {
    if (subtitle) sub.textContent = subtitle;
    else sub.textContent = 'A private space to say what is real.';
  }
}

function updateMoodChip() {
  const chip = $('#chatMoodChip');
  if (!chip) return;
  const mood = moodByLevel(state.moodLevel);
  if (mood) {
    chip.textContent = `${mood.emoji} ${mood.label}`;
    chip.title = `Currently feeling ${mood.label.toLowerCase()}`;
  } else {
    chip.textContent = '🌱 No check-in';
    chip.title = 'Log a mood for a more tailored tone';
  }
}

async function loadMoodChip() {
  try {
    const { summary } = await api.mood.list('all');
    state.moodLevel = summary.current?.mood ?? null;
  } catch {
    state.moodLevel = null;
  }
  updateMoodChip();
}

/* --------------------------------------------------------------------------
   Message rendering
   -------------------------------------------------------------------------- */

function metaLabel(message, role) {
  const time = message.createdAt ? formatTime(message.createdAt) : '';
  const model = message.meta?.model ? `<span class="message-model">${escapeHtml(message.meta.model)}</span>` : '';
  const who = role === 'user' ? escapeHtml(displayName()) : assistantName();
  return `<div class="message-meta"><span>${who}</span>${model}${time ? `<time datetime="${escapeHtml(message.createdAt)}">${escapeHtml(time)}</time>` : ''}</div>`;
}

function messageHtml(message) {
  const role = message.role === 'user' ? 'user' : 'assistant';
  const avatar =
    role === 'user'
      ? `<span class="message-avatar" aria-hidden="true">${escapeHtml((displayName() || 'Y').trim().charAt(0).toUpperCase())}</span>`
      : `<span class="message-avatar" aria-hidden="true">${icon('brain')}</span>`;
  const crisis = role === 'assistant' && (message.meta?.safety || message.meta?.override === 'crisis');
  const bubble = `<div class="message-bubble${crisis ? ' is-crisis' : ''}">${renderMarkdown(message.content)}</div>`;
  return `
    <article class="message message-${role}" data-message-id="${escapeHtml(message.id || '')}">
      ${avatar}
      <div class="message-body">
        ${metaLabel(message, role)}
        ${bubble}
      </div>
    </article>`;
}

function safetyBanner() {
  return `
    <div class="chat-safety-banner" role="note">
      ${icon('life-buoy')}
      <div>
        <strong>Your safety comes first.</strong>
        If you are in immediate danger, call your local emergency number (112, 911, or 999) or go to the nearest emergency department.
        <a href="https://findahelpline.com" target="_blank" rel="noopener noreferrer">Find a free crisis line</a> or
        <button type="button" class="text-link" data-open-support>open urgent support</button>.
      </div>
    </div>`;
}

function clearMessages() {
  const box = $('#chatMessages');
  if (!box) return;
  box.querySelectorAll('.message, .message-error, .chat-safety-banner').forEach((node) => node.remove());
}

function clearErrors() {
  const box = $('#chatMessages');
  box?.querySelectorAll('.message-error').forEach((node) => node.remove());
}

function renderConversation(conversation) {
  clearMessages();
  const box = $('#chatMessages');
  if (!box) return;
  const messages = conversation?.messages || [];
  showEmpty(messages.length === 0);
  if (!messages.length) return;

  let html = '';
  let safetyShown = false;
  for (const message of messages) {
    const crisis = message.role === 'assistant' && (message.meta?.safety || message.meta?.override === 'crisis');
    if (crisis && !safetyShown) {
      html += safetyBanner();
      safetyShown = true;
    }
    html += messageHtml(message);
  }
  box.insertAdjacentHTML('beforeend', html);
  refreshIcons();
  scrollToBottom();
}

function appendUserMessage(text) {
  const box = $('#chatMessages');
  const message = { role: 'user', content: text, createdAt: new Date().toISOString(), id: 'pending' };
  box.insertAdjacentHTML('beforeend', messageHtml(message));
  showEmpty(false);
  refreshIcons();
  scrollToBottom();
  return box.querySelector('.message-user:last-of-type');
}

function appendAssistantPlaceholder() {
  const box = $('#chatMessages');
  box.insertAdjacentHTML(
    'beforeend',
    `
    <article class="message message-assistant" data-streaming="true">
      <span class="message-avatar" aria-hidden="true">${icon('brain')}</span>
      <div class="message-body">
        <div class="message-meta"><span>${assistantName()}</span></div>
        <div class="message-bubble">${TYPING}</div>
      </div>
    </article>`,
  );
  refreshIcons();
  scrollToBottom();
  return box.querySelector('[data-streaming="true"]');
}

/** Renders a reply that the server has stored, either on `done` or after a stop race. */
function renderFinishedReply({ assistantEl, message, conversation, followUp, fallbackContent = '' }) {
  const bubble = assistantEl?.querySelector('.message-bubble');
  if (!assistantEl || !bubble) return;
  const content = String(message?.content || fallbackContent || '');
  bubble.innerHTML = content ? renderMarkdown(content) : TYPING;
  const crisis = message?.meta?.safety || message?.meta?.override === 'crisis';
  if (crisis) {
    bubble.classList.add('is-crisis');
    insertSafetyBanner(assistantEl);
  }
  assistantEl.removeAttribute('data-streaming');
  if (message?.id) assistantEl.dataset.messageId = message.id;
  const metaRow = assistantEl.querySelector('.message-meta');
  if (message?.createdAt) {
    metaRow?.insertAdjacentHTML(
      'beforeend',
      `<time datetime="${escapeHtml(message.createdAt)}">${escapeHtml(formatTime(message.createdAt))}</time>`,
    );
  }
  metaRow?.insertAdjacentHTML(
    'beforeend',
    `<span class="message-model">${escapeHtml(message?.meta?.model || 'phi-mindmate')}</span>`,
  );
  if (conversation) {
    state.conversation = { ...(state.conversation || {}), ...conversation };
    if (conversation.id) {
      state.activeId = conversation.id;
      store.set({ currentConversationId: conversation.id }, 'conversation');
    }
    setTitle(conversation.title || 'Conversation');
    const sub = $('#chatSubtitle');
    const count = Number.isFinite(conversation.messageCount)
      ? conversation.messageCount
      : Array.isArray(conversation.messages) ? conversation.messages.length : null;
    if (sub && count !== null) {
      sub.textContent = `${count} message${count === 1 ? '' : 's'} · stored privately on this device`;
    }
  }
  if (followUp !== undefined) setFollowUp(followUp || null);
  refreshConversationLists();
  loadRail();
  refreshIcons();
  scrollToBottom();
}

/**
 * A very fast reply can finish on the server a moment before the browser's
 * abort reaches it. Ask the server what it stored so the interface never
 * claims a reply was lost when it was actually saved. The turn id travels with
 * the request, so it still identifies the turn when the abort lands before the
 * first stream event.
 */
async function findStoredReply({ meta, turnId }) {
  const ids = [];
  if (meta?.conversationId) ids.push(meta.conversationId);
  else if (state.activeId) ids.push(state.activeId);
  if (!ids.length) {
    try {
      const list = await api.conversations.list({ limit: 5 });
      for (const item of list.conversations) if (!ids.includes(item.id)) ids.push(item.id);
    } catch {
      // Fall through to the per-conversation attempts below.
    }
  }

  for (const id of ids) {
    try {
      const { conversation } = await api.conversations.get(id);
      const index = conversation.messages.findIndex(
        (item) => item.role === 'user' && (item.id === meta?.userMessage?.id || (turnId && item.meta?.turnId === turnId)),
      );
      if (index === -1) continue;
      const saved = conversation.messages
        .slice(index + 1)
        .find((item) => item.role === 'assistant' && String(item.content || '').trim());
      if (saved) return { conversation, saved };
    } catch {
      // Try the next candidate; a missing conversation is not an error here.
    }
  }
  return null;
}

async function reconcileStoppedReply({ meta, assistantEl, fallbackContent, turnId }) {
  // The abort can reach the browser before the server has finished writing its
  // final turn. Give the store a short, bounded moment to settle so we do not
  // report a reply as lost when it is about to be saved.
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const found = await findStoredReply({ meta, turnId });
    if (found?.saved) {
      renderFinishedReply({
        assistantEl,
        message: found.saved,
        conversation: found.conversation,
        followUp: meta?.followUp,
        fallbackContent,
      });
      toast('info', 'Reply already complete', 'MindMate finished just before you stopped.');
      return true;
    }
    if (attempt < 4) await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return false;
}

/**
 * An aborted turn is rolled back by the server. If it was a brand-new
 * conversation, that conversation disappears too, so clear the stale id and
 * refresh the rail instead of leaving a link that returns 404.
 */
async function syncStoppedTurn({ meta, wasNew }) {
  const candidate = meta?.conversationId || state.activeId;
  const resetActive = () => {
    state.activeId = null;
    state.conversation = null;
    store.set({ currentConversationId: null }, 'conversation');
    setTitle('New conversation');
    setChatTitleSubtitle();
    markActiveRail();
  };

  if (wasNew && candidate && state.activeId === candidate) resetActive();

  try {
    const list = await api.conversations.list({ limit: 200 });
    if (candidate && state.activeId === candidate && !list.conversations.some((item) => item.id === candidate)) {
      resetActive();
    }
    renderSidebarConversations(list.conversations);
    await loadRail();
  } catch {
    await refreshConversationLists();
    await loadRail();
  }
}

function insertSafetyBanner(beforeEl) {
  if (!beforeEl || beforeEl.previousElementSibling?.classList.contains('chat-safety-banner')) return;
  beforeEl.insertAdjacentHTML('beforebegin', safetyBanner());
  refreshIcons();
}

function setFollowUp(text) {
  state.followUp = text || null;
  const wrap = $('#chatFollowUp');
  const button = $('#chatFollowUpBtn');
  if (!wrap || !button) return;
  if (text) {
    button.textContent = text;
    wrap.hidden = false;
  } else {
    button.textContent = '';
    wrap.hidden = true;
  }
}

function presentError({ title, message, hint = '', retryable = true, text = '', userEl = null, assistantEl = null }) {
  assistantEl?.remove();
  clearErrors();
  const box = $('#chatMessages');
  if (!box) return;
  box.insertAdjacentHTML(
    'beforeend',
    `
    <div class="message-error" role="alert">
      ${icon('alert-circle')}
      <div>
        <strong>${escapeHtml(title)}</strong>
        <p>${escapeHtml(message)}</p>
        ${hint ? `<p class="fine-print">${escapeHtml(hint)}</p>` : ''}
        <div class="composer-buttons" style="margin-top:6px;gap:6px">
          ${retryable && text ? `<button class="btn btn-soft btn-sm" type="button" data-retry>${icon('refresh-cw')} Try again</button>` : ''}
          <button class="btn btn-ghost btn-sm" type="button" data-dismiss>Dismiss</button>
        </div>
      </div>
    </div>`,
  );
  refreshIcons();
  box.querySelector('[data-retry]')?.addEventListener('click', () => {
    clearErrors();
    sendMessage(text, { retry: true, userEl });
  });
  box.querySelector('[data-dismiss]')?.addEventListener('click', () => {
    box.querySelector('.message-error')?.remove();
  });
  scrollToBottom();
}

/* --------------------------------------------------------------------------
   Conversation rail + sidebar
   -------------------------------------------------------------------------- */

function railItem(conversation) {
  const active = conversation.id === state.activeId ? ' is-active' : '';
  const when = relativeDay(conversation.updatedAt);
  return `
    <button class="chat-rail-item${active}" type="button" data-conversation="${escapeHtml(conversation.id)}">
      <strong>${escapeHtml(truncate(conversation.title, 60) || 'Conversation')}</strong>
      <span>${escapeHtml(when)} · ${conversation.messageCount} message${conversation.messageCount === 1 ? '' : 's'}</span>
    </button>`;
}

async function loadRail(query = state.search) {
  const list = $('#chatConversationList');
  if (!list) return;
  try {
    const data = await api.conversations.list({ q: query, limit: 120 });
    state.conversations = data.conversations;
    if (!data.conversations.length) {
      list.innerHTML = query
        ? `<div class="chat-rail-empty">No conversations match “${escapeHtml(query)}”.</div>`
        : `<div class="chat-rail-empty">No conversations yet. Your first message starts a new thread.</div>`;
      return;
    }
    list.innerHTML = data.conversations.map(railItem).join('');
  } catch (error) {
    list.innerHTML = `<div class="chat-rail-empty">Could not load conversations. ${escapeHtml(error.message)}</div>`;
  }
}

function markActiveRail() {
  for (const item of $$('#chatConversationList [data-conversation]')) {
    item.classList.toggle('is-active', item.dataset.conversation === state.activeId);
  }
}

function renderSidebarConversations(conversations) {
  const container = $('#sidebarConversations');
  if (!container) return;
  if (!conversations.length) {
    container.innerHTML = '<div class="sidebar-empty">No conversations yet. Your first chat will appear here.</div>';
    return;
  }
  container.innerHTML = conversations
    .slice(0, 6)
    .map(
      (conversation) => `
      <button class="sidebar-chat${conversation.id === state.activeId ? ' is-active' : ''}" type="button" data-conversation="${escapeHtml(conversation.id)}">
        ${icon('message-circle')}
        <span>${escapeHtml(truncate(conversation.title, 40) || 'Conversation')}</span>
      </button>`,
    )
    .join('');
  refreshIcons();
}

/** Refreshes the sidebar's recent list. Called by the app shell after boot. */
export async function refreshConversationLists() {
  try {
    const data = await api.conversations.list({ limit: 8 });
    store.set({ conversations: data.conversations }, 'conversations');
    renderSidebarConversations(data.conversations);
  } catch {
    // The sidebar is non-critical; leave the existing list in place.
  }
}

function showEmptyConversation({ focus = false } = {}) {
  state.activeId = null;
  state.conversation = null;
  state.lastText = '';
  state.lastUserEl = null;
  clearMessages();
  clearErrors();
  showEmpty(true);
  setFollowUp(null);
  setTitle('New conversation');
  setChatTitleSubtitle();
  markActiveRail();
  const input = $('#chatInput');
  if (input) {
    input.value = '';
    input.style.height = 'auto';
  }
  updateSendState();
  if (focus) setTimeout(focusChatInput, 80);
}

function setChatTitleSubtitle() {
  const sub = $('#chatSubtitle');
  if (sub) sub.textContent = 'A private space to say what is real.';
}

/** Creates a fresh conversation in the UI. Exported for the app shell. */
export async function newChat({ focus = true, navigateTo = false } = {}) {
  if (state.streaming) stopStreaming({ quiet: true });
  store.set({ currentConversationId: null }, 'conversation');
  showEmptyConversation({ focus });
  await loadRail();
  if (navigateTo) navigate('chat');
}

export async function openConversation(id) {
  if (!id) return showEmptyConversation();
  if (state.streaming) stopStreaming({ quiet: true });
  try {
    const { conversation } = await api.conversations.get(id);
    state.activeId = conversation.id;
    state.conversation = conversation;
    store.set({ currentConversationId: conversation.id }, 'conversation');
    setTitle(conversation.title || 'Conversation');
    const sub = $('#chatSubtitle');
    if (sub) {
      const count = conversation.messages.length;
      sub.textContent = count
        ? `${count} message${count === 1 ? '' : 's'} · stored privately on this device`
        : 'A new, quiet place to start.';
    }
    renderConversation(conversation);
    setFollowUp(null);
    markActiveRail();
    renderSidebarConversations(state.conversations);
    if (window.innerWidth <= 960) $('#chatRail')?.classList.remove('is-open');
  } catch (error) {
    toast('error', 'Could not open conversation', error.message);
    showEmptyConversation();
  }
}

/* --------------------------------------------------------------------------
   Streaming
   -------------------------------------------------------------------------- */

function updateSendState() {
  const input = $('#chatInput');
  const button = $('#chatSendBtn');
  if (!input || !button) return;
  button.disabled = state.streaming || input.value.trim().length === 0;
}

function autoResize() {
  const input = $('#chatInput');
  if (!input) return;
  input.style.height = 'auto';
  input.style.height = `${Math.min(input.scrollHeight, 180)}px`;
}

function setStreaming(streaming) {
  state.streaming = streaming;
  const stop = $('#chatStopBtn');
  const send = $('#chatSendBtn');
  const input = $('#chatInput');
  if (stop) stop.hidden = !streaming;
  if (send) send.disabled = streaming || !input?.value.trim();
  if (input) input.setAttribute('aria-busy', String(streaming));
}

function stopStreaming({ quiet = false } = {}) {
  if (!state.controller) return;
  state.controller.abort();
  if (!quiet) toast('info', 'Stopped', 'MindMate stopped replying.');
}

async function sendMessage(rawText, { retry = false, userEl = null } = {}) {
  const text = String(rawText || '').trim();
  if (!text) return;
  if (state.streaming) {
    toast('info', 'One moment', 'MindMate is still replying. You can stop it first.');
    return;
  }

  const input = $('#chatInput');
  if (input) {
    input.value = '';
    autoResize();
  }
  updateSendState();
  clearErrors();
  setFollowUp(null);

  const bubbleUser = retry ? userEl : appendUserMessage(text);
  state.lastText = text;
  state.lastUserEl = bubbleUser;

  state.controller = new AbortController();
  const turnId = globalThis.crypto?.randomUUID?.() || `turn_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  setStreaming(true);
  const assistantEl = appendAssistantPlaceholder();
  const bubble = assistantEl.querySelector('.message-bubble');
  let content = '';
  let frame = null;
  let failed = false;
  let meta = null;

  const paint = () => {
    frame = null;
    if (!bubble || !bubble.isConnected) return;
    bubble.innerHTML = content ? renderMarkdown(content) : TYPING;
    scrollToBottom();
  };

  try {
    await streamChat({
      message: text,
      conversationId: state.activeId,
      moodLevel: state.moodLevel ?? undefined,
      turnId,
      signal: state.controller.signal,
      onEvent(event) {
        if (event.type === 'meta') {
          meta = event;
          state.activeId = event.conversationId;
          store.set({ currentConversationId: event.conversationId }, 'conversation');
          setTitle(event.conversation?.title || 'Conversation');
          const sub = $('#chatSubtitle');
          if (sub) sub.textContent = 'Listening · kept privately on this device';
          if (event.safety) insertSafetyBanner(assistantEl);
          refreshConversationLists();
          loadRail();
        } else if (event.type === 'delta') {
          content += event.content || '';
          if (!frame) frame = requestAnimationFrame(paint);
        } else if (event.type === 'done') {
          content = event.message?.content || content;
          if (frame) cancelAnimationFrame(frame);
          renderFinishedReply({
            assistantEl,
            message: event.message,
            conversation: event.conversation,
            followUp: event.followUp,
            fallbackContent: content,
          });
          if (event.memory?.added) toast('info', 'Noted gently', 'MindMate will remember this for future check-ins.');
          if (event.memory?.resolved) toast('success', 'Marked as resolved', `${event.memory.resolved} memory note${event.memory.resolved === 1 ? '' : 's'} moved to resolved.`);
        } else if (event.type === 'error') {
          failed = true;
          presentError({
            title: 'MindMate could not reply',
            message: event.message || 'The response was interrupted.',
            hint: event.hint || '',
            retryable: event.retryable !== false,
            text,
            userEl: bubbleUser,
            assistantEl,
          });
        }
      },
    });

    if (!failed) {
      refreshIcons();
      scrollToBottom();
    }
  } catch (error) {
    if (error.name === 'AbortError') {
      const recovered = await reconcileStoppedReply({ meta, assistantEl, fallbackContent: content, turnId });
      if (!recovered) {
        const wasNew = meta?.conversation?.messageCount === 1;
        presentError({
          title: 'Reply stopped',
          message: 'You stopped this reply. Your message was not saved.',
          hint: 'You can try again whenever you are ready.',
          retryable: true,
          text,
          userEl: bubbleUser,
          assistantEl,
        });
        // Wait briefly for the server's rollback, then tidy the rail so a
        // discarded conversation is not left behind as a dead link.
        const candidate = meta?.conversationId || state.activeId;
        const settle = () => {
          if (state.streaming) return;
          if (state.activeId && candidate && state.activeId !== candidate) return;
          syncStoppedTurn({ meta, wasNew });
        };
        setTimeout(settle, 700);
        setTimeout(settle, 2200);
      }
    } else {
      presentError({
        title: 'Connection interrupted',
        message: error.message || 'MindMate could not reach the local server.',
        hint: error.hint || 'Make sure the app server is running, then try again.',
        retryable: true,
        text,
        userEl: bubbleUser,
        assistantEl,
      });
    }
  } finally {
    if (frame) cancelAnimationFrame(frame);
    state.controller = null;
    setStreaming(false);
    updateSendState();
  }
}

/* --------------------------------------------------------------------------
   Static bindings
   -------------------------------------------------------------------------- */

function bindOnce() {
  if (state.bound) return;
  state.bound = true;

  const form = $('#chatForm');
  form?.addEventListener('submit', (event) => {
    event.preventDefault();
    const input = $('#chatInput');
    sendMessage(input?.value || '');
  });

  const input = $('#chatInput');
  input?.addEventListener('input', () => {
    autoResize();
    updateSendState();
  });
  input?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      if (!state.streaming && input.value.trim()) sendMessage(input.value);
    }
  });

  $('#chatStopBtn')?.addEventListener('click', () => stopStreaming());
  $('#chatNewBtn')?.addEventListener('click', () => newChat());
  $('#chatRailNew')?.addEventListener('click', () => newChat());

  $('#chatClearBtn')?.addEventListener('click', async () => {
    if (!state.activeId) {
      toast('info', 'Nothing to clear', 'This is already a new conversation.');
      return;
    }
    const ok = await confirmDialog({
      title: 'Clear this conversation?',
      message: 'All messages in this thread will be removed. The conversation itself stays in your history.',
      confirmLabel: 'Clear messages',
      danger: true,
    });
    if (!ok) return;
    try {
      await api.conversations.clear(state.activeId);
      state.conversation = { ...(state.conversation || {}), messages: [] };
      clearMessages();
      showEmpty(true);
      setFollowUp(null);
      const sub = $('#chatSubtitle');
      if (sub) sub.textContent = 'Cleared · a fresh page in this thread.';
      await refreshConversationLists();
      await loadRail();
      toast('success', 'Conversation cleared', 'The thread is ready to start again.');
    } catch (error) {
      toast('error', 'Could not clear conversation', error.message);
    }
  });

  $('#chatDeleteBtn')?.addEventListener('click', async () => {
    if (!state.activeId) {
      toast('info', 'Nothing to delete', 'This is already a new conversation.');
      return;
    }
    const ok = await confirmDialog({
      title: 'Delete this conversation?',
      message: 'This removes the conversation and every message in it. It cannot be undone.',
      confirmLabel: 'Delete conversation',
      danger: true,
    });
    if (!ok) return;
    try {
      await api.conversations.remove(state.activeId);
      toast('success', 'Conversation deleted');
      await refreshConversationLists();
      state.activeId = null;
      showEmptyConversation({ focus: true });
      await loadRail();
    } catch (error) {
      toast('error', 'Could not delete conversation', error.message);
    }
  });

  $('#chatSearch')?.addEventListener(
    'input',
    debounce((event) => {
      state.search = event.target.value.trim();
      loadRail(state.search);
    }, 220),
  );

  $('#chatRailToggle')?.addEventListener('click', () => {
    const rail = $('#chatRail');
    const open = rail?.classList.toggle('is-open');
    $('#chatRailToggle')?.setAttribute('aria-expanded', String(Boolean(open)));
  });

  $('#chatStarterPrompts')?.addEventListener('click', (event) => {
    const chip = event.target.closest('[data-prompt]');
    if (!chip) return;
    const inputNode = $('#chatInput');
    if (!inputNode) return;
    inputNode.value = chip.dataset.prompt || '';
    autoResize();
    updateSendState();
    focusChatInput();
  });

  $('#chatFollowUpBtn')?.addEventListener('click', () => {
    if (!state.followUp) return;
    const inputNode = $('#chatInput');
    if (!inputNode) return;
    inputNode.value = state.followUp;
    autoResize();
    updateSendState();
    focusChatInput();
  });

  const railList = $('#chatConversationList');
  railList?.addEventListener('click', (event) => {
    const item = event.target.closest('[data-conversation]');
    if (!item) return;
    if (item.dataset.conversation === state.activeId) return;
    openConversation(item.dataset.conversation);
  });

  $('#chatMessages')?.addEventListener('click', (event) => {
    if (event.target.closest('[data-open-support]')) {
      import('../support.js').then((module) => module.openSupportModal());
    }
  });
}

/* --------------------------------------------------------------------------
   Mount
   -------------------------------------------------------------------------- */

export async function mount() {
  bindOnce();
  const targetId = store.get('currentConversationId');
  await Promise.all([loadMoodChip(), loadRail()]);
  if (targetId) await openConversation(targetId);
  else showEmptyConversation();

  await refreshConversationLists();

  const pending = store.get('pendingPrompt');
  if (pending) {
    store.set({ pendingPrompt: null }, 'prompt');
    const input = $('#chatInput');
    if (input) {
      input.value = pending;
      autoResize();
      updateSendState();
    }
    setTimeout(focusChatInput, 80);
  } else if (!targetId) {
    setTimeout(() => {
      if (document.getElementById('view-chat')?.hidden === false) focusChatInput();
    }, 120);
  }

  return () => {
    if (state.controller) {
      state.controller.abort();
      state.controller = null;
    }
    state.streaming = false;
    updateSendState();
  };
}
