"use node";

/**
 * Convex Jobs — Node.js runtime actions
 *
 * Must be in a separate file from queries/mutations because
 * "use node" cannot coexist with Convex DB functions.
 *
 * process.env is available here because of the Node.js runtime.
 */

import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import type { ActionCtx } from "./_generated/server";
import { v } from "convex/values";

/**
 * Fetch scheduled_jobs from PCC Fastify API and upsert into Convex.
 * Called by convex/crons.ts every 5 minutes.
 */
export const syncVpsRoutines = internalAction({
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
        console.error(`[jobs] VPS routines sync failed: HTTP ${res.status}`);
        return { synced: 0, error: `HTTP ${res.status}` };
      }

      const raw: unknown = await res.json();
      const data = Array.isArray(raw) ? (raw as any[]) : [];
      if (data.length === 0) {
        console.log("[jobs] No routines returned from VPS (table may not exist yet)");
        return { synced: 0 };
      }

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
      console.log(`[jobs] Synced ${routines.length} routines from VPS`);
      return { synced: routines.length };
    } catch (err: any) {
      console.error("[jobs] Sync error:", err.message);
      return { synced: 0, error: err.message };
    }
  },
});
