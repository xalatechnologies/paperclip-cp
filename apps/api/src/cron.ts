/**
 * Cron Executor
 *
 * Reads the `routines` table on startup and schedules node-cron jobs.
 * Each tick:
 *   1. Fires the Paperclip agent trigger (via VPS API or SSH fallback)
 *   2. Records the run in `routine_runs`
 *   3. Updates `routines.last_run_at`, `last_status`, `avg_duration_sec`
 *
 * Also exports refreshCrons() which re-reads the DB and re-registers
 * all active schedules — call after creating/toggling a routine.
 */

import { schedule as nodeCronSchedule, validate as cronValidate } from 'node-cron';
import { routinesDb, routineRunsDb, memoryDb } from './db.js';
import { estimateTokens } from './embeddings.js';
import type { ScheduledTask } from 'node-cron';
import OpenAI from 'openai';

// ---------------------------------------------------------------------------
// Paperclip agent trigger — calls the VPS REST API that Paperclip exposes
// ---------------------------------------------------------------------------

const VPS_API_BASE = process.env.VPS_API_BASE ?? 'http://72.61.82.22:3001';
const VPS_API_KEY  = process.env.VPS_API_KEY  ?? process.env.PAPERCLIP_API_KEY ?? '';

async function triggerAgent(agentId: string, skillSlug: string | null): Promise<{
  success: boolean; output: string; duration_sec: number;
}> {
  const start = Date.now();
  try {
    const res = await fetch(`${VPS_API_BASE}/api/agents/${agentId}/run`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${VPS_API_KEY}`,
      },
      body: JSON.stringify({ skill_slug: skillSlug }),
      signal: AbortSignal.timeout(5 * 60 * 1000), // 5 min max
    });
    const body = await res.json().catch(() => ({}));
    return {
      success: res.ok,
      output: JSON.stringify(body),
      duration_sec: (Date.now() - start) / 1000,
    };
  } catch (err: any) {
    return {
      success: false,
      output: err.message,
      duration_sec: (Date.now() - start) / 1000,
    };
  }
}

// ---------------------------------------------------------------------------
// Run a routine (called by cron tick OR manual "Run Now")
// ---------------------------------------------------------------------------

/**
 * Auto-distill: extract memory facts from a run output via LLM.
 * Fires best-effort — errors are logged but don't block.
 */
async function distillRunOutput(
  agentId: string,
  companyId: string,
  runId: string,
  output: string,
  error: string | null,
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
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 600,
      temperature: 0.2,
    });

    let facts: any[] = [];
    try { facts = JSON.parse(res.choices[0].message.content ?? '[]'); } catch {}
    if (!Array.isArray(facts)) facts = [];

    for (const f of facts.slice(0, 4)) {
      if (!f?.content) continue;
      memoryDb.insert.run({
        paperclip_agent_id: agentId,
        paperclip_company_id: companyId,
        type: ['fact','summary','error','preference'].includes(f.type) ? f.type : 'fact',
        content: String(f.content).slice(0, 500),
        source: runId,
        importance: Math.min(5, Math.max(1, parseInt(f.importance, 10) || 3)),
        token_count: estimateTokens(f.content),
        expires_at: null,
      });
    }
    if (facts.length > 0) {
      console.log(`[cron] Auto-distilled ${facts.length} memory entries from run ${runId}`);
    }
  } catch (err: any) {
    console.error('[cron] Distillation failed:', err.message);
  }
}

export async function executeRoutine(routineId: string): Promise<void> {
  const routine = routinesDb.get.get(routineId) as any;
  if (!routine) return;

  // Open a run record
  const run = routineRunsDb.insert.get(routineId) as any;
  const runId = run.id;

  console.log(`[cron] Running routine "${routine.name}" (${routineId}) → run ${runId}`);

  const result = await triggerAgent(routine.paperclip_agent_id, routine.skill_slug);

  // Close the run record
  routineRunsDb.finish.run({
    id: runId,
    status: result.success ? 'success' : 'failed',
    duration_sec: result.duration_sec,
    output: result.output,
    error: result.success ? null : result.output,
  });

  // Update routine stats
  routinesDb.recordRun.run({
    id: routineId,
    status: result.success ? 'success' : 'failed',
    error: result.success ? null : result.output,
    duration: result.duration_sec,
  });

  // Auto-distill memory from run output (best-effort, async)
  distillRunOutput(
    routine.paperclip_agent_id,
    routine.paperclip_company_id,
    runId,
    result.output,
    result.success ? null : result.output,
  ).catch(() => {});

  console.log(`[cron] Routine "${routine.name}" → ${result.success ? 'success' : 'FAILED'} (${result.duration_sec.toFixed(1)}s)`);
}

// ---------------------------------------------------------------------------
// Scheduler registry
// ---------------------------------------------------------------------------

const scheduledTasks = new Map<string, ScheduledTask>();

/**
 * (Re-)register all enabled routines from the DB.
 * Safe to call multiple times — clears old tasks first.
 */
export function refreshCrons(): void {
  // Stop all existing tasks
  for (const [id, task] of scheduledTasks) {
    task.stop();
    scheduledTasks.delete(id);
  }

  const routines = routinesDb.list.all() as any[];
  let registered = 0;

  for (const r of routines) {
    if (!r.enabled) continue;
    if (!cronValidate(r.schedule)) {
      console.warn(`[cron] Routine "${r.name}" has invalid cron expression: "${r.schedule}" — skipping`);
      continue;
    }

    const task = nodeCronSchedule(r.schedule, async () => {
      await executeRoutine(r.id);
    }, {
      timezone: 'UTC',
    });

    scheduledTasks.set(r.id, task);
    registered++;
    console.log(`[cron] Scheduled "${r.name}" → ${r.schedule}`);
  }

  console.log(`[cron] ${registered}/${routines.length} routines scheduled`);
}

/**
 * Start the cron system. Call once on API boot.
 */
export function startCronExecutor(): void {
  console.log('[cron] Starting cron executor…');
  refreshCrons();
}
