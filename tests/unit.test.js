import test from 'node:test';
import assert from 'node:assert/strict';
import { parseTimestamp, dayKey } from '../server/utils/dates.js';
import { parseCsv } from '../server/utils/csv.js';
import { tokenize, titleFromMessage, sharedThemeCount } from '../server/utils/text.js';
import { assessRisk } from '../server/services/safetyService.js';
import { buildSummary } from '../server/services/moodService.js';

test('parseTimestamp handles date-only, local datetime, and ISO timestamps', () => {
  const dateOnly = parseTimestamp('2025-06-11');
  assert.equal(dateOnly.hasTime, false);
  assert.equal(dateOnly.date.getFullYear(), 2025);

  const local = parseTimestamp('2025-06-11 14:35:13');
  assert.equal(local.hasTime, true);
  assert.equal(local.date.getHours(), 14);

  const iso = parseTimestamp('2025-06-11T14:35:13.000Z');
  assert.equal(iso.hasTime, true);
  assert.equal(iso.iso, '2025-06-11T14:35:13.000Z');

  assert.equal(parseTimestamp('not a date'), null);
});

test('dayKey is stable for local dates', () => {
  const parsed = parseTimestamp('2025-06-11 23:59:00');
  assert.match(dayKey(parsed.iso), /^\d{4}-\d{2}-\d{2}$/);
});

test('CSV parser handles quoted commas', () => {
  const rows = parseCsv('date,mood\n2025-06-11,2\n"2025-06-12 10:00:00",5\n');
  assert.deepEqual(rows[0], ['date', 'mood']);
  assert.deepEqual(rows[2], ['2025-06-12 10:00:00', '5']);
});

test('tokenizer removes common stopwords', () => {
  const tokens = tokenize('I am feeling really overwhelmed about my exam');
  assert.ok(tokens.includes('overwhelmed'));
  assert.ok(tokens.includes('exam'));
  assert.ok(!tokens.includes('feeling'));
});

test('emotional themes link different words for a similar feeling', () => {
  const previous = tokenize('I feel stressed about my exam');
  const current = tokenize("I'm feeling overwhelmed again");
  assert.ok(sharedThemeCount(previous, current) >= 1);
  assert.equal(sharedThemeCount(tokenize('the weather is grey'), tokenize('I feel stressed')), 0);
  assert.equal(sharedThemeCount(tokenize('I am lonely'), tokenize('I feel stressed')), 0);
});

test('titles are short and readable', () => {
  assert.equal(titleFromMessage('   hello   world '), 'hello world');
  assert.ok(titleFromMessage('one two three four five six seven eight nine').length <= 64);
});

test('crisis detection catches direct risk and ignores ordinary sayings', () => {
  assert.equal(assessRisk('I want to kill myself').isCrisis, true);
  assert.equal(assessRisk("I don't want to live anymore").isCrisis, true);
  assert.equal(assessRisk('This exam will kill me').isCrisis, false);
  assert.equal(assessRisk('I feel a bit tired today').isCrisis, false);
  assert.match(assessRisk('I want to end my life').response, /988/);
});

test('mood summary calculates streak, averages and trend', () => {
  const now = new Date();
  const iso = (daysAgo) => {
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysAgo, 12);
    return date.toISOString();
  };
  const entries = [
    { id: 0, timestamp: iso(4), mood: 1, label: 'Very Sad', emoji: '😢' },
    { id: 1, timestamp: iso(3), mood: 2, label: 'Sad', emoji: '☹️' },
    { id: 2, timestamp: iso(2), mood: 4, label: 'Happy', emoji: '😊' },
    { id: 3, timestamp: iso(1), mood: 5, label: 'Very Happy', emoji: '😄' },
    { id: 4, timestamp: iso(0), mood: 5, label: 'Very Happy', emoji: '😄' },
  ];
  const summary = buildSummary(entries);
  assert.equal(summary.total, 5);
  assert.equal(summary.streak, 5);
  assert.equal(summary.current.mood, 5);
  assert.equal(summary.average7, 3.4);
  assert.equal(summary.trend, 'up');
  assert.equal(summary.distribution[5], 2);
});
