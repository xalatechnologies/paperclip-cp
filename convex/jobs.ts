"use node";

/**
 * Convex Jobs — Node.js runtime bidirectional sync actions
 *
 * "use node" is required for fetch() with full Node.js APIs.
 * These run IN Convex cloud — they call external HTTP endpoints,
 * NOT localhost (which is unreachable from Convex cloud).
 *
 * VPS → Convex (inbound sync):
 *   syncVpsRoutines  — VPS scheduled_jobs → routines table
 *   syncVpsAgents    — VPS agents status → agentMemory heartbeats
 *   syncPaperclipGoals — Paperclip goals → goals table
 *
 * Convex → Paperclip (outbound writeback):
 *   pushPendingGoals — new PCC goals → Paperclip API POST
 */

import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import type { ActionCtx } from "./_generated/server";
import { v } from "convex/values";

// ── Helpers ────────────────────────────────────────────────────────────────

function vpsBase(): string {
  // MUST be set in Convex env vars via: npx convex env set VPS_API_BASE=http://72.61.82.22:3001
  return process.env.VPS_API_BASE ?? "http://72.61.82.22:3001";
}

function vpsKey(): string {
  return process.env.VPS_API_KEY ?? process.env.PAPERCLIP_API_KEY ?? "";
}

function paperclipBase(): string {
  return process.env.PAPERCLIP_BASE_URL ?? vpsBase();
}

function paperclipKey(): string {
  return process.env.PAPERCLIP_API_KEY ?? vpsKey();
}

async function vpsGet(path: string): Promise<any> {
  const res = await fetch(`${vpsBase()}${path}`, {
    headers: { Authorization: `Bearer ${vpsKey()}` },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`VPS HTTP ${res.status} ${path}`);
  return res.json();
}

async function paperclipPost(path: string, body: object): Promise<any> {
  const res = await fetch(`${paperclipBase()}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${paperclipKey()}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Paperclip HTTP ${res.status} ${path}`);
  return res.json();
}

// ── VPS → Convex: Routines ─────────────────────────────────────────────────

/**
 * Sync VPS scheduled_jobs into Convex routines table.
 * Calls VPS Paperclip API directly — NOT localhost PCC API.
 * Triggered by Convex cron every 5 minutes.
 */
export const syncVpsRoutines = internalAction({
  args: {},
  handler: async (ctx: ActionCtx) => {
    let data: any[] = [];
    try {
      const raw = await vpsGet("/api/scheduled-jobs");
      data = Array.isArray(raw) ? raw : (raw?.data ?? raw?.jobs ?? []);
    } catch (err: any) {
      console.error("[jobs] syncVpsRoutines failed:", err.message);
      return { synced: 0, error: err.message };
    }

    if (data.length === 0) {
      console.log("[jobs] No scheduled jobs from VPS");
      return { synced: 0 };
    }

    const routines = data.map((r: any) => ({
      vps_job_id:       String(r.id),
      name:             r.name ?? "Unnamed",
      cron_expression:  r.cron_expression ?? r.schedule ?? "* * * * *",
      enabled:          Boolean(r.enabled ?? r.active),
      agent_id:         String(r.agent_id ?? ""),
      skill_slug:       r.skill_slug ?? undefined,
      company_id:       String(r.company_id ?? ""),
      company_name:     r.company_name ?? "Unknown",
      agent_name:       r.agent_name ?? "Unknown",
      last_run_at:      r.last_run_at ?? undefined,
      last_status:      r.last_status ?? undefined,
      run_count:        Number(r.run_count ?? 0),
      avg_duration_sec: r.avg_duration_sec != null ? Number(r.avg_duration_sec) : undefined,
    }));

    await ctx.runMutation(internal.routines.upsertFromVps, { routines });
    console.log(`[jobs] ← VPS: synced ${routines.length} routines`);
    return { synced: routines.length };
  },
});

// ── VPS → Convex: Agents ───────────────────────────────────────────────────

/**
 * Sync VPS agent status into Convex agentMemory heartbeats.
 * Triggered by Convex cron every 2 minutes.
 */
export const syncVpsAgents = internalAction({
  args: {},
  handler: async (ctx: ActionCtx) => {
    let agents: any[] = [];
    try {
      const raw = await vpsGet("/api/agents");
      agents = Array.isArray(raw) ? raw : (raw?.data ?? raw?.agents ?? []);
    } catch (err: any) {
      console.error("[jobs] syncVpsAgents failed:", err.message);
      return { synced: 0, error: err.message };
    }

    for (const agent of agents) {
      try {
        await ctx.runMutation(internal.agents.heartbeatInternal, {
          paperclip_agent_id:   String(agent.id ?? agent.agent_id),
          status:               agent.status ?? "unknown",
          last_seen:            new Date().toISOString(),
          paperclip_company_id: agent.company_id ? String(agent.company_id) : undefined,
          metadata:             JSON.stringify({
            name:   agent.name,
            skills: agent.skills,
            model:  agent.model,
          }),
        });
      } catch {}
    }
    console.log(`[jobs] ← VPS: synced ${agents.length} agent heartbeats`);
    return { synced: agents.length };
  },
});

// ── Paperclip → Convex: Goals ──────────────────────────────────────────────

/**
 * Pull goals from Paperclip and upsert into Convex.
 * Triggered by Convex cron every 10 minutes.
 */
export const syncPaperclipGoals = internalAction({
  args: {},
  handler: async (ctx: ActionCtx): Promise<{ synced: number; error?: string }> => {
    let data: any[] = [];
    try {
      const raw = await vpsGet("/api/goals");
      data = Array.isArray(raw) ? raw : (raw?.data ?? raw?.goals ?? []);
    } catch (err: any) {
      console.error("[jobs] syncPaperclipGoals failed:", err.message);
      return { synced: 0, error: err.message };
    }

    if (data.length === 0) return { synced: 0 };

    const goals = data.map((g: any) => ({
      paperclip_goal_id:    String(g.id),
      paperclip_company_id: String(g.company_id ?? ""),
      title:                g.title ?? "Untitled",
      description:          g.description ?? undefined,
      status:               g.status ?? "planned",
      priority:             g.priority ?? "medium",
      progress_pct:         g.progress_pct != null ? Number(g.progress_pct) : 0,
      due_date:             g.due_date ?? undefined,
    }));

    const count = (await ctx.runMutation(internal.goals.upsertFromPaperclip, { goals })) as number;
    console.log(`[jobs] ← Paperclip: synced ${count} goals`);
    return { synced: count };
  },
});

// ── Convex → Paperclip: Goals writeback ───────────────────────────────────

/**
 * Push PCC-created goals to Paperclip API.
 * Runs after every goal creation (scheduled from goals mutation).
 * Also triggered by Convex cron every 5 minutes as a catch-all.
 */
export const pushPendingGoals = internalAction({
  args: {},
  handler: async (ctx: ActionCtx) => {
    const pending = await ctx.runQuery(internal.goals.listPendingPushInternal, {});

    let pushed = 0;
    for (const goal of (pending as any[]).slice(0, 20)) {
      try {
        const result = await paperclipPost("/api/goals", {
          title:       goal.title,
          description: goal.description,
          status:      goal.status,
          priority:    goal.priority,
          company_id:  goal.paperclip_company_id,
          due_date:    goal.due_date,
        });

        if (result?.id) {
          await ctx.runMutation(internal.goals.markPushed, {
            _id:               goal._id,
            paperclip_goal_id: String(result.id),
          });
          pushed++;
        }
      } catch (err: any) {
        console.warn(`[jobs] → Paperclip: goal push failed "${goal.title}": ${err.message}`);
      }
    }

    if (pushed > 0) console.log(`[jobs] → Paperclip: pushed ${pushed} goals`);
    return { pushed };
  },
});
