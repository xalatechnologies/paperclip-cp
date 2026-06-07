/**
 * Knowledge Base Routes — /api/knowledge
 *
 * Real RAG pipeline:
 *  Upload → chunk (512-tok sliding) → embed (text-embedding-3-small) → store
 *  Search  → embed query → cosine similarity → top-k chunks with snippets
 */

import type { FastifyPluginAsync } from 'fastify';
import { knowledgeDb, chunksDb } from '../db.js';
import {
  splitChunks, embedBatch, embedText,
  float32ToBuffer, bufferToFloat32,
  searchChunks, estimateTokens, EMBEDDING_ENABLED,
} from '../embeddings.js';

export const knowledgeRoutes: FastifyPluginAsync = async (app) => {

  // ── Collections ────────────────────────────────────────────────────────────

  app.get('/', async (_req, reply) => {
    const cols = knowledgeDb.listCollections.all() as any[];
    return reply.send(cols.map(c => ({
      ...c,
      bound_agent_ids: JSON.parse(c.bound_agent_ids ?? '[]'),
    })));
  });

  app.post<{
    Body: {
      name: string;
      paperclip_company_id: string;
      description?: string;
      embedding_model?: string;
      chunk_strategy?: string;
      bound_agent_ids?: string[];
    };
  }>('/', async (req, reply) => {
    const { name, paperclip_company_id, description, embedding_model, chunk_strategy, bound_agent_ids } = req.body;
    if (!name || !paperclip_company_id) {
      return reply.status(400).send({ error: 'name and paperclip_company_id required' });
    }
    const col = knowledgeDb.insertCollection.get({
      name, paperclip_company_id,
      description: description ?? null,
      embedding_model: embedding_model ?? 'text-embedding-3-small',
      chunk_strategy: chunk_strategy ?? 'sliding_512',
      bound_agent_ids: JSON.stringify(bound_agent_ids ?? []),
    }) as any;
    return reply.status(201).send({ ...col, bound_agent_ids: JSON.parse(col.bound_agent_ids ?? '[]') });
  });

  app.delete<{ Params: { id: string } }>('/:id', async (req, reply) => {
    knowledgeDb.deleteCollection.run(req.params.id);
    return reply.send({ deleted: true });
  });

  // ── Documents ─────────────────────────────────────────────────────────────

  app.get<{ Params: { id: string } }>('/:id/documents', async (req, reply) => {
    const docs = knowledgeDb.listDocuments.all(req.params.id) as any[];
    return reply.send(docs.map(d => ({ ...d, content: undefined }))); // don't return raw content
  });

  /**
   * POST /:id/documents
   * Upload a document → chunk it → generate embeddings → store
   */
  app.post<{
    Params: { id: string };
    Body: { name: string; file_type?: string; content: string; collection_id?: string };
  }>('/:id/documents', async (req, reply) => {
    const collectionId = req.params.id;
    const { name, file_type = 'text', content } = req.body;
    if (!name || !content) return reply.status(400).send({ error: 'name and content required' });

    // 1. Store document
    const doc = knowledgeDb.insertDocument.get({
      collection_id: collectionId,
      name,
      file_type,
      content,
      chunk_count: 0,
      size_bytes: Buffer.byteLength(content, 'utf8'),
    }) as any;

    // 2. Split into chunks
    const rawChunks = splitChunks(content);

    // 3. Embed all chunks in one batch call
    const embeddings = await embedBatch(rawChunks);

    // 4. Store chunks with embeddings
    const insertChunk = chunksDb.insertChunk;
    for (let i = 0; i < rawChunks.length; i++) {
      const chunkText = rawChunks[i];
      const vec = embeddings[i];
      insertChunk.run({
        document_id: doc.id,
        collection_id: collectionId,
        chunk_index: i,
        content: chunkText,
        token_count: estimateTokens(chunkText),
        embedding: vec ? float32ToBuffer(vec) : null,
      });
    }

    // 5. Update collection counts
    const allDocs = knowledgeDb.listDocuments.all(collectionId) as any[];
    const totalChunks = (chunksDb.countByCollection.get(collectionId) as any)?.count ?? 0;
    knowledgeDb.updateCollectionMeta.run({
      id: collectionId,
      doc_count: allDocs.length,
      chunk_count: totalChunks,
      status: 'ready',
    });

    return reply.status(201).send({
      ...doc,
      chunk_count: rawChunks.length,
      embedding_enabled: EMBEDDING_ENABLED(),
    });
  });

  app.delete<{ Params: { id: string; docId: string } }>(
    '/:id/documents/:docId', async (req, reply) => {
      // Chunks cascade-delete via FK
      chunksDb.deleteByDocument.run(req.params.docId);
      knowledgeDb.deleteDocument.run(req.params.docId);

      // Recount
      const allDocs = knowledgeDb.listDocuments.all(req.params.id) as any[];
      const totalChunks = (chunksDb.countByCollection.get(req.params.id) as any)?.count ?? 0;
      knowledgeDb.updateCollectionMeta.run({
        id: req.params.id,
        doc_count: allDocs.length,
        chunk_count: totalChunks,
        status: 'ready',
      });
      return reply.send({ deleted: true });
    }
  );

  // ── Semantic Search ────────────────────────────────────────────────────────

  /**
   * POST /search
   * Body: { query, collection_id?, top_k? }
   * Embeds query → cosine similarity over chunks → returns top-k with snippets
   */
  app.post<{
    Body: { query: string; collection_id?: string; top_k?: number };
  }>('/search', async (req, reply) => {
    const { query, collection_id, top_k = 5 } = req.body;
    if (!query?.trim()) return reply.status(400).send({ error: 'query required' });

    // Load relevant chunks from SQLite
    let rawChunks: any[];
    if (collection_id) {
      rawChunks = chunksDb.listByCollection.all(collection_id) as any[];
    } else {
      // Search across all collections
      const cols = knowledgeDb.listCollections.all() as any[];
      rawChunks = cols.flatMap(c =>
        (chunksDb.listByCollection.all(c.id) as any[]).map(ch => ({ ...ch, collection_id: c.id }))
      );
    }

    if (rawChunks.length === 0) {
      return reply.send({ results: [], embedding_used: false, query });
    }

    // Semantic search (falls back to keyword if no API key)
    const results = await searchChunks(query, rawChunks, top_k);

    // Enrich with document + collection names
    const allCols = knowledgeDb.listCollections.all() as any[];
    const allDocs = (knowledgeDb.listCollections.all() as any[]).flatMap(c =>
      (knowledgeDb.listDocuments.all(c.id) as any[]).map(d => ({ ...d, collection_name: c.name }))
    );

    const enriched = results.map(r => {
      const doc = allDocs.find(d => d.id === r.document_id);
      return {
        chunk_id:        r.chunk_id,
        document_id:     r.document_id,
        document_name:   doc?.name ?? 'Unknown',
        collection_name: doc?.collection_name ?? 'Unknown',
        snippet:         r.content.length > 400 ? r.content.slice(0, 400) + '…' : r.content,
        score:           Math.round(r.score * 1000) / 1000,
        token_count:     r.token_count,
      };
    });

    return reply.send({
      results: enriched,
      embedding_used: EMBEDDING_ENABLED(),
      total_chunks_searched: rawChunks.length,
      query,
    });
  });

  // ── Chunk inspection ──────────────────────────────────────────────────────

  app.get<{ Params: { id: string; docId: string } }>(
    '/:id/documents/:docId/chunks', async (req, reply) => {
      const chunks = chunksDb.listByDocument.all(req.params.docId) as any[];
      return reply.send(chunks.map(c => ({
        id: c.id,
        chunk_index: c.chunk_index,
        token_count: c.token_count,
        has_embedding: !!c.embedding,
        snippet: c.content.slice(0, 120) + (c.content.length > 120 ? '…' : ''),
      })));
    }
  );
};
