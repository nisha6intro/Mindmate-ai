import { CRISIS_RESOURCES, DISCLAIMER } from '../constants.js';

const CRISIS_PATTERNS = [
  { pattern: /\b(kill|hurt|harm)\s+myself\b/i, reason: 'self-harm language' },
  { pattern: /\b(suicid(?:e|al)|self[\s-]?harm)\b/i, reason: 'suicide or self-harm' },
  { pattern: /\b(want|wanna|going|plan)\s+to\s+die\b/i, reason: 'wanting to die' },
  { pattern: /\b(don'?t|do not)\s+want\s+to\s+(live|be here|exist|wake up)\b/i, reason: 'not wanting to live' },
  { pattern: /\bend\s+(my\s+life|it\s+all)\b/i, reason: 'ending life' },
  { pattern: /\b(no reason|nothing)\s+to\s+live\b/i, reason: 'no reason to live' },
  { pattern: /\bbetter\s+off\s+(dead|without\s+me)\b/i, reason: 'feeling better off dead' },
  { pattern: /\b(overdose|cut\s+myself|hang\s+myself|jump\s+off)\b/i, reason: 'immediate self-harm risk' },
  { pattern: /\bi\s+(have|made)\s+a\s+plan\s+to\s+(die|kill|end)\b/i, reason: 'suicide plan' },
  { pattern: /\b(can'?t|cannot)\s+go\s+on\s+(anymore|like this)\b/i, reason: 'overwhelming hopelessness' },
];

const CRISIS_RESPONSE = `I'm really glad you told me this. I'm taking what you're feeling seriously, and I want to be honest with you: I'm an AI companion, not an emergency service, and your safety matters more than anything else right now.

Please do at least one of these now if you might act on these thoughts:

• **Call your local emergency number** (112, 911, 999, or your country's number) or go to the nearest emergency department.
• **Contact a crisis line right away.** You can find one anywhere at findahelpline.com. In the US or Canada, call or text **988**. In the UK or Ireland, call Samaritans on **116 123**. In India, call Tele-MANAS on **14416**.
• **Reach out to someone you trust** and ask them to stay with you. If you can, move away from anything you could use to hurt yourself.

You don't have to carry this alone, and this moment does not have to be the end of your story. Are you safe right now?`;

export function assessRisk(message) {
  const clean = String(message || '').replace(/[’]/g, "'");
  for (const entry of CRISIS_PATTERNS) {
    if (entry.pattern.test(clean)) {
      return { isCrisis: true, reason: entry.reason, response: CRISIS_RESPONSE };
    }
  }
  return { isCrisis: false, reason: null, response: null };
}

export function safetyResources() {
  return {
    disclaimer: DISCLAIMER,
    resources: CRISIS_RESOURCES,
    note: 'If you are in immediate danger, call your local emergency number. MindMate is not a crisis service and cannot contact emergency help for you.',
  };
}

export const SAFETY_NOTE =
  'If you are thinking about harming yourself, please contact a local crisis line or emergency service now. You deserve immediate, human support.';
