/**
 * Embedding Pipeline
 * 
 * - splitChunks()     : sliding-window 512-token chunker
 * - embedText()       : OpenAI text-embedding-3-small (1536 dims)
 * - embedBatch()      : batch up to 100 texts
 * - cosineSimilarity(): dot-product similarity for pre-normalised vectors
 * - searchChunks()    : semantic search over an array of {content, embedding}
 *
 * Degrades gracefully: if OPENAI_API_KEY is not set, embedText() returns null
 * and callers fall back to keyword matching.
 */

import OpenAI from 'openai';

// ---------------------------------------------------------------------------
// Client — lazy singleton
// ---------------------------------------------------------------------------

let _client: OpenAI | null = null;

function getClient(): OpenAI | null {
  if (!process.env.OPENAI_API_KEY) return null;
  if (!_client) _client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return _client;
}

// ---------------------------------------------------------------------------
// Chunking — simple word-boundary sliding window
// ---------------------------------------------------------------------------

const CHUNK_TOKENS = 512;  // target tokens per chunk
const CHUNK_OVERLAP = 64;  // overlap in tokens between adjacent chunks
const CHARS_PER_TOKEN = 4; // rough approximation

export function splitChunks(text: string): string[] {
  const targetChars  = CHUNK_TOKENS * CHARS_PER_TOKEN;
  const overlapChars = CHUNK_OVERLAP * CHARS_PER_TOKEN;

  if (text.length <= targetChars) return [text];

  const chunks: string[] = [];
  let start = 0;

  while (start < text.length) {
    let end = start + targetChars;

    // Walk back to a word boundary to avoid splitting mid-word
    if (end < text.length) {
      const boundary = text.lastIndexOf(' ', end);
      if (boundary > start + overlapChars) end = boundary;
    } else {
      end = text.length;
    }

    chunks.push(text.slice(start, end).trim());
    if (end >= text.length) break;

    // Advance with overlap
    start = end - overlapChars;
    // Walk forward to next word boundary
    const nextBoundary = text.indexOf(' ', start);
    if (nextBoundary > start && nextBoundary < end) start = nextBoundary + 1;
  }

  return chunks.filter(c => c.length > 0);
}

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

// ---------------------------------------------------------------------------
// Embedding — OpenAI text-embedding-3-small
// ---------------------------------------------------------------------------

const EMBED_MODEL = 'text-embedding-3-small';
const EMBED_DIMS  = 1536;

/**
 * Embed a single text. Returns null if OpenAI is not configured.
 */
export async function embedText(text: string): Promise<Float32Array | null> {
  const client = getClient();
  if (!client) return null;

  try {
    const res = await client.embeddings.create({
      model: EMBED_MODEL,
      input: text.replace(/\n+/g, ' ').slice(0, 8191), // API max
    });
    return new Float32Array(res.data[0].embedding);
  } catch (err) {
    console.error('[embeddings] embedText failed:', err);
    return null;
  }
}

/**
 * Embed up to 100 texts in one API call.
 */
export async function embedBatch(texts: string[]): Promise<(Float32Array | null)[]> {
  const client = getClient();
  if (!client) return texts.map(() => null);
  if (texts.length === 0) return [];

  try {
    const cleaned = texts.map(t => t.replace(/\n+/g, ' ').slice(0, 8191));
    const res = await client.embeddings.create({ model: EMBED_MODEL, input: cleaned });
    return res.data.map(d => new Float32Array(d.embedding));
  } catch (err) {
    console.error('[embeddings] embedBatch failed:', err);
    return texts.map(() => null);
  }
}

// ---------------------------------------------------------------------------
// Serialisation — Float32Array ↔ Buffer (SQLite BLOB)
// ---------------------------------------------------------------------------

export function float32ToBuffer(vec: Float32Array): Buffer {
  return Buffer.from(vec.buffer);
}

export function bufferToFloat32(buf: Buffer | null | undefined): Float32Array | null {
  if (!buf || buf.length === 0) return null;
  return new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
}

// ---------------------------------------------------------------------------
// Cosine similarity — assumes unit-norm vectors (OpenAI returns normalised)
// ---------------------------------------------------------------------------

export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) return 0;
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return dot; // vectors are already unit-norm from OpenAI
}

// ---------------------------------------------------------------------------
// Semantic search over in-memory chunk list
// ---------------------------------------------------------------------------

export interface ChunkResult {
  chunk_id: string;
  document_id: string;
  collection_id?: string;
  content: string;
  token_count: number;
  score: number;
}

/**
 * Search chunks by cosine similarity to the query embedding.
 * Falls back to keyword matching when embeddings are unavailable.
 */
export async function searchChunks(
  query: string,
  chunks: Array<{
    id: string;
    document_id: string;
    collection_id?: string;
    content: string;
    token_count: number;
    embedding: Buffer | null;
  }>,
  topK = 5,
): Promise<ChunkResult[]> {
  const queryVec = await embedText(query);

  if (queryVec) {
    // Semantic search
    const scored = chunks
      .map(c => {
        const vec = bufferToFloat32(c.embedding);
        const score = vec ? cosineSimilarity(queryVec, vec) : keywordScore(query, c.content);
        return { chunk_id: c.id, document_id: c.document_id, collection_id: c.collection_id, content: c.content, token_count: c.token_count, score };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
    return scored;
  }

  // Keyword fallback
  const qWords = query.toLowerCase().split(/\s+/);
  return chunks
    .map(c => ({
      chunk_id: c.id, document_id: c.document_id, collection_id: c.collection_id,
      content: c.content, token_count: c.token_count,
      score: keywordScore(query, c.content),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .filter(r => r.score > 0);
}

function keywordScore(query: string, text: string): number {
  const lowerText = text.toLowerCase();
  const words = query.toLowerCase().split(/\s+/);
  let hits = 0;
  for (const w of words) if (w.length > 2 && lowerText.includes(w)) hits++;
  return hits / Math.max(words.length, 1);
}

export const EMBEDDING_ENABLED = () => !!process.env.OPENAI_API_KEY;
