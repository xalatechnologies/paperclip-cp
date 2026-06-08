/**
 * Secrets — Encrypted Vault
 *
 * Security contract:
 *   - Public queries NEVER return `encryptedValue`
 *   - `getEncrypted` is internalQuery — only callable from Fastify via ConvexHttpClient
 *   - The API encrypts/decrypts with SECRETS_ENCRYPTION_KEY (AES-256-GCM)
 *   - Convex only stores the opaque cipher string
 */

import { query, mutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import type { QueryCtx, MutationCtx } from "./_generated/server";

// ── Public Queries ────────────────────────────────────────────────────────

/** List all secrets — metadata only, no encryptedValue */
export const list = query({
  args: {},
  handler: async (ctx: QueryCtx) => {
    const rows = await ctx.db.query("secrets").order("desc").take(200);
    return rows.map(({ encryptedValue: _ev, ...safe }) => safe);
  },
});

export const listByCompany = query({
  args: { paperclip_company_id: v.string() },
  handler: async (ctx: QueryCtx, args) => {
    const rows = await ctx.db
      .query("secrets")
      .withIndex("by_company_id", (q) =>
        q.eq("paperclip_company_id", args.paperclip_company_id)
      )
      .order("desc")
      .take(100);
    return rows.map(({ encryptedValue: _ev, ...safe }) => safe);
  },
});

// ── Internal Query — returns encryptedValue (API only) ───────────────────

export const getEncrypted = internalQuery({
  args: { id: v.id("secrets") },
  handler: async (ctx: QueryCtx, args) => {
    return await ctx.db.get(args.id);
  },
});

// ── Public Mutations ──────────────────────────────────────────────────────

export const create = mutation({
  args: {
    name:                 v.string(),
    encryptedValue:       v.string(), // pre-encrypted by API
    scope:                v.string(),
    paperclip_company_id: v.optional(v.string()),
    paperclip_agent_id:   v.optional(v.string()),
    description:          v.optional(v.string()),
    rotate_after_days:    v.optional(v.number()),
  },
  handler: async (ctx: MutationCtx, args) => {
    const id = await ctx.db.insert("secrets", {
      name:                 args.name,
      encryptedValue:       args.encryptedValue,
      scope:                args.scope,
      paperclip_company_id: args.paperclip_company_id,
      paperclip_agent_id:   args.paperclip_agent_id,
      description:          args.description,
      rotate_after_days:    args.rotate_after_days,
    });
    const doc = await ctx.db.get(id);
    const { encryptedValue: _ev, ...safe } = doc!;
    return safe;
  },
});

export const update = mutation({
  args: {
    id:              v.id("secrets"),
    encryptedValue:  v.optional(v.string()),
    description:     v.optional(v.string()),
    rotate_after_days: v.optional(v.number()),
  },
  handler: async (ctx: MutationCtx, args) => {
    const { id, ...patch } = args;
    const updates: Record<string, unknown> = {};
    if (patch.encryptedValue !== undefined) updates.encryptedValue = patch.encryptedValue;
    if (patch.description    !== undefined) updates.description    = patch.description;
    if (patch.rotate_after_days !== undefined) updates.rotate_after_days = patch.rotate_after_days;
    await ctx.db.patch(id, updates);
    const doc = await ctx.db.get(id);
    const { encryptedValue: _ev, ...safe } = doc!;
    return safe;
  },
});

export const remove = mutation({
  args: { id: v.id("secrets") },
  handler: async (ctx: MutationCtx, args) => {
    const doc = await ctx.db.get(args.id);
    if (!doc) throw new Error("Secret not found");
    await ctx.db.delete(args.id);
    return { deleted: true, name: doc.name };
  },
});
