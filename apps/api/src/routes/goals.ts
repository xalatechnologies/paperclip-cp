/**
 * Goals Routes — /api/goals
 *
 * Full CRUD for goals, milestones, and tasks.
 * Agent/skill data is pulled live from the Paperclip VPS.
 */

import type { FastifyPluginAsync } from 'fastify';
import {
  goalsDb, milestonesDb, tasksDb,
} from '../db.js';

export const goalsRoutes: FastifyPluginAsync = async (app) => {

  // ── Goals ─────────────────────────────────────────────────────────────────

  app.get('/', async (_req, reply) => {
    const goals = goalsDb.list.all() as any[];

    // For each goal, attach milestones + tasks in one pass
    const enriched = goals.map(g => {
      const milestones = milestonesDb.listByGoal.all(g.id) as any[];
      const withTasks = milestones.map(m => ({
        ...m,
        tasks: tasksDb.listByMilestone.all(m.id),
      }));
      const allTasks = withTasks.flatMap(m => m.tasks);
      return {
        ...g,
        milestones: withTasks,
        task_count: allTasks.length,
        done_count:  allTasks.filter((t: any) => t.status === 'done').length,
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

  app.patch<{ Params: { id: string }; Body: Partial<{ title: string; description: string; status: string; priority: string; due_date: string }> }>(
    '/:id', async (req, reply) => {
      const goal = goalsDb.update.get({ id: req.params.id, ...req.body });
      if (!goal) return reply.status(404).send({ error: 'Goal not found' });
      return reply.send(goal);
    }
  );

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
    return reply.send(ms);
  });

  app.delete<{ Params: { goalId: string; msId: string } }>(
    '/:goalId/milestones/:msId', async (req, reply) => {
      milestonesDb.delete.run(req.params.msId);
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
    });
    return reply.status(201).send(task);
  });

  app.patch<{
    Params: { goalId: string; msId: string; taskId: string };
    Body: { status?: string; paperclip_agent_id?: string };
  }>('/:goalId/milestones/:msId/tasks/:taskId', async (req, reply) => {
    const task = tasksDb.update.get({ id: req.params.taskId, ...req.body });
    if (!task) return reply.status(404).send({ error: 'Task not found' });
    return reply.send(task);
  });

  app.delete<{ Params: { goalId: string; msId: string; taskId: string } }>(
    '/:goalId/milestones/:msId/tasks/:taskId', async (req, reply) => {
      tasksDb.delete.run(req.params.taskId);
      return reply.send({ deleted: true });
    }
  );
};
