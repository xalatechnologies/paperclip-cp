/**
 * Goals Routes — /api/goals
 *
 * CRUD for goals, milestones, tasks — delegated to Convex.
 * Progress rollup (task→milestone→goal) runs inside Convex mutations.
 * This file remains responsible for: agent trigger (VPS HTTP call) on task→in_progress.
 */

import type { FastifyPluginAsync } from 'fastify';
import { convex, api } from '../convex-client.js';

const VPS_API_BASE = process.env.VPS_API_BASE ?? 'http://72.61.82.22:3001';
const VPS_API_KEY  = process.env.VPS_API_KEY  ?? process.env.PAPERCLIP_API_KEY ?? '';

async function maybeFireTaskAgent(task: any) {
  if (!task.paperclip_agent_id || !task.skill_slug) return;
  if (task.status !== 'in_progress') return;
  try {
    const res = await fetch(`${VPS_API_BASE}/api/agents/${task.paperclip_agent_id}/run`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${VPS_API_KEY}` },
      body:    JSON.stringify({ skill_slug: task.skill_slug }),
      signal:  AbortSignal.timeout(10_000),
    });
    console.log(`[goals] Task agent trigger → ${res.status}`);
  } catch (err: any) {
    console.error('[goals] Task agent trigger failed:', err.message);
  }
}

export const goalsRoutes: FastifyPluginAsync = async (app) => {

  // ── Goals ──────────────────────────────────────────────────────────────────

  app.get<{ Querystring: { company_id?: string } }>('/', async (req, reply) => {
    const goals = await convex.query(api.goals.listGoals, {
      company_id: req.query.company_id,
    });
    return reply.send(goals);
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
    const id = await convex.mutation(api.goals.createGoal, {
      paperclip_company_id, title, description, status, priority, due_date,
    });
    return reply.status(201).send({ _id: id });
  });

  app.patch<{
    Params: { id: string };
    Body: Partial<{ title: string; description: string; status: string; priority: string; due_date: string }>;
  }>('/:id', async (req, reply) => {
    const goal = await convex.mutation(api.goals.updateGoal, {
      id: req.params.id as any,
      ...req.body,
    });
    if (!goal) return reply.status(404).send({ error: 'Goal not found' });
    return reply.send(goal);
  });

  app.delete<{ Params: { id: string } }>('/:id', async (req, reply) => {
    await convex.mutation(api.goals.deleteGoal, { id: req.params.id as any });
    return reply.send({ deleted: true });
  });

  // ── Milestones ─────────────────────────────────────────────────────────────

  app.post<{
    Params: { goalId: string };
    Body: { title: string; position?: number };
  }>('/:goalId/milestones', async (req, reply) => {
    const id = await convex.mutation(api.goals.createMilestone, {
      goal_id:  req.params.goalId as any,
      title:    req.body.title,
      position: req.body.position,
    });
    return reply.status(201).send({ _id: id });
  });

  app.patch<{
    Params: { goalId: string; msId: string };
    Body: { title?: string; status?: string };
  }>('/:goalId/milestones/:msId', async (req, reply) => {
    const ms = await convex.mutation(api.goals.updateMilestone, {
      id:      req.params.msId  as any,
      goal_id: req.params.goalId as any,
      ...req.body,
    });
    return reply.send(ms);
  });

  app.delete<{ Params: { goalId: string; msId: string } }>(
    '/:goalId/milestones/:msId', async (req, reply) => {
      await convex.mutation(api.goals.deleteMilestone, {
        id:      req.params.msId   as any,
        goal_id: req.params.goalId as any,
      });
      return reply.send({ deleted: true });
    }
  );

  // ── Tasks ──────────────────────────────────────────────────────────────────

  app.post<{
    Params: { goalId: string; msId: string };
    Body: { title: string; paperclip_agent_id?: string; skill_slug?: string };
  }>('/:goalId/milestones/:msId/tasks', async (req, reply) => {
    const id = await convex.mutation(api.goals.createTask, {
      milestone_id:       req.params.msId   as any,
      goal_id:            req.params.goalId as any,
      title:              req.body.title,
      paperclip_agent_id: req.body.paperclip_agent_id,
      skill_slug:         req.body.skill_slug,
    });
    return reply.status(201).send({ _id: id });
  });

  app.patch<{
    Params: { goalId: string; msId: string; taskId: string };
    Body: { status?: string; paperclip_agent_id?: string; skill_slug?: string };
  }>('/:goalId/milestones/:msId/tasks/:taskId', async (req, reply) => {
    const task = await convex.mutation(api.goals.updateTask, {
      id:           req.params.taskId  as any,
      milestone_id: req.params.msId    as any,
      goal_id:      req.params.goalId  as any,
      ...req.body,
    });
    if (!task) return reply.status(404).send({ error: 'Task not found' });

    if (req.body.status === 'in_progress') {
      maybeFireTaskAgent(task).catch(() => {});
    }

    return reply.send(task);
  });

  app.delete<{ Params: { goalId: string; msId: string; taskId: string } }>(
    '/:goalId/milestones/:msId/tasks/:taskId', async (req, reply) => {
      await convex.mutation(api.goals.deleteTask, {
        id:           req.params.taskId  as any,
        milestone_id: req.params.msId    as any,
        goal_id:      req.params.goalId  as any,
      });
      return reply.send({ deleted: true });
    }
  );

  // ── SSE stream (goals progress) — reads from Convex ───────────────────────
  // Push goal list every 5s (Convex real-time is preferred via the web client,
  // but this SSE keeps backward compat for any consumers of the API stream)

  app.get('/stream', async (req, reply) => {
    reply.raw.writeHead(200, {
      'Content-Type':     'text/event-stream',
      'Cache-Control':    'no-cache',
      'Connection':       'keep-alive',
      'X-Accel-Buffering':'no',
    });

    const send = async () => {
      try {
        const goals = await convex.query(api.goals.listGoals, {});
        reply.raw.write(`data: ${JSON.stringify(goals)}\n\n`);
      } catch { /* client disconnected */ }
    };

    await send();
    const interval = setInterval(send, 5000);
    req.raw.on('close', () => clearInterval(interval));
    await new Promise<void>(resolve => req.raw.on('close', resolve));
  });
};
