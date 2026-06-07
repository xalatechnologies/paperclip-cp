/**
 * Goals Routes — /api/goals
 *
 * Full CRUD for goals, milestones, and tasks.
 * Task status changes trigger:
 *   - Auto-progress rollup (task→milestone→goal)
 *   - Agent run if task transitions to in_progress and has agent+skill assigned
 * SSE stream: GET /api/goals/stream → pushes goal progress updates
 */

import type { FastifyPluginAsync } from 'fastify';
import { goalsDb, milestonesDb, tasksDb } from '../db.js';

const VPS_API_BASE = process.env.VPS_API_BASE ?? 'http://72.61.82.22:3001';
const VPS_API_KEY  = process.env.VPS_API_KEY  ?? process.env.PAPERCLIP_API_KEY ?? '';

// ── Progress helpers ──────────────────────────────────────────────────────────

/**
 * Recalculate milestone and goal status after a task change.
 * milestone → 'done' when all tasks are done
 * milestone → 'in_progress' when any task is in_progress or done
 * goal      → 'done' when all milestones are done
 * goal      → 'in_progress' when any milestone is in_progress or done
 */
function rollupProgress(goalId: string) {
  const milestones = milestonesDb.listByGoal.all(goalId) as any[];

  for (const ms of milestones) {
    const tasks = tasksDb.listByMilestone.all(ms.id) as any[];
    if (tasks.length === 0) continue;

    const allDone = tasks.every((t: any) => t.status === 'done');
    const anyActive = tasks.some((t: any) => t.status === 'in_progress' || t.status === 'done');
    const newStatus = allDone ? 'done' : anyActive ? 'in_progress' : 'planned';

    if (newStatus !== ms.status) {
      milestonesDb.update.run({ id: ms.id, status: newStatus, title: null });
    }
  }

  // Rollup to goal
  const refreshed = milestonesDb.listByGoal.all(goalId) as any[];
  const allMsDone = refreshed.length > 0 && refreshed.every((m: any) => m.status === 'done');
  const anyMsActive = refreshed.some((m: any) => m.status === 'in_progress' || m.status === 'done');
  const goalStatus = allMsDone ? 'done' : anyMsActive ? 'in_progress' : 'planned';

  const goal = goalsDb.get.get(goalId) as any;
  if (goal && goal.status !== goalStatus && goal.status !== 'done') {
    // Don't downgrade a manually-set 'done'
    if (goalStatus !== 'planned' || goal.status === 'in_progress') {
      goalsDb.update.run({ id: goalId, status: goalStatus, title: null, description: null, priority: null, due_date: null });
    }
  }
}

/**
 * When a task goes → in_progress and it has an agent+skill,
 * fire the Paperclip agent trigger directly via HTTP.
 * No SQLite routine is created — this is a one-shot VPS call.
 */
async function maybeFireTaskAgent(task: any) {
  if (!task.paperclip_agent_id || !task.skill_slug) return;
  if (task.status !== 'in_progress') return;

  try {
    const res = await fetch(`${VPS_API_BASE}/api/agents/${task.paperclip_agent_id}/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${VPS_API_KEY}` },
      body: JSON.stringify({ skill_slug: task.skill_slug }),
      signal: AbortSignal.timeout(10_000),
    });
    console.log(`[goals] Task "${task.title}" agent trigger → ${res.status}`);
  } catch (err: any) {
    console.error('[goals] Task agent trigger failed:', err.message);
  }
}

// ── Route handlers ────────────────────────────────────────────────────────────

export const goalsRoutes: FastifyPluginAsync = async (app) => {

  // ── Goals ─────────────────────────────────────────────────────────────────

  app.get('/', async (_req, reply) => {
    const goals = goalsDb.list.all() as any[];
    const enriched = goals.map(g => {
      const milestones = milestonesDb.listByGoal.all(g.id) as any[];
      const withTasks = milestones.map(m => ({
        ...m,
        tasks: tasksDb.listByMilestone.all(m.id),
      }));
      const allTasks = withTasks.flatMap(m => m.tasks) as any[];
      const doneCount = allTasks.filter(t => t.status === 'done').length;
      return {
        ...g,
        milestones: withTasks,
        task_count: allTasks.length,
        done_count: doneCount,
        progress_pct: allTasks.length > 0 ? Math.round((doneCount / allTasks.length) * 100) : 0,
      };
    });
    return reply.send(enriched);
  });

  app.post<{
    Body: {
      paperclip_company_id: string;
      title: string;
      description?: string;
      status?: string;
      priority?: string;
      due_date?: string;
    };
  }>('/', async (req, reply) => {
    const { paperclip_company_id, title, description, status, priority, due_date } = req.body;
    if (!paperclip_company_id || !title) {
      return reply.status(400).send({ error: 'company_id and title required' });
    }
    const goal = goalsDb.insert.get({
      paperclip_company_id, title,
      description: description ?? null,
      status: status ?? 'planned',
      priority: priority ?? 'medium',
      due_date: due_date ?? null,
    });
    return reply.status(201).send(goal);
  });

  app.patch<{
    Params: { id: string };
    Body: Partial<{ title: string; description: string; status: string; priority: string; due_date: string }>;
  }>('/:id', async (req, reply) => {
    const goal = goalsDb.update.get({ id: req.params.id, ...req.body });
    if (!goal) return reply.status(404).send({ error: 'Goal not found' });
    return reply.send(goal);
  });

  app.delete<{ Params: { id: string } }>('/:id', async (req, reply) => {
    goalsDb.delete.run(req.params.id);
    return reply.send({ deleted: true });
  });

  // ── Milestones ─────────────────────────────────────────────────────────────

  app.post<{
    Params: { goalId: string };
    Body: { title: string; status?: string; position?: number };
  }>('/:goalId/milestones', async (req, reply) => {
    const { title, status, position } = req.body;
    const ms = milestonesDb.insert.get({
      goal_id: req.params.goalId, title,
      status: status ?? 'planned',
      position: position ?? 0,
    });
    return reply.status(201).send(ms);
  });

  app.patch<{
    Params: { goalId: string; msId: string };
    Body: { title?: string; status?: string };
  }>('/:goalId/milestones/:msId', async (req, reply) => {
    const ms = milestonesDb.update.get({ id: req.params.msId, ...req.body });
    if (!ms) return reply.status(404).send({ error: 'Milestone not found' });
    rollupProgress(req.params.goalId);
    return reply.send(ms);
  });

  app.delete<{ Params: { goalId: string; msId: string } }>(
    '/:goalId/milestones/:msId', async (req, reply) => {
      milestonesDb.delete.run(req.params.msId);
      rollupProgress(req.params.goalId);
      return reply.send({ deleted: true });
    }
  );

  // ── Tasks ──────────────────────────────────────────────────────────────────

  app.post<{
    Params: { goalId: string; msId: string };
    Body: { title: string; paperclip_agent_id?: string; skill_slug?: string; status?: string };
  }>('/:goalId/milestones/:msId/tasks', async (req, reply) => {
    const { title, paperclip_agent_id, skill_slug, status } = req.body;
    const task = tasksDb.insert.get({
      milestone_id: req.params.msId, title,
      paperclip_agent_id: paperclip_agent_id ?? null,
      skill_slug: skill_slug ?? null,
      status: status ?? 'planned',
    }) as any;
    rollupProgress(req.params.goalId);
    return reply.status(201).send(task);
  });

  app.patch<{
    Params: { goalId: string; msId: string; taskId: string };
    Body: { status?: string; paperclip_agent_id?: string; skill_slug?: string };
  }>('/:goalId/milestones/:msId/tasks/:taskId', async (req, reply) => {
    const task = tasksDb.update.get({ id: req.params.taskId, ...req.body }) as any;
    if (!task) return reply.status(404).send({ error: 'Task not found' });

    // Auto-progress rollup
    rollupProgress(req.params.goalId);

    // Fire agent if task just moved to in_progress with agent+skill
    if (req.body.status === 'in_progress') {
      maybeFireTaskAgent(task).catch(() => {});
    }

    return reply.send(task);
  });

  app.delete<{ Params: { goalId: string; msId: string; taskId: string } }>(
    '/:goalId/milestones/:msId/tasks/:taskId', async (req, reply) => {
      tasksDb.delete.run(req.params.taskId);
      rollupProgress(req.params.goalId);
      return reply.send({ deleted: true });
    }
  );

  // ── SSE: live goal progress stream ────────────────────────────────────────
  // GET /api/goals/stream
  // Push goal list (with progress_pct) every 5 seconds.
  // Clients can use this for live dashboard updates without polling.

  app.get('/stream', async (req, reply) => {
    reply.raw.writeHead(200, {
      'Content-Type':  'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection':    'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    const send = () => {
      try {
        const goals = goalsDb.list.all() as any[];
        const enriched = goals.map(g => {
          const milestones = milestonesDb.listByGoal.all(g.id) as any[];
          const allTasks = milestones.flatMap(m => tasksDb.listByMilestone.all(m.id) as any[]);
          const doneCount = allTasks.filter(t => t.status === 'done').length;
          return {
            id: g.id, title: g.title, status: g.status, priority: g.priority,
            task_count: allTasks.length,
            done_count: doneCount,
            progress_pct: allTasks.length > 0 ? Math.round((doneCount / allTasks.length) * 100) : 0,
          };
        });
        reply.raw.write(`data: ${JSON.stringify(enriched)}\n\n`);
      } catch { /* client disconnected */ }
    };

    send();
    const interval = setInterval(send, 5000);

    req.raw.on('close', () => {
      clearInterval(interval);
    });

    // Keep the connection open
    await new Promise<void>(resolve => req.raw.on('close', resolve));
  });
};
