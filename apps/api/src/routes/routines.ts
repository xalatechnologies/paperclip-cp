/**
 * Routines Routes — /api/routines
 *
 * CRUD for scheduled agent runs. Toggle, run now, view run history.
 * Agents and skills are fetched from VPS via /api/control/*.
 */

import type { FastifyPluginAsync } from 'fastify';
import { routinesDb, routineRunsDb } from '../db.js';
import { vpsCommand } from '../vps-db.js';

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
    // Validate cron-ish: 5 space-separated tokens
    if (schedule.trim().split(/\s+/).length !== 5) {
      return reply.status(400).send({ error: 'schedule must be a valid 5-field cron expression' });
    }
    const routine = routinesDb.insert.get({
      name, paperclip_company_id, paperclip_agent_id,
      skill_slug: skill_slug ?? null,
      schedule,
      enabled: enabled !== false ? 1 : 0,
    });
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
    return reply.send({ id: req.params.id, enabled: req.body.enabled });
  });

  // Run now (manual trigger)
  app.post<{ Params: { id: string } }>('/:id/run', async (req, reply) => {
    const routine = routinesDb.get.get(req.params.id) as any;
    if (!routine) return reply.status(404).send({ error: 'Routine not found' });
    if (!routine.enabled) return reply.status(400).send({ error: 'Routine is disabled' });

    const runRow = routineRunsDb.insert.get(req.params.id) as any;
    const runId = runRow.id;
    const t0 = Date.now();

    // Fire and forget — respond immediately so UI doesn't hang
    reply.status(202).send({ run_id: runId, message: 'Run triggered' });

    // Best-effort: execute via VPS SSH — just log the trigger
    try {
      const cmd = routine.skill_slug
        ? `echo "[PCC] Triggered routine '${routine.name}' — skill: ${routine.skill_slug} — agent: ${routine.paperclip_agent_id}"`
        : `echo "[PCC] Triggered routine '${routine.name}' — agent: ${routine.paperclip_agent_id}"`;
      const { stdout, stderr } = await vpsCommand(cmd);
      const durationSec = (Date.now() - t0) / 1000;
      routineRunsDb.finish.run({
        id: runId, status: 'success',
        duration_sec: durationSec,
        output: stdout || null,
        error: stderr || null,
      });
      routinesDb.recordRun.run({
        id: req.params.id, status: 'success',
        error: null, duration: durationSec,
      });
    } catch (err: any) {
      const durationSec = (Date.now() - t0) / 1000;
      routineRunsDb.finish.run({
        id: runId, status: 'failed',
        duration_sec: durationSec, output: null,
        error: err.message,
      });
      routinesDb.recordRun.run({
        id: req.params.id, status: 'failed',
        error: err.message, duration: durationSec,
      });
    }
  });

  // Delete routine
  app.delete<{ Params: { id: string } }>('/:id', async (req, reply) => {
    routinesDb.delete.run(req.params.id);
    return reply.send({ deleted: true });
  });

  // Run history for a routine
  app.get<{ Params: { id: string } }>('/:id/runs', async (req, reply) => {
    const runs = routineRunsDb.list.all(req.params.id);
    return reply.send(runs);
  });
};
