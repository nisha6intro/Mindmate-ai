/** Emotional memories: review, resolve, reopen, add, pause and clear. */

import { api } from '../api.js';
import { store } from '../store.js';
import {
  $,
  closeModal,
  confirmDialog,
  debounce,
  escapeHtml,
  formatDate,
  icon,
  openModal,
  refreshIcons,
  relativeDay,
  setBusy,
  toast,
} from '../ui.js';

const state = {
  memories: [],
  counts: { active: 0, resolved: 0, total: 0 },
  memoryEnabled: true,
  query: '',
  bound: false,
};

const SOURCE_LABEL = {
  conversation: 'from a chat',
  manual: 'added by you',
  legacy: 'from your original memory',
};

function updateNavCount() {
  const badge = $('#navMemoryCount');
  if (!badge) return;
  const count = state.counts.active || 0;
  badge.textContent = String(count);
  badge.hidden = count === 0;
}

function filtered(list) {
  if (!state.query) return list;
  const query = state.query.toLowerCase();
  return list.filter((memory) => memory.text.toLowerCase().includes(query));
}

function memoryItem(memory, { resolved = false } = {}) {
  const keywords = (memory.keywords || [])
    .slice(0, 4)
    .map((keyword) => `<span class="memory-keyword">${escapeHtml(keyword)}</span>`)
    .join('');
  const source = SOURCE_LABEL[memory.source] || 'saved memory';
  const action = resolved
    ? `<button class="icon-btn icon-btn-sm" type="button" data-action="reopen" data-id="${escapeHtml(memory.id)}" aria-label="Reopen memory" title="Move back to active">${icon('rotate-ccw')}</button>`
    : `<button class="icon-btn icon-btn-sm" type="button" data-action="resolve" data-id="${escapeHtml(memory.id)}" aria-label="Mark as resolved" title="Mark as resolved">${icon('check')}</button>`;

  return `
    <div class="memory-item${resolved ? ' is-resolved' : ''}" data-memory="${escapeHtml(memory.id)}">
      <div class="memory-item-body">
        <p class="memory-item-text">${escapeHtml(memory.text)}</p>
        <div class="memory-item-meta">
          <span>${icon('clock')} ${escapeHtml(relativeDay(memory.updatedAt))} · ${escapeHtml(formatDate(memory.updatedAt))}</span>
          <span>${icon('quote')} ${escapeHtml(source)}</span>
          ${memory.count > 1 ? `<span>${icon('repeat')} mentioned ${memory.count}×</span>` : ''}
          ${keywords}
        </div>
      </div>
      <div class="memory-item-actions">
        ${action}
        <button class="icon-btn icon-btn-sm" type="button" data-action="delete" data-id="${escapeHtml(memory.id)}" aria-label="Delete memory" title="Delete memory">${icon('trash-2')}</button>
      </div>
    </div>`;
}

function renderPreference() {
  const button = $('#saveMemoryPrefBtn');
  if (button) {
    button.innerHTML = state.memoryEnabled ? `${icon('brain')} Memory is on` : `${icon('brain')} Memory is paused`;
    button.title = state.memoryEnabled ? 'Pause emotional memory' : 'Turn emotional memory back on';
    button.setAttribute('aria-pressed', String(state.memoryEnabled));
  }
  const banner = $('#memoryBanner');
  if (banner) {
    banner.classList.toggle('is-off', !state.memoryEnabled);
    const copy = banner.querySelector('div');
    if (copy) {
      copy.innerHTML = state.memoryEnabled
        ? '<strong>Memory is under your control.</strong><p>It remembers up to 50 active emotional notes, never stores passwords or sensitive identifiers, and can be paused or cleared at any moment.</p>'
        : '<strong>Memory is paused.</strong><p>MindMate will not save new emotional context or recall old notes in conversation. Everything already stored remains here until you delete it.</p>';
    }
  }
}

function render() {
  const active = filtered(state.activeList || []);
  const resolved = filtered(state.resolvedList || []);

  const activeNode = $('#memoryList');
  const resolvedNode = $('#resolvedMemoryList');
  if (activeNode) {
    activeNode.innerHTML = active.length
      ? active.map((memory) => memoryItem(memory)).join('')
      : `<div class="memory-empty"><strong>${state.query ? 'No matching active memories' : 'Nothing in mind right now'}</strong>${state.query ? 'Try a different word.' : 'When you share something emotional in chat, it can appear here — only while memory is on.'}</div>`;
  }
  if (resolvedNode) {
    resolvedNode.innerHTML = resolved.length
      ? resolved.map((memory) => memoryItem(memory, { resolved: true })).join('')
      : `<div class="memory-empty"><strong>${state.query ? 'No matching resolved memories' : 'Nothing resolved yet'}</strong>${state.query ? 'Try a different word.' : 'When something you were carrying feels settled, resolve it here to keep the history lightly.'}</div>`;
  }

  const activeCount = $('#memoryActiveCount');
  if (activeCount) activeCount.textContent = String(state.counts.active || 0);
  const resolvedCount = $('#memoryResolvedCount');
  if (resolvedCount) resolvedCount.textContent = String(state.counts.resolved || 0);
  const activeBadge = $('#activeMemoryBadge');
  if (activeBadge) activeBadge.textContent = `${state.activeList?.length || 0} total`;
  const resolvedBadge = $('#resolvedMemoryBadge');
  if (resolvedBadge) resolvedBadge.textContent = `${state.resolvedList?.length || 0} total`;

  renderPreference();
  updateNavCount();
  refreshIcons();
}

async function load({ quiet = false } = {}) {
  try {
    const data = await api.memory.list();
    state.memories = data.memories || [];
    state.activeList = data.active || [];
    state.resolvedList = data.resolved || [];
    state.counts = data.counts || { active: 0, resolved: 0, total: 0 };
    state.memoryEnabled = Boolean(data.memoryEnabled);
    render();
  } catch (error) {
    if (!quiet) toast('error', 'Could not load memories', error.message);
  }
}

function addMemoryModal() {
  const backdrop = openModal({
    title: 'Add a memory',
    description: 'Something you would like MindMate to keep in mind for later.',
    iconName: 'brain',
    body: `
      <form id="addMemoryForm" class="settings-form">
        <label class="field">
          <span>What should MindMate remember?</span>
          <input type="text" id="addMemoryText" maxlength="500" placeholder="E.g. I have an exam next month and I am feeling anxious about it." autocomplete="off" />
          <small>Up to 500 characters. You can resolve or delete it at any time.</small>
        </label>
      </form>`,
    footer: `
      <button class="btn btn-ghost" type="button" data-cancel>Cancel</button>
      <button class="btn btn-primary" type="submit" form="addMemoryForm">${icon('plus')} Add memory</button>`,
  });

  const form = backdrop.querySelector('#addMemoryForm');
  backdrop.querySelector('[data-cancel]')?.addEventListener('click', closeModal);
  form?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const value = backdrop.querySelector('#addMemoryText')?.value.trim();
    if (!value || value.length < 3) {
      toast('warning', 'A few more words', 'Write at least a few words so the memory is useful.');
      return;
    }
    const submit = backdrop.querySelector('[type="submit"]');
    setBusy(submit, true, 'Saving…');
    try {
      await api.memory.add(value);
      closeModal();
      toast('success', 'Memory added', 'You can resolve or delete it at any time.');
      await load({ quiet: true });
    } catch (error) {
      setBusy(submit, false);
      toast('error', 'Could not add memory', error.message);
    }
  });
}

async function togglePreference(event) {
  const button = event.currentTarget;
  const next = !state.memoryEnabled;
  setBusy(button, true, next ? 'Turning on…' : 'Pausing…');
  try {
    const { settings } = await api.settings.update({ memoryEnabled: next });
    state.memoryEnabled = Boolean(settings.memoryEnabled);
    store.set({ settings: { ...(store.get('settings') || {}), ...settings } }, 'settings');
    renderPreference();
    toast(
      'success',
      state.memoryEnabled ? 'Memory is on' : 'Memory is paused',
      state.memoryEnabled ? 'MindMate can notice and recall meaningful context again.' : 'No new memories will be saved or recalled.',
    );
  } catch (error) {
    toast('error', 'Could not update memory setting', error.message);
  } finally {
    setBusy(button, false);
    renderPreference();
  }
}

async function setStatus(id, status) {
  try {
    await api.memory.setStatus(id, status);
    toast('success', status === 'resolved' ? 'Memory resolved' : 'Memory reopened');
    await load({ quiet: true });
  } catch (error) {
    toast('error', 'Could not update memory', error.message);
  }
}

async function removeMemory(id) {
  const ok = await confirmDialog({
    title: 'Delete this memory?',
    message: 'MindMate will no longer use this note for context. This cannot be undone.',
    confirmLabel: 'Delete memory',
    danger: true,
  });
  if (!ok) return;
  try {
    await api.memory.remove(id);
    toast('success', 'Memory deleted');
    await load({ quiet: true });
  } catch (error) {
    toast('error', 'Could not delete memory', error.message);
  }
}

function bindOnce() {
  if (state.bound) return;
  state.bound = true;

  $('#addMemoryBtn')?.addEventListener('click', addMemoryModal);
  $('#saveMemoryPrefBtn')?.addEventListener('click', togglePreference);

  $('#memoryList')?.addEventListener('click', handleItemAction);
  $('#resolvedMemoryList')?.addEventListener('click', handleItemAction);

  function handleItemAction(event) {
    const button = event.target.closest('[data-action]');
    if (!button) return;
    const id = button.dataset.id;
    if (button.dataset.action === 'resolve') setStatus(id, 'resolved');
    else if (button.dataset.action === 'reopen') setStatus(id, 'active');
    else if (button.dataset.action === 'delete') removeMemory(id);
  }

  $('#memorySearch')?.addEventListener(
    'input',
    debounce((event) => {
      state.query = event.target.value.trim();
      render();
    }, 180),
  );

  $('#clearResolvedBtn')?.addEventListener('click', async () => {
    if (!state.counts.resolved) {
      toast('info', 'Nothing to clear', 'You have no resolved memories yet.');
      return;
    }
    const ok = await confirmDialog({
      title: 'Clear resolved memories?',
      message: `${state.counts.resolved} resolved memor${state.counts.resolved === 1 ? 'y' : 'ies'} will be deleted. Active memories are kept.`,
      confirmLabel: 'Clear resolved',
      danger: true,
    });
    if (!ok) return;
    try {
      await api.memory.clear('resolved');
      toast('success', 'Resolved memories cleared');
      await load({ quiet: true });
    } catch (error) {
      toast('error', 'Could not clear resolved memories', error.message);
    }
  });

  $('#clearAllMemoriesBtn')?.addEventListener('click', async () => {
    if (!state.counts.total) {
      toast('info', 'Nothing to clear', 'You have no stored memories.');
      return;
    }
    const ok = await confirmDialog({
      title: 'Clear all emotional memories?',
      message: 'This deletes every active and resolved memory. MindMate will no longer recall this context.',
      note: 'A backup is saved on the server first. This cannot be undone from the app.',
      confirmLabel: 'Clear everything',
      danger: true,
    });
    if (!ok) return;
    try {
      await api.memory.clear('all');
      toast('success', 'All memories cleared');
      await load({ quiet: true });
    } catch (error) {
      toast('error', 'Could not clear memories', error.message);
    }
  });
}

export async function mount() {
  bindOnce();
  const search = $('#memorySearch');
  if (search && search.value.trim() !== state.query) state.query = search.value.trim();
  await load();
  refreshIcons();
}
