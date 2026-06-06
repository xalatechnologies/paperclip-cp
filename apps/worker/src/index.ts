import { config } from 'dotenv';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
config({ path: resolve(__dirname, '../../../.env') });

import { Queue, Worker } from 'bullmq';
import { getDb, agents, agentStatusSnapshots, heartbeatEvents, costSnapshots } from '@pcc/db';
import { createPaperclipSDK } from '@pcc/paperclip-sdk';

// =============================================================================
// PCC Worker — Background job processor
// Polls Paperclip API for agent status, heartbeats, and costs
// =============================================================================

const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';
const connection = { url: REDIS_URL };

// Queues
const statusQueue = new Queue('agent-status-poll', { connection });
const heartbeatQueue = new Queue('heartbeat-poll', { connection });
const costQueue = new Queue('cost-snapshot', { connection });

// =============================================================================
// Agent Status Worker
// =============================================================================

const statusWorker = new Worker(
  'agent-status-poll',
  async (job) => {
    const db = getDb();
    const { agentId, paperclipAgentId } = job.data;

    if (!paperclipAgentId) {
      console.log(`[status] Agent ${agentId} has no Paperclip ID — skipping`);
      return;
    }

    let sdk: ReturnType<typeof createPaperclipSDK>;
    try {
      sdk = createPaperclipSDK();
    } catch {
      console.warn('[status] Paperclip SDK not configured — skipping poll');
      return;
    }

    try {
      const status = await sdk.agents.status(paperclipAgentId);

      await db.insert(agentStatusSnapshots).values({
        agentId,
        status: (status.status?.toLowerCase() as any) ?? 'unknown',
        currentTask: status.currentTask,
        tokensUsedToday: status.tokensUsedToday,
        costToday: status.costToday?.toString(),
        rawPayload: status as any,
      });

      // Update agent.status
      await db
        .update(agents)
        .set({ status: (status.status?.toLowerCase() as any) ?? 'unknown', updatedAt: new Date() })
        .where((col) => col.eq(agents.id, agentId));

      console.log(`[status] Updated agent ${agentId}: ${status.status}`);
    } catch (err) {
      console.error(`[status] Failed to poll agent ${agentId}:`, err);
    }
  },
  { connection },
);

// =============================================================================
// Heartbeat Worker
// =============================================================================

const heartbeatWorker = new Worker(
  'heartbeat-poll',
  async (job) => {
    const db = getDb();
    const { agentId, paperclipAgentId } = job.data;

    if (!paperclipAgentId) return;

    let sdk: ReturnType<typeof createPaperclipSDK>;
    try {
      sdk = createPaperclipSDK();
    } catch {
      return;
    }

    try {
      const heartbeats = await sdk.agents.heartbeats(paperclipAgentId);
      const latest = heartbeats[0];

      if (latest) {
        await db.insert(heartbeatEvents).values({
          agentId,
          healthy: latest.healthy,
          message: latest.message,
          rawPayload: latest as any,
        });

        await db
          .update(agents)
          .set({ lastHeartbeatAt: new Date(), updatedAt: new Date() })
          .where((col) => col.eq(agents.id, agentId));
      }
    } catch (err) {
      // Record unhealthy event
      await db.insert(heartbeatEvents).values({
        agentId,
        healthy: false,
        message: `Poll failed: ${String(err)}`,
      });
    }
  },
  { connection },
);

// =============================================================================
// Schedule recurring jobs
// =============================================================================

async function schedulePollingJobs() {
  const db = getDb();
  const allAgents = await db
    .select({ id: agents.id, paperclipAgentId: agents.paperclipAgentId })
    .from(agents);

  for (const agent of allAgents) {
    // Status poll every 2 minutes
    await statusQueue.add(
      'poll',
      { agentId: agent.id, paperclipAgentId: agent.paperclipAgentId },
      { repeat: { every: 2 * 60 * 1000 } },
    );

    // Heartbeat poll every 5 minutes
    await heartbeatQueue.add(
      'poll',
      { agentId: agent.id, paperclipAgentId: agent.paperclipAgentId },
      { repeat: { every: 5 * 60 * 1000 } },
    );
  }

  console.log(`[worker] Scheduled polling for ${allAgents.length} agents`);
}

// =============================================================================
// Start
// =============================================================================

console.log('\n⚙️  PCC Worker starting...');
console.log(`   Redis: ${REDIS_URL}`);

schedulePollingJobs()
  .then(() => console.log('   Polling jobs scheduled\n'))
  .catch((err) => console.error('Failed to schedule jobs:', err));

// Graceful shutdown
process.on('SIGTERM', async () => {
  await statusWorker.close();
  await heartbeatWorker.close();
  process.exit(0);
});
