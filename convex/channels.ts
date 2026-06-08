/**
 * Notification Channels
 *
 * encryptedConfig is AES-256-GCM encrypted JSON — never returned by public queries.
 * getConfig() is internalQuery — only the API server calls it when dispatching.
 */

import { query, mutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import type { QueryCtx, MutationCtx } from "./_generated/server";

// ── Queries ───────────────────────────────────────────────────────────────

export const list = query({
  args: { paperclip_company_id: v.optional(v.string()) },
  handler: async (ctx: QueryCtx, args) => {
    let rows;
    if (args.paperclip_company_id) {
      rows = await ctx.db
        .query("notificationChannels")
        .withIndex("by_company_id", (q) =>
          q.eq("paperclip_company_id", args.paperclip_company_id!)
        )
        .take(100);
    } else {
      rows = await ctx.db.query("notificationChannels").take(200);
    }
    // Strip encryptedConfig from public response
    return rows.map(({ encryptedConfig: _ec, ...safe }) => safe);
  },
});

/** Internal — returns encryptedConfig for API notification dispatch */
export const getConfig = internalQuery({
  args: { id: v.id("notificationChannels") },
  handler: async (ctx: QueryCtx, args) => {
    return await ctx.db.get(args.id);
  },
});

// ── Mutations ─────────────────────────────────────────────────────────────

export const create = mutation({
  args: {
    name:                 v.string(),
    type:                 v.string(),
    enabled:              v.boolean(),
    paperclip_company_id: v.optional(v.string()),
    encryptedConfig:      v.string(), // pre-encrypted by API
    events:               v.array(v.string()),
  },
  handler: async (ctx: MutationCtx, args) => {
    const id = await ctx.db.insert("notificationChannels", {
      name:                 args.name,
      type:                 args.type,
      enabled:              args.enabled,
      paperclip_company_id: args.paperclip_company_id,
      encryptedConfig:      args.encryptedConfig,
      events:               args.events,
    });
    const doc = await ctx.db.get(id);
    const { encryptedConfig: _ec, ...safe } = doc!;
    return safe;
  },
});

export const toggle = mutation({
  args: { id: v.id("notificationChannels"), enabled: v.boolean() },
  handler: async (ctx: MutationCtx, args) => {
    await ctx.db.patch(args.id, { enabled: args.enabled });
    return { id: args.id, enabled: args.enabled };
  },
});

export const remove = mutation({
  args: { id: v.id("notificationChannels") },
  handler: async (ctx: MutationCtx, args) => {
    const doc = await ctx.db.get(args.id);
    if (!doc) throw new Error("Channel not found");
    await ctx.db.delete(args.id);
    return { deleted: true, name: doc.name };
  },
});
