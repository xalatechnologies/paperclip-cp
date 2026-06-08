/**
 * Memory Routes — /api/memory
 *
 * Agent memory: facts, summaries, preferences, errors.
 * Reads/writes go through Convex — real-time on the web side.
 */

import type { FastifyPluginAsync } from 'fastify';
import { convex, api } from '../convex-client.js';

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export const memoryRoutes: FastifyPluginAsync = async (app) => {

  // List entries (filtered)
  app.get<{ Querystring: { agent_id?: string; company_id?: string } }>(
    '/', async (req, reply) => {
      let entries: any[];
      if (req.query.agent_id) {
        entries = await convex.query(api.memory.listByAgent, {
          paperclip_agent_id: req.query.agent_id,
        });
      } else if (req.query.company_id) {
        entries = await convex.query(api.memory.listByCompany, {
          paperclip_company_id: req.query.company_id,
        });
      } else {
        // No global list — return empty (avoids full table scans)
        entries = [];
      }

      // Per-agent context budget summary
      const byAgent: Record<string, { count: number; tokens: number }> = {};
      for (const r of entries) {
        const key = r.paperclip_agent_id;
        if (!byAgent[key]) byAgent[key] = { count: 0, tokens: 0 };
        byAgent[key].count++;
        byAgent[key].tokens += r.token_count;
      }

      return reply.send({ entries, budget: byAgent });
    }
  );

  // Add a memory entry
  app.post<{
    Body: {
      paperclip_agent_id:   string;
      paperclip_company_id: string;
      type: 'fact' | 'summary' | 'preference' | 'error';
      content:    string;
      source?:    string;
      importance?: number;
      expires_in_days?: number;
    };
  }>('/', async (req, reply) => {
    const { paperclip_agent_id, paperclip_company_id, type, content, source, importance, expires_in_days } = req.body;
    if (!paperclip_agent_id || !paperclip_company_id || !type || !content) {
      return reply.status(400).send({ error: 'agent_id, company_id, type, content required' });
    }

    const token_count = estimateTokens(content);
    const expires_at  = expires_in_days
      ? Date.now() + expires_in_days * 86_400_000
      : undefined;

    const id = await convex.mutation(api.memory.insert, {
      paperclip_agent_id,
      paperclip_company_id,
      type,
      content,
      source,
      importance: importance ?? 3,
      token_count,
      expires_at,
    });
    return reply.status(201).send({ _id: id });
  });

  // Delete a memory entry
  app.delete<{ Params: { id: string } }>('/:id', async (req, reply) => {
    await convex.mutation(api.memory.remove, { id: req.params.id as any });
    return reply.send({ deleted: true });
  });

  // Context budget for an agent (token summary)
  app.get<{ Params: { agentId: string } }>('/budget/:agentId', async (req, reply) => {
    const entries = await convex.query(api.memory.listByAgent, {
      paperclip_agent_id: req.params.agentId,
    });
    const totalTokens = entries.reduce((a: number, e: any) => a + e.token_count, 0);
    const byType: Record<string, number> = {};
    for (const e of entries) byType[e.type] = (byType[e.type] ?? 0) + e.token_count;

    return reply.send({
      agent_id:    req.params.agentId,
      entry_count: entries.length,
      total_tokens: totalTokens,
      by_type:     byType,
      entries_by_importance: {
        critical: entries.filter((e: any) => e.importance >= 5).length,
        high:     entries.filter((e: any) => e.importance === 4).length,
        normal:   entries.filter((e: any) => e.importance === 3).length,
        low:      entries.filter((e: any) => e.importance <= 2).length,
      },
    });
  });
};
