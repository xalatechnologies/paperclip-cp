/**
 * Two-Way Sync Engine
 *
 * Orchestrates bidirectional data flow between VPS/Paperclip and Convex.
 * Called from cron.ts — complements the Convex cloud crons.
 *
 * This runs in the local Fastify process (can reach VPS via SSH).
 * The Convex cloud crons run remotely (can reach VPS via HTTP only).
 *
 * VPS → Convex:
 *   syncAgents()   — poll VPS /api/agents, write heartbeats to Convex
 *   syncRoutines() — poll VPS /api/scheduled-jobs, upsert to Convex routines
 *   syncRunHistory() — pull recent run logs from VPS into Convex
 *
 * Convex → VPS:
 *   pushPendingGoals()  — new PCC goals → POST to Paperclip API
 *   pushPendingTasks()  — PCC tasks assigned to agents → Paperclip API
 *   injectAgentContext() — push Convex memory into agent context before runs
 *
 * Full cycle: runBidirectionalSync() — runs all above in parallel
 */

import { convex, convexAdmin, callInternalMutation, api, internal } from './convex-client.js';

const VPS_API_BASE    = process.env.VPS_API_BASE     ?? 'http://72.61.82.22:3001';
const VPS_API_KEY     = process.env.VPS_API_KEY      ?? process.env.PAPERCLIP_API_KEY ?? '';
const PAPERCLIP_BASE  = process.env.PAPERCLIP_BASE_URL ?? VPS_API_BASE;
const PAPERCLIP_KEY   = process.env.PAPERCLIP_API_KEY  ?? VPS_API_KEY;

// ── Helpers ───────────────────────────────────────────────────────────────────

async function vpsFetch(path: string): Promise<any> {
  const res = await fetch(`${VPS_API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${VPS_API_KEY}` },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`VPS HTTP ${res.status} ${path}`);
  return res.json();
}

async function paperclipPost(path: string, body: object): Promise<any> {
  const res = await fetch(`${PAPERCLIP_BASE}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${PAPERCLIP_KEY}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Paperclip HTTP ${res.status} ${path}`);
  return res.json();
}

async function paperclipPatch(path: string, body: object): Promise<any> {
  const res = await fetch(`${PAPERCLIP_BASE}${path}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${PAPERCLIP_KEY}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Paperclip HTTP ${res.status} PATCH ${path}`);
  return res.json();
}

// ── VPS → Convex ──────────────────────────────────────────────────────────────

/**
 * Pull VPS agent status → Convex heartbeats.
 * Also includes metadata (name, skills, model) for enriched dashboard display.
 */
export async function syncAgents(): Promise<number> {
  try {
    const raw = await vpsFetch('/api/agents');
    const agents: any[] = Array.isArray(raw) ? raw : (raw?.data ?? raw?.agents ?? []);

    for (const agent of agents) {
      try {
        await convex.mutation(api.agents.heartbeat, {
          paperclip_agent_id:   String(agent.id ?? agent.agent_id),
          status:               agent.status ?? 'unknown',
          last_seen:            new Date().toISOString(),
          paperclip_company_id: agent.company_id ? String(agent.company_id) : undefined,
          metadata: JSON.stringify({
            name:   agent.name,
            model:  agent.model,
            skills: agent.skills ?? [],
          }),
        });
      } catch {}
    }

    console.log(`[sync] ← VPS agents: ${agents.length} synced`);
    return agents.length;
  } catch (err: any) {
    console.warn('[sync] syncAgents failed:', err.message);
    return 0;
  }
}

/**
 * Pull VPS scheduled_jobs → Convex routines table.
 * The Convex mirror is what the dashboard reads via useQuery (reactive).
 */
export async function syncRoutines(): Promise<number> {
  try {
    const raw = await vpsFetch('/api/scheduled-jobs');
    const data: any[] = Array.isArray(raw) ? raw : (raw?.data ?? raw?.jobs ?? []);

    if (data.length === 0) return 0;

    const routines = data.map((r: any) => ({
      vps_job_id:       String(r.id),
      name:             r.name ?? 'Unnamed',
      cron_expression:  r.cron_expression ?? r.schedule ?? '* * * * *',
      enabled:          Boolean(r.enabled ?? r.active),
      agent_id:         String(r.agent_id ?? ''),
      skill_slug:       r.skill_slug ?? undefined,
      company_id:       String(r.company_id ?? ''),
      company_name:     r.company_name ?? 'Unknown',
      agent_name:       r.agent_name ?? 'Unknown',
      last_run_at:      r.last_run_at ?? undefined,
      last_status:      r.last_status ?? undefined,
      run_count:        Number(r.run_count ?? 0),
      avg_duration_sec: r.avg_duration_sec != null ? Number(r.avg_duration_sec) : undefined,
    }));

    await callInternalMutation(internal.routines.upsertFromVps, { routines });
    console.log(`[sync] ← VPS routines: ${routines.length} synced`);
    return routines.length;
  } catch (err: any) {
    console.warn('[sync] syncRoutines failed:', err.message);
    return 0;
  }
}

/**
 * Pull Paperclip goals → Convex goals table (inbound writeback).
 * Only syncs goals that came from Paperclip (have a paperclip_goal_id).
 */
export async function syncGoalsFromPaperclip(): Promise<number> {
  try {
    const raw = await vpsFetch('/api/goals');
    const data: any[] = Array.isArray(raw) ? raw : (raw?.data ?? raw?.goals ?? []);

    if (data.length === 0) return 0;

    const goals = data.map((g: any) => ({
      paperclip_goal_id:    String(g.id),
      paperclip_company_id: String(g.company_id ?? ''),
      title:                g.title ?? 'Untitled',
      description:          g.description ?? undefined,
      status:               g.status ?? 'planned',
      priority:             g.priority ?? 'medium',
      progress_pct:         g.progress_pct != null ? Number(g.progress_pct) : 0,
      due_date:             g.due_date ?? undefined,
    }));

    await callInternalMutation(internal.goals.upsertFromPaperclip, { goals });
    console.log(`[sync] ← Paperclip goals: ${goals.length} synced`);
    return goals.length;
  } catch (err: any) {
    console.warn('[sync] syncGoalsFromPaperclip failed:', err.message);
    return 0;
  }
}

// ── Convex → VPS (outbound writeback) ────────────────────────────────────────

/**
 * Push PCC-created goals (those without pushed_at) to Paperclip API.
 * On success, marks them with paperclip_goal_id + pushed_at in Convex.
 */
export async function pushPendingGoals(): Promise<number> {
  try {
    const pending = await convex.query(api.goals.listPendingPush, {}) as any[];

    let pushed = 0;
    for (const goal of pending.slice(0, 20)) {
      try {
        const result = await paperclipPost('/api/goals', {
          title:       goal.title,
          description: goal.description,
          status:      goal.status,
          priority:    goal.priority,
          company_id:  goal.paperclip_company_id,
          due_date:    goal.due_date,
        });

        if (result?.id) {
          await callInternalMutation(internal.goals.markPushed, {
            _id:               goal._id,
            paperclip_goal_id: String(result.id),
          });
          pushed++;
          console.log(`[sync] → Paperclip: goal "${goal.title}" pushed as ID ${result.id}`);
        }
      } catch (err: any) {
        console.warn(`[sync] → Goal push failed "${goal.title}": ${err.message}`);
      }
    }

    return pushed;
  } catch (err: any) {
    console.warn('[sync] pushPendingGoals failed:', err.message);
    return 0;
  }
}

/**
 * Inject Convex agent memory into a Paperclip agent's context before a run.
 * Call this before triggerAgent() in the cron executor.
 */
export async function injectAgentContext(
  agentId: string,
  companyId: string,
): Promise<void> {
  try {
    const memories = await convex.query(api.memory.listByAgent, {
      paperclip_agent_id: agentId,
      limit: 10,
    }) as any[];

    if (memories.length === 0) return;

    const contextBlock = memories
      .map((m: any) => `[${m.type}] ${m.content}`)
      .join('\n');

    // Push context to Paperclip agent memory endpoint
    try {
      await paperclipPost(`/api/agents/${agentId}/context`, {
        content: contextBlock,
        source:  'pcc-memory-injection',
      });
      console.log(`[sync] → Injected ${memories.length} memory entries into agent ${agentId}`);
    } catch {
      // Context injection is best-effort — agent runs without it if API fails
    }
  } catch {}
}

// ── Full bidirectional cycle ──────────────────────────────────────────────────

export async function runBidirectionalSync(): Promise<void> {
  console.log('[sync] Starting bidirectional sync cycle…');

  const [agents, routines, goalsIn, goalsOut] = await Promise.allSettled([
    syncAgents(),
    syncRoutines(),
    syncGoalsFromPaperclip(),
    pushPendingGoals(),
  ]);

  console.log('[sync] Cycle complete:', {
    agents:   agents.status === 'fulfilled' ? agents.value : '✗',
    routines: routines.status === 'fulfilled' ? routines.value : '✗',
    goalsIn:  goalsIn.status === 'fulfilled' ? goalsIn.value : '✗',
    goalsOut: goalsOut.status === 'fulfilled' ? goalsOut.value : '✗',
  });
}
