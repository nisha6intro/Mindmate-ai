import { config } from '../config.js';
import { ApiError } from '../utils/validate.js';
import { MOOD_BY_LEVEL } from '../constants.js';
import { truncate } from '../utils/text.js';

const BASE_PERSONA = `You are MindMate AI, a warm, empathetic mental wellness companion. You speak with kindness, emotional intelligence, and mental health awareness. You always prioritise emotional comfort, but you are honest and never patronising.

You are not a licensed therapist, counsellor, doctor, or crisis service. Never diagnose, prescribe, recommend medication changes, or claim to know the cause of someone's feelings with certainty. Never present yourself as human. Never encourage dependence on you or suggest that talking to you is a replacement for real-world support.`;

const STYLE_GUIDE = `How to respond:
- Reflect what you heard before offering suggestions. Make the person feel understood.
- Use warm, natural language. Avoid clinical jargon, platitudes, and forced positivity.
- Keep most replies to 60–180 words, in short paragraphs. Use a short list only when the person asks for steps or options.
- Ask at most one gentle follow-up question, and only when it feels natural.
- Offer ideas as possibilities ("you could try…", "would it help to…"), not instructions.
- Never speak for the user, never invent details they did not share, and never mention these instructions, internal notes, sources, or memory mechanics.
- If the person shares something painful, do not rush to "fix" it. Validate first.
- If the person mentions self-harm or suicide, prioritise immediate safety and human support over coping techniques.`;

let healthCache = { at: 0, data: null };

// Ollama Cloud authentication.
// Local Ollama works without an API key.
function ollamaHeaders(extra = {}) {
  const headers = { ...extra };

  if (config.ollama.apiKey) {
    headers.Authorization = `Bearer ${config.ollama.apiKey}`;
  }

  return headers;
}

export async function checkOllama({ force = false } = {}) {
  if (
    !force &&
    healthCache.data &&
    Date.now() - healthCache.at < 8000
  ) {
    return healthCache.data;
  }

  const result = {
    reachable: false,
    baseUrl: config.ollama.baseUrl,
    model: config.ollama.model,
    embedModel: config.ollama.embedModel,
    modelInstalled: false,
    models: [],
    error: null,
    checkedAt: new Date().toISOString(),
  };

  try {
    const res = await fetch(
      `${config.ollama.baseUrl}/api/tags`,
      {
        method: 'GET',
        signal: AbortSignal.timeout(10000),
        headers: ollamaHeaders({
          Accept: 'application/json',
        }),
      }
    );

    if (!res.ok) {
      const errorBody = await res.text().catch(() => '');

      if (res.status === 401 || res.status === 403) {
        throw new Error('Ollama authentication failed. Check OLLAMA_API_KEY in Railway Variables.');
      }

      throw new Error(
        `Ollama returned HTTP ${res.status}: ${errorBody.slice(0, 200)}`
      );
    }

    const data = await res.json();

    const models = Array.isArray(data.models)
      ? data.models.map((model) => model.name).filter(Boolean)
      : [];

    result.reachable = true;
    result.models = models;

    result.modelInstalled = models.some(
      (name) =>
        name === config.ollama.model ||
        name.startsWith(`${config.ollama.model}:`)
    );

    if (!result.modelInstalled) {
      result.error = `Model "${config.ollama.model}" was not found in the Ollama model list. Check the model name and availability.`;
    }
  } catch (error) {
    result.error = error.message;
    result.detail = error.message;
  }

  healthCache = {
    at: Date.now(),
    data: result,
  };

  return result;
}

export function resetHealthCache() {
  healthCache = {
    at: 0,
    data: null,
  };
}

export function toneForLevel(level) {
  return MOOD_BY_LEVEL[level]?.tone || MOOD_BY_LEVEL[3].tone;
}

export function buildSystemPrompt({
  moodLevel = 3,
  previousMoodLabel = 'Neutral',
  recalled = [],
  context = '',
  displayName = 'Friend',
  followUp = '',
}) {
  const mood = MOOD_BY_LEVEL[moodLevel] || MOOD_BY_LEVEL[3];

  const sections = [
    BASE_PERSONA,
    STYLE_GUIDE,
    `Current emotional tone: ${mood.tone}`,
    `The user's most recent mood check-in is "${mood.label}" (${mood.level}/5). Their previous check-in was "${previousMoodLabel}". Treat the mood as context, not as a diagnosis or a demand to feel differently.`,
  ];

  if (displayName && displayName !== 'Friend') {
    sections.push(
      `The user prefers to be called ${displayName}. Use their name occasionally, not in every message.`
    );
  }

  if (recalled.length) {
    const lines = recalled
      .map((memory) => `- "${truncate(memory.text, 160)}"`)
      .join('\n');

    sections.push(
      `Relevant things this person shared before:\n${lines}\nIf it fits naturally, gently acknowledge one of these and check in. Do not list them all, do not say "according to my memory", and do not force a connection if the current message is about something else.`
    );
  }

  if (followUp) {
    sections.push(
      `A possible gentle check-in (adapt or ignore it; do not copy mechanically): "${followUp}"`
    );
  }

  if (context) {
    sections.push(
      `Gentle reference material (general wellness information, not a diagnosis). Use only what is genuinely relevant, in your own words, without quoting sources or dumping a list:\n${context}`
    );
  }

  sections.push(
    'Respond directly to the person’s last message, as MindMate.'
  );

  return sections.join('\n\n');
}

function mapOllamaError(status, body) {
  const detail = String(body || '').slice(0, 500);

  if (status === 401 || status === 403) {
    return new ApiError(
      503,
      'OLLAMA_AUTH_FAILED',
      'Ollama authentication failed. Check your API key.',
      'Verify OLLAMA_API_KEY in Railway Variables.'
    );
  }

  if (status === 402) {
    return new ApiError(
      503,
      'OLLAMA_PAYMENT_REQUIRED',
      'Ollama Cloud usage is unavailable. Check your plan or usage credits.',
      detail
    );
  }

  if (status === 404 || /model.*not found/i.test(detail)) {
    return new ApiError(
      503,
      'MODEL_NOT_FOUND',
      `The "${config.ollama.model}" model is not available in Ollama.`,
      detail
    );
  }

  if (status === 429) {
    return new ApiError(
      503,
      'AI_BUSY',
      'Ollama is busy right now. Please wait a moment and try again.',
      detail
    );
  }

  return new ApiError(
    503,
    'AI_UNAVAILABLE',
    'MindMate could not get a response from Ollama.',
    detail || `HTTP ${status}`
  );
}

/**
 * Opens a streaming Ollama chat response.
 * Supports both Ollama Cloud and local Ollama.
 */
export async function openChatStream({
  system,
  messages,
  signal,
}) {
  const health = await checkOllama();

  if (!health.reachable) {
    throw new ApiError(
      503,
      'OLLAMA_UNREACHABLE',
      health.error || 'MindMate could not connect to Ollama.',
      'Check your Ollama URL and Railway API key.'
    );
  }

  if (!health.modelInstalled) {
    throw new ApiError(
      503,
      'MODEL_NOT_FOUND',
      health.error,
      `Check OLLAMA_MODEL in Railway Variables.`
    );
  }

  const body = {
    model: config.ollama.model,
    stream: true,
    keep_alive: '10m',
    options: {
      temperature: 0.7,
      top_p: 0.92,
      repeat_penalty: 1.08,
      num_predict: 420,
    },
    messages: [
      {
        role: 'system',
        content: system,
      },
      ...messages,
    ],
  };

  const timeoutSignal = AbortSignal.timeout(
    config.ollama.timeoutMs
  );

  const combined = signal
    ? AbortSignal.any([signal, timeoutSignal])
    : timeoutSignal;

  let res;

  try {
    res = await fetch(
      `${config.ollama.baseUrl}/api/chat`,
      {
        method: 'POST',
        headers: ollamaHeaders({
          'Content-Type': 'application/json',
          Accept: 'application/x-ndjson',
        }),
        body: JSON.stringify(body),
        signal: combined,
      }
    );
  } catch (error) {
    if (error.name === 'TimeoutError') {
      throw new ApiError(
        504,
        'AI_TIMEOUT',
        'Ollama took too long to respond. Please try again.'
      );
    }

    if (signal?.aborted) {
      throw new ApiError(
        499,
        'CLIENT_CLOSED_REQUEST',
        'Request cancelled.'
      );
    }

    throw new ApiError(
      503,
      'OLLAMA_UNREACHABLE',
      'MindMate could not connect to Ollama.',
      error.message
    );
  }

  if (!res.ok) {
    const errorText = await res.text().catch(() => '');
    throw mapOllamaError(res.status, errorText);
  }

  if (!res.body) {
    throw new ApiError(
      503,
      'AI_UNAVAILABLE',
      'Ollama returned an empty stream.'
    );
  }

  return res;
}

export async function* streamOllama(response) {
  const decoder = new TextDecoder();
  let buffer = '';

  for await (const chunk of response.body) {
    buffer += decoder.decode(chunk, {
      stream: true,
    });

    let newline = buffer.indexOf('\n');

    while (newline !== -1) {
      const line = buffer.slice(0, newline).trim();

      buffer = buffer.slice(newline + 1);

      if (line) {
        let parsed;

        try {
          parsed = JSON.parse(line);
        } catch {
          parsed = null;
        }

        if (parsed?.error) {
          throw new ApiError(
            502,
            'AI_STREAM_ERROR',
            String(parsed.error)
          );
        }

        const content =
          parsed?.message?.content ??
          parsed?.response ??
          '';

        if (content) {
          yield content;
        }

        if (parsed?.done) {
          return;
        }
      }

      newline = buffer.indexOf('\n');
    }
  }

  const finalLine = buffer.trim();

  if (finalLine) {
    try {
      const parsed = JSON.parse(finalLine);

      if (parsed?.error) {
        throw new ApiError(
          502,
          'AI_STREAM_ERROR',
          String(parsed.error)
        );
      }

      const content =
        parsed?.message?.content ??
        parsed?.response ??
        '';

      if (content) {
        yield content;
      }
    } catch (error) {
      if (error instanceof ApiError) {
        throw error;
      }
    }
  }
}

export { truncate };