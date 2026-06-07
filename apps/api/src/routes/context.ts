/**
 * Context Engineering Routes — /api/context
 *
 * Per-agent context rules: budget caps, injection order, trim strategies,
 * knowledge bindings, memory priority filters.
 */

import type { FastifyPluginAsync } from 'fastify';
import { contextDb } from '../db.js';
import { memoryDb, knowledgeDb } from '../db.js';

export const contextRoutes: FastifyPluginAsync = async (app) => {

  // List all context rules (optionally filtered)
  app.get<{ Querystring: { agent_id?: string; company_id?: string } }>(
    '/', async (req, reply) => {
      let rules: any[];
      if (req.query.agent_id) {
        rules = contextDb.listByAgent.all(req.query.agent_id) as any[];
      } else if (req.query.company_id) {
        rules = contextDb.listByCompany.all(req.query.company_id) as any[];
      } else {
        rules = contextDb.list.all() as any[];
      }
      // Parse JSON config
      return reply.send(rules.map(r => ({ ...r, config: JSON.parse(r.config ?? '{}') })));
    }
  );

  // Create a context rule
  app.post<{
    Body: {
      paperclip_agent_id: string;
      paperclip_company_id: string;
      rule_type: string;
      label: string;
      config?: Record<string, unknown>;
      enabled?: boolean;
      priority?: number;
    };
  }>('/', async (req, reply) => {
    const { paperclip_agent_id, paperclip_company_id, rule_type, label, config, enabled, priority } = req.body;
    if (!paperclip_agent_id || !paperclip_company_id || !rule_type || !label) {
      return reply.status(400).send({ error: 'agent_id, company_id, rule_type, label required' });
    }
    const rule = contextDb.insert.get({
      paperclip_agent_id, paperclip_company_id, rule_type, label,
      config: JSON.stringify(config ?? {}),
      enabled: enabled !== false ? 1 : 0,
      priority: priority ?? 5,
    }) as any;
    return reply.status(201).send({ ...rule, config: JSON.parse(rule.config) });
  });

  // Toggle rule enabled/disabled
  app.patch<{ Params: { id: string }; Body: { enabled: boolean } }>(
    '/:id/toggle', async (req, reply) => {
      contextDb.toggle.run({ id: req.params.id, enabled: req.body.enabled ? 1 : 0 });
      return reply.send({ id: req.params.id, enabled: req.body.enabled });
    }
  );

  // Update rule config or priority
  app.patch<{
    Params: { id: string };
    Body: { label?: string; config?: Record<string, unknown>; priority?: number };
  }>('/:id', async (req, reply) => {
    const { label, config, priority } = req.body;
    const rule = contextDb.update.get({
      id: req.params.id,
      label: label ?? null,
      config: config ? JSON.stringify(config) : null,
      priority: priority ?? null,
    }) as any;
    if (!rule) return reply.status(404).send({ error: 'Rule not found' });
    return reply.send({ ...rule, config: JSON.parse(rule.config) });
  });

  // Delete a rule
  app.delete<{ Params: { id: string } }>('/:id', async (req, reply) => {
    contextDb.delete.run(req.params.id);
    return reply.send({ deleted: true });
  });

  // ── Assembled context snapshot for an agent ────────────────────────────────
  // Returns the full context that would be injected into the agent at run time:
  // memory entries + knowledge chunks + active rules — all within a token budget.

  app.get<{
    Params: { agentId: string };
    Querystring: { max_tokens?: string };
  }>('/snapshot/:agentId', async (req, reply) => {
    const maxTokens = parseInt(req.query.max_tokens ?? '8000', 10);

    // 1. Active rules for this agent
    const rules = (contextDb.listByAgent.all(req.params.agentId) as any[])
      .filter(r => r.enabled)
      .map(r => ({ ...r, config: JSON.parse(r.config ?? '{}') }));

    // 2. Memory entries (sorted by importance, respecting budget rule if present)
    memoryDb.purgeExpired.run();
    const budgetRule = rules.find(r => r.rule_type === 'budget');
    const memMaxTokens = budgetRule?.config?.memory_max_tokens ?? Math.floor(maxTokens * 0.3);
    const memEntries = (memoryDb.listByAgent.all(req.params.agentId) as any[])
      .filter(e => e.importance >= (budgetRule?.config?.min_importance ?? 1));

    let memTokens = 0;
    const includedMemory: any[] = [];
    for (const entry of memEntries) {
      if (memTokens + entry.token_count > memMaxTokens) break;
      includedMemory.push(entry);
      memTokens += entry.token_count;
    }

    // 3. Knowledge chunks (from bound collections)
    const knowledgeMaxTokens = budgetRule?.config?.knowledge_max_tokens ?? Math.floor(maxTokens * 0.5);
    const allCols = knowledgeDb.listCollections.all() as any[];
    const boundCols = allCols.filter(c => {
      const ids: string[] = JSON.parse(c.bound_agent_ids ?? '[]');
      return ids.includes(req.params.agentId);
    });

    let knowledgeTokens = 0;
    const includedKnowledge: Array<{ collection: string; document: string; tokens: number }> = [];
    for (const col of boundCols) {
      const docs = knowledgeDb.listDocuments.all(col.id) as any[];
      for (const doc of docs) {
        const docTokens = Math.ceil(doc.size_bytes / 4);
        if (knowledgeTokens + docTokens > knowledgeMaxTokens) break;
        includedKnowledge.push({ collection: col.name, document: doc.name, tokens: docTokens });
        knowledgeTokens += docTokens;
      }
    }

    const totalTokens = memTokens + knowledgeTokens;
    const utilizationPct = Math.round((totalTokens / maxTokens) * 100);

    return reply.send({
      agent_id: req.params.agentId,
      max_tokens: maxTokens,
      total_tokens: totalTokens,
      utilization_pct: utilizationPct,
      breakdown: {
        memory:    { tokens: memTokens,     entries: includedMemory.length },
        knowledge: { tokens: knowledgeTokens, documents: includedKnowledge.length },
      },
      memory: includedMemory,
      knowledge: includedKnowledge,
      rules: rules.map(r => ({ id: r.id, type: r.rule_type, label: r.label, priority: r.priority })),
    });
  });
};
