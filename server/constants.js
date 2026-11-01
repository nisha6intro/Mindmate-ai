export const MOODS = [
  {
    level: 1,
    label: 'Very Sad',
    emoji: '😢',
    color: '#8b5cf6',
    description: 'Heavy, low, or struggling a lot',
    tone: 'Be extremely gentle, compassionate, and supportive. Validate the pain first. Do not rush to solutions. Offer one tiny, manageable act of care and let the person set the pace.',
  },
  {
    level: 2,
    label: 'Sad',
    emoji: '☹️',
    color: '#a78bfa',
    description: 'Down, discouraged, or uneasy',
    tone: 'Be encouraging, warm, and understanding. Acknowledge what is hard, reflect their feelings, and gently offer hope or a small next step.',
  },
  {
    level: 3,
    label: 'Neutral',
    emoji: '😐',
    color: '#c4b5fd',
    description: 'Steady, okay, or somewhere in between',
    tone: 'Be balanced, curious, and helpful. Listen closely, respond naturally, and offer practical support without forcing positivity.',
  },
  {
    level: 4,
    label: 'Happy',
    emoji: '😊',
    color: '#8b5cf6',
    description: 'Good, hopeful, or content',
    tone: 'Be positive, enthusiastic, and reinforcing. Celebrate what is going well and help them savour the moment.',
  },
  {
    level: 5,
    label: 'Very Happy',
    emoji: '😄',
    color: '#7c3aed',
    description: 'Great, energised, or joyful',
    tone: 'Be energetic, joyful, and reinforcing. Match their energy, celebrate warmly, and help them anchor the good feeling.',
  },
];

export const MOOD_BY_LEVEL = Object.fromEntries(MOODS.map((mood) => [mood.level, mood]));

export const EMOTIONAL_KEYWORDS = [
  'exam', 'stress', 'goal', 'panic', 'afraid', 'failure', 'failed', 'depression', 'depressed',
  'nervous', 'rejected', 'rejection', 'alone', 'lonely', 'tired', 'exhausted', 'lost',
  'overwhelmed', 'burnout', 'burned out', 'hopeless', 'worthless', 'anxiety', 'anxious',
  'scared', 'fear', 'grief', 'grieving', 'sad', 'angry', 'pressure', 'deadline', 'insomnia',
  'crying', 'heartbroken', 'worried', 'worry', 'shame', 'guilt', 'self-doubt', 'insecure',
  'unmotivated', 'stuck', 'breakup', 'break-up', 'confused', 'empty', 'numb', 'sleepless',
];

export const RESOLUTION_PATTERNS = [
  /\bno longer\b/i,
  /\bresolved\b/i,
  /\bsolved\b/i,
  /\bhandled\b/i,
  /\bworked (it )?out\b/i,
  /\bfigured (it )?out\b/i,
  /\bmoved past\b/i,
  /\bovercame\b/i,
  /\bfeeling better now\b/i,
  /\bi'?m better\b/i,
  /\bi am better\b/i,
  /\bfeel much better\b/i,
  /\bnot (a problem|an issue) anymore\b/i,
  /\ball done\b/i,
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

export const CRISIS_RESOURCES = [
  { region: 'Immediate danger', name: 'Local emergency services', contact: 'Call your local emergency number (e.g. 112, 911, 999)', type: 'emergency' },
  { region: 'Find a helpline', name: 'findahelpline.com', contact: 'Free, confidential support in 130+ countries', url: 'https://findahelpline.com', type: 'directory' },
  { region: 'United States & Canada', name: '988 Suicide & Crisis Lifeline', contact: 'Call or text 988', type: 'phone' },
  { region: 'United Kingdom & Ireland', name: 'Samaritans', contact: 'Call 116 123 (free, 24/7)', type: 'phone' },
  { region: 'India', name: 'Tele-MANAS', contact: 'Call 14416', type: 'phone' },
  { region: 'India', name: 'KIRAN Mental Health Helpline', contact: 'Call 1800-599-0019', type: 'phone' },
  { region: 'Australia', name: 'Lifeline', contact: 'Call 13 11 14', type: 'phone' },
];

export const DISCLAIMER =
  'MindMate AI is a supportive wellness companion, not a licensed therapist or a substitute for professional care. If you are in immediate danger, contact your local emergency services.';
