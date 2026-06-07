/**
 * Routines + Run Records
 *
 * Routines are a real-time mirror of VPS `scheduled_jobs`.
 * The cron syncs them every 5 minutes.
 * The UI reads from Convex reactively (WebSocket) — no polling.
 */

import { query, internalMutation } from "./_generated/server";
import { v } from "convex/values";


// ── Queries ────────────────────────────────────────────────────────────────

export const list = query({
  args: { company_id: v.optional(v.string()) },
  handler: async (ctx, args) => {
    if (args.company_id) {
      return await ctx.db
        .query("routines")
        .withIndex("by_company_id", (q) => q.eq("company_id", args.company_id!))
        .take(100);
    }
    return await ctx.db.query("routines").take(200);
  },
});

export const recentRuns = query({
  args: {
    vps_job_id: v.optional(v.string()),
    limit:      v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = Math.min(args.limit ?? 20, 50);
    if (args.vps_job_id) {
      return await ctx.db
        .query("routineRuns")
        .withIndex("by_vps_job_id", (q) => q.eq("vps_job_id", args.vps_job_id!))
        .order("desc")
        .take(limit);
    }
    return await ctx.db.query("routineRuns").order("desc").take(limit);
  },
});

// ── Internal Mutations (called by cron/action) ─────────────────────────────

export const upsertFromVps = internalMutation({
  args: {
    routines: v.array(v.object({
      vps_job_id:      v.string(),
      name:            v.string(),
      cron_expression: v.string(),
      enabled:         v.boolean(),
      agent_id:        v.string(),
      skill_slug:      v.optional(v.string()),
      company_id:      v.string(),
      company_name:    v.string(),
      agent_name:      v.string(),
      last_run_at:     v.optional(v.string()),
      last_status:     v.optional(v.string()),
      run_count:       v.number(),
      avg_duration_sec: v.optional(v.number()),
    })),
  },
  handler: async (ctx, args) => {
    for (const r of args.routines) {
      const existing = await ctx.db
        .query("routines")
        .withIndex("by_vps_job_id", (q) => q.eq("vps_job_id", r.vps_job_id))
        .unique();

      if (existing) {
        await ctx.db.patch(existing._id, {
          name:             r.name,
          cron_expression:  r.cron_expression,
          enabled:          r.enabled,
          last_run_at:      r.last_run_at,
          last_status:      r.last_status,
          run_count:        r.run_count,
          avg_duration_sec: r.avg_duration_sec,
        });
      } else {
        await ctx.db.insert("routines", r);
      }
    }
    return args.routines.length;
  },
});

export const recordRun = internalMutation({
  args: {
    vps_job_id:   v.string(),
    started_at:   v.string(),
    finished_at:  v.optional(v.string()),
    status:       v.string(),
    duration_sec: v.optional(v.number()),
    output:       v.optional(v.string()),
    error:        v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Link to local routine record
    const routine = await ctx.db
      .query("routines")
      .withIndex("by_vps_job_id", (q) => q.eq("vps_job_id", args.vps_job_id))
      .unique();

    const runId = await ctx.db.insert("routineRuns", {
      vps_job_id:   args.vps_job_id,
      routine_id:   routine?._id,
      started_at:   args.started_at,
      finished_at:  args.finished_at,
      status:       args.status,
      duration_sec: args.duration_sec,
      output:       args.output,
      error:        args.error,
    });

    // Update routine last_status + last_run_at
    if (routine) {
      await ctx.db.patch(routine._id, {
        last_status: args.status,
        last_run_at: args.started_at,
      });
    }

    return runId;
  },
});

