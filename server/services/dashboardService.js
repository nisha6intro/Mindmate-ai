import { DISCLAIMER } from '../constants.js';
import { getMood } from './moodService.js';
import { listConversations, conversationStats } from './conversationService.js';
import { getMemories, memoryCounts } from './memoryService.js';
import { lastReminder } from './reminderService.js';
import { getSettings } from './settingsService.js';
import { getVectorStatus } from './vectorService.js';
import { truncate } from '../utils/text.js';

const AFFIRMATIONS = [
  'You are allowed to take up space and take your time.',
  'Small steps count. Rest counts too.',
  'Your feelings make sense, even when they are uncomfortable.',
  'You do not have to earn the right to be gentle with yourself.',
  'One difficult moment is not the whole story.',
  'You have made it through hard days before.',
  'Progress can look like getting through the day.',
];

function buildSuggestions({ summary, memories, conversations }) {
  const suggestions = [];
  const topMemory = memories.active[0] || null;
  const level = summary.current?.mood || 3;

  if (topMemory) {
    suggestions.push({
      id: 'memory',
      icon: 'sparkles',
      title: 'Pick up where you left off',
      description: `You previously shared: “${truncate(topMemory.text, 70)}”`,
      prompt: `Earlier I mentioned “${truncate(topMemory.text, 140)}”. I'd like to talk about how I feel about it now.`,
    });
  }

  if (level <= 2) {
    suggestions.push({
      id: 'gentle',
      icon: 'heart',
      title: 'A gentle check-in',
      description: 'No pressure to fix anything. Just a quiet space to be heard.',
      prompt: "I'm feeling low today. Can you sit with me for a moment and help me feel less alone?",
    });
  } else if (level >= 4) {
    suggestions.push({
      id: 'savour',
      icon: 'sun',
      title: 'Savour the good moment',
      description: 'Reflect on what is working and anchor the feeling.',
      prompt: "I'm feeling good today. Help me reflect on what's been working and how to carry it forward.",
    });
  } else {
    suggestions.push({
      id: 'unpack',
      icon: 'message-circle',
      title: 'Unpack what is on your mind',
      description: 'A calm conversation can make a tangle feel more manageable.',
      prompt: 'Something has been sitting on my mind today. Can you help me untangle it gently?',
    });
  }

  if (!conversations.total) {
    suggestions.push({
      id: 'first',
      icon: 'pen-line',
      title: 'Start with what is real',
      description: 'You do not need the right words. Begin anywhere.',
      prompt: 'I want to check in with myself. Can you ask me a gentle question to get started?',
    });
  } else {
    suggestions.push({
      id: 'next-step',
      icon: 'footprints',
      title: 'One small next step',
      description: 'Turn a heavy feeling into something manageable today.',
      prompt: 'I feel a bit stuck. Can you help me choose one small, realistic next step for today?',
    });
  }

  suggestions.push({
    id: 'reset',
    icon: 'wind',
    title: 'A two-minute reset',
    description: 'A short grounding pause for a busy or anxious moment.',
    prompt: 'Can you guide me through a short grounding exercise for a stressful moment?',
  });

  return suggestions.slice(0, 3);
}

function buildInsight(summary) {
  if (!summary.total) {
    return 'Log your first mood check-in to start seeing patterns over time.';
  }
  if (summary.trend === 'up') {
    return `Your recent check-ins are trending upward, with a 7-entry average of ${summary.average7}/5. Notice what is helping — you deserve to give yourself credit.`;
  }
  if (summary.trend === 'down') {
    return `Your recent check-ins suggest a heavier stretch (7-entry average ${summary.average7}/5). That deserves gentleness, not judgement. Small care counts.`;
  }
  return `Your mood has been fairly steady, with a 7-entry average of ${summary.average7}/5 across ${summary.total} check-in${summary.total === 1 ? '' : 's'}.`;
}

export async function getDashboard() {
  const [mood, conversationList, memories, reminder, settings, stats, vector] = await Promise.all([
    getMood(),
    listConversations({ limit: 5 }),
    getMemories(),
    lastReminder(),
    getSettings(),
    conversationStats(),
    getVectorStatus(),
  ]);

  const summary = mood.summary;
  const dayIndex = Math.floor(Date.now() / 86400000) % AFFIRMATIONS.length;

  return {
    settings: {
      displayName: settings.displayName,
      memoryEnabled: settings.memoryEnabled,
      theme: settings.theme,
    },
    mood: {
      current: summary.current,
      previous: summary.previous,
      average7: summary.average7,
      total: summary.total,
      todayCount: summary.todayCount,
      streak: summary.streak,
      trend: summary.trend,
      checkins7Days: summary.checkins7Days,
      last7: summary.last7,
      distribution: summary.distribution,
      insight: buildInsight(summary),
    },
    memories: {
      counts: { active: memories.counts.active, resolved: memories.counts.resolved },
      recent: memories.active.slice(0, 3),
    },
    conversations: {
      total: conversationList.total,
      messages: stats.messages,
      recent: conversationList.conversations,
    },
    reminder,
    suggestions: buildSuggestions({ summary, memories, conversations: conversationList }),
    affirmation: AFFIRMATIONS[dayIndex],
    vector,
    disclaimer: DISCLAIMER,
    generatedAt: new Date().toISOString(),
  };
}

export { memoryCounts };
