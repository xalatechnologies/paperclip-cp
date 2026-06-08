/**
 * Routines + Run Records
 *
 * Routines are a real-time mirror of VPS `scheduled_jobs`.
 * The cron syncs them every 5 minutes.
 * The UI reads from Convex reactively (WebSocket) — no polling.
 */

import { query, mutation, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import type { MutationCtx, QueryCtx } from "./_generated/server";


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

export const listActiveRuns = query({
  args: {},
  handler: async (ctx) => {
    // There's no status index on routineRuns right now, but there shouldn't be
    // more than a few running at any given time anyway.
    // However, the best way without a dedicated index is to filter all runs.
    // If the table grows large, this needs an index, but for now we take recent runs and filter.
    const recent = await ctx.db.query("routineRuns").order("desc").take(100);
    return recent.filter(r => r.status === "running");
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

export const recordRun = mutation({
  args: {
    vps_job_id:   v.string(),
    routine_id:   v.optional(v.id("routines")),
    started_at:   v.string(),
    finished_at:  v.optional(v.string()),
    status:       v.string(),
    duration_sec: v.optional(v.number()),
    output:       v.optional(v.string()),
    error:        v.optional(v.string()),
  },
  handler: async (ctx: MutationCtx, args) => {
    // Resolve routine by vps_job_id if routine_id not provided
    let routineId = args.routine_id;
    if (!routineId) {
      const routine = await ctx.db
        .query("routines")
        .withIndex("by_vps_job_id", (q) => q.eq("vps_job_id", args.vps_job_id))
        .unique();
      routineId = routine?._id;
    }

    const runId = await ctx.db.insert("routineRuns", {
      vps_job_id:   args.vps_job_id,
      routine_id:   routineId,
      started_at:   args.started_at,
      finished_at:  args.finished_at,
      status:       args.status,
      duration_sec: args.duration_sec,
      output:       args.output,
      error:        args.error,
    });

    if (routineId) {
      await ctx.db.patch(routineId, {
        last_status: args.status,
        last_run_at: args.started_at,
      });
    }

    return runId;
  },
});

export const updateLastRun = mutation({
  args: {
    _id:         v.id("routines"),
    last_run_at: v.string(),
    last_status: v.string(),
  },
  handler: async (ctx: MutationCtx, args) => {
    await ctx.db.patch(args._id, {
      last_run_at: args.last_run_at,
      last_status: args.last_status,
    });
  },
});

// ── Live run status (two-way sync + streaming) ─────────────────────────────

/** Called BEFORE triggering agent — creates a "running" record the UI sees instantly */
export const startRun = mutation({
  args: {
    vps_job_id:  v.string(),
    routine_id:  v.optional(v.id("routines")),
    started_at:  v.string(),
  },
  handler: async (ctx: MutationCtx, args) => {
    let routineId = args.routine_id;
    if (!routineId) {
      const routine = await ctx.db
        .query("routines")
        .withIndex("by_vps_job_id", (q) => q.eq("vps_job_id", args.vps_job_id))
        .unique();
      routineId = routine?._id;
    }

    const runId = await ctx.db.insert("routineRuns", {
      vps_job_id:  args.vps_job_id,
      routine_id:  routineId,
      started_at:  args.started_at,
      status:      "running",
    });

    // Mark routine as running
    if (routineId) {
      await ctx.db.patch(routineId, { last_status: "running", last_run_at: args.started_at });
    }

    return runId;
  },
});

/** Append partial output during long-running agents (optional live streaming) */
export const appendLiveOutput = mutation({
  args: {
    run_id: v.id("routineRuns"),
    chunk:  v.string(),
  },
  handler: async (ctx: MutationCtx, args) => {
    const run = await ctx.db.get(args.run_id);
    if (!run) return;
    const current = run.live_output ?? "";
    await ctx.db.patch(args.run_id, {
      live_output: (current + args.chunk).slice(-8000), // keep last 8k chars
    });
  },
});

/** Called AFTER agent finishes — updates the "running" record with final result */
export const finishRun = mutation({
  args: {
    run_id:       v.id("routineRuns"),
    finished_at:  v.string(),
    status:       v.string(), // "success" | "failed"
    duration_sec: v.optional(v.number()),
    output:       v.optional(v.string()),
    error:        v.optional(v.string()),
  },
  handler: async (ctx: MutationCtx, args) => {
    const run = await ctx.db.get(args.run_id);
    if (!run) return;

    await ctx.db.patch(args.run_id, {
      finished_at:  args.finished_at,
      status:       args.status,
      duration_sec: args.duration_sec,
      output:       args.output,
      error:        args.error,
      live_output:  undefined, // clear streaming buffer
    });

    // Update routine last_status
    if (run.routine_id) {
      await ctx.db.patch(run.routine_id, {
        last_status: args.status,
        last_run_at: args.finished_at,
      });
    }
  },
});
