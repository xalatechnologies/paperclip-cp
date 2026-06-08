/**
 * Knowledge Base — RAG Pipeline
 *
 * Collections → Documents → Chunks (with embeddings)
 *
 * Vector search uses Convex native ANN index — replaces manual
 * cosineSimilarity() loop in the Fastify API.
 *
 * Embedding is still produced by the Fastify API (OpenAI call needs
 * OPENAI_API_KEY). The float32 array is passed here as ArrayBuffer (v.bytes).
 *
 * "use node" is NOT needed here because fetch() is available in Convex
 * runtime and we don't use Node.js built-ins.
 */

import { query, mutation, internalMutation, action } from "./_generated/server";
import { v } from "convex/values";
import type { QueryCtx, MutationCtx, ActionCtx } from "./_generated/server";

// ── Collections ───────────────────────────────────────────────────────────

export const listCollections = query({
  args: { paperclip_company_id: v.optional(v.string()) },
  handler: async (ctx: QueryCtx, args) => {
    if (args.paperclip_company_id) {
      return ctx.db
        .query("knowledgeCollections")
        .withIndex("by_company_id", (q) =>
          q.eq("paperclip_company_id", args.paperclip_company_id!)
        )
        .order("desc")
        .take(100);
    }
    return ctx.db.query("knowledgeCollections").order("desc").take(200);
  },
});

export const getCollection = query({
  args: { id: v.id("knowledgeCollections") },
  handler: async (ctx: QueryCtx, args) => ctx.db.get(args.id),
});

export const createCollection = mutation({
  args: {
    name:                 v.string(),
    paperclip_company_id: v.string(),
    description:          v.optional(v.string()),
    embedding_model:      v.optional(v.string()),
    chunk_strategy:       v.optional(v.string()),
    bound_agent_ids:      v.optional(v.array(v.string())),
  },
  handler: async (ctx: MutationCtx, args) => {
    return ctx.db.insert("knowledgeCollections", {
      name:                 args.name,
      paperclip_company_id: args.paperclip_company_id,
      description:          args.description,
      embedding_model:      args.embedding_model ?? "text-embedding-3-small",
      chunk_strategy:       args.chunk_strategy  ?? "sliding_512",
      bound_agent_ids:      args.bound_agent_ids ?? [],
      status:    "ready",
      doc_count:   0,
      chunk_count: 0,
    });
  },
});

export const bindAgents = mutation({
  args: { id: v.id("knowledgeCollections"), agent_ids: v.array(v.string()) },
  handler: async (ctx: MutationCtx, args) => {
    await ctx.db.patch(args.id, { bound_agent_ids: args.agent_ids });
  },
});

export const deleteCollection = mutation({
  args: { id: v.id("knowledgeCollections") },
  handler: async (ctx: MutationCtx, args) => {
    const docs = await ctx.db
      .query("knowledgeDocuments")
      .withIndex("by_collection_id", (q) => q.eq("collection_id", args.id))
      .take(500);

    // Inline: delete chunks + document for each doc
    for (const doc of docs) {
      const chunks = await ctx.db
        .query("knowledgeChunks")
        .withIndex("by_document_id", (q) => q.eq("document_id", doc._id))
        .take(1000);
      for (const chunk of chunks) await ctx.db.delete(chunk._id);
      await ctx.db.delete(doc._id);
    }

    await ctx.db.delete(args.id);
    return { deleted: true };
  },
});

// ── Documents ─────────────────────────────────────────────────────────────

export const listDocuments = query({
  args: { collection_id: v.id("knowledgeCollections") },
  handler: async (ctx: QueryCtx, args) => {
    const docs = await ctx.db
      .query("knowledgeDocuments")
      .withIndex("by_collection_id", (q) =>
        q.eq("collection_id", args.collection_id)
      )
      .order("desc")
      .take(100);
    // Don't return raw content — it can be huge
    return docs.map(({ content: _c, ...safe }) => safe);
  },
});

export const insertDocument = mutation({
  args: {
    collection_id: v.id("knowledgeCollections"),
    name:          v.string(),
    file_type:     v.optional(v.string()),
    content:       v.string(),
    size_bytes:    v.number(),
  },
  handler: async (ctx: MutationCtx, args) => {
    const docId = await ctx.db.insert("knowledgeDocuments", {
      collection_id: args.collection_id,
      name:          args.name,
      file_type:     args.file_type ?? "text",
      content:       args.content,
      chunk_count:   0,
      size_bytes:    args.size_bytes,
    });
    // Increment doc_count on collection
    const col = await ctx.db.get(args.collection_id);
    if (col) await ctx.db.patch(args.collection_id, { doc_count: col.doc_count + 1 });
    return docId;
  },
});

export const deleteDocument = mutation({
  args: { id: v.id("knowledgeDocuments"), collection_id: v.id("knowledgeCollections") },
  handler: async (ctx: MutationCtx, args) => {
    // Delete all chunks for this document
    const chunks = await ctx.db
      .query("knowledgeChunks")
      .withIndex("by_document_id", (q) => q.eq("document_id", args.id))
      .take(1000);
    for (const chunk of chunks) await ctx.db.delete(chunk._id);

    await ctx.db.delete(args.id);

    // Update collection counts
    const col = await ctx.db.get(args.collection_id);
    if (col) {
      const remaining = await ctx.db
        .query("knowledgeDocuments")
        .withIndex("by_collection_id", (q) => q.eq("collection_id", args.collection_id))
        .take(500);
      const totalChunks = await ctx.db
        .query("knowledgeChunks")
        .withIndex("by_collection_id", (q) => q.eq("collection_id", args.collection_id))
        .take(500);
      await ctx.db.patch(args.collection_id, {
        doc_count:   remaining.length,
        chunk_count: totalChunks.length,
      });
    }
    return { deleted: true };
  },
});

// ── Chunks ────────────────────────────────────────────────────────────────

/** Internal — called from Fastify after embedding batch */
export const insertChunks = internalMutation({
  args: {
    document_id:   v.id("knowledgeDocuments"),
    collection_id: v.id("knowledgeCollections"),
    chunks: v.array(v.object({
      chunk_index: v.number(),
      content:     v.string(),
      token_count: v.number(),
      embedding:   v.optional(v.array(v.float64())), // Float32Array as number[]
    })),
  },
  handler: async (ctx: MutationCtx, args) => {
    for (const chunk of args.chunks) {
      await ctx.db.insert("knowledgeChunks", {
        document_id:   args.document_id,
        collection_id: args.collection_id,
        chunk_index:   chunk.chunk_index,
        content:       chunk.content,
        token_count:   chunk.token_count,
        embedding:     chunk.embedding,
      });
    }
    // Update document chunk_count
    await ctx.db.patch(args.document_id, { chunk_count: args.chunks.length });
    // Update collection chunk_count
    const col = await ctx.db.get(args.collection_id);
    if (col) {
      await ctx.db.patch(args.collection_id, {
        chunk_count: col.chunk_count + args.chunks.length,
        status: "ready",
      });
    }
    return args.chunks.length;
  },
});

export const listChunks = query({
  args: { document_id: v.id("knowledgeDocuments") },
  handler: async (ctx: QueryCtx, args) => {
    const chunks = await ctx.db
      .query("knowledgeChunks")
      .withIndex("by_document_id", (q) => q.eq("document_id", args.document_id))
      .take(500);
    // Return metadata only (no embedding blob — too large)
    return chunks.map(({ embedding: _e, content, ...meta }) => ({
      ...meta,
      has_embedding: _e != null,
      snippet: content.slice(0, 120) + (content.length > 120 ? "…" : ""),
    }));
  },
});

/** Fetch chunk content by IDs — used after vectorSearch returns IDs */
export const getChunksByIds = query({
  args: { ids: v.array(v.id("knowledgeChunks")) },
  handler: async (ctx: QueryCtx, args) => {
    const results = [];
    for (const id of args.ids) {
      const chunk = await ctx.db.get(id);
      if (chunk) {
        const { embedding: _e, ...safe } = chunk;
        results.push(safe);
      }
    }
    return results;
  },
});

// ── Vector Search (Convex native ANN) ─────────────────────────────────────
//
// Replaces manual cosineSimilarity() loop in the Fastify API.
// The query vector is produced by the Fastify API (OpenAI call) and
// passed here as a plain number[].
//
// Returns: [{ _id, _score }] — top-k chunk IDs with similarity scores.
// The caller (Fastify /api/knowledge/search) then fetches chunk content
// via getChunksByIds and enriches with document/collection names.

export const vectorSearch = action({
  args: {
    collection_id: v.id("knowledgeCollections"),
    vector:        v.array(v.number()), // Float32Array converted to number[]
    limit:         v.optional(v.number()),
  },
  handler: async (ctx: ActionCtx, args) => {
    const limit = Math.min(args.limit ?? 5, 20);
    const results = await ctx.vectorSearch("knowledgeChunks", "by_embedding", {
      vector: args.vector,
      limit,
      filter: (q) => q.eq("collection_id", args.collection_id),
    });
    return results; // [{ _id: Id<"knowledgeChunks">, _score: number }]
  },
});

/** Vector search across ALL collections (no filter) */
export const vectorSearchGlobal = action({
  args: {
    vector: v.array(v.number()),
    limit:  v.optional(v.number()),
  },
  handler: async (ctx: ActionCtx, args) => {
    const limit = Math.min(args.limit ?? 5, 20);
    return ctx.vectorSearch("knowledgeChunks", "by_embedding", {
      vector: args.vector,
      limit,
    });
  },
});
