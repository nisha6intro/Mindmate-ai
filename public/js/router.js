/** Hash router with one mounted view at a time. */

import { $, $$, parseHash, refreshIcons } from './ui.js';
import { store, emit } from './store.js';

const routes = new Map();
let activeView = null;
let activeCleanup = null;
let navigating = false;

const META = {
  dashboard: { title: 'Dashboard', subtitle: 'A gentle place to check in with yourself.' },
  chat: { title: 'Chat with MindMate', subtitle: 'A private space to say what is real.' },
  mood: { title: 'Mood tracker', subtitle: 'Notice your rhythm without judgement.' },
  selfcare: { title: 'Self-care', subtitle: 'Small kindnesses that fit your day.' },
  history: { title: 'Conversation history', subtitle: 'Everything you have talked through, kept private.' },
  memories: { title: 'Emotional memories', subtitle: 'The context you have chosen to keep.' },
  settings: { title: 'Settings', subtitle: 'Make MindMate yours.' },
};

export function registerRoute(name, view) {
  routes.set(name, view);
}

function closeSidebar() {
  document.getElementById('sidebar')?.classList.remove('is-open');
  const overlay = document.getElementById('sidebarOverlay');
  if (overlay) overlay.hidden = true;
  document.getElementById('sidebarToggle')?.setAttribute('aria-expanded', 'false');
  document.body.classList.remove('sidebar-open');
}

export async function navigate(name, { replace = false, force = false } = {}) {
  const route = routes.has(name) ? name : 'dashboard';
  if (replace) {
    history.replaceState(null, '', `#/${route}`);
  } else if (window.location.hash !== `#/${route}`) {
    window.location.hash = `#/${route}`;
    return; // hashchange will run the navigation
  }

  if (navigating && !force) return;
  if (activeView === route && !force) return;
  navigating = true;

  try {
    if (typeof activeCleanup === 'function') {
      try {
        activeCleanup();
      } catch (error) {
        console.warn('[router] cleanup failed', error);
      }
    }
    activeCleanup = null;

    for (const section of $$('.view')) {
      section.hidden = section.dataset.view !== route;
    }
    for (const link of $$('.nav-link')) {
      const isActive = link.dataset.route === route;
      link.classList.toggle('active', isActive);
      if (isActive) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    }

    const meta = META[route] || META.dashboard;
    const titleNode = document.getElementById('pageTitle');
    const subtitleNode = document.getElementById('pageSubtitle');
    if (titleNode) titleNode.textContent = meta.title;
    if (subtitleNode) subtitleNode.textContent = meta.subtitle;
    document.title = `${meta.title} · MindMate AI`;

    closeSidebar();
    window.scrollTo({ top: 0, behavior: 'auto' });
    store.set({ route }, 'route');
    emit('route', route);

    const view = routes.get(route);
    activeView = route;
    if (view?.mount) {
      const cleanup = await view.mount();
      if (typeof cleanup === 'function') activeCleanup = cleanup;
    }
    refreshIcons();
  } finally {
    navigating = false;
  }
}

export function startRouter() {
  const handle = () => {
    const { route } = parseHash();
    navigate(route);
  };
  window.addEventListener('hashchange', handle);
  handle();
}

export function currentRoute() {
  return activeView || 'dashboard';
}

export { closeSidebar, META };
