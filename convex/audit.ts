/**
 * Audit Logs
 *
 * append() is internalMutation — called fire-and-forget from API actions.
 * list() is public for the dashboard audit trail.
 */

import { query, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import type { QueryCtx, MutationCtx } from "./_generated/server";
import { paginationOptsValidator } from "convex/server";

export const append = internalMutation({
  args: {
    action:        v.string(),
    actor_id:      v.optional(v.string()),
    resource_type: v.string(),
    resource_id:   v.optional(v.string()),
    metadata:      v.optional(v.string()),
    ip_address:    v.optional(v.string()),
  },
  handler: async (ctx: MutationCtx, args) => {
    await ctx.db.insert("auditLogs", {
      action:        args.action,
      actor_id:      args.actor_id,
      resource_type: args.resource_type,
      resource_id:   args.resource_id,
      metadata:      args.metadata,
      ip_address:    args.ip_address,
    });
  },
});

export const list = query({
  args: {
    paginationOpts: paginationOptsValidator,
    action:         v.optional(v.string()),
    resource_type:  v.optional(v.string()),
  },
  handler: async (ctx: QueryCtx, args) => {
    if (args.action) {
      return ctx.db
        .query("auditLogs")
        .withIndex("by_action", (q) => q.eq("action", args.action!))
        .order("desc")
        .paginate(args.paginationOpts);
    }
    return ctx.db.query("auditLogs").order("desc").paginate(args.paginationOpts);
  },
});

export const listRecent = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx: QueryCtx, args) => {
    return ctx.db
      .query("auditLogs")
      .order("desc")
      .take(Math.min(args.limit ?? 50, 200));
  },
});
