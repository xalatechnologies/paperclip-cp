/**
 * Agents — heartbeat + status mirror
 *
 * PCC doesn't own agent CRUD (Paperclip API is authoritative).
 * We mirror status + last_seen into Convex so the dashboard can
 * show live agent status without polling the VPS on every render.
 *
 * heartbeat() is called by the Fastify cron every 2 minutes.
 */

import { query, mutation, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import type { QueryCtx, MutationCtx } from "./_generated/server";

// ── Agent status snapshot table (lightweight — only status + last_seen) ────
// Uses the agentMemory table's company index for company filtering.
// Agent list is stored in a separate lightweight "agentStatus" concept here
// via the existing Convex data model — we upsert into a dedicated pattern.

// Since schema.ts doesn't have an agentStatus table, we use the agentMemory
// table's indexes. For true status tracking, add agentStatus table in next
// schema expansion.
//
// For now: heartbeat writes a special memory entry with type="preference"
// and content = JSON status snapshot, importance=1 (lowest, auto-purged).

export const heartbeat = mutation({
  args: {
    paperclip_agent_id:   v.string(),
    status:               v.string(), // "online" | "offline" | "running" | "idle"
    last_seen:            v.string(), // ISO timestamp
    paperclip_company_id: v.optional(v.string()),
    metadata:             v.optional(v.string()), // JSON
  },
  handler: async (ctx: MutationCtx, args) => {
    // Find existing heartbeat entry for this agent
    const existing = await ctx.db
      .query("agentMemory")
      .withIndex("by_agent_id", (q) =>
        q.eq("paperclip_agent_id", args.paperclip_agent_id)
      )
      .filter((q) => q.eq(q.field("type"), "preference"))
      .filter((q) => q.eq(q.field("source"), "__heartbeat__"))
      .first();

    const content = JSON.stringify({
      status:    args.status,
      last_seen: args.last_seen,
      metadata:  args.metadata,
    });

    if (existing) {
      await ctx.db.patch(existing._id, { content, token_count: 10 });
      return existing._id;
    } else {
      return ctx.db.insert("agentMemory", {
        paperclip_agent_id:   args.paperclip_agent_id,
        paperclip_company_id: args.paperclip_company_id ?? "unknown",
        type:        "preference",
        content,
        source:      "__heartbeat__",
        importance:  1,
        token_count: 10,
      });
    }
  },
});

export const getStatus = query({
  args: { paperclip_agent_id: v.string() },
  handler: async (ctx: QueryCtx, args) => {
    const entry = await ctx.db
      .query("agentMemory")
      .withIndex("by_agent_id", (q) =>
        q.eq("paperclip_agent_id", args.paperclip_agent_id)
      )
      .filter((q) => q.eq(q.field("source"), "__heartbeat__"))
      .first();

    if (!entry) return null;
    try {
      return { paperclip_agent_id: args.paperclip_agent_id, ...JSON.parse(entry.content) };
    } catch {
      return null;
    }
  },
});

export const listStatuses = query({
  args: {},
  handler: async (ctx: QueryCtx) => {
    const entries = await ctx.db
      .query("agentMemory")
      .filter((q) => q.eq(q.field("importance"), 1)) // Heartbeats have importance=1
      .filter((q) => q.eq(q.field("type"), "preference"))
      .filter((q) => q.eq(q.field("source"), "__heartbeat__"))
      .collect();

    return entries.map(entry => {
      try {
        return { paperclip_agent_id: entry.paperclip_agent_id, ...JSON.parse(entry.content) };
      } catch {
        return { paperclip_agent_id: entry.paperclip_agent_id, status: 'unknown' };
      }
    });
  },
});

/** Internal version — called by convex/jobs.ts cloud actions */
export const heartbeatInternal = internalMutation({
  args: {
    paperclip_agent_id:   v.string(),
    status:               v.string(),
    last_seen:            v.string(),
    paperclip_company_id: v.optional(v.string()),
    metadata:             v.optional(v.string()),
  },
  handler: async (ctx: MutationCtx, args) => {
    const existing = await ctx.db
      .query("agentMemory")
      .withIndex("by_agent_id", (q) =>
        q.eq("paperclip_agent_id", args.paperclip_agent_id)
      )
      .filter((q) => q.eq(q.field("type"), "preference"))
      .filter((q) => q.eq(q.field("source"), "__heartbeat__"))
      .first();

    const content = JSON.stringify({
      status:    args.status,
      last_seen: args.last_seen,
      metadata:  args.metadata,
    });

    if (existing) {
      await ctx.db.patch(existing._id, { content, token_count: 10 });
      return existing._id;
    }
    return ctx.db.insert("agentMemory", {
      paperclip_agent_id:   args.paperclip_agent_id,
      paperclip_company_id: args.paperclip_company_id ?? "unknown",
      type:        "preference",
      content,
      source:      "__heartbeat__",
      importance:  1,
      token_count: 10,
    });
  },
});
