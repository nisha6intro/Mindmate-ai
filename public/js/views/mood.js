/** Mood tracker: five-level check-in, chart and editable history. */

import { api } from '../api.js';
import { renderMoodChart } from '../charts.js';
import { MOODS, moodByLevel } from '../constants.js';
import {
  $,
  $$,
  confirmDialog,
  escapeHtml,
  formatDate,
  formatTime,
  icon,
  refreshIcons,
  relativeDay,
  setBusy,
  toast,
} from '../ui.js';

const state = {
  entries: [],
  summary: null,
  selected: null,
  range: '7',
  expanded: false,
  bound: false,
};

const TREND_TEXT = {
  up: 'Your recent check-ins are trending upward. Notice what is helping — you deserve the credit.',
  down: 'This looks like a heavier stretch. That deserves gentleness, not judgement. Small care counts.',
  steady: 'Your mood has been fairly steady. Consistency is its own quiet kind of progress.',
};

function isToday(value) {
  const date = new Date(value);
  return !Number.isNaN(date.getTime()) && date.toDateString() === new Date().toDateString();
}

function renderOptions() {
  const container = $('#moodOptions');
  if (!container) return;
  const todayEntry = [...state.entries].reverse().find((entry) => isToday(entry.timestamp));
  container.innerHTML = MOODS.map((mood) => {
    const selected = state.selected === mood.level;
    const today = todayEntry?.mood === mood.level;
    return `
      <button class="mood-option${selected ? ' is-selected' : ''}${today ? ' is-today' : ''}"
        type="button" data-mood="${mood.level}" aria-pressed="${selected}"
        title="${escapeHtml(mood.description)}">
        <span class="mood-option-emoji" aria-hidden="true">${mood.emoji}</span>
        <span class="mood-option-label">${escapeHtml(mood.label)}</span>
        <span class="mood-option-level">${mood.level} of 5</span>
      </button>`;
  }).join('');

  const submit = $('#moodSubmit');
  if (submit) submit.disabled = !state.selected;
  const hint = $('#moodHint');
  if (hint) {
    const mood = moodByLevel(state.selected);
    hint.textContent = mood
      ? `You're feeling ${mood.label.toLowerCase()} — save when you're ready.`
      : todayEntry
        ? "You've already checked in today. You can always update it."
        : "Select a mood to save today's check-in.";
  }
}

function renderCurrent() {
  const summary = state.summary;
  const current = summary?.current;
  const emoji = $('#currentMoodEmoji');
  const label = $('#currentMoodLabel');
  const time = $('#currentMoodTime');
  if (emoji) emoji.textContent = current?.emoji || '🌱';
  if (label) label.textContent = current?.label || 'No check-in yet';
  if (time) {
    time.textContent = current
      ? `${relativeDay(current.timestamp)} · ${formatTime(current.timestamp)}${summary?.todayCount ? ' · logged today' : ''}`
      : 'Your first check-in is a small act of care.';
  }

  const average = $('#moodAverage');
  if (average) average.textContent = summary?.average7 != null ? `${summary.average7}/5` : '—';
  const checkins = $('#moodCheckins');
  if (checkins) checkins.textContent = String(summary?.total ?? 0);
  const best = $('#moodBestDay');
  if (best) {
    best.textContent = summary?.bestDay?.date
      ? formatDate(new Date(`${summary.bestDay.date}T12:00:00`))
      : '—';
    best.title = summary?.bestDay ? `Average ${summary.bestDay.average}/5` : '';
  }

  const insight = $('#currentMoodInsight');
  if (insight) {
    if (!summary?.total) {
      insight.textContent = 'There is no perfect way to feel. A check-in is simply a moment of noticing.';
    } else {
      insight.textContent = `${TREND_TEXT[summary.trend] || TREND_TEXT.steady} Your 7-entry average is ${summary.average7 ?? '—'}/5.`;
    }
  }

  const streak = $('#moodStreakBadge');
  if (streak) {
    const days = summary?.streak || 0;
    streak.innerHTML = `${icon('flame')} ${days} day${days === 1 ? '' : 's'} streak`;
  }
}

function chartEntries() {
  const entries = state.entries;
  if (state.range === 'all') return entries;
  const count = Number(state.range);
  return entries.slice(-count);
}

function renderChart() {
  const entries = chartEntries();
  const canvas = $('#moodChart');
  const empty = $('#moodChartEmpty');
  if (empty) empty.hidden = entries.length > 0;
  if (entries.length) {
    renderMoodChart(canvas, entries, { compact: false });
  } else if (canvas && window.Chart) {
    window.Chart.getChart(canvas)?.destroy();
  }

  const insight = $('#moodInsight');
  if (insight) {
    if (!state.summary?.total) {
      insight.textContent = 'Log a mood to see your pattern.';
    } else {
      const avg = state.summary.average7;
      insight.textContent = `Showing ${entries.length} of ${state.summary.total} check-in${state.summary.total === 1 ? '' : 's'}. 7-entry average ${avg ?? '—'}/5 · trend ${state.summary.trend}.`;
    }
  }
}

function historyRow(entry) {
  return `
    <div class="mood-history-row">
      <span class="mood-history-emoji" aria-hidden="true">${entry.emoji}</span>
      <div class="mood-history-copy">
        <strong>${escapeHtml(entry.label)}</strong>
        <span>${escapeHtml(relativeDay(entry.timestamp))} · ${escapeHtml(formatTime(entry.timestamp))}${entry.hasTime ? '' : ' · date only'}</span>
      </div>
      <button class="icon-btn icon-btn-sm" type="button" data-delete-mood="${entry.id}" aria-label="Delete this check-in" title="Delete check-in">${icon('trash-2')}</button>
    </div>`;
}

function renderHistory() {
  const container = $('#moodHistory');
  if (!container) return;
  const entries = [...state.entries].reverse();
  const shown = state.expanded ? entries : entries.slice(0, 8);
  if (!shown.length) {
    container.innerHTML = '<div class="mood-history-empty">No check-ins yet. Choose a mood above to begin your history.</div>';
  } else {
    container.innerHTML = shown.map(historyRow).join('');
  }
  refreshIcons();
  const more = $('#moodShowMore');
  if (more) more.hidden = entries.length <= 8 || state.expanded;
}

function renderAll() {
  renderOptions();
  renderCurrent();
  renderChart();
  renderHistory();
}

async function load({ quiet = false } = {}) {
  try {
    const data = await api.mood.list('all');
    state.entries = data.entries || [];
    state.summary = data.summary || null;
    renderAll();
  } catch (error) {
    if (!quiet) toast('error', 'Mood data unavailable', error.message);
  }
}

function bindOnce() {
  if (state.bound) return;
  state.bound = true;

  $('#moodOptions')?.addEventListener('click', (event) => {
    const button = event.target.closest('[data-mood]');
    if (!button) return;
    state.selected = Number(button.dataset.mood);
    renderOptions();
  });

  $('#moodSubmit')?.addEventListener('click', async (event) => {
    if (!state.selected) return;
    const button = event.currentTarget;
    setBusy(button, true, 'Saving…');
    try {
      await api.mood.add(state.selected);
      const mood = moodByLevel(state.selected);
      toast('success', 'Check-in saved', `Feeling ${mood.label.toLowerCase()} today.`);
      state.selected = null;
      await load({ quiet: true });
    } catch (error) {
      toast('error', 'Could not save mood', error.message);
    } finally {
      setBusy(button, false);
    }
  });

  $('#moodRange')?.addEventListener('click', (event) => {
    const button = event.target.closest('[data-range]');
    if (!button) return;
    state.range = button.dataset.range;
    for (const item of $$('#moodRange [data-range]')) {
      item.classList.toggle('active', item === button);
      item.setAttribute('aria-pressed', String(item === button));
    }
    renderChart();
  });

  $('#moodRefreshBtn')?.addEventListener('click', async (event) => {
    const button = event.currentTarget;
    setBusy(button, true, 'Refreshing…');
    await load();
    setBusy(button, false);
  });

  $('#moodShowMore')?.addEventListener('click', () => {
    state.expanded = true;
    renderHistory();
  });

  $('#moodHistory')?.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-delete-mood]');
    if (!button) return;
    const ok = await confirmDialog({
      title: 'Delete this check-in?',
      message: 'This mood entry will be removed from your history and the chart.',
      confirmLabel: 'Delete check-in',
      danger: true,
    });
    if (!ok) return;
    try {
      await api.mood.remove(button.dataset.deleteMood);
      toast('success', 'Check-in removed');
      await load({ quiet: true });
    } catch (error) {
      toast('error', 'Could not remove check-in', error.message);
    }
  });

  $('#moodEmptyAction')?.addEventListener('click', () => {
    const first = $('#moodOptions .mood-option');
    first?.focus();
    first?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  });
}

export async function mount() {
  bindOnce();
  state.selected = null;
  for (const item of $$('#moodRange [data-range]')) {
    item.classList.toggle('active', item.dataset.range === state.range);
    item.setAttribute('aria-pressed', String(item.dataset.range === state.range));
  }
  renderOptions();
  await load();
  refreshIcons();
}
