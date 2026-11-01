/** Shared client-side constants that mirror the server's wellness vocabulary. */

export const MOODS = [
  { level: 1, label: 'Very Sad', emoji: '😢', description: 'Heavy, low, or struggling a lot' },
  { level: 2, label: 'Sad', emoji: '☹️', description: 'Down, discouraged, or uneasy' },
  { level: 3, label: 'Neutral', emoji: '😐', description: 'Steady, okay, or somewhere in between' },
  { level: 4, label: 'Happy', emoji: '😊', description: 'Good, hopeful, or content' },
  { level: 5, label: 'Very Happy', emoji: '😄', description: 'Great, energised, or joyful' },
];

export const REMINDER_CATALOG = [
  { id: 'water', emoji: '💧', text: 'Drink a glass of water.', category: 'Body' },
  { id: 'breathe', emoji: '🧘', text: 'Take three deep breaths.', category: 'Calm' },
  { id: 'walk', emoji: '🚶', text: 'Go for a short walk.', category: 'Movement' },
  { id: 'music', emoji: '🎵', text: 'Listen to your favourite music.', category: 'Joy' },
  { id: 'read', emoji: '📖', text: 'Read a page of a book.', category: 'Rest' },
  { id: 'nature', emoji: '🌸', text: 'Look at nature for two minutes.', category: 'Grounding' },
  { id: 'shoulders', emoji: '😌', text: 'Relax your shoulders and breathe.', category: 'Calm' },
];

export const CRISIS_LINKS = [
  { label: 'Find a helpline near you', href: 'https://findahelpline.com' },
  { label: 'US & Canada: call or text 988', href: 'tel:988' },
  { label: 'UK & Ireland: Samaritans 116 123', href: 'tel:116123' },
  { label: 'India: Tele-MANAS 14416', href: 'tel:14416' },
];

export function moodByLevel(level) {
  return MOODS.find((mood) => mood.level === Number(level)) || null;
}

export function reminderEmoji(text) {
  const clean = String(text || '').toLowerCase();
  const match = REMINDER_CATALOG.find((item) => item.text.toLowerCase() === clean);
  if (match) return match.emoji;
  if (clean.includes('water') || clean.includes('drink')) return '💧';
  if (clean.includes('breath') || clean.includes('relax')) return '🧘';
  if (clean.includes('walk') || clean.includes('move')) return '🚶';
  if (clean.includes('music') || clean.includes('song')) return '🎵';
  if (clean.includes('read') || clean.includes('book')) return '📖';
  if (clean.includes('nature') || clean.includes('sun')) return '🌸';
  return '🌱';
}

export function reminderCategory(text) {
  const clean = String(text || '').toLowerCase();
  const match = REMINDER_CATALOG.find((item) => item.text.toLowerCase() === clean);
  return match?.category || 'Self-care';
}
