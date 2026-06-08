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
// Serialisation — Float32Array ↔ ArrayBuffer (Convex v.bytes)
//
// Note: float32ToBuffer (SQLite BLOB) removed — use float32ToArrayBuffer instead.
//       bufferToFloat32 removed — Convex vectorSearch returns IDs+scores, not vectors.
// ---------------------------------------------------------------------------

/**
 * Convert a Float32Array to an ArrayBuffer for storage as v.bytes() in Convex.
 */
export function float32ToArrayBuffer(vec: Float32Array): ArrayBuffer {
  // Copy to avoid sharing the backing buffer with Node.js internals
  return vec.buffer.slice(vec.byteOffset, vec.byteOffset + vec.byteLength) as ArrayBuffer;
}

export const EMBEDDING_ENABLED = () => !!process.env.OPENAI_API_KEY;
