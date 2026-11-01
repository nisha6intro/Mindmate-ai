/** Tiny observable app store shared by the views. */

const listeners = new Map();

const state = {
  settings: null,
  health: null,
  dashboard: null,
  conversations: [],
  currentConversationId: null,
  mood: null,
  pendingPrompt: null,
  route: 'dashboard',
};

export const store = {
  get(key) {
    return key ? state[key] : state;
  },
  set(patch, event = 'change') {
    Object.assign(state, patch);
    emit(event, state);
  },
  on(event, handler) {
    if (!listeners.has(event)) listeners.set(event, new Set());
    listeners.get(event).add(handler);
    return () => listeners.get(event)?.delete(handler);
  },
  emit,
};

export function emit(event, payload = state) {
  for (const handler of listeners.get(event) || []) {
    try {
      handler(payload);
    } catch (error) {
      console.error(`[store:${event}]`, error);
    }
  }
}

/** Keeps the sidebar/topbar identity in sync with saved preferences. */
export function syncIdentity(settings) {
  if (!settings) return;
  const name = settings.displayName || 'Friend';
  const letter = name.trim().charAt(0).toUpperCase() || 'F';

  const sidebarName = document.getElementById('sidebarName');
  if (sidebarName) sidebarName.textContent = name;

  const sidebarAvatar = document.getElementById('sidebarAvatar');
  if (sidebarAvatar) sidebarAvatar.textContent = letter;

  const topbarAvatar = document.getElementById('topbarAvatar');
  if (topbarAvatar) topbarAvatar.textContent = letter;

  const headingName = document.getElementById('dashboardHeadline');
  if (headingName && !headingName.dataset.custom) {
    // Headline is intentionally warm, not name-driven; keep it stable.
  }
}
