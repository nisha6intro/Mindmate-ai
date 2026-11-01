/**
 * Shared DOM, formatting, feedback and modal helpers.
 * Everything is rendered with explicit escaping; messages go through a small
 * safe Markdown renderer and never use innerHTML with raw model output.
 */

export const $ = (selector, root = document) => root.querySelector(selector);
export const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function icon(name, className = '') {
  return `<i data-lucide="${escapeHtml(name)}"${className ? ` class="${escapeHtml(className)}"` : ''} aria-hidden="true"></i>`;
}

export function refreshIcons() {
  if (window.lucide?.createIcons) {
    window.lucide.createIcons({ attrs: { 'aria-hidden': 'true' } });
  }
}

export function debounce(fn, wait = 220) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
}

/* --------------------------------------------------------------------------
   Formatting
   -------------------------------------------------------------------------- */

const DATE_FMT = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
const TIME_FMT = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });
const WEEKDAY_FMT = new Intl.DateTimeFormat(undefined, { weekday: 'long' });

export function formatDate(value, { withTime = false } = {}) {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return withTime ? `${DATE_FMT.format(date)} · ${TIME_FMT.format(date)}` : DATE_FMT.format(date);
}

export function formatTime(value) {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return TIME_FMT.format(date);
}

export function relativeDay(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const now = new Date();
  const startOf = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diff = Math.round((startOf(now) - startOf(date)) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  if (diff > 1 && diff < 7) return WEEKDAY_FMT.format(date);
  return formatDate(date);
}

export function relativeTime(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const diff = Date.now() - date.getTime();
  if (diff < 60_000) return 'Just now';
  if (diff < 3_600_000) return `${Math.max(1, Math.round(diff / 60_000))} min ago`;
  if (diff < 86_400_000) return `${Math.round(diff / 3_600_000)} hr ago`;
  if (diff < 7 * 86_400_000) return relativeDay(date);
  return formatDate(date);
}

export function greeting(date = new Date()) {
  const hour = date.getHours();
  if (hour < 5) return 'Still awake';
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  if (hour < 22) return 'Good evening';
  return 'Winding down';
}

export function initials(name) {
  const clean = String(name || 'Friend').trim();
  if (!clean) return 'F';
  const parts = clean.split(/\s+/).slice(0, 2);
  return parts.map((part) => part.charAt(0).toUpperCase()).join('').slice(0, 2) || 'F';
}

export function truncate(value, max = 120) {
  const clean = String(value || '').replace(/\s+/g, ' ').trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

export function titleCase(value) {
  return String(value || '').charAt(0).toUpperCase() + String(value || '').slice(1);
}

export function moodEmoji(level) {
  return ['😢', '☹️', '😐', '😊', '😄'][Number(level) - 1] || '🌱';
}

export function parseHash() {
  const raw = window.location.hash.replace(/^#\/?/, '');
  const [route = 'dashboard', ...rest] = raw.split('/');
  return { route: route || 'dashboard', params: rest };
}

/* --------------------------------------------------------------------------
   Safe Markdown
   -------------------------------------------------------------------------- */

function inlineMarkdown(input) {
  let text = escapeHtml(input);
  text = text.replace(/`([^`\n]+)`/g, '<code>$1</code>');
  text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  text = text.replace(/(^|[\s(])\*([^*\n]+)\*(?=[\s).,!?:;]|$)/g, '$1<em>$2</em>');
  text = text.replace(
    /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>',
  );
  text = text.replace(
    /(^|[\s>])(https?:\/\/[^\s<]+[^\s<.,!?;:])/g,
    '$1<a href="$2" target="_blank" rel="noopener noreferrer">$2</a>',
  );
  return text;
}

/**
 * Converts a subset of Markdown to safe HTML. Input is escaped first, so model
 * output can never inject markup.
 */
export function renderMarkdown(value) {
  const source = String(value || '').replace(/\r\n/g, '\n').trim();
  if (!source) return '';

  const lines = source.split('\n');
  const blocks = [];
  let paragraph = [];
  let list = null;

  const flushParagraph = () => {
    if (!paragraph.length) return;
    blocks.push(`<p>${paragraph.map(inlineMarkdown).join('<br>')}</p>`);
    paragraph = [];
  };
  const flushList = () => {
    if (!list) return;
    const tag = list.type === 'ol' ? 'ol' : 'ul';
    blocks.push(`<${tag}>${list.items.map((item) => `<li>${inlineMarkdown(item)}</li>`).join('')}</${tag}>`);
    list = null;
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      flushParagraph();
      flushList();
      continue;
    }
    const bullet = /^[-*•]\s+(.*)$/.exec(trimmed);
    const numbered = /^\d+[.)]\s+(.*)$/.exec(trimmed);
    const heading = /^#{2,4}\s+(.*)$/.exec(trimmed);
    const quote = /^>\s+(.*)$/.exec(trimmed);

    if (bullet || numbered) {
      flushParagraph();
      const type = numbered ? 'ol' : 'ul';
      if (!list || list.type !== type) {
        flushList();
        list = { type, items: [] };
      }
      list.items.push((bullet || numbered)[1]);
      continue;
    }

    flushList();

    if (heading) {
      flushParagraph();
      blocks.push(`<p><strong>${inlineMarkdown(heading[1])}</strong></p>`);
      continue;
    }
    if (quote) {
      flushParagraph();
      blocks.push(`<blockquote>${inlineMarkdown(quote[1])}</blockquote>`);
      continue;
    }
    paragraph.push(trimmed);
  }

  flushParagraph();
  flushList();
  return blocks.join('');
}

/* --------------------------------------------------------------------------
   Toasts
   -------------------------------------------------------------------------- */

const TOAST_ICONS = { success: 'check-circle-2', error: 'alert-circle', warning: 'alert-triangle', info: 'info' };

export function toast(type, title, message = '', { timeout = 4800 } = {}) {
  const root = document.getElementById('toastRoot');
  if (!root) return;
  const kind = TOAST_ICONS[type] ? type : 'info';
  const element = document.createElement('div');
  element.className = `toast toast-${kind}`;
  element.innerHTML = `
    <span class="toast-icon">${icon(TOAST_ICONS[kind])}</span>
    <div class="toast-copy"><strong>${escapeHtml(title)}</strong>${message ? `<span>${escapeHtml(message)}</span>` : ''}</div>
    <button class="toast-close" type="button" aria-label="Dismiss notification">${icon('x')}</button>
  `;
  const remove = () => {
    if (!element.isConnected) return;
    element.classList.add('is-leaving');
    setTimeout(() => element.remove(), 230);
  };
  element.querySelector('.toast-close').addEventListener('click', remove);
  root.appendChild(element);
  refreshIcons();
  if (timeout > 0) setTimeout(remove, timeout);
}

/* --------------------------------------------------------------------------
   Buttons / form feedback
   -------------------------------------------------------------------------- */

export function setBusy(button, busy, label = null) {
  if (!button) return;
  if (busy) {
    button.dataset.originalHtml = button.innerHTML;
    if (label) button.textContent = label;
    button.classList.add('is-loading');
    button.disabled = true;
  } else {
    button.classList.remove('is-loading');
    if (button.dataset.originalHtml) {
      button.innerHTML = button.dataset.originalHtml;
      delete button.dataset.originalHtml;
      refreshIcons();
    }
    button.disabled = false;
  }
}

export function showFormError(form, message) {
  if (!form) return;
  let node = form.querySelector('.form-error');
  if (!node) {
    node = document.createElement('p');
    node.className = 'form-error';
    form.appendChild(node);
  }
  node.textContent = message;
  if (message) node.setAttribute('role', 'alert');
  else node.remove();
}

/* --------------------------------------------------------------------------
   Modals
   -------------------------------------------------------------------------- */

let lastFocused = null;
let closeHandler = null;

export function closeModal() {
  const backdrop = document.querySelector('.modal-backdrop');
  if (!backdrop) return;
  backdrop.remove();
  document.body.classList.remove('modal-open');
  closeHandler = null;
  if (lastFocused && document.contains(lastFocused)) lastFocused.focus();
  lastFocused = null;
  document.dispatchEvent(new CustomEvent('mindmate:modal-closed'));
}

/**
 * Opens the single app modal. `body` and `footer` are trusted HTML strings.
 * Returns the backdrop element so callers can wire events in `onMount`.
 */
export function openModal({ title, description = '', iconName = 'sparkles', tone = 'brand', body = '', footer = '', wide = false, onMount = null }) {
  closeModal();
  lastFocused = document.activeElement;
  const root = document.getElementById('modalRoot');
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.innerHTML = `
    <div class="modal${wide ? ' modal-wide' : ''}" role="dialog" aria-modal="true" aria-labelledby="modalTitle" aria-describedby="${description ? 'modalDesc' : 'modalTitle'}">
      <div class="modal-head">
        <span class="modal-icon${tone === 'danger' ? ' is-danger' : ''}">${icon(iconName)}</span>
        <div class="modal-head-copy">
          <h2 id="modalTitle">${escapeHtml(title)}</h2>
          ${description ? `<p id="modalDesc">${escapeHtml(description)}</p>` : ''}
        </div>
        <button class="modal-close" type="button" data-modal-close aria-label="Close dialog">${icon('x')}</button>
      </div>
      ${body ? `<div class="modal-body">${body}</div>` : ''}
      ${footer ? `<div class="modal-foot">${footer}</div>` : ''}
    </div>
  `;
  root.appendChild(backdrop);
  document.body.classList.add('modal-open');
  refreshIcons();

  const focusable = () =>
    [...backdrop.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')].filter(
      (node) => !node.disabled && node.offsetParent !== null,
    );

  backdrop.addEventListener('mousedown', (event) => {
    if (event.target === backdrop) closeModal();
  });
  backdrop.querySelectorAll('[data-modal-close]').forEach((button) => {
    button.addEventListener('click', closeModal);
  });
  closeHandler = (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeModal();
    } else if (event.key === 'Tab') {
      const nodes = focusable();
      if (!nodes.length) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
  };
  document.addEventListener('keydown', closeHandler);

  const firstField = backdrop.querySelector('input, textarea, select') || focusable()[0];
  setTimeout(() => firstField?.focus(), 60);

  if (onMount) onMount(backdrop);
  return backdrop;
}

export function confirmDialog({
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  danger = false,
  iconName = danger ? 'alert-triangle' : 'help-circle',
  note = '',
}) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      document.removeEventListener('mindmate:modal-closed', onClosed);
      closeModal();
      resolve(value);
    };
    // The modal can also close from Escape, the backdrop or its close button.
    const onClosed = () => {
      if (settled) return;
      settled = true;
      resolve(false);
    };
    const backdrop = openModal({
      title,
      iconName,
      tone: danger ? 'danger' : 'brand',
      body: `
        <p>${escapeHtml(message)}</p>
        ${note ? `<div class="modal-note${danger ? ' is-warning' : ''}">${escapeHtml(note)}</div>` : ''}
      `,
      footer: `
        <button class="btn btn-ghost" type="button" data-cancel>${escapeHtml(cancelLabel)}</button>
        <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" type="button" data-confirm>${escapeHtml(confirmLabel)}</button>
      `,
    });
    document.addEventListener('mindmate:modal-closed', onClosed);
    backdrop.querySelector('[data-cancel]').addEventListener('click', () => finish(false));
    backdrop.querySelector('[data-confirm]').addEventListener('click', () => finish(true));
  });
}

/* --------------------------------------------------------------------------
   Theme
   -------------------------------------------------------------------------- */

const media = window.matchMedia('(prefers-color-scheme: dark)');
let themePreference = 'system';

function resolvedTheme(theme) {
  if (theme === 'system') return media.matches ? 'dark' : 'light';
  return theme === 'dark' ? 'dark' : 'light';
}

export function applyTheme(theme = 'system', { reduceMotion = false } = {}) {
  themePreference = ['light', 'dark', 'system'].includes(theme) ? theme : 'system';
  const resolved = resolvedTheme(themePreference);
  document.documentElement.dataset.theme = resolved;
  document.documentElement.dataset.reduceMotion = String(Boolean(reduceMotion));
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', resolved === 'dark' ? '#100c1a' : '#7c3aed');

  const toggle = document.getElementById('themeToggle');
  if (toggle) {
    const nextIsDark = resolved !== 'dark';
    toggle.setAttribute('aria-label', nextIsDark ? 'Switch to dark theme' : 'Switch to light theme');
    toggle.title = nextIsDark ? 'Switch to dark theme' : 'Switch to light theme';
    toggle.innerHTML = icon(nextIsDark ? 'moon' : 'sun');
    refreshIcons();
  }
  try {
    localStorage.setItem('mindmate-theme', themePreference);
  } catch {
    // Storage can be blocked; theme still applies for this page.
  }
  return resolved;
}

export function toggleTheme(currentSettings) {
  const resolved = resolvedTheme(themePreference);
  const next = resolved === 'dark' ? 'light' : 'dark';
  applyTheme(next, { reduceMotion: Boolean(currentSettings?.reduceMotion) });
  return next;
}

export function cachedTheme() {
  try {
    const value = localStorage.getItem('mindmate-theme');
    return ['light', 'dark', 'system'].includes(value) ? value : 'system';
  } catch {
    return 'system';
  }
}

media.addEventListener('change', () => {
  if (themePreference === 'system') {
    applyTheme('system', { reduceMotion: document.documentElement.dataset.reduceMotion === 'true' });
  }
});

/* --------------------------------------------------------------------------
   Misc
   -------------------------------------------------------------------------- */

export function scrollIntoViewSoft(element, container) {
  if (!element || !container) return;
  const distance = container.scrollHeight - container.scrollTop - container.clientHeight;
  if (distance < 160) element.scrollIntoView({ block: 'end', behavior: 'smooth' });
}

export function focusChatInput() {
  const input = document.getElementById('chatInput');
  if (!input) return;
  input.focus();
  const length = input.value.length;
  input.setSelectionRange(length, length);
}

export function emptyState({ emoji = '🌱', title, text, action = '' }) {
  return `
    <div class="memory-empty">
      <strong>${escapeHtml(title)}</strong>
      ${text ? `<span>${escapeHtml(text)}</span>` : ''}
      ${action}
    </div>
  `;
}
