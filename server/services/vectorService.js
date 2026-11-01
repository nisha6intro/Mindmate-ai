import crypto from 'node:crypto';
import { config } from '../config.js';
import { readJson, writeJson } from '../utils/jsonStore.js';
import { truncate, uniqueTokens } from '../utils/text.js';
import { CURATED_KNOWLEDGE, ORIGINAL_VECTOR_DOCS, TRAINING_DOCS } from '../data/knowledgeSeed.js';

const FALLBACK_DOCS = [...ORIGINAL_VECTOR_DOCS, ...TRAINING_DOCS, ...CURATED_KNOWLEDGE];

let cachedKnowledge = null;
let cachedKnowledgeHash = null;
let cachedIndex = null;
let indexState = 'idle'; // idle | indexing | ready | unavailable
let lastProbe = null;
let embeddingCooldownUntil = 0;
let warmupPromise = null;

function docsHash(docs) {
  return crypto.createHash('sha1').update(JSON.stringify(docs.map((doc) => [doc.id, doc.text]))).digest('hex');
}

async function loadKnowledge() {
  const raw = await readJson(config.files.knowledge, null);
  let docs;
  if (raw && Array.isArray(raw.documents) && raw.documents.length) {
    docs = raw.documents
      .filter((doc) => doc && typeof doc.text === 'string' && doc.text.trim())
      .map((doc, index) => ({
        id: String(doc.id || `doc-${index}`),
        title: String(doc.title || 'Wellness note').slice(0, 120),
        text: String(doc.text).slice(0, 2000),
        source: String(doc.source || 'knowledge'),
        tags: Array.isArray(doc.tags) ? doc.tags.map(String).slice(0, 12) : [],
      }));
  } else {
    docs = FALLBACK_DOCS;
  }
  const hash = docsHash(docs);
  if (hash !== cachedKnowledgeHash) {
    cachedKnowledge = docs;
    cachedKnowledgeHash = hash;
    cachedIndex = null;
  }
  return docs;
}

function isValidIndex(index, docs) {
  if (!index || typeof index.vectors !== 'object' || index.vectors === null) return false;
  if (index.model !== config.ollama.embedModel) return false;
  if (index.hash !== docsHash(docs)) return false;
  return docs.every((doc) => Array.isArray(index.vectors[doc.id]) && index.vectors[doc.id].length > 0);
}

async function loadIndex(docs) {
  if (cachedIndex && isValidIndex(cachedIndex, docs)) return cachedIndex;
  const stored = await readJson(config.files.vectorIndex, null);
  if (isValidIndex(stored, docs)) {
    cachedIndex = stored;
    indexState = 'ready';
    return stored;
  }
  return null;
}

async function embed(input) {
  const res = await fetch(`${config.ollama.baseUrl}/api/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: config.ollama.embedModel, prompt: input }),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Embedding request failed (${res.status}): ${body.slice(0, 160)}`);
  }
  const data = await res.json();
  if (!Array.isArray(data.embedding) || !data.embedding.length) throw new Error('Embedding model returned no vector.');
  return data.embedding;
}

function cosine(a, b) {
  if (!a?.length || !b?.length || a.length !== b.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (!na || !nb) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

function lexicalScore(query, doc) {
  const queryTokens = uniqueTokens(query);
  if (!queryTokens.length) return 0;
  const docTokens = new Set(uniqueTokens(`${doc.title} ${doc.text} ${(doc.tags || []).join(' ')}`));
  const haystack = `${doc.title} ${doc.text} ${(doc.tags || []).join(' ')}`.toLowerCase();
  let score = 0;
  for (const token of queryTokens) {
    if (docTokens.has(token)) score += 1;
    else if (token.length > 3 && haystack.includes(token)) score += 0.4;
  }
  const tagHits = (doc.tags || []).filter((tag) => String(query).toLowerCase().includes(String(tag).toLowerCase()));
  score += tagHits.length * 0.8;
  // Slight preference for hand-curated guidance when scores are close.
  if (doc.source === 'curated:mindmate') score += 0.15;
  return score;
}

export async function lexicalRetrieve(query, { k = 3 } = {}) {
  const docs = await loadKnowledge();
  const scored = docs
    .map((doc) => ({ doc, score: lexicalScore(query, doc) }))
    .filter((item) => item.score > 0.2)
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
  return scored;
}

export async function retrieve(query, { k = 3 } = {}) {
  const docs = await loadKnowledge();
  const index = await loadIndex(docs);
  if (index && Date.now() > embeddingCooldownUntil) {
    try {
      const vector = await embed(String(query).slice(0, 2000));
      const scored = docs
        .map((doc) => ({ doc, score: cosine(vector, index.vectors[doc.id]) }))
        .sort((a, b) => b.score - a.score)
        .slice(0, k);
      if (scored.length && scored[0].score >= 0.2) return scored;
    } catch (error) {
      lastProbe = { at: new Date().toISOString(), error: error.message };
      embeddingCooldownUntil = Date.now() + 120_000;
    }
  }
  return lexicalRetrieve(query, { k });
}

export async function buildContext(query, { k = 2, maxChars = 700 } = {}) {
  try {
    const scored = await retrieve(query, { k });
    if (!scored.length) return '';
    const pieces = [];
    for (const item of scored) {
      pieces.push(`${item.doc.text}${item.doc.source ? ` (source: ${item.doc.source})` : ''}`);
    }
    return truncate(pieces.join('\n\n'), maxChars);
  } catch {
    return '';
  }
}

export async function getKnowledgeDocuments() {
  return loadKnowledge();
}

export async function ensureVectorIndex({ force = false } = {}) {
  if (warmupPromise && !force) return warmupPromise;
  if (config.isTest) return null;
  warmupPromise = (async () => {
    if (Date.now() < embeddingCooldownUntil && !force) return null;
    const docs = await loadKnowledge();
    const existing = force ? null : await loadIndex(docs);
    if (existing) {
      indexState = 'ready';
      return existing;
    }
    indexState = 'indexing';
    const vectors = {};
    let ok = 0;
    for (const doc of docs) {
      try {
        vectors[doc.id] = await embed(`${doc.title}. ${doc.text}`);
        ok += 1;
      } catch (error) {
        lastProbe = { at: new Date().toISOString(), error: error.message };
        embeddingCooldownUntil = Date.now() + 300_000;
        indexState = 'unavailable';
        return null;
      }
    }
    if (ok === 0) {
      indexState = 'unavailable';
      return null;
    }
    const index = {
      version: 1,
      model: config.ollama.embedModel,
      hash: docsHash(docs),
      dimensions: vectors[docs[0].id]?.length || 0,
      createdAt: new Date().toISOString(),
      vectors,
    };
    await writeJson(config.files.vectorIndex, index);
    cachedIndex = index;
    indexState = 'ready';
    lastProbe = { at: new Date().toISOString(), error: null };
    return index;
  })().catch(() => {
    indexState = 'unavailable';
    return null;
  }).finally(() => {
    warmupPromise = null;
  });
  return warmupPromise;
}

export async function getVectorStatus() {
  const docs = await loadKnowledge();
  const index = await loadIndex(docs);
  let mode = 'lexical';
  if (index) mode = 'embeddings';
  else if (indexState === 'indexing') mode = 'indexing';
  return {
    mode,
    embeddingModel: config.ollama.embedModel,
    documents: docs.length,
    indexed: Boolean(index),
    lastProbe,
    note: index
      ? 'Hybrid retrieval: Ollama embeddings with lexical fallback.'
      : 'Local lexical retrieval is active. Start Ollama with the embedding model to enable vector search.',
  };
}

export function resetVectorCache() {
  cachedKnowledge = null;
  cachedKnowledgeHash = null;
  cachedIndex = null;
  indexState = 'idle';
  warmupPromise = null;
}
