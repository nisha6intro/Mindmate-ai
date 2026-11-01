export const STOPWORDS = new Set([
  'a', 'about', 'above', 'after', 'again', 'against', 'all', 'am', 'an', 'and', 'any', 'are', 'as', 'at',
  'be', 'because', 'been', 'before', 'being', 'below', 'between', 'both', 'but', 'by', 'can', 'could',
  'did', 'do', 'does', 'doing', 'down', 'during', 'each', 'few', 'for', 'from', 'further', 'had', 'has',
  'have', 'having', 'he', 'her', 'here', 'hers', 'herself', 'him', 'himself', 'his', 'how', 'i', 'if',
  'in', 'into', 'is', 'it', 'its', 'itself', 'just', 'me', 'more', 'most', 'my', 'myself', 'no', 'nor',
  'not', 'now', 'of', 'off', 'on', 'once', 'only', 'or', 'other', 'our', 'ours', 'ourselves', 'out',
  'over', 'own', 'same', 'she', 'should', 'so', 'some', 'such', 'than', 'that', 'the', 'their', 'theirs',
  'them', 'themselves', 'then', 'there', 'these', 'they', 'this', 'those', 'through', 'to', 'too', 'under',
  'until', 'up', 'very', 'was', 'we', 'were', 'what', 'when', 'where', 'which', 'while', 'who', 'whom',
  'why', 'will', 'with', 'would', 'you', 'your', 'yours', 'yourself', 'yourselves', 'feel', 'feeling',
  'really', 'today', 'like', 'get', 'got', 'im', 'ive', 'dont', 'cant', 'want', 'need', 'know', 'think',
  'help', 'thanks', 'thank', 'please', 'also', 'much', 'many', 'make', 'made', 'one', 'two', 'day',
]);

/**
 * Emotional families used for gentle recall. Two different words from the same
 * family ("stressed" and "overwhelmed") describe a similar feeling, so a memory
 * can still surface when the exact words change. Families are intentionally
 * small and feeling-focused so ordinary conversation does not over-recall.
 */
export const EMOTION_THEMES = {
  distress: [
    'stress', 'stressed', 'stressful', 'overwhelm', 'overwhelmed', 'overwhelming',
    'anxiety', 'anxious', 'panic', 'panicking', 'worried', 'worry', 'worrying',
    'nervous', 'pressure', 'tense', 'burnout', 'deadline', 'afraid', 'scared',
    'fear', 'fearful', 'dread', 'apprehensive',
  ],
  sadness: [
    'sad', 'sadness', 'down', 'low', 'depressed', 'depression', 'hopeless',
    'empty', 'numb', 'crying', 'cry', 'grief', 'grieving', 'heartbroken',
    'lonely', 'alone', 'lost', 'worthless', 'discouraged', 'hurt',
  ],
  anger: ['angry', 'anger', 'frustrated', 'frustrating', 'irritated', 'mad', 'resentful', 'annoyed'],
  fatigue: ['tired', 'exhausted', 'exhausting', 'sleep', 'insomnia', 'sleepless', 'unmotivated', 'drained', 'stuck'],
  shame: ['shame', 'ashamed', 'guilty', 'guilt', 'embarrassed', 'insecure', 'doubt', 'failure', 'failed'],
  rejection: ['rejected', 'rejection', 'breakup', 'abandoned', 'unwanted'],
};

const THEME_BY_TOKEN = new Map();
for (const [theme, words] of Object.entries(EMOTION_THEMES)) {
  for (const word of words) THEME_BY_TOKEN.set(word, theme);
}

/** Returns the emotional families present in a token list. */
export function themesForTokens(tokens) {
  const themes = new Set();
  for (const token of tokens) {
    const theme = THEME_BY_TOKEN.get(token);
    if (theme) themes.add(theme);
  }
  return themes;
}

/** Number of emotional families shared by two token lists. */
export function sharedThemeCount(aTokens, bTokens) {
  if (!aTokens.length || !bTokens.length) return 0;
  const a = themesForTokens(aTokens);
  if (!a.size) return 0;
  const b = themesForTokens(bTokens);
  let shared = 0;
  for (const theme of a) if (b.has(theme)) shared += 1;
  return shared;
}

export function tokenize(input) {
  return String(input || '')
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 2 && !STOPWORDS.has(word));
}

export function uniqueTokens(input) {
  return [...new Set(tokenize(input))];
}

export function titleFromMessage(message, fallback = 'New conversation') {
  const clean = String(message || '').replace(/\s+/g, ' ').trim();
  if (!clean) return fallback;
  const words = clean.split(' ');
  let title = words.slice(0, 8).join(' ');
  if (words.length > 8) title += '…';
  return title.length > 64 ? `${title.slice(0, 61)}…` : title;
}

export function truncate(value, max = 180) {
  const clean = String(value || '').replace(/\s+/g, ' ').trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

export function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function containsAny(text, terms) {
  const haystack = String(text || '').toLowerCase();
  return terms.some((term) => haystack.includes(String(term).toLowerCase()));
}

export function stripControlCharacters(input) {
  return String(input || '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');
}
