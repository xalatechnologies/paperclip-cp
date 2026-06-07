/**
 * Routines Routes — /api/routines
 *
 * CRUD for scheduled agent runs. Toggle, run now, view run history.
 * On create/toggle/delete: calls refreshCrons() to re-sync the scheduler.
 * On "run now": calls executeRoutine() from the cron executor (real agent trigger).
 */

import type { FastifyPluginAsync } from 'fastify';
import { validate as cronValidate } from 'node-cron';
import { routinesDb, routineRunsDb } from '../db.js';
import { executeRoutine, refreshCrons } from '../cron.js';

export const routinesRoutes: FastifyPluginAsync = async (app) => {

  // List all routines
  app.get('/', async (_req, reply) => {
    const routines = routinesDb.list.all();
    return reply.send(routines);
  });

  // Get single routine with run history
  app.get<{ Params: { id: string } }>('/:id', async (req, reply) => {
    const routine = routinesDb.get.get(req.params.id);
    if (!routine) return reply.status(404).send({ error: 'Routine not found' });
    const runs = routineRunsDb.list.all(req.params.id);
    return reply.send({ ...routine, runs });
  });

  // Create routine
  app.post<{
    Body: {
      name: string;
      paperclip_company_id: string;
      paperclip_agent_id: string;
      skill_slug?: string;
      schedule: string;
      enabled?: boolean;
    };
  }>('/', async (req, reply) => {
    const { name, paperclip_company_id, paperclip_agent_id, skill_slug, schedule, enabled } = req.body;
    if (!name || !paperclip_company_id || !paperclip_agent_id || !schedule) {
      return reply.status(400).send({ error: 'name, company_id, agent_id, schedule required' });
    }
    if (!cronValidate(schedule)) {
      return reply.status(400).send({ error: 'schedule must be a valid 5-field cron expression' });
    }
    const routine = routinesDb.insert.get({
      name, paperclip_company_id, paperclip_agent_id,
      skill_slug: skill_slug ?? null,
      schedule,
      enabled: enabled !== false ? 1 : 0,
    });
    // Re-sync cron scheduler
    refreshCrons();
    return reply.status(201).send(routine);
  });

  // Toggle enabled/disabled
  app.patch<{
    Params: { id: string };
    Body: { enabled: boolean };
  }>('/:id/toggle', async (req, reply) => {
    const routine = routinesDb.get.get(req.params.id);
    if (!routine) return reply.status(404).send({ error: 'Routine not found' });
    routinesDb.toggle.run({ id: req.params.id, enabled: req.body.enabled ? 1 : 0 });
    // Re-sync cron scheduler
    refreshCrons();
    return reply.send({ id: req.params.id, enabled: req.body.enabled });
  });

  // Run now (manual trigger via cron executor)
  app.post<{ Params: { id: string } }>('/:id/run', async (req, reply) => {
    const routine = routinesDb.get.get(req.params.id) as any;
    if (!routine) return reply.status(404).send({ error: 'Routine not found' });
    if (!routine.enabled) return reply.status(400).send({ error: 'Routine is disabled' });

    // Respond immediately — run is async
    reply.status(202).send({ message: 'Run triggered', routine_id: req.params.id });

    // Execute via the real cron executor (fires Paperclip agent trigger)
    executeRoutine(req.params.id).catch((err: Error) => {
      console.error(`[routines] Manual run failed for ${req.params.id}:`, err.message);
    });
  });

  // Delete routine
  app.delete<{ Params: { id: string } }>('/:id', async (req, reply) => {
    routinesDb.delete.run(req.params.id);
    refreshCrons(); // Remove from scheduler
    return reply.send({ deleted: true });
  });

  // Run history for a routine
  app.get<{ Params: { id: string } }>('/:id/runs', async (req, reply) => {
    const runs = routineRunsDb.list.all(req.params.id);
    return reply.send(runs);
  });
};
