/** Conversation history: search, sort, open, rename and delete. */

import { api } from '../api.js';
import { store } from '../store.js';
import { navigate } from '../router.js';
import { newChat } from './chat.js';
import {
  $,
  confirmDialog,
  debounce,
  escapeHtml,
  formatTime,
  icon,
  closeModal,
  openModal,
  refreshIcons,
  relativeDay,
  setBusy,
  toast,
  truncate,
} from '../ui.js';

const state = {
  conversations: [],
  query: '',
  sort: 'newest',
  loading: false,
  bound: false,
};

function sorted(list) {
  const copy = [...list];
  if (state.sort === 'oldest') return copy.sort((a, b) => new Date(a.updatedAt) - new Date(b.updatedAt));
  if (state.sort === 'title') return copy.sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }));
  return copy.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
}

function itemHtml(conversation) {
  const badge = conversation.legacy ? '<span class="history-badge">imported</span>' : '';
  return `
    <article class="history-item" data-id="${escapeHtml(conversation.id)}">
      <span class="history-icon" aria-hidden="true">${icon('message-circle')}</span>
      <div class="history-copy">
        <h3>${escapeHtml(truncate(conversation.title, 80) || 'Conversation')}</h3>
        <p class="history-preview">${escapeHtml(conversation.preview || 'No messages yet')}</p>
        <div class="history-meta">
          <span>${icon('clock')} ${escapeHtml(relativeDay(conversation.updatedAt))} · ${escapeHtml(formatTime(conversation.updatedAt))}</span>
          <span>${icon('message-square')} ${conversation.messageCount} message${conversation.messageCount === 1 ? '' : 's'}</span>
          ${badge}
        </div>
      </div>
      <div class="history-actions">
        <button class="icon-btn icon-btn-sm" type="button" data-action="rename" aria-label="Rename conversation" title="Rename">${icon('pencil')}</button>
        <button class="icon-btn icon-btn-sm" type="button" data-action="delete" aria-label="Delete conversation" title="Delete">${icon('trash-2')}</button>
        <button class="btn btn-primary btn-sm history-open" type="button" data-action="open">Open</button>
      </div>
    </article>`;
}

function render() {
  const list = $('#historyList');
  const empty = $('#historyEmpty');
  if (!list || !empty) return;

  const conversations = sorted(state.conversations);
  if (!conversations.length) {
    list.innerHTML = '';
    empty.hidden = false;
    if (state.query) {
      empty.innerHTML = `
        <span class="empty-icon">🔍</span>
        <h3>No conversations match “${escapeHtml(truncate(state.query, 40))}”</h3>
        <p>Try a different word, or clear the search to see everything.</p>
        <button class="btn btn-ghost" type="button" data-clear-search>Clear search</button>`;
      empty.querySelector('[data-clear-search]')?.addEventListener('click', () => {
        state.query = '';
        const search = $('#historySearch');
        if (search) search.value = '';
        load();
      });
    } else {
      empty.innerHTML = `
        <span class="empty-icon">🕊️</span>
        <h3>No conversations yet</h3>
        <p>When you talk with MindMate, your conversations will live here — private and persistent.</p>
        <button class="btn btn-primary" type="button" data-empty-new>${icon('message-circle')} Start a conversation</button>`;
      empty.querySelector('[data-empty-new]')?.addEventListener('click', startNewChat);
    }
    refreshIcons();
    return;
  }

  empty.hidden = true;
  list.innerHTML = conversations.map(itemHtml).join('');
  refreshIcons();
}

async function load({ quiet = false } = {}) {
  if (state.loading) return;
  state.loading = true;
  const list = $('#historyList');
  if (list && !state.conversations.length) {
    list.innerHTML = Array.from({ length: 3 })
      .map(
        () => `
        <div class="history-item" aria-hidden="true">
          <span class="history-icon skeleton"></span>
          <div class="history-copy"><div class="skeleton skeleton-row"></div><div class="skeleton skeleton-row"></div><div class="skeleton skeleton-row"></div></div>
          <span class="skeleton" style="width:118px;height:34px"></span>
        </div>`,
      )
      .join('');
  }
  try {
    const data = await api.conversations.list({ q: state.query, limit: 200 });
    state.conversations = data.conversations || [];
    store.set({ conversations: state.conversations }, 'conversations');
    render();
  } catch (error) {
    if (!quiet) toast('error', 'Could not load history', error.message);
    if (list) list.innerHTML = '';
  } finally {
    state.loading = false;
  }
}

async function startNewChat() {
  await newChat({ focus: false, navigateTo: true });
}

function renameConversation(conversation) {
  const backdrop = openModal({
    title: 'Rename conversation',
    description: 'A short title makes it easier to find later.',
    iconName: 'pencil',
    body: `
      <form id="renameForm" class="settings-form">
        <label class="field">
          <span>Title</span>
          <input type="text" id="renameInput" maxlength="80" value="${escapeHtml(conversation.title)}" autocomplete="off" />
          <small>Up to 80 characters.</small>
        </label>
      </form>`,
    footer: `
      <button class="btn btn-ghost" type="button" data-cancel>Cancel</button>
      <button class="btn btn-primary" type="submit" form="renameForm">${icon('check')} Save title</button>`,
  });

  const form = backdrop.querySelector('#renameForm');
  backdrop.querySelector('[data-cancel]')?.addEventListener('click', closeModal);
  form?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const title = backdrop.querySelector('#renameInput')?.value.trim();
    if (!title) {
      toast('warning', 'Title needed', 'Give the conversation a short title.');
      return;
    }
    const submit = backdrop.querySelector('[type="submit"]');
    setBusy(submit, true, 'Saving…');
    try {
      await api.conversations.rename(conversation.id, title);
      closeModal();
      toast('success', 'Conversation renamed', title);
      await load({ quiet: true });
    } catch (error) {
      setBusy(submit, false);
      toast('error', 'Could not rename conversation', error.message);
    }
  });
}

async function deleteConversation(conversation) {
  const ok = await confirmDialog({
    title: 'Delete this conversation?',
    message: `“${truncate(conversation.title, 60)}” and all of its messages will be permanently removed.`,
    confirmLabel: 'Delete conversation',
    danger: true,
  });
  if (!ok) return;
  try {
    await api.conversations.remove(conversation.id);
    if (store.get('currentConversationId') === conversation.id) {
      store.set({ currentConversationId: null }, 'conversation');
    }
    toast('success', 'Conversation deleted');
    await load({ quiet: true });
  } catch (error) {
    toast('error', 'Could not delete conversation', error.message);
  }
}

function bindOnce() {
  if (state.bound) return;
  state.bound = true;

  $('#historySearch')?.addEventListener(
    'input',
    debounce((event) => {
      state.query = event.target.value.trim();
      load();
    }, 240),
  );

  $('#historySort')?.addEventListener('change', (event) => {
    state.sort = event.target.value;
    render();
  });

  $('#historyRefresh')?.addEventListener('click', async (event) => {
    const button = event.currentTarget;
    setBusy(button, true, 'Refreshing…');
    await load();
    setBusy(button, false);
  });

  $('#historyNewChat')?.addEventListener('click', startNewChat);

  $('#historyList')?.addEventListener('click', (event) => {
    const item = event.target.closest('[data-id]');
    if (!item) return;
    const conversation = state.conversations.find((entry) => entry.id === item.dataset.id);
    if (!conversation) return;
    const action = event.target.closest('[data-action]')?.dataset.action;
    if (action === 'rename') return renameConversation(conversation);
    if (action === 'delete') return deleteConversation(conversation);
    if (action === 'open' || event.target.closest('.history-copy')) {
      store.set({ currentConversationId: conversation.id }, 'conversation');
      navigate('chat');
    }
  });
}

export async function mount() {
  bindOnce();
  const sort = $('#historySort');
  if (sort) sort.value = state.sort;
  const search = $('#historySearch');
  if (search && search.value.trim() !== state.query) search.value = state.query;
  await load();
}
