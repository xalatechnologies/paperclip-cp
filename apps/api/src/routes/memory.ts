/**
 * Memory Routes — /api/memory
 *
 * Agent memory entries: facts, summaries, preferences, errors.
 * Entries are context-budgeted: token_count is stored per entry
 * so the frontend can enforce per-agent context windows.
 */

import type { FastifyPluginAsync } from 'fastify';
import { memoryDb } from '../db.js';

// Rough token estimate: 1 token ≈ 4 chars
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export const memoryRoutes: FastifyPluginAsync = async (app) => {

  // List all memory (optionally filtered)
  app.get<{ Querystring: { agent_id?: string; company_id?: string; type?: string } }>(
    '/', async (req, reply) => {
      memoryDb.purgeExpired.run();
      let rows: any[];
      if (req.query.agent_id) {
        rows = memoryDb.listByAgent.all(req.query.agent_id) as any[];
      } else if (req.query.company_id) {
        rows = memoryDb.listByCompany.all(req.query.company_id) as any[];
      } else {
        rows = memoryDb.list.all() as any[];
      }
      if (req.query.type) {
        rows = rows.filter(r => r.type === req.query.type);
      }

      // Attach per-agent context budget summary
      const byAgent: Record<string, { count: number; tokens: number }> = {};
      for (const r of rows) {
        if (!byAgent[r.paperclip_agent_id]) byAgent[r.paperclip_agent_id] = { count: 0, tokens: 0 };
        byAgent[r.paperclip_agent_id].count++;
        byAgent[r.paperclip_agent_id].tokens += r.token_count;
      }

      return reply.send({ entries: rows, budget: byAgent });
    }
  );

  // Add a memory entry
  app.post<{
    Body: {
      paperclip_agent_id: string;
      paperclip_company_id: string;
      type: 'fact' | 'summary' | 'preference' | 'error';
      content: string;
      source?: string;
      importance?: number;
      expires_in_days?: number;
    };
  }>('/', async (req, reply) => {
    const { paperclip_agent_id, paperclip_company_id, type, content, source, importance, expires_in_days } = req.body;
    if (!paperclip_agent_id || !paperclip_company_id || !type || !content) {
      return reply.status(400).send({ error: 'agent_id, company_id, type, content required' });
    }
    const token_count = estimateTokens(content);
    const expires_at = expires_in_days
      ? Math.floor(Date.now() / 1000) + expires_in_days * 86400
      : null;

    const entry = memoryDb.insert.get({
      paperclip_agent_id, paperclip_company_id, type, content,
      source: source ?? null,
      importance: importance ?? 3,
      token_count,
      expires_at,
    });
    return reply.status(201).send(entry);
  });

  // Delete a memory entry
  app.delete<{ Params: { id: string } }>('/:id', async (req, reply) => {
    memoryDb.delete.run(req.params.id);
    return reply.send({ deleted: true });
  });

  // Get context budget for an agent (token summary)
  app.get<{ Params: { agentId: string } }>('/budget/:agentId', async (req, reply) => {
    memoryDb.purgeExpired.run();
    const entries = memoryDb.listByAgent.all(req.params.agentId) as any[];
    const totalTokens = entries.reduce((a, e) => a + e.token_count, 0);
    const byType: Record<string, number> = {};
    for (const e of entries) {
      byType[e.type] = (byType[e.type] ?? 0) + e.token_count;
    }
    return reply.send({
      agent_id: req.params.agentId,
      entry_count: entries.length,
      total_tokens: totalTokens,
      by_type: byType,
      entries_by_importance: {
        critical: entries.filter(e => e.importance >= 5).length,
        high:     entries.filter(e => e.importance === 4).length,
        normal:   entries.filter(e => e.importance === 3).length,
        low:      entries.filter(e => e.importance <= 2).length,
      },
    });
  });
};
