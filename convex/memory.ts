/**
 * Agent Memory
 *
 * Public CRUD + internal purge and distillation.
 * Memory entries are fetched by importance × recency for context injection.
 */

import { query, mutation, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import type { MutationCtx } from "./_generated/server";

// ── Public Queries ─────────────────────────────────────────────────────────

export const listByAgent = query({
  args: {
    paperclip_agent_id: v.string(),
    min_importance:     v.optional(v.number()),
    limit:              v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = Math.min(args.limit ?? 50, 200);
    let q = ctx.db
      .query("agentMemory")
      .withIndex("by_agent_id_and_importance", (q) =>
        q.eq("paperclip_agent_id", args.paperclip_agent_id)
      )
      .order("desc");

    const rows = await q.take(limit);
    const now = Date.now();
    // Filter out expired entries client-side (Convex doesn't support filter)
    return rows.filter((r) => r.expires_at == null || r.expires_at > now);
  },
});

export const listByCompany = query({
  args: {
    paperclip_company_id: v.string(),
    limit:                v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = Math.min(args.limit ?? 100, 500);
    return await ctx.db
      .query("agentMemory")
      .withIndex("by_company_id", (q) =>
        q.eq("paperclip_company_id", args.paperclip_company_id)
      )
      .order("desc")
      .take(limit);
  },
});

// ── Public Mutations ───────────────────────────────────────────────────────

export const insert = mutation({
  args: {
    paperclip_agent_id:   v.string(),
    paperclip_company_id: v.string(),
    type: v.union(
      v.literal("fact"),
      v.literal("summary"),
      v.literal("error"),
      v.literal("preference"),
    ),
    content:    v.string(),
    source:     v.optional(v.string()),
    importance: v.number(),
    token_count: v.number(),
    expires_at: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("agentMemory", {
      paperclip_agent_id:   args.paperclip_agent_id,
      paperclip_company_id: args.paperclip_company_id,
      type:        args.type,
      content:     args.content,
      source:      args.source,
      importance:  Math.min(5, Math.max(1, args.importance)),
      token_count: args.token_count,
      expires_at:  args.expires_at,
    });
  },
});

export const remove = mutation({
  args: { id: v.id("agentMemory") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id);
  },
});

export const updateImportance = mutation({
  args: { id: v.id("agentMemory"), importance: v.number() },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, { importance: Math.min(5, Math.max(1, args.importance)) });
  },
});

// ── Internal: Purge expired entries ──────────────────────────────────────
// Called by cron every hour.

export const purgeExpired = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    // Scan in batches — Convex mutations have document limits
    const expired = await ctx.db
      .query("agentMemory")
      .order("asc")
      .take(200);

    let count = 0;
    for (const entry of expired) {
      if (entry.expires_at != null && entry.expires_at < now) {
        await ctx.db.delete(entry._id);
        count++;
      }
    }
    console.log(`[memory] Purged ${count} expired entries`);
    return count;
  },
});

// ── Internal: Bulk insert from Fastify distillation ───────────────────────

export const bulkInsert = internalMutation({
  args: {
    entries: v.array(v.object({
      paperclip_agent_id:   v.string(),
      paperclip_company_id: v.string(),
      type: v.union(
        v.literal("fact"),
        v.literal("summary"),
        v.literal("error"),
        v.literal("preference"),
      ),
      content:    v.string(),
      source:     v.optional(v.string()),
      importance: v.number(),
      token_count: v.number(),
      expires_at: v.optional(v.number()),
    })),
  },
  handler: async (ctx, args) => {
    const ids = [];
    for (const e of args.entries.slice(0, 10)) { // max 10 per call
      const id = await ctx.db.insert("agentMemory", {
        ...e,
        importance: Math.min(5, Math.max(1, e.importance)),
      });
      ids.push(id);
    }
    return ids;
  },
});
