/**
 * MindMate AI — application bootstrap.
 * Wires the shell, theme, health status, sidebar and hash routes.
 */

import { api } from './api.js';
import { registerRoute, startRouter, navigate } from './router.js';
import { store, syncIdentity } from './store.js';
import { $, applyTheme, cachedTheme, refreshIcons, toast, toggleTheme } from './ui.js';
import { refreshCharts } from './charts.js';
import * as dashboardView from './views/dashboard.js';
import * as chatView from './views/chat.js';
import * as moodView from './views/mood.js';
import * as selfcareView from './views/selfcare.js';
import * as historyView from './views/history.js';
import * as memoriesView from './views/memories.js';
import * as settingsView from './views/settings.js';
import { openSupportModal } from './support.js';

/* --------------------------------------------------------------------------
   Sidebar
   -------------------------------------------------------------------------- */

function openSidebar() {
  const sidebar = $('#sidebar');
  const overlay = $('#sidebarOverlay');
  const toggle = $('#sidebarToggle');
  sidebar?.classList.add('is-open');
  if (overlay) overlay.hidden = false;
  toggle?.setAttribute('aria-expanded', 'true');
  document.body.classList.add('sidebar-open');
  setTimeout(() => $('#sidebarClose')?.focus(), 80);
}

function closeSidebarNav({ restoreFocus = false } = {}) {
  const sidebar = $('#sidebar');
  const overlay = $('#sidebarOverlay');
  const toggle = $('#sidebarToggle');
  sidebar?.classList.remove('is-open');
  if (overlay) overlay.hidden = true;
  toggle?.setAttribute('aria-expanded', 'false');
  document.body.classList.remove('sidebar-open');
  $('#chatRail')?.classList.remove('is-open');
  if (restoreFocus && window.innerWidth <= 960) toggle?.focus();
}

/* --------------------------------------------------------------------------
   Health
   -------------------------------------------------------------------------- */

function renderHealth(health) {
  const pill = $('#aiStatus');
  const label = $('#aiStatusText');
  if (!pill || !label) return;

  pill.classList.remove('is-checking', 'is-online', 'is-offline');
  const ai = health?.ai;
  if (!ai) {
    pill.classList.add('is-checking');
    label.textContent = 'Checking AI';
    pill.title = 'Checking the local Ollama connection';
    return;
  }

  if (ai.ready) {
    pill.classList.add('is-online');
    label.textContent = 'AI ready';
    pill.title = `${ai.model || 'phi-mindmate'} is connected through Ollama`;
  } else {
    pill.classList.add('is-offline');
    label.textContent = ai.reachable ? 'Model missing' : 'AI offline';
    pill.title = `${ai.error || 'Ollama is not reachable.'} Click to check again.`;
  }

  const badge = $('#navMemoryCount');
  if (badge && health?.storage?.memories) {
    const active = health.storage.memories.active || 0;
    badge.textContent = String(active);
    badge.hidden = active === 0;
  }
}

async function checkHealth({ refresh = false, notify = false } = {}) {
  if (notify) {
    const pill = $('#aiStatus');
    pill?.classList.add('is-checking');
    const label = $('#aiStatusText');
    if (label) label.textContent = 'Checking…';
  }
  try {
    const health = await api.health({ refresh });
    store.set({ health }, 'health');
    renderHealth(health);
    if (notify) {
      if (health.ai?.ready) {
        toast('success', 'Ollama is ready', `${health.ai.model} will reply locally.`);
      } else {
        toast(
          'warning',
          health.ai?.reachable ? 'Model not installed' : 'Ollama is not reachable',
          health.ai?.error || 'Start Ollama locally to enable AI replies.',
        );
      }
    }
    return health;
  } catch (error) {
    renderHealth(null);
    if (notify) toast('error', 'Status check failed', error.message);
    return null;
  }
}

/* --------------------------------------------------------------------------
   Theme
   -------------------------------------------------------------------------- */

async function persistTheme(next) {
  const current = store.get('settings') || {};
  store.set({ settings: { ...current, theme: next } }, 'settings');
  refreshCharts();
  try {
    const { settings } = await api.settings.update({ theme: next });
    store.set({ settings: { ...(store.get('settings') || {}), ...settings } }, 'settings');
  } catch (error) {
    // The theme still works for this session; explain that it was not saved.
    toast('warning', 'Theme not saved', 'Your preference applies now, but the server could not store it.');
  }
}

function watchThemeChanges() {
  if (!('MutationObserver' in window)) return;
  const observer = new MutationObserver(() => refreshCharts());
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
}

/* --------------------------------------------------------------------------
   Shell wiring
   -------------------------------------------------------------------------- */

function wireShell() {
  $('#sidebarToggle')?.addEventListener('click', openSidebar);
  $('#sidebarClose')?.addEventListener('click', () => closeSidebarNav({ restoreFocus: true }));
  $('#sidebarOverlay')?.addEventListener('click', () => closeSidebarNav());

  for (const link of document.querySelectorAll('.nav-link')) {
    link.addEventListener('click', () => closeSidebarNav());
  }

  const startChat = () => chatView.newChat({ focus: true, navigateTo: true });
  $('#topbarNewChat')?.addEventListener('click', startChat);
  $('#sidebarNewChat')?.addEventListener('click', startChat);

  $('#sidebarSupport')?.addEventListener('click', () => {
    closeSidebarNav();
    openSupportModal();
  });
  $('#urgentSupportBtn')?.addEventListener('click', openSupportModal);

  const openSettings = () => navigate('settings');
  $('#topbarProfile')?.addEventListener('click', openSettings);
  $('#sidebarProfile')?.addEventListener('click', () => {
    closeSidebarNav();
    openSettings();
  });

  $('#themeToggle')?.addEventListener('click', () => {
    const next = toggleTheme(store.get('settings'));
    persistTheme(next);
  });

  $('#aiStatus')?.addEventListener('click', () => checkHealth({ refresh: true, notify: true }));

  // Sidebar recent conversations work from every route.
  $('#sidebarConversations')?.addEventListener('click', (event) => {
    const item = event.target.closest('[data-conversation]');
    if (!item) return;
    const id = item.dataset.conversation;
    closeSidebarNav();
    if (store.get('route') === 'chat') {
      chatView.openConversation(id);
    } else {
      store.set({ currentConversationId: id }, 'conversation');
      navigate('chat');
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      closeSidebarNav();
    }
  });

  window.addEventListener('offline', () => {
    toast('warning', 'You are offline', 'The app is local, but your browser lost its network connection. Anything already loaded still works.');
  });
  window.addEventListener('online', () => {
    toast('success', 'Back online');
    checkHealth({ refresh: true });
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') checkHealth();
  });
}

/* --------------------------------------------------------------------------
   Boot
   -------------------------------------------------------------------------- */

function registerRoutes() {
  registerRoute('dashboard', dashboardView);
  registerRoute('chat', chatView);
  registerRoute('mood', moodView);
  registerRoute('selfcare', selfcareView);
  registerRoute('history', historyView);
  registerRoute('memories', memoriesView);
  registerRoute('settings', settingsView);
}

function startHealthPolling() {
  checkHealth();
  setInterval(() => {
    if (document.visibilityState === 'visible') checkHealth();
  }, 60_000);
}

async function boot() {
  applyTheme(cachedTheme());
  watchThemeChanges();
  wireShell();
  registerRoutes();

  try {
    const { settings } = await api.settings.get();
    store.set({ settings }, 'settings');
    syncIdentity(settings);
    applyTheme(settings.theme, { reduceMotion: settings.reduceMotion });
  } catch (error) {
    console.warn('[mindmate] settings could not load', error);
  }

  startRouter();
  refreshIcons();
  startHealthPolling();

  chatView.refreshConversationLists();
  refreshIcons();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
  boot();
}
