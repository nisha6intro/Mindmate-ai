/** Dashboard view: live stats, mood chart, quick check-in and gentle prompts. */

import { api } from '../api.js';
import { renderMoodChart } from '../charts.js';
import { MOODS, moodByLevel, reminderEmoji } from '../constants.js';
import { store, syncIdentity } from '../store.js';
import { navigate } from '../router.js';
import {
  $,
  $$,
  escapeHtml,
  formatDate,
  greeting,
  icon,
  refreshIcons,
  relativeDay,
  relativeTime,
  setBusy,
  toast,
  truncate,
} from '../ui.js';

let selectedMood = null;
let loading = false;

const TREND = {
  up: { label: 'Improving', icon: 'trending-up' },
  down: { label: 'Heavier stretch', icon: 'trending-down' },
  steady: { label: 'Steady', icon: 'activity' },
};

const HEADLINES = {
  1: "There is room for how you feel.",
  2: "You don't have to carry this alone.",
  3: 'A quiet moment, just for you.',
  4: "Let's make space for the good.",
  5: 'What a lovely place to be today.',
};

function renderQuickMoods() {
  const container = $('#quickMoodOptions');
  if (!container) return;
  container.innerHTML = MOODS.map(
    (mood) => `
      <button class="quick-mood-option${selectedMood === mood.level ? ' is-selected' : ''}"
        type="button" data-mood="${mood.level}" aria-pressed="${selectedMood === mood.level}" title="${escapeHtml(mood.label)}">
        <span>${mood.emoji}</span>${escapeHtml(mood.label)}
      </button>`,
  ).join('');
  const submit = $('#quickMoodSubmit');
  if (submit) submit.disabled = !selectedMood;
}

function renderStats(mood, conversations, memories) {
  const current = mood.current;
  const setStat = (key, value, note) => {
    const valueNode = $(`[data-stat="${key}"]`);
    if (valueNode) valueNode.textContent = value;
    if (note !== undefined) {
      const noteNode = $(`[data-stat="${key}-note"]`);
      if (noteNode) noteNode.textContent = note;
    }
  };
  setStat('mood', current ? current.label : '—', current ? relativeTime(current.timestamp) : 'No check-in yet');
  setStat('checkins', String(mood.checkins7Days ?? 0), mood.streak ? `${mood.streak}-day check-in streak` : 'Small check-ins count');
  setStat('conversations', String(conversations.total ?? 0), conversations.total ? `${conversations.messages ?? 0} messages kept private` : 'A space to be heard');
  setStat('memories', String(memories.counts?.active ?? 0), memories.counts?.active ? `${memories.counts.resolved ?? 0} resolved` : 'Only what you choose to keep');
}

function renderRecent(recent = []) {
  const container = $('#recentConversations');
  if (!container) return;
  if (!recent.length) {
    container.innerHTML = `
      <div class="snapshot-empty">
        No conversations yet. <a href="#/chat" class="text-link">Start one <i data-lucide="arrow-right"></i></a>
      </div>`;
    return;
  }
  container.innerHTML = recent
    .slice(0, 4)
    .map(
      (conversation) => `
      <button class="recent-item" type="button" data-conversation="${escapeHtml(conversation.id)}">
        <span class="recent-item-icon">${icon('message-circle')}</span>
        <span class="recent-item-copy">
          <strong>${escapeHtml(truncate(conversation.title, 44))}</strong>
          <span>${escapeHtml(truncate(conversation.preview, 58))}</span>
        </span>
        <span class="history-badge">${escapeHtml(relativeDay(conversation.updatedAt))}</span>
        ${icon('chevron-right')}
      </button>`,
    )
    .join('');

  for (const item of $$('[data-conversation]', container)) {
    item.addEventListener('click', () => {
      store.set({ currentConversationId: item.dataset.conversation }, 'conversation');
      navigate('chat');
    });
  }
}

function renderMemories(memories) {
  const container = $('#dashboardMemories');
  if (!container) return;
  const recent = memories.recent || [];
  if (!recent.length) {
    container.innerHTML = `
      <div class="snapshot-empty">
        Nothing stored yet. As you talk, meaningful feelings can be remembered here — only if you keep memory on.
      </div>`;
    return;
  }
  container.innerHTML = recent
    .map(
      (memory) => `
      <div class="snapshot-item">
        <p>${escapeHtml(truncate(memory.text, 150))}</p>
        <span>${escapeHtml(relativeDay(memory.updatedAt))}${memory.count > 1 ? ` · mentioned ${memory.count}×` : ''}</span>
      </div>`,
    )
    .join('');
}

function renderSuggestions(suggestions = []) {
  const container = $('#dashboardSuggestions');
  if (!container) return;
  container.innerHTML = suggestions
    .map(
      (suggestion) => `
      <button class="suggestion-item" type="button" data-prompt="${escapeHtml(suggestion.prompt)}">
        <span class="suggestion-icon">${icon(suggestion.icon || 'sparkles')}</span>
        <span class="suggestion-copy">
          <strong>${escapeHtml(suggestion.title)}</strong>
          <span>${escapeHtml(suggestion.description)}</span>
        </span>
      </button>`,
    )
    .join('');
  for (const item of $$('[data-prompt]', container)) {
    item.addEventListener('click', () => {
      store.set({ pendingPrompt: item.dataset.prompt }, 'prompt');
      navigate('chat');
    });
  }
}

function renderHero(mood, settings) {
  const eyebrow = $('#dashboardGreeting');
  const name = settings?.displayName && settings.displayName !== 'Friend' ? `, ${settings.displayName}` : '';
  if (eyebrow) eyebrow.textContent = `${greeting()}${name}`;

  const current = mood.current;
  if (current) {
    const meta = moodByLevel(current.mood);
    const headline = $('#dashboardHeadline');
    if (headline) headline.textContent = HEADLINES[current.mood] || HEADLINES[3];
    const orb = $('#heroMoodOrb');
    if (orb) orb.textContent = current.emoji || meta?.emoji || '😐';
    const label = $('#heroMoodLabel');
    if (label) label.textContent = `${current.label}`;
    const time = $('#heroMoodTime');
    if (time) time.textContent = `${relativeDay(current.timestamp)} · ${relativeTime(current.timestamp)}`;
  } else {
    const orb = $('#heroMoodOrb');
    if (orb) orb.textContent = '🌱';
    const label = $('#heroMoodLabel');
    if (label) label.textContent = 'Not logged yet';
    const time = $('#heroMoodTime');
    if (time) time.textContent = 'A mood check-in helps MindMate meet you where you are.';
  }
}

function renderReminder(reminder) {
  const emoji = $('#dashboardReminderEmoji');
  const text = $('#dashboardReminderText');
  const caption = $('#dashboardReminderCaption');
  if (!text) return;
  if (reminder?.text) {
    if (emoji) emoji.textContent = reminderEmoji(reminder.text);
    text.textContent = reminder.text;
    if (caption) caption.textContent = reminder.timestamp ? `Saved ${relativeDay(reminder.timestamp).toLowerCase()}` : 'A small act of care for future you.';
  } else {
    if (emoji) emoji.textContent = '🌿';
    text.textContent = 'A small act of care for future you.';
    if (caption) caption.textContent = 'Take a breath. You are doing more than you think.';
  }
}

function renderChart(mood) {
  const canvas = $('#dashboardMoodChart');
  const empty = $('#dashboardChartEmpty');
  const entries = mood.last7 || [];
  if (empty) empty.hidden = entries.length > 0;
  if (entries.length) renderMoodChart(canvas, entries, { compact: true });
  else if (canvas && window.Chart) window.Chart.getChart(canvas)?.destroy();

  const badge = $('#dashboardTrendBadge');
  const trend = TREND[mood.trend] || TREND.steady;
  if (badge) badge.innerHTML = `${icon(trend.icon)} ${trend.label}`;
  const insight = $('#dashboardInsight');
  if (insight) insight.textContent = mood.insight || 'Log your first mood check-in to start seeing patterns over time.';
}

async function loadDashboard({ quiet = false } = {}) {
  if (loading) return;
  loading = true;
  try {
    const data = await api.dashboard();
    store.set({ dashboard: data }, 'dashboard');
    if (data.settings) {
      store.set({ settings: { ...(store.get('settings') || {}), ...data.settings } }, 'settings');
      syncIdentity(data.settings);
    }
    renderHero(data.mood, data.settings);
    renderStats(data.mood, data.conversations, data.memories);
    renderChart(data.mood);
    renderRecent(data.conversations.recent);
    renderMemories(data.memories);
    renderSuggestions(data.suggestions);
    renderReminder(data.reminder);
    renderQuickMoods();

    const affirmation = $('#dashboardAffirmation');
    if (affirmation) affirmation.textContent = data.affirmation;
    refreshIcons();
  } catch (error) {
    if (!quiet) toast('error', 'Dashboard unavailable', error.message);
  } finally {
    loading = false;
  }
}

export async function mount() {
  selectedMood = null;
  renderQuickMoods();
  renderHero({ current: null }, store.get('settings'));

  const quick = $('#quickMoodOptions');
  if (quick && !quick.dataset.bound) {
    quick.dataset.bound = '1';
    quick.addEventListener('click', (event) => {
      const button = event.target.closest('[data-mood]');
      if (!button) return;
      selectedMood = Number(button.dataset.mood);
      renderQuickMoods();
      refreshIcons();
    });
  }

  const submit = $('#quickMoodSubmit');
  if (submit) {
    submit.onclick = async () => {
      if (!selectedMood) return;
      setBusy(submit, true, 'Saving…');
      try {
        await api.mood.add(selectedMood);
        toast('success', 'Check-in saved', `You are feeling ${moodByLevel(selectedMood)?.label.toLowerCase()}.`);
        selectedMood = null;
        await loadDashboard({ quiet: true });
      } catch (error) {
        toast('error', 'Could not save mood', error.message);
      } finally {
        setBusy(submit, false);
      }
    };
  }

  const heroMood = $('#heroMoodBtn');
  if (heroMood) heroMood.onclick = () => navigate('mood');

  const newReminder = $('#dashboardNewReminder');
  if (newReminder) {
    newReminder.onclick = async () => {
      setBusy(newReminder, true, 'Choosing…');
      try {
        const result = await api.reminders.add({});
        renderReminder({ ...result.reminder, timestamp: result.reminder.timestamp });
        refreshIcons();
        toast('success', 'A small reminder', result.reminder.text);
        const dashboard = store.get('dashboard');
        if (dashboard) dashboard.reminder = { ...result.reminder };
      } catch (error) {
        toast('error', 'Could not add reminder', error.message);
      } finally {
        setBusy(newReminder, false);
      }
    };
  }

  await loadDashboard();
  refreshIcons();
}
