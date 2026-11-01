/** Self-care: reminder catalog, random prompts, history and notifications. */

import { api } from '../api.js';
import { reminderCategory, reminderEmoji } from '../constants.js';
import { store } from '../store.js';
import { navigate } from '../router.js';
import {
  $,
  escapeHtml,
  formatTime,
  icon,
  openModal,
  closeModal,
  refreshIcons,
  relativeDay,
  setBusy,
  toast,
} from '../ui.js';

const state = {
  catalog: [],
  history: [],
  last: null,
  settings: null,
  bound: false,
};

function currentSettings() {
  return state.settings || store.get('settings') || {};
}

function notificationStatus() {
  const settings = currentSettings();
  if (typeof Notification === 'undefined') {
    return 'This browser does not support desktop notifications. Your reminders are still saved here.';
  }
  if (!settings.reminderNotifications) {
    return 'Browser reminders are off. Turn them on in Settings.';
  }
  if (Notification.permission === 'granted') {
    return 'Browser reminders are on for each self-care prompt you save.';
  }
  if (Notification.permission === 'denied') {
    return 'Notifications are blocked by your browser. You can re-enable them in browser settings.';
  }
  return 'One more step: allow notifications in your browser to receive reminders.';
}

function renderNotificationStatus() {
  const node = $('#careNotificationStatus');
  if (node) node.textContent = notificationStatus();
}

function findCatalog(text) {
  return state.catalog.find((item) => item.text === text) || null;
}

function renderHero() {
  const reminder = state.last;
  const emoji = $('#careHeroEmoji');
  const kicker = $('#careHeroKicker');
  const text = $('#careHeroText');
  const meta = $('#careHeroMeta');

  if (reminder?.text) {
    const catalogItem = findCatalog(reminder.text);
    if (emoji) emoji.textContent = catalogItem?.emoji || reminderEmoji(reminder.text);
    if (kicker) kicker.textContent = catalogItem?.category || reminderCategory(reminder.text);
    if (text) text.textContent = reminder.text;
    if (meta) {
      meta.textContent = reminder.timestamp
        ? `Saved ${relativeDay(reminder.timestamp).toLowerCase()} · ${formatTime(reminder.timestamp)}. Come back to it whenever you need.`
        : 'One of the reminders you have kept. Come back to it whenever you need.';
    }
  } else {
    if (emoji) emoji.textContent = '💜';
    if (kicker) kicker.textContent = 'A moment for you';
    if (text) text.textContent = 'Take three deep breaths.';
    if (meta) meta.textContent = "Self-care isn't a reward. It's maintenance.";
  }
  renderNotificationStatus();
}

function renderCatalog() {
  const container = $('#careCatalog');
  if (!container) return;
  if (!state.catalog.length) {
    container.innerHTML = '<div class="reminder-empty">The self-care menu is unavailable right now.</div>';
    return;
  }
  container.innerHTML = state.catalog
    .map(
      (item) => `
      <button class="care-catalog-item" type="button" data-reminder-id="${escapeHtml(item.id)}" title="Save this reminder">
        <span class="care-catalog-emoji" aria-hidden="true">${item.emoji}</span>
        <span class="care-catalog-copy"><strong>${escapeHtml(item.text)}</strong><span>${escapeHtml(item.category)}</span></span>
        ${icon('plus')}
      </button>`,
    )
    .join('');
  refreshIcons();
}

function renderHistory() {
  const container = $('#reminderHistory');
  if (!container) return;
  if (!state.history.length) {
    container.innerHTML = '<div class="reminder-empty">No reminders yet. Choose one from the menu, or ask for something new.</div>';
    return;
  }
  container.innerHTML = state.history
    .map(
      (reminder) => `
      <div class="reminder-row">
        <span class="reminder-row-emoji" aria-hidden="true">${reminderEmoji(reminder.text)}</span>
        <div class="reminder-row-copy">
          <strong>${escapeHtml(reminder.text)}</strong>
          <span>${escapeHtml(reminder.timestamp ? `${relativeDay(reminder.timestamp)} · ${formatTime(reminder.timestamp)}` : 'Earlier reminder')}${reminder.legacy ? ' · from your original log' : ''}</span>
        </div>
        <button class="icon-btn icon-btn-sm" type="button" data-delete-reminder="${reminder.id}" aria-label="Remove reminder" title="Remove reminder">${icon('x')}</button>
      </div>`,
    )
    .join('');
  refreshIcons();
}

function render() {
  renderHero();
  renderCatalog();
  renderHistory();
}

async function load({ quiet = false } = {}) {
  try {
    const [reminders, settingsPayload] = await Promise.all([api.reminders.list(), api.settings.get()]);
    state.catalog = reminders.catalog || [];
    state.history = reminders.history || [];
    state.last = reminders.last || null;
    state.settings = settingsPayload.settings;
    store.set({ settings: { ...(store.get('settings') || {}), ...settingsPayload.settings } }, 'settings');
    render();
  } catch (error) {
    if (!quiet) toast('error', 'Self-care space unavailable', error.message);
  }
}

function notify(reminder) {
  const settings = currentSettings();
  if (!settings.reminderNotifications) return;
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  try {
    new Notification('A small self-care moment', {
      body: reminder.text,
      tag: 'mindmate-selfcare',
      icon: '/assets/favicon.svg',
    });
  } catch {
    // Some browsers require a service worker; the in-app reminder still works.
  }
}

async function addReminder(payload, button = null) {
  if (button) setBusy(button, true, 'Saving…');
  try {
    const result = await api.reminders.add(payload);
    notify(result.reminder);
    toast('success', 'Reminder saved', result.reminder.text);
    await load({ quiet: true });
    return true;
  } catch (error) {
    toast('error', 'Could not save reminder', error.message);
    return false;
  } finally {
    if (button) setBusy(button, false);
  }
}

function openCustomReminder() {
  const backdrop = openModal({
    title: 'Add your own reminder',
    description: 'A sentence you would like future-you to read.',
    iconName: 'sprout',
    body: `
      <form id="customReminderForm" class="settings-form">
        <label class="field">
          <span>Reminder</span>
          <input type="text" id="customReminderText" maxlength="220" placeholder="E.g. Stretch your shoulders and look out the window." autocomplete="off" />
          <small>Up to 220 characters. Keep it small and kind.</small>
        </label>
      </form>`,
    footer: `
      <button class="btn btn-ghost" type="button" data-cancel>Cancel</button>
      <button class="btn btn-primary" type="submit" form="customReminderForm" id="customReminderSave">${icon('check')} Save reminder</button>`,
  });

  const form = backdrop.querySelector('#customReminderForm');
  const save = backdrop.querySelector('#customReminderSave');
  backdrop.querySelector('[data-cancel]')?.addEventListener('click', closeModal);
  form?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const value = backdrop.querySelector('#customReminderText')?.value.trim();
    if (!value) {
      toast('warning', 'Add a few words', 'Write a short reminder first.');
      return;
    }
    const ok = await addReminder({ text: value }, save);
    if (ok) closeModal();
  });
}

function bindOnce() {
  if (state.bound) return;
  state.bound = true;

  $('#careCatalog')?.addEventListener('click', (event) => {
    const item = event.target.closest('[data-reminder-id]');
    if (!item) return;
    addReminder({ reminderId: item.dataset.reminderId }, item);
  });

  $('#careHeroButton')?.addEventListener('click', (event) => {
    addReminder({}, event.currentTarget);
  });

  $('#newReminderBtn')?.addEventListener('click', openCustomReminder);

  $('#clearReminderHistory')?.addEventListener('click', async (event) => {
    if (!state.history.length) {
      toast('info', 'Nothing to clear', 'Your reminder history is already empty.');
      return;
    }
    const { confirmDialog } = await import('../ui.js');
    const ok = await confirmDialog({
      title: 'Clear reminder history?',
      message: 'Every saved reminder will be removed from this list. A backup is kept on the server.',
      confirmLabel: 'Clear reminders',
      danger: true,
    });
    if (!ok) return;
    const button = event.currentTarget;
    setBusy(button, true, 'Clearing…');
    try {
      await api.reminders.clear();
      toast('success', 'Reminder history cleared');
      await load({ quiet: true });
    } catch (error) {
      toast('error', 'Could not clear reminders', error.message);
    } finally {
      setBusy(button, false);
    }
  });

  $('#reminderHistory')?.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-delete-reminder]');
    if (!button) return;
    const { confirmDialog } = await import('../ui.js');
    const ok = await confirmDialog({
      title: 'Remove this reminder?',
      message: 'It will be deleted from your reminder history.',
      confirmLabel: 'Remove',
      danger: true,
    });
    if (!ok) return;
    try {
      await api.reminders.remove(button.dataset.deleteReminder);
      toast('success', 'Reminder removed');
      await load({ quiet: true });
    } catch (error) {
      toast('error', 'Could not remove reminder', error.message);
    }
  });

  $('#careNotificationStatus')?.addEventListener('click', () => navigate('settings'));
  $('#careNotificationStatus')?.setAttribute('title', 'Open notification settings');
  $('#careNotificationStatus')?.style.setProperty('cursor', 'pointer');
  $('#careNotificationStatus')?.setAttribute('role', 'button');
  $('#careNotificationStatus')?.setAttribute('tabindex', '0');
  $('#careNotificationStatus')?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      navigate('settings');
    }
  });
}

export async function mount() {
  bindOnce();
  state.settings = store.get('settings') || state.settings;
  renderNotificationStatus();
  await load();
  refreshIcons();
}
