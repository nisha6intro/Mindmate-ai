const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Parse legacy and modern timestamps without shifting date-only values across timezones. */
export function parseTimestamp(value) {
  if (!value) return null;
  const raw = String(value).trim();
  if (!raw) return null;

  // Date only (legacy mood CSV).
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (dateOnly) {
    const [, y, m, d] = dateOnly;
    const date = new Date(Number(y), Number(m) - 1, Number(d), 12, 0, 0, 0);
    return Number.isNaN(date.getTime()) ? null : { date, iso: date.toISOString(), hasTime: false, raw };
  }

  // Local "YYYY-MM-DD HH:mm[:ss]" (legacy chat/mood logs) — no timezone suffix.
  if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}/.test(raw) && !/(Z|[+-]\d{2}:?\d{2})$/.test(raw)) {
    const date = new Date(raw.replace(' ', 'T'));
    return Number.isNaN(date.getTime()) ? null : { date, iso: date.toISOString(), hasTime: true, raw };
  }

  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return null;
  return { date, iso: date.toISOString(), hasTime: /T\d{2}:\d{2}/.test(raw), raw };
}

export function nowIso() {
  return new Date().toISOString();
}

export function dayKey(dateLike) {
  const date = dateLike instanceof Date ? dateLike : new Date(dateLike);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function relativeLabel(iso) {
  const parsed = parseTimestamp(iso);
  if (!parsed) return '';
  const date = parsed.date;
  const now = new Date();
  const diffDays = Math.floor((new Date(now.getFullYear(), now.getMonth(), now.getDate()) - new Date(date.getFullYear(), date.getMonth(), date.getDate())) / 86400000);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays > 1 && diffDays < 7) return date.toLocaleDateString(undefined, { weekday: 'long' });
  return `${MONTHS[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
}

export function shortDate(iso) {
  const parsed = parseTimestamp(iso);
  if (!parsed) return '';
  const { date, hasTime } = parsed;
  const base = `${MONTHS[date.getMonth()]} ${date.getDate()}`;
  if (!hasTime) return base;
  return `${base}, ${date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`;
}

export function sortableTime(iso) {
  const parsed = parseTimestamp(iso);
  return parsed ? parsed.date.getTime() : 0;
}
