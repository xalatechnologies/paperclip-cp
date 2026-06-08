/**
 * Context Rules
 *
 * Per-agent context engineering configuration:
 *   - budget_cap       : max token budget for context window
 *   - knowledge_filter : which knowledge collections to inject
 *   - memory_filter    : min importance threshold for memory entries
 *   - injection_order  : ordering of context sections
 *   - trim_strategy    : what to drop when over budget
 */

import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import type { QueryCtx, MutationCtx } from "./_generated/server";

// ── Queries ───────────────────────────────────────────────────────────────

export const list = query({
  args: {
    paperclip_agent_id:   v.optional(v.string()),
    paperclip_company_id: v.optional(v.string()),
  },
  handler: async (ctx: QueryCtx, args) => {
    if (args.paperclip_agent_id) {
      return ctx.db
        .query("contextRules")
        .withIndex("by_agent_id", (q) =>
          q.eq("paperclip_agent_id", args.paperclip_agent_id!)
        )
        .order("desc")
        .take(100);
    }
    if (args.paperclip_company_id) {
      return ctx.db
        .query("contextRules")
        .withIndex("by_company_id", (q) =>
          q.eq("paperclip_company_id", args.paperclip_company_id!)
        )
        .order("desc")
        .take(100);
    }
    return ctx.db.query("contextRules").order("desc").take(200);
  },
});

// ── Mutations ─────────────────────────────────────────────────────────────

export const create = mutation({
  args: {
    paperclip_agent_id:   v.string(),
    paperclip_company_id: v.string(),
    rule_type: v.string(),
    label:     v.string(),
    config:    v.any(),
    enabled:   v.boolean(),
    priority:  v.number(),
  },
  handler: async (ctx: MutationCtx, args) => {
    return ctx.db.insert("contextRules", {
      paperclip_agent_id:   args.paperclip_agent_id,
      paperclip_company_id: args.paperclip_company_id,
      rule_type: args.rule_type,
      label:     args.label,
      config:    args.config,
      enabled:   args.enabled,
      priority:  args.priority,
    });
  },
});

export const update = mutation({
  args: {
    id:       v.id("contextRules"),
    label:    v.optional(v.string()),
    config:   v.optional(v.any()),
    priority: v.optional(v.number()),
  },
  handler: async (ctx: MutationCtx, args) => {
    const { id, ...patch } = args;
    const updates: Record<string, unknown> = {};
    if (patch.label    !== undefined) updates.label    = patch.label;
    if (patch.config   !== undefined) updates.config   = patch.config;
    if (patch.priority !== undefined) updates.priority = patch.priority;
    await ctx.db.patch(id, updates);
    return ctx.db.get(id);
  },
});

export const toggle = mutation({
  args: { id: v.id("contextRules"), enabled: v.boolean() },
  handler: async (ctx: MutationCtx, args) => {
    await ctx.db.patch(args.id, { enabled: args.enabled });
    return { id: args.id, enabled: args.enabled };
  },
});

export const remove = mutation({
  args: { id: v.id("contextRules") },
  handler: async (ctx: MutationCtx, args) => {
    await ctx.db.delete(args.id);
    return { deleted: true };
  },
});
