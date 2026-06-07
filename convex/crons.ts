/**
 * Convex Cron Jobs
 *
 * Replaces node-cron in apps/api/src/cron.ts for the intelligence layer.
 * VPS agent execution still happens in Fastify (needs SSH) — crons here
 * handle sync, cleanup, and coordination.
 */

import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Sync VPS scheduled_jobs into Convex every 5 minutes
// (so the UI reflects real VPS state reactively)
crons.interval(
  "sync-vps-routines",
  { minutes: 5 },
  internal.jobs.syncVpsRoutines,
  {},
);

// Purge expired agent memory entries every hour
crons.interval(
  "purge-expired-memory",
  { hours: 1 },
  internal.memory.purgeExpired,
  {},
);

export default crons;
