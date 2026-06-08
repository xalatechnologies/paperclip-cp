/**
 * Convex Cron Jobs — Bidirectional sync scheduler
 *
 * All sync actions run IN Convex cloud and call external APIs directly.
 * They do NOT call localhost — VPS_API_BASE / PAPERCLIP_BASE_URL must be
 * set in Convex env vars pointing to the actual VPS/Paperclip endpoints.
 *
 * VPS → Convex (inbound):
 *   every 2 min  — syncVpsAgents      (heartbeats + online status)
 *   every 5 min  — syncVpsRoutines    (scheduled_jobs mirror)
 *   every 10 min — syncPaperclipGoals (goals from Paperclip → Convex)
 *
 * Convex → VPS (outbound writeback):
 *   every 5 min  — pushPendingGoals   (PCC-created goals → Paperclip API)
 *
 * Maintenance:
 *   every 1 hr   — purgeExpired (old agentMemory entries)
 */

import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// ── VPS → Convex ──────────────────────────────────────────────────────────

crons.interval(
  "sync-vps-agents",
  { minutes: 2 },
  internal.jobs.syncVpsAgents,
  {},
);

crons.interval(
  "sync-vps-routines",
  { minutes: 5 },
  internal.jobs.syncVpsRoutines,
  {},
);

crons.interval(
  "sync-paperclip-goals",
  { minutes: 10 },
  internal.jobs.syncPaperclipGoals,
  {},
);

// ── Convex → VPS (writeback) ──────────────────────────────────────────────

crons.interval(
  "push-pending-goals",
  { minutes: 5 },
  internal.jobs.pushPendingGoals,
  {},
);

// ── Maintenance ───────────────────────────────────────────────────────────

crons.interval(
  "purge-expired-memory",
  { hours: 1 },
  internal.memory.purgeExpired,
  {},
);

export default crons;
