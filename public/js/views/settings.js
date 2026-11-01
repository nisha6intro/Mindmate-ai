/** Settings: profile, appearance, AI status, privacy controls and data resets. */

import { api, downloadExport } from '../api.js';
import { refreshCharts } from '../charts.js';
import { store, syncIdentity } from '../store.js';
import { refreshConversationLists } from './chat.js';
import { openSupportModal } from '../support.js';
import {
  $,
  applyTheme,
  confirmDialog,
  refreshIcons,
  setBusy,
  showFormError,
  toast,
} from '../ui.js';

const state = {
  settings: null,
  health: null,
  theme: 'system',
  bound: false,
};

const RESET_COPY = {
  conversations: {
    title: 'Clear all conversations?',
    message: 'Every conversation and message will be removed. Moods, memories and reminders stay.',
    confirmLabel: 'Clear conversations',
    success: 'Conversations cleared',
  },
  mood: {
    title: 'Clear mood history?',
    message: 'Every mood check-in will be deleted and the chart will reset.',
    confirmLabel: 'Clear mood history',
    success: 'Mood history cleared',
  },
  reminders: {
    title: 'Clear all reminders?',
    message: 'Every saved self-care reminder will be removed.',
    confirmLabel: 'Clear reminders',
    success: 'Reminders cleared',
  },
  settings: {
    title: 'Reset preferences?',
    message: 'Your display name, theme and toggles will return to their defaults.',
    confirmLabel: 'Reset preferences',
    success: 'Preferences reset',
  },
  all: {
    title: 'Erase all wellness data?',
    message: 'Conversations, mood history, memories and reminders will all be erased. Your preferences are kept unless you reset them separately.',
    confirmLabel: 'Erase everything',
    success: 'All wellness data erased',
  },
};

function paintThemeButtons() {
  for (const button of document.querySelectorAll('[data-theme-option]')) {
    const active = button.dataset.themeOption === state.theme;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-pressed', String(active));
  }
}

function fillForm() {
  const settings = state.settings;
  if (!settings) return;
  const name = $('#settingsName');
  if (name) name.value = settings.displayName === 'Friend' ? '' : settings.displayName;
  const memory = $('#settingsMemory');
  if (memory) memory.checked = Boolean(settings.memoryEnabled);
  const notifications = $('#settingsNotifications');
  if (notifications) notifications.checked = Boolean(settings.reminderNotifications);
  const motion = $('#settingsMotion');
  if (motion) motion.checked = Boolean(settings.reduceMotion);
  state.theme = settings.theme || 'system';
  paintThemeButtons();
}

function renderHealth() {
  const health = state.health;
  const card = $('#connectionCard');
  const dot = $('#connectionDot');
  const title = $('#connectionTitle');
  const text = $('#connectionText');
  if (!card || !title || !text) return;

  card.classList.remove('is-online', 'is-offline');
  if (dot) dot.className = 'connection-dot';

  if (!health) {
    title.textContent = 'Checking connection…';
    text.textContent = 'Looking for your local Ollama server.';
    return;
  }

  const ai = health.ai || {};
  if (ai.ready) {
    card.classList.add('is-online');
    title.textContent = 'Connected to Ollama';
    text.textContent = `${ai.model || 'phi-mindmate'} is ready. Replies stream privately from your local model.`;
  } else if (ai.reachable && !ai.modelInstalled) {
    card.classList.add('is-offline');
    title.textContent = 'Ollama is running — model missing';
    text.textContent = `Pull the model with “ollama pull ${ai.model || 'phi-mindmate'}” and try again.`;
  } else {
    card.classList.add('is-offline');
    title.textContent = 'Ollama is not reachable';
    text.textContent = ai.error || 'Start Ollama locally to enable AI replies. Everything else still works offline.';
  }

  const model = $('#settingsModel');
  if (model) model.textContent = ai.model || 'phi-mindmate';
  const vector = $('#settingsVector');
  if (vector) {
    const mode = health.vector?.mode;
    vector.textContent =
      mode === 'embeddings' ? 'Ollama embeddings' : mode === 'indexing' ? 'Building index…' : 'Local lexical';
  }
  const docs = $('#settingsDocs');
  if (docs) docs.textContent = String(health.vector?.documents ?? 0);
  const disclaimer = $('#settingsDisclaimer');
  if (disclaimer && health.disclaimer) disclaimer.textContent = health.disclaimer;
}

async function loadHealth({ refresh = false, quiet = false } = {}) {
  try {
    state.health = await api.health({ refresh });
    store.set({ health: state.health }, 'health');
    renderHealth();
  } catch (error) {
    if (!quiet) toast('error', 'Could not check AI status', error.message);
    state.health = null;
    renderHealth();
  }
}

async function load({ quiet = false } = {}) {
  try {
    const [{ settings }, health] = await Promise.all([api.settings.get(), api.health().catch(() => null)]);
    state.settings = settings;
    state.health = health;
    store.set({ settings: { ...(store.get('settings') || {}), ...settings }, health }, 'settings');
    syncIdentity(settings);
    fillForm();
    renderHealth();
    refreshIcons();
  } catch (error) {
    if (!quiet) toast('error', 'Could not load settings', error.message);
  }
}

async function saveSettings(event) {
  event.preventDefault();
  const form = event.currentTarget;
  showFormError(form, '');
  const submit = $('#saveSettingsBtn');
  setBusy(submit, true, 'Saving…');

  const name = $('#settingsName')?.value.trim() || 'Friend';
  const memoryEnabled = Boolean($('#settingsMemory')?.checked);
  const reduceMotion = Boolean($('#settingsMotion')?.checked);
  let reminderNotifications = Boolean($('#settingsNotifications')?.checked);

  if (reminderNotifications) {
    if (typeof Notification === 'undefined') {
      reminderNotifications = false;
      const toggle = $('#settingsNotifications');
      if (toggle) toggle.checked = false;
      toast('warning', 'Notifications unavailable', 'This browser does not support desktop notifications.');
    } else if (Notification.permission !== 'granted') {
      try {
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') {
          reminderNotifications = false;
          const toggle = $('#settingsNotifications');
          if (toggle) toggle.checked = false;
          toast(
            'warning',
            'Notifications not allowed',
            permission === 'denied'
              ? 'Your browser blocked notifications. You can re-enable them in browser settings.'
              : 'Reminders will stay in the app, but desktop notifications need permission.',
          );
        }
      } catch {
        reminderNotifications = false;
      }
    }
  }

  try {
    const { settings } = await api.settings.update({
      displayName: name,
      theme: state.theme,
      memoryEnabled,
      reminderNotifications,
      reduceMotion,
    });
    state.settings = settings;
    store.set({ settings: { ...(store.get('settings') || {}), ...settings } }, 'settings');
    applyTheme(settings.theme, { reduceMotion: settings.reduceMotion });
    syncIdentity(settings);
    fillForm();
    refreshCharts();
    toast('success', 'Preferences saved', 'MindMate will remember your choices.');
  } catch (error) {
    showFormError(form, error.message);
    toast('error', 'Could not save preferences', error.message);
  } finally {
    setBusy(submit, false);
  }
}

function bindOnce() {
  if (state.bound) return;
  state.bound = true;

  $('#profileForm')?.addEventListener('submit', saveSettings);

  document.querySelectorAll('[data-theme-option]').forEach((button) => {
    button.addEventListener('click', () => {
      state.theme = button.dataset.themeOption;
      paintThemeButtons();
      applyTheme(state.theme, { reduceMotion: Boolean($('#settingsMotion')?.checked) });
      refreshCharts();
    });
  });

  $('#settingsMotion')?.addEventListener('change', (event) => {
    document.documentElement.dataset.reduceMotion = String(event.target.checked);
  });

  $('#refreshHealthBtn')?.addEventListener('click', async (event) => {
    const button = event.currentTarget;
    setBusy(button, true);
    await loadHealth({ refresh: true });
    setBusy(button, false);
    toast('info', 'AI status refreshed', state.health?.ai?.ready ? 'Ollama is ready.' : 'Ollama is not available right now.');
  });

  $('#exportDataBtn')?.addEventListener('click', () => {
    downloadExport();
    toast('success', 'Export started', 'Your private data is downloading as JSON. Keep it somewhere safe.');
  });

  $('#aboutSupportBtn')?.addEventListener('click', openSupportModal);

  document.querySelectorAll('[data-reset]').forEach((button) => {
    button.addEventListener('click', async () => {
      const scope = button.dataset.reset;
      const copy = RESET_COPY[scope];
      if (!copy) return;
      const ok = await confirmDialog({
        title: copy.title,
        message: copy.message,
        note: 'A backup is saved on the server first.',
        confirmLabel: copy.confirmLabel,
        danger: true,
      });
      if (!ok) return;
      setBusy(button, true, 'Clearing…');
      try {
        const result = await api.data.reset(scope);
        if (scope === 'conversations' || scope === 'all') {
          store.set({ currentConversationId: null }, 'conversation');
          refreshConversationLists();
        }
        if (scope === 'settings' || scope === 'all') {
          state.settings = result.settings || (await api.settings.get()).settings;
          applyTheme(state.settings.theme, { reduceMotion: state.settings.reduceMotion });
          syncIdentity(state.settings);
          fillForm();
        }
        if (scope === 'memories' || scope === 'all') {
          const badge = $('#navMemoryCount');
          if (badge) badge.hidden = true;
        }
        toast('success', copy.success, 'A backup was created before anything was removed.');
        await load({ quiet: true });
        refreshIcons();
      } catch (error) {
        toast('error', 'Could not complete that reset', error.message);
      } finally {
        setBusy(button, false);
      }
    });
  });
}

export async function mount() {
  bindOnce();
  await load();
  paintThemeButtons();
}
