/**
 * Routines Routes — /api/routines
 *
 * PCC-managed scheduled agent runs. Read from Convex (mirror of VPS scheduled_jobs).
 * Execute via VPS SSH (cron executor). Run history also from Convex.
 *
 * Note: The VPS is the authoritative source for scheduled_jobs.
 * Convex is a real-time mirror, synced every 5 minutes by convex/crons.ts.
 * Manual "run now" calls the VPS directly via executeRoutine().
 */

import type { FastifyPluginAsync } from 'fastify';
import { validate as cronValidate } from 'node-cron';
import { convex, api } from '../convex-client.js';
import { executeRoutine } from '../cron.js';

export const routinesRoutes: FastifyPluginAsync = async (app) => {

  // List all routines (from Convex mirror — real-time)
  app.get<{ Querystring: { company_id?: string } }>('/', async (req, reply) => {
    const routines = await convex.query(api.routines.list, {
      company_id: req.query.company_id,
    });
    return reply.send(routines);
  });

  // Get single routine with recent runs
  app.get<{ Params: { id: string } }>('/:id', async (req, reply) => {
    const routines = await convex.query(api.routines.list, {});
    const routine  = (routines as any[]).find((r) => r._id === req.params.id || r.vps_job_id === req.params.id);
    if (!routine) return reply.status(404).send({ error: 'Routine not found' });

    const runs = await convex.query(api.routines.recentRuns, {
      vps_job_id: routine.vps_job_id,
      limit: 20,
    });
    return reply.send({ ...routine, runs });
  });

  // Run now (manual trigger via VPS SSH cron executor)
  app.post<{ Params: { vpsJobId: string } }>('/:vpsJobId/run', async (req, reply) => {
    const routines = await convex.query(api.routines.list, {});
    const routine  = (routines as any[]).find(
      (r) => r.vps_job_id === req.params.vpsJobId
    );
    if (!routine) return reply.status(404).send({ error: 'Routine not found' });
    if (!routine.enabled) return reply.status(400).send({ error: 'Routine is disabled' });

    // Respond immediately — execute is async
    reply.status(202).send({ message: 'Run triggered', vps_job_id: req.params.vpsJobId });

    executeRoutine(req.params.vpsJobId).catch((err: Error) => {
      console.error(`[routines] Manual run failed for ${req.params.vpsJobId}:`, err.message);
    });
  });

  // Run history for a routine
  app.get<{ Params: { id: string } }>('/:id/runs', async (req, reply) => {
    const runs = await convex.query(api.routines.recentRuns, {
      vps_job_id: req.params.id,
      limit: 50,
    });
    return reply.send(runs);
  });
};
