/**
 * Routines + Run Records
 *
 * Routines are a real-time mirror of VPS `scheduled_jobs`.
 * The cron syncs them every 5 minutes.
 * The UI reads from Convex reactively (WebSocket) — no polling.
 */

import { query, mutation, internalMutation, internalAction } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { ActionCtx, MutationCtx } from "./_generated/server";

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

// ── Internal Action: Sync from VPS ───────────────────────────────────────
// Called by cron every 5 minutes via the PCC API bridge.
// The action fetches routines from Fastify (/api/control/routines)
// and upserts them into Convex.

export const syncFromVps = internalAction({
  args: {},
  handler: async (ctx: ActionCtx) => {
    const apiBase = process.env.PCC_API_URL ?? "http://localhost:3001";
    const apiKey  = process.env.CONTROL_CENTER_API_KEY ?? "";

    try {
      const res = await fetch(`${apiBase}/api/control/routines`, {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(15_000),
      });

      if (!res.ok) {
        console.error(`[routines] VPS sync failed: HTTP ${res.status}`);
        return;
      }

      const raw: unknown = await res.json();
      const data = Array.isArray(raw) ? (raw as any[]) : [];
      if (data.length === 0) return;


      const routines = data.map((r: any) => ({
        vps_job_id:      String(r.id),
        name:            r.name ?? "Unnamed",
        cron_expression: r.cron_expression ?? "* * * * *",
        enabled:         Boolean(r.enabled),
        agent_id:        String(r.agent_id ?? ""),
        skill_slug:      r.skill_slug ?? undefined,
        company_id:      String(r.company_id ?? ""),
        company_name:    r.company_name ?? "Unknown",
        agent_name:      r.agent_name ?? "Unknown",
        last_run_at:     r.last_run_at ?? undefined,
        last_status:     r.last_status ?? undefined,
        run_count:       Number(r.run_count ?? 0),
        avg_duration_sec: r.avg_duration_sec != null ? Number(r.avg_duration_sec) : undefined,
      }));

      await ctx.runMutation(internal.routines.upsertFromVps, { routines });
      console.log(`[routines] Synced ${routines.length} jobs from VPS`);
    } catch (err: any) {
      console.error("[routines] Sync error:", err.message);
    }
  },
});
