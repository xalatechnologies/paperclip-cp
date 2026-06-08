/**
 * Cron Executor — Agent trigger + schedule management
 *
 * Responsibilities:
 *   1. Read scheduled routines from Convex (mirrored from VPS by sync-engine)
 *   2. Register local node-cron tasks for each enabled routine
 *   3. Trigger agents via VPS HTTP API (with SSH fallback on failure)
 *   4. Write live run status to Convex (running → success/failed)
 *   5. Auto-distill run output into agent memory
 *   6. Run bidirectional sync every 2/5 min (delegates to sync-engine.ts)
 *
 * NOTE: Data sync (VPS↔Convex) is now in sync-engine.ts.
 * This file ONLY handles cron scheduling + agent execution.
 */

import { schedule as nodeCronSchedule, validate as cronValidate } from 'node-cron';
import { convex, api } from './convex-client.js';
import { vpsCommand } from './vps-db.js';
import { runBidirectionalSync, injectAgentContext } from './sync-engine.js';
import { estimateTokens } from './embeddings.js';
import type { ScheduledTask } from 'node-cron';
import OpenAI from 'openai';

const VPS_API_BASE = process.env.VPS_API_BASE ?? 'http://72.61.82.22:3001';
const VPS_API_KEY  = process.env.VPS_API_KEY  ?? process.env.PAPERCLIP_API_KEY ?? '';
const CONTAINER    = 'paperclip-cumf-paperclip-1';

// ── Agent trigger — HTTP with SSH fallback ────────────────────────────────────

async function triggerAgentHttp(agentId: string, skillSlug: string | null): Promise<{
  success: boolean; output: string; duration_sec: number;
}> {
  const start = Date.now();
  const res = await fetch(`${VPS_API_BASE}/api/agents/${agentId}/run`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${VPS_API_KEY}` },
    body:    JSON.stringify({ skill_slug: skillSlug }),
    signal:  AbortSignal.timeout(5 * 60 * 1000), // 5 min
  });
  const body = await res.json().catch(() => ({}));
  return {
    success:      res.ok,
    output:       JSON.stringify(body),
    duration_sec: (Date.now() - start) / 1000,
  };
}

async function triggerAgentSSH(agentId: string, skillSlug: string | null): Promise<{
  success: boolean; output: string; duration_sec: number;
}> {
  const start = Date.now();
  const cmd = skillSlug
    ? `docker exec ${CONTAINER} node -e "require('paperclipai').runAgent('${agentId}','${skillSlug}')" 2>&1`
    : `docker exec ${CONTAINER} node -e "require('paperclipai').runAgent('${agentId}')" 2>&1`;

  const { stdout, stderr } = await vpsCommand(cmd);
  const output = stdout || stderr;
  const success = !stderr?.toLowerCase().includes('error') && !stderr?.toLowerCase().includes('fail');

  return { success, output, duration_sec: (Date.now() - start) / 1000 };
}

async function triggerAgent(agentId: string, skillSlug: string | null): Promise<{
  success: boolean; output: string; duration_sec: number;
}> {
  // Try HTTP first (fastest, most structured response)
  try {
    const result = await triggerAgentHttp(agentId, skillSlug);
    if (result.success) return result;
    console.warn(`[cron] HTTP trigger failed (HTTP error), trying SSH fallback…`);
  } catch (err: any) {
    console.warn(`[cron] HTTP trigger threw (${err.message}), trying SSH fallback…`);
  }

  // SSH fallback — direct Docker exec (works even if VPS API is down)
  try {
    return await triggerAgentSSH(agentId, skillSlug);
  } catch (err: any) {
    return {
      success:      false,
      output:       `Both HTTP and SSH triggers failed: ${err.message}`,
      duration_sec: 0,
    };
  }
}

// ── Memory distillation ───────────────────────────────────────────────────────

async function distillRunOutput(
  agentId:   string,
  companyId: string,
  runId:     string,
  output:    string,
  error:     string | null,
): Promise<void> {
  if (!process.env.OPENAI_API_KEY) return;
  if (!output?.trim() && !error?.trim()) return;

  try {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const prompt = `Extract up to 4 concise, reusable facts from this agent run. Return JSON array only:
[{"type":"fact"|"summary"|"error"|"preference","content":"...","importance":1-5}]

Output:
${(output ?? '').slice(0, 3000)}${error ? `\nError: ${error.slice(0, 500)}` : ''}`;

    const res = await client.chat.completions.create({
      model:       'gpt-4o-mini',
      messages:    [{ role: 'user', content: prompt }],
      max_tokens:  600,
      temperature: 0.2,
    });

    let facts: any[] = [];
    try { facts = JSON.parse(res.choices[0].message.content ?? '[]'); } catch {}
    if (!Array.isArray(facts)) facts = [];

    for (const f of facts.slice(0, 4)) {
      if (!f?.content) continue;
      await convex.mutation(api.memory.insert, {
        paperclip_agent_id:   agentId,
        paperclip_company_id: companyId,
        type:        ['fact', 'summary', 'error', 'preference'].includes(f.type) ? f.type : 'fact',
        content:     String(f.content).slice(0, 500),
        source:      runId,
        importance:  Math.min(5, Math.max(1, parseInt(f.importance, 10) || 3)),
        token_count: estimateTokens(f.content),
      });
    }
    if (facts.length > 0) {
      console.log(`[cron] Auto-distilled ${facts.length} memory entries from run ${runId}`);
    }
  } catch (err: any) {
    console.error('[cron] Distillation failed:', err.message);
  }
}

// ── Routine executor ──────────────────────────────────────────────────────────

export async function executeRoutine(vpsJobId: string): Promise<void> {
  const allRoutines = await convex.query(api.routines.list, {});
  const routine = (allRoutines as any[]).find((r) => r.vps_job_id === vpsJobId || r._id === vpsJobId);
  if (!routine) {
    console.warn(`[cron] Routine not found: ${vpsJobId}`);
    return;
  }

  const startedAt = new Date().toISOString();
  console.log(`[cron] Running "${routine.name}" (${vpsJobId})`);

  // 1. Write "running" status to Convex immediately — dashboard sees it live
  const runId = await convex.mutation(api.routines.startRun, {
    vps_job_id: vpsJobId,
    routine_id: routine._id,
    started_at: startedAt,
  });

  // 2. Inject agent context from Convex memory (best-effort)
  const agentId  = routine.agent_id ?? routine.paperclip_agent_id;
  const companyId = routine.company_id ?? routine.paperclip_company_id ?? '';
  if (agentId && companyId) {
    injectAgentContext(agentId, companyId).catch(() => {});
  }

  // 3. Trigger agent
  const result = await triggerAgent(agentId, routine.skill_slug ?? null);
  const finishedAt = new Date().toISOString();
  const durationSec = result.duration_sec;

  // 4. Update Convex with final result
  await convex.mutation(api.routines.finishRun, {
    run_id:       runId,
    finished_at:  finishedAt,
    status:       result.success ? 'success' : 'failed',
    duration_sec: durationSec,
    output:       result.success  ? result.output.slice(0, 4000) : undefined,
    error:        !result.success ? result.output.slice(0, 2000) : undefined,
  });

  console.log(`[cron] "${routine.name}" → ${result.success ? 'success' : 'FAILED'} (${durationSec.toFixed(1)}s)`);

  // 5. Auto-distill run output into agent memory (async, best-effort)
  distillRunOutput(
    agentId,
    companyId,
    `${vpsJobId}-${Date.now()}`,
    result.output,
    result.success ? null : result.output,
  ).catch(() => {});
}

// ── Scheduler registry ────────────────────────────────────────────────────────

const scheduledTasks = new Map<string, ScheduledTask>();

export async function refreshCrons(): Promise<void> {
  for (const [, task] of scheduledTasks) task.stop();
  scheduledTasks.clear();

  const routines = await convex.query(api.routines.list, {}) as any[];
  let registered = 0;

  for (const r of routines) {
    if (!r.enabled) continue;
    const expr = r.cron_expression ?? r.schedule;
    if (!expr || !cronValidate(expr)) {
      console.warn(`[cron] "${r.name}" invalid cron: "${expr}" — skipping`);
      continue;
    }

    const task = nodeCronSchedule(expr, async () => {
      await executeRoutine(r.vps_job_id);
    }, { timezone: 'UTC' });

    scheduledTasks.set(r.vps_job_id, task);
    registered++;
    console.log(`[cron] Scheduled "${r.name}" → ${expr}`);
  }

  console.log(`[cron] ${registered}/${routines.length} routines scheduled`);
}

// ── Start — call once on API boot ─────────────────────────────────────────────

export async function startCronExecutor(): Promise<void> {
  console.log('[cron] Starting executor…');

  // Initial sync + schedule load
  await runBidirectionalSync().catch((err) =>
    console.warn('[cron] Initial sync failed:', err.message)
  );
  await refreshCrons().catch((err) =>
    console.warn('[cron] Initial schedule load failed:', err.message)
  );

  // Bidirectional sync: every 2 min (agents) — sync-engine handles both directions
  nodeCronSchedule('*/2 * * * *', () => {
    runBidirectionalSync().catch(() => {});
  }, { timezone: 'UTC' });

  // Re-read Convex routines (already updated by sync-engine) + re-register crons
  nodeCronSchedule('*/5 * * * *', async () => {
    await refreshCrons().catch(() => {});
  }, { timezone: 'UTC' });

  console.log('[cron] Bidirectional sync: every 2 min');
  console.log('[cron] Schedule refresh: every 5 min');
}
