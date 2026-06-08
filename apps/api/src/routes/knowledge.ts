/**
 * Knowledge Base Routes — /api/knowledge
 *
 * RAG pipeline:
 *  Upload → chunk (512-tok sliding) → embed (text-embedding-3-small) → store in Convex
 *  Search  → embed query → Convex native ANN vectorSearch → top-k chunks
 *
 * Embeddings are produced in this file (OpenAI call), then stored as v.bytes() in Convex.
 * The OpenAI API key never leaves the Fastify API.
 */

import type { FastifyPluginAsync } from 'fastify';
import { convex, convexAdmin, callInternalMutation, api, internal } from '../convex-client.js';
import {
  splitChunks,
  embedBatch,
  embedText,
  estimateTokens,
  EMBEDDING_ENABLED,
} from '../embeddings.js';

export const knowledgeRoutes: FastifyPluginAsync = async (app) => {

  // ── Collections ────────────────────────────────────────────────────────────

  app.get<{ Querystring: { company_id?: string } }>('/', async (req, reply) => {
    const cols = await convex.query(api.knowledge.listCollections, {
      paperclip_company_id: req.query.company_id,
    });
    return reply.send(cols);
  });

  app.post<{
    Body: {
      name:                 string;
      paperclip_company_id: string;
      description?:         string;
      embedding_model?:     string;
      chunk_strategy?:      string;
      bound_agent_ids?:     string[];
    };
  }>('/', async (req, reply) => {
    const { name, paperclip_company_id, description, embedding_model, chunk_strategy, bound_agent_ids } = req.body;
    if (!name || !paperclip_company_id) {
      return reply.status(400).send({ error: 'name and paperclip_company_id required' });
    }
    const id = await convex.mutation(api.knowledge.createCollection, {
      name, paperclip_company_id, description, embedding_model, chunk_strategy, bound_agent_ids,
    });
    return reply.status(201).send({ _id: id });
  });

  app.delete<{ Params: { id: string } }>('/:id', async (req, reply) => {
    await convex.mutation(api.knowledge.deleteCollection, { id: req.params.id as any });
    return reply.send({ deleted: true });
  });

  // ── Documents ─────────────────────────────────────────────────────────────

  app.get<{ Params: { id: string } }>('/:id/documents', async (req, reply) => {
    const docs = await convex.query(api.knowledge.listDocuments, {
      collection_id: req.params.id as any,
    });
    return reply.send(docs);
  });

  /**
   * POST /:id/documents
   * Upload → chunk → embed → store in Convex
   */
  app.post<{
    Params: { id: string };
    Body: { name: string; file_type?: string; content: string };
  }>('/:id/documents', async (req, reply) => {
    const collectionId = req.params.id;
    const { name, file_type = 'text', content } = req.body;
    if (!name || !content) return reply.status(400).send({ error: 'name and content required' });

    // 1. Store document
    const docId = await convex.mutation(api.knowledge.insertDocument, {
      collection_id: collectionId as any,
      name,
      file_type,
      content,
      size_bytes: Buffer.byteLength(content, 'utf8'),
    });

    // 2. Chunk
    const rawChunks = splitChunks(content);

    // 3. Embed batch (OpenAI — stays in API)
    const embeddings = await embedBatch(rawChunks);

    // 4. Store chunks with embeddings via internalMutation
    const chunks = rawChunks.map((chunkText, i) => ({
      chunk_index: i,
      content:     chunkText,
      token_count: estimateTokens(chunkText),
      embedding:   embeddings[i] ? Array.from(embeddings[i]!) : undefined, // Float32Array → number[]
    }));

    await callInternalMutation(internal.knowledge.insertChunks, {
      document_id:   docId as any,
      collection_id: collectionId as any,
      chunks,
    });

    return reply.status(201).send({
      _id:              docId,
      chunk_count:      rawChunks.length,
      embedding_enabled: EMBEDDING_ENABLED(),
    });
  });

  app.delete<{ Params: { id: string; docId: string } }>(
    '/:id/documents/:docId', async (req, reply) => {
      await convex.mutation(api.knowledge.deleteDocument, {
        id:            req.params.docId as any,
        collection_id: req.params.id   as any,
      });
      return reply.send({ deleted: true });
    }
  );

  // ── Semantic Search ────────────────────────────────────────────────────────

  app.post<{
    Body: { query: string; collection_id?: string; top_k?: number };
  }>('/search', async (req, reply) => {
    const { query, collection_id, top_k = 5 } = req.body;
    if (!query?.trim()) return reply.status(400).send({ error: 'query required' });

    const allCols = await convex.query(api.knowledge.listCollections, {});

    // Embed query (OpenAI — stays in API)
    const queryVec = EMBEDDING_ENABLED() ? await embedText(query) : null;

    let enriched: any[] = [];

    if (queryVec) {
      // Convex native ANN vector search
      const targetCols = collection_id
        ? allCols.filter((c: any) => c._id === collection_id)
        : allCols;

      for (const col of targetCols) {
        const hits = await convex.action(api.knowledge.vectorSearch, {
          collection_id: col._id,
          vector:        Array.from(queryVec),
          limit:         top_k,
        }) as Array<{ _id: string; _score: number }>;

        const chunks = await convex.query(api.knowledge.getChunksByIds, {
          ids: hits.map((h) => h._id as any),
        });

        for (let i = 0; i < chunks.length; i++) {
          const chunk = chunks[i] as any;
          if (!chunk) continue;
          enriched.push({
            chunk_id:        chunk._id,
            document_id:     chunk.document_id,
            collection_name: col.name,
            snippet:         chunk.content.length > 400 ? chunk.content.slice(0, 400) + '…' : chunk.content,
            score:           Math.round((hits[i]?._score ?? 0) * 1000) / 1000,
            token_count:     chunk.token_count,
          });
        }
      }

      // Sort by score descending, take top_k globally
      enriched = enriched.sort((a, b) => b.score - a.score).slice(0, top_k);

    } else {
      // Keyword fallback (no embedding)
      const targetColIds = collection_id ? [collection_id] : allCols.map((c: any) => c._id);
      for (const colId of targetColIds) {
        const col  = allCols.find((c: any) => c._id === colId);
        const docs = await convex.query(api.knowledge.listDocuments, { collection_id: colId as any });
        for (const doc of docs as any[]) {
          const chunks = await convex.query(api.knowledge.listChunks, { document_id: doc._id });
          for (const ch of chunks as any[]) {
            const lower = ch.snippet.toLowerCase();
            const words = query.toLowerCase().split(/\s+/);
            const hits  = words.filter((w: string) => w.length > 2 && lower.includes(w)).length;
            if (hits > 0) {
              enriched.push({
                chunk_id:        ch._id,
                document_id:     doc._id,
                collection_name: col?.name ?? colId,
                snippet:         ch.snippet,
                score:           hits / words.length,
                token_count:     ch.token_count,
              });
            }
          }
        }
      }
      enriched = enriched.sort((a, b) => b.score - a.score).slice(0, top_k);
    }

    return reply.send({
      results:       enriched,
      embedding_used: EMBEDDING_ENABLED() && !!queryVec,
      query,
    });
  });

  // ── Chunk inspection ───────────────────────────────────────────────────────

  app.get<{ Params: { id: string; docId: string } }>(
    '/:id/documents/:docId/chunks', async (req, reply) => {
      const chunks = await convex.query(api.knowledge.listChunks, {
        document_id: req.params.docId as any,
      });
      return reply.send(chunks);
    }
  );
};
