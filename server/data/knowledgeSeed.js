/**
 * Reference material for MindMate's optional retrieval layer.
 *
 * - The three `mindmate-original` documents were migrated from the original
 *   Chroma vector store (vectorstore/chroma.sqlite3).
 * - The `training` entries come from training/training-data.jsonl.
 * - The curated entries are general, evidence-informed wellness prompts. They
 *   are reference material for the model — not diagnoses or treatment.
 */
export const ORIGINAL_VECTOR_DOCS = [
  { id: 'orig-1', title: 'You are strong', source: 'chroma:original', tags: ['encouragement', 'self-worth'], text: 'You are strong and capable! Every day is a new chance.' },
  { id: 'orig-2', title: 'Great things take time', source: 'chroma:original', tags: ['patience', 'motivation'], text: "Don't give up now. Great things take time!" },
  { id: 'orig-3', title: 'Small steps', source: 'chroma:original', tags: ['progress', 'motivation'], text: 'Even small steps move you forward.' },
];

export const TRAINING_DOCS = [
  { id: 'train-1', title: 'Overwhelmed with studies', source: 'training:phi-mindmate', tags: ['study', 'overwhelm', 'breathing'], text: "It's completely okay to feel overwhelmed sometimes. Take a deep breath and break things down step by step. You are not alone in this." },
  { id: 'train-2', title: 'Celebrating good marks', source: 'training:phi-mindmate', tags: ['happy', 'achievement', 'celebration'], text: "That's fantastic! Hard work paying off is worth celebrating. Let yourself enjoy this moment — you earned it." },
  { id: 'train-3', title: 'Exam failure and self-worth', source: 'training:phi-mindmate', tags: ['failure', 'exam', 'self-worth'], text: "Failing an exam does not define your worth. You have value beyond results. Let's talk about how to move forward, one step at a time." },
  { id: 'train-4', title: 'Motivation before a test', source: 'training:phi-mindmate', tags: ['exam', 'motivation', 'confidence'], text: "You've prepared for this, and you have the strength to do well. Believe in yourself. One step at a time — you're doing great." },
  { id: 'train-5', title: 'A perfect day', source: 'training:phi-mindmate', tags: ['happy', 'gratitude', 'savour'], text: "That's lovely to hear. Savour those moments — they're special, and you deserve them." },
];

export const CURATED_KNOWLEDGE = [
  {
    id: 'tip-grounding',
    title: '5-4-3-2-1 grounding',
    source: 'curated:mindmate',
    tags: ['anxiety', 'panic', 'grounding', 'overwhelm'],
    text: 'A grounding exercise for anxious moments: notice 5 things you can see, 4 you can physically feel, 3 you can hear, 2 you can smell, and 1 you can taste. Go slowly, and name each one. The aim is to bring attention back to the present, not to make anxiety disappear instantly.',
  },
  {
    id: 'tip-breathing',
    title: 'A longer exhale',
    source: 'curated:mindmate',
    tags: ['anxiety', 'stress', 'breathing', 'calm'],
    text: 'When stress is high, try a longer exhale: breathe in through the nose for about 4 counts, then out for about 6. Repeat 5–10 times. A longer exhale can gently activate the body’s calming response. If breathing deeply feels uncomfortable, return to your natural breath.',
  },
  {
    id: 'tip-study-stress',
    title: 'Study stress',
    source: 'curated:mindmate',
    tags: ['exam', 'study', 'stress', 'deadline', 'procrastination'],
    text: 'For study stress, choose one small task that can be finished in 15–25 minutes. Put the phone out of reach, set a timer, and take a real break afterwards. Progress on one small piece is more useful than planning the perfect revision day. Sleep and food are part of preparation, not distractions from it.',
  },
  {
    id: 'tip-low-mood',
    title: 'When everything feels heavy',
    source: 'curated:mindmate',
    tags: ['sad', 'low mood', 'tired', 'hopeless', 'depression'],
    text: 'On a low day, lower the bar rather than pushing harder: one glass of water, one window opened, one message to someone safe. If low mood lasts most days for weeks, or makes daily life hard, talking to a doctor or mental-health professional is a practical next step, not a failure.',
  },
  {
    id: 'tip-loneliness',
    title: 'Loneliness',
    source: 'curated:mindmate',
    tags: ['lonely', 'alone', 'rejected', 'connection'],
    text: 'Loneliness can make reaching out feel risky. Start with a low-pressure message to one person — “I’ve been thinking of you, how are you?” — rather than waiting until you have something impressive to say. Connection is a skill we practise, not a test we pass.',
  },
  {
    id: 'tip-self-compassion',
    title: 'Self-compassion',
    source: 'curated:mindmate',
    tags: ['self-worth', 'failure', 'shame', 'guilt', 'self-doubt'],
    text: 'Self-compassion is not letting yourself off the hook; it is treating yourself as someone you care about. Try naming what happened without insults (“I missed the deadline and I feel ashamed”), then ask what you would say to a friend in the same situation. You can take responsibility and still be kind to yourself.',
  },
  {
    id: 'tip-sleep',
    title: 'Sleep and worry',
    source: 'curated:mindmate',
    tags: ['sleep', 'insomnia', 'night', 'worry', 'anxiety'],
    text: 'If worry keeps you awake, write the unfinished thought or task on paper with one next step for tomorrow. Keep the room dim and avoid checking the clock. If sleep problems persist for weeks, mention them to a healthcare professional, especially if they affect safety or daily functioning.',
  },
  {
    id: 'tip-boundaries',
    title: 'Boundaries',
    source: 'curated:mindmate',
    tags: ['boundaries', 'overwhelm', 'burnout', 'pressure', 'people-pleasing'],
    text: 'A boundary can be short and kind: “I can’t take that on this week, but I can help with one part next Tuesday.” You do not need a long justification. Boundaries protect the energy you need for the things you care about.',
  },
  {
    id: 'tip-anger',
    title: 'Anger',
    source: 'curated:mindmate',
    tags: ['angry', 'anger', 'frustration', 'conflict'],
    text: 'Anger often points to a boundary or unmet need. Before responding, give yourself a pause: unclench your jaw, feel your feet, and name the need underneath (“I need to be heard”). Wait until the first surge passes if you can. If anger is frightening you or others, seek professional support.',
  },
  {
    id: 'tip-help',
    title: 'Asking for help',
    source: 'curated:mindmate',
    tags: ['support', 'help', 'therapy', 'professional', 'alone'],
    text: 'You do not have to be in crisis to deserve support. If something has felt heavy for more than a couple of weeks, a GP, counsellor, therapist, faith leader, or trusted friend can be a first point of contact. Ask what is available, and it is okay to say “I’m not sure what I need yet.”',
  },
  {
    id: 'tip-gratitude',
    title: 'Savouring good moments',
    source: 'curated:mindmate',
    tags: ['happy', 'gratitude', 'joy', 'celebration'],
    text: 'When something good happens, pause for ten seconds and notice the details: what you can see, who is there, how your body feels. Savouring helps a good moment land. You can also write down one specific thing that went well and why it mattered.',
  },
  {
    id: 'tip-procrastination',
    title: 'Procrastination',
    source: 'curated:mindmate',
    tags: ['procrastination', 'motivation', 'stuck', 'study'],
    text: 'Procrastination is often a reaction to feeling overwhelmed or afraid of doing it badly, not laziness. Shrink the first step until it feels almost too easy — open the document, write one sentence, set a five-minute timer. You can stop after five minutes; often you will not need to.',
  },
];
