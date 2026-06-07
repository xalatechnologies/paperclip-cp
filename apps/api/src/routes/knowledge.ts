/**
 * Knowledge Routes — /api/knowledge
 *
 * RAG document store: collections, documents, semantic search stub.
 * Collections are bound to Paperclip agents — their contents are
 * injected into the agent context window at run time.
 */

import type { FastifyPluginAsync } from 'fastify';
import { knowledgeDb } from '../db.js';

// Chunk a text into ~512-token segments (sliding window, 10% overlap)
function chunkText(text: string, chunkTokens = 512): string[] {
  const words = text.split(/\s+/);
  const chunkWords = chunkTokens * 4; // ~4 chars per token ≈ 1 word per token (conservative)
  const overlap = Math.floor(chunkWords * 0.1);
  const chunks: string[] = [];
  let i = 0;
  while (i < words.length) {
    chunks.push(words.slice(i, i + chunkWords).join(' '));
    i += chunkWords - overlap;
  }
  return chunks.filter(c => c.trim().length > 0);
}

export const knowledgeRoutes: FastifyPluginAsync = async (app) => {

  // ── Collections ───────────────────────────────────────────────────────────

  app.get<{ Querystring: { company_id?: string } }>('/collections', async (req, reply) => {
    const rows = req.query.company_id
      ? knowledgeDb.listByCompany.all(req.query.company_id)
      : knowledgeDb.listCollections.all();
    // Parse bound_agent_ids JSON
    const parsed = (rows as any[]).map(r => ({
      ...r,
      bound_agent_ids: JSON.parse(r.bound_agent_ids ?? '[]'),
    }));
    return reply.send(parsed);
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
  }>('/collections', async (req, reply) => {
    const { name, paperclip_company_id, description, embedding_model, chunk_strategy, bound_agent_ids } = req.body;
    if (!name || !paperclip_company_id) {
      return reply.status(400).send({ error: 'name and company_id required' });
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

  // Bind agents to a collection
  app.patch<{
    Params: { id: string };
    Body: { bound_agent_ids: string[] };
  }>('/collections/:id/bind', async (req, reply) => {
    const col = knowledgeDb.getCollection.get(req.params.id);
    if (!col) return reply.status(404).send({ error: 'Collection not found' });
    knowledgeDb.bindAgents.run({
      id: req.params.id,
      bound_agent_ids: JSON.stringify(req.body.bound_agent_ids ?? []),
    });
    return reply.send({ id: req.params.id, bound_agent_ids: req.body.bound_agent_ids });
  });

  app.delete<{ Params: { id: string } }>('/collections/:id', async (req, reply) => {
    knowledgeDb.deleteCollection.run(req.params.id);
    return reply.send({ deleted: true });
  });

  // ── Documents ─────────────────────────────────────────────────────────────

  app.get<{ Params: { colId: string } }>('/collections/:colId/documents', async (req, reply) => {
    const docs = knowledgeDb.listDocuments.all(req.params.colId);
    return reply.send(docs);
  });

  app.post<{
    Params: { colId: string };
    Body: {
      name: string;
      file_type?: string;
      content: string;
    };
  }>('/collections/:colId/documents', async (req, reply) => {
    const { name, file_type, content } = req.body;
    if (!name || !content) {
      return reply.status(400).send({ error: 'name and content required' });
    }

    // Chunk the document
    const chunks = chunkText(content);
    const doc = knowledgeDb.insertDocument.get({
      collection_id: req.params.colId,
      name,
      file_type: file_type ?? 'text',
      content,
      chunk_count: chunks.length,
      size_bytes: Buffer.byteLength(content, 'utf8'),
    }) as any;

    // Update collection totals
    const col = knowledgeDb.getCollection.get(req.params.colId) as any;
    if (col) {
      const docs = knowledgeDb.listDocuments.all(req.params.colId) as any[];
      knowledgeDb.updateCollectionMeta.run({
        id: req.params.colId,
        doc_count: docs.length,
        chunk_count: docs.reduce((a, d) => a + d.chunk_count, 0),
        status: 'ready',
      });
    }

    return reply.status(201).send(doc);
  });

  app.delete<{ Params: { colId: string; docId: string } }>(
    '/collections/:colId/documents/:docId', async (req, reply) => {
      knowledgeDb.deleteDocument.run(req.params.docId);
      // Recalculate totals
      const docs = knowledgeDb.listDocuments.all(req.params.colId) as any[];
      knowledgeDb.updateCollectionMeta.run({
        id: req.params.colId,
        doc_count: docs.length,
        chunk_count: docs.reduce((a, d) => a + d.chunk_count, 0),
        status: 'ready',
      });
      return reply.send({ deleted: true });
    }
  );

  // ── Semantic search (text match stub — real embeddings need pgvector) ──────

  app.post<{ Body: { query: string; collection_id?: string; top_k?: number } }>(
    '/search', async (req, reply) => {
      const { query, collection_id, top_k = 5 } = req.body;
      if (!query) return reply.status(400).send({ error: 'query required' });

      // Simple keyword search until pgvector embeddings are wired in
      const allDocs = collection_id
        ? knowledgeDb.listDocuments.all(collection_id) as any[]
        : (knowledgeDb.listCollections.all() as any[]).flatMap(col =>
            knowledgeDb.listDocuments.all(col.id) as any[]
          );

      const qLower = query.toLowerCase();
      const results = allDocs
        .filter(d => d.content.toLowerCase().includes(qLower))
        .slice(0, top_k)
        .map(d => ({
          document_id: d.id,
          document_name: d.name,
          collection_id: d.collection_id,
          snippet: d.content.slice(
            Math.max(0, d.content.toLowerCase().indexOf(qLower) - 120),
            d.content.toLowerCase().indexOf(qLower) + 300
          ),
          score: 1.0, // placeholder — will be cosine similarity when pgvector is connected
        }));

      return reply.send({
        query,
        results,
        total: results.length,
        note: 'Keyword search — pgvector cosine similarity available when VPS embedding pipeline is active',
      });
    }
  );

  // ── Context injection payload ──────────────────────────────────────────────
  // Returns the formatted context blob to inject for a given agent (top-N chunks by relevance)

  app.get<{ Params: { agentId: string }; Querystring: { max_tokens?: string } }>(
    '/inject/:agentId', async (req, reply) => {
      const maxTokens = parseInt(req.query.max_tokens ?? '4000', 10);

      // Find all collections bound to this agent
      const allCols = knowledgeDb.listCollections.all() as any[];
      const boundCols = allCols.filter(c => {
        const ids: string[] = JSON.parse(c.bound_agent_ids ?? '[]');
        return ids.includes(req.params.agentId);
      });

      let totalTokens = 0;
      const sections: string[] = [];

      for (const col of boundCols) {
        const docs = knowledgeDb.listDocuments.all(col.id) as any[];
        for (const doc of docs) {
          const docTokens = Math.ceil(doc.size_bytes / 4);
          if (totalTokens + docTokens > maxTokens) break;
          sections.push(`## ${col.name} / ${doc.name}\n${doc.content}`);
          totalTokens += docTokens;
        }
      }

      return reply.send({
        agent_id: req.params.agentId,
        collection_count: boundCols.length,
        total_tokens: totalTokens,
        max_tokens: maxTokens,
        context_block: sections.join('\n\n---\n\n'),
      });
    }
  );
};
