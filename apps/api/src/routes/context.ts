/**
 * Context Injection + Memory Distillation Routes — /api/context
 *
 * Key endpoints:
 *  GET  /snapshot/:agentId          — preview assembled context (existing)
 *  POST /inject/:agentId            — assemble context for actual agent use
 *  POST /distill                    — extract memory facts from a run output
 */

import type { FastifyPluginAsync } from 'fastify';
import { contextDb, memoryDb, knowledgeDb, chunksDb } from '../db.js';
import { embedText, bufferToFloat32, cosineSimilarity, searchChunks, estimateTokens, EMBEDDING_ENABLED } from '../embeddings.js';
import OpenAI from 'openai';

export const contextRoutes: FastifyPluginAsync = async (app) => {

  // ── CRUD ──────────────────────────────────────────────────────────────────

  app.get<{ Querystring: { agent_id?: string; company_id?: string } }>(
    '/', async (req, reply) => {
      let rules: any[];
      if (req.query.agent_id)       rules = contextDb.listByAgent.all(req.query.agent_id) as any[];
      else if (req.query.company_id) rules = contextDb.listByCompany.all(req.query.company_id) as any[];
      else                           rules = contextDb.list.all() as any[];
      return reply.send(rules.map(r => ({ ...r, config: JSON.parse(r.config ?? '{}') })));
    }
  );

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

  app.patch<{ Params: { id: string }; Body: { enabled: boolean } }>(
    '/:id/toggle', async (req, reply) => {
      contextDb.toggle.run({ id: req.params.id, enabled: req.body.enabled ? 1 : 0 });
      return reply.send({ id: req.params.id, enabled: req.body.enabled });
    }
  );

  app.patch<{ Params: { id: string }; Body: { label?: string; config?: Record<string, unknown>; priority?: number } }>(
    '/:id', async (req, reply) => {
      const { label, config, priority } = req.body;
      const rule = contextDb.update.get({
        id: req.params.id,
        label: label ?? null,
        config: config ? JSON.stringify(config) : null,
        priority: priority ?? null,
      }) as any;
      if (!rule) return reply.status(404).send({ error: 'Rule not found' });
      return reply.send({ ...rule, config: JSON.parse(rule.config) });
    }
  );

  app.delete<{ Params: { id: string } }>('/:id', async (req, reply) => {
    contextDb.delete.run(req.params.id);
    return reply.send({ deleted: true });
  });

  // ── Context Snapshot (preview) ────────────────────────────────────────────

  app.get<{
    Params: { agentId: string };
    Querystring: { max_tokens?: string };
  }>('/snapshot/:agentId', async (req, reply) => {
    const maxTokens = parseInt(req.query.max_tokens ?? '8000', 10);
    const rules = (contextDb.listByAgent.all(req.params.agentId) as any[])
      .filter(r => r.enabled)
      .map(r => ({ ...r, config: JSON.parse(r.config ?? '{}') }));

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
    return reply.send({
      agent_id: req.params.agentId,
      max_tokens: maxTokens,
      total_tokens: totalTokens,
      utilization_pct: Math.round((totalTokens / maxTokens) * 100),
      breakdown: {
        memory:    { tokens: memTokens,    entries: includedMemory.length },
        knowledge: { tokens: knowledgeTokens, documents: includedKnowledge.length },
      },
      memory: includedMemory,
      knowledge: includedKnowledge,
      rules: rules.map(r => ({ id: r.id, type: r.rule_type, label: r.label, priority: r.priority })),
    });
  });

  // ── Context Injection (agent calls this before each run) ──────────────────
  // Returns an assembled system-prompt prefix the agent prepends to its system prompt.

  app.post<{
    Params: { agentId: string };
    Body: { query?: string; max_tokens?: number };
  }>('/inject/:agentId', async (req, reply) => {
    const { agentId } = req.params;
    const query     = req.body.query ?? '';
    const maxTokens = req.body.max_tokens ?? 8000;

    // Load active rules
    const rules = (contextDb.listByAgent.all(agentId) as any[])
      .filter(r => r.enabled)
      .map(r => ({ ...r, config: JSON.parse(r.config ?? '{}') }));

    const budgetRule    = rules.find(r => r.rule_type === 'budget');
    const trimRule      = rules.find(r => r.rule_type === 'trim');
    const injectionRule = rules.find(r => r.rule_type === 'injection');
    const memFilterRule = rules.find(r => r.rule_type === 'memory');
    const knowledgeRule = rules.find(r => r.rule_type === 'knowledge');

    const memBudget  = budgetRule?.config?.memory_max_tokens    ?? Math.floor(maxTokens * 0.3);
    const knBudget   = budgetRule?.config?.knowledge_max_tokens ?? Math.floor(maxTokens * 0.5);
    const minImp     = memFilterRule?.config?.min_importance ?? budgetRule?.config?.min_importance ?? 1;

    // 1. Memory entries (importance-ordered, budget-capped)
    memoryDb.purgeExpired.run();
    const memEntries = (memoryDb.listByAgent.all(agentId) as any[])
      .filter(e => e.importance >= minImp);

    let memTokensUsed = 0;
    const pickedMem: any[] = [];
    for (const e of memEntries) {
      if (memTokensUsed + e.token_count > memBudget) break;
      pickedMem.push(e);
      memTokensUsed += e.token_count;
    }

    // 2. Knowledge chunks (semantic search if query provided, else first-fit)
    const allCols = knowledgeDb.listCollections.all() as any[];
    const boundColIds: string[] = knowledgeRule?.config?.collection_ids?.length
      ? knowledgeRule.config.collection_ids as string[]
      : allCols
          .filter(c => (JSON.parse(c.bound_agent_ids ?? '[]') as string[]).includes(agentId))
          .map(c => c.id);

    let pickedChunks: Array<{ collection_name: string; content: string; token_count: number; score?: number }> = [];

    if (query && EMBEDDING_ENABLED()) {
      // Semantic: gather chunks from bound collections, run vector search
      const rawChunks = boundColIds.flatMap(colId =>
        (chunksDb.listByCollection.all(colId) as any[]).map(ch => ({
          ...ch,
          collection_id: colId,
        }))
      );
      const maxChunks = knowledgeRule?.config?.max_chunks ?? 20;
      const results = await searchChunks(query, rawChunks, maxChunks);

      let knTokensUsed = 0;
      for (const r of results) {
        if (knTokensUsed + r.token_count > knBudget) break;
        const colName = allCols.find(c => c.id === r.collection_id)?.name ?? 'Knowledge';
        pickedChunks.push({ collection_name: colName, content: r.content, token_count: r.token_count, score: r.score });
        knTokensUsed += r.token_count;
      }
    } else {
      // First-fit: include whole documents up to budget
      let knTokensUsed = 0;
      outer: for (const colId of boundColIds) {
        const col = allCols.find(c => c.id === colId);
        const docs = knowledgeDb.listDocuments.all(colId) as any[];
        for (const doc of docs) {
          const chunks = chunksDb.listByDocument.all(doc.id) as any[];
          for (const ch of chunks) {
            if (knTokensUsed + ch.token_count > knBudget) break outer;
            pickedChunks.push({ collection_name: col?.name ?? colId, content: ch.content, token_count: ch.token_count });
            knTokensUsed += ch.token_count;
          }
        }
      }
    }

    // 3. Determine injection order
    const order: ('memory' | 'knowledge')[] = injectionRule?.config?.order ?? ['knowledge', 'memory'];

    // 4. Build system prompt prefix (markdown)
    const sections: string[] = [];

    for (const section of order) {
      if (section === 'memory' && pickedMem.length > 0) {
        sections.push([
          '## [MEMORY]',
          pickedMem.map(e => `- (${e.type.toUpperCase()}, importance ${e.importance}/5) ${e.content}`).join('\n'),
        ].join('\n'));
      }
      if (section === 'knowledge' && pickedChunks.length > 0) {
        const grouped = new Map<string, typeof pickedChunks>();
        for (const ch of pickedChunks) {
          const arr = grouped.get(ch.collection_name) ?? [];
          arr.push(ch);
          grouped.set(ch.collection_name, arr);
        }
        const kBlocks: string[] = ['## [KNOWLEDGE BASE]'];
        for (const [colName, chunks] of grouped) {
          kBlocks.push(`### ${colName}`);
          kBlocks.push(chunks.map(c => c.content).join('\n\n---\n\n'));
        }
        sections.push(kBlocks.join('\n'));
      }
    }

    const systemPromptPrefix = sections.length > 0
      ? `<!-- PCC CONTEXT INJECTION -->\n${sections.join('\n\n')}\n<!-- END PCC CONTEXT -->\n`
      : '';

    const totalTokens = memTokensUsed + pickedChunks.reduce((a, c) => a + c.token_count, 0);

    return reply.send({
      agent_id: agentId,
      system_prompt_prefix: systemPromptPrefix,
      total_tokens: totalTokens,
      max_tokens: maxTokens,
      utilization_pct: Math.round((totalTokens / maxTokens) * 100),
      memory_count: pickedMem.length,
      knowledge_chunks: pickedChunks.length,
      semantic_search: query.length > 0 && EMBEDDING_ENABLED(),
    });
  });

  // ── Memory Distillation ───────────────────────────────────────────────────
  // POST /distill
  // Called after an agent run to extract facts and store in agent_memory.

  app.post<{
    Body: {
      paperclip_agent_id: string;
      paperclip_company_id: string;
      run_id?: string;
      output: string;
      error?: string | null;
      max_facts?: number;
    };
  }>('/distill', async (req, reply) => {
    const {
      paperclip_agent_id,
      paperclip_company_id,
      run_id,
      output,
      error,
      max_facts = 5,
    } = req.body;

    if (!paperclip_agent_id || !paperclip_company_id || !output) {
      return reply.status(400).send({ error: 'agent_id, company_id, and output required' });
    }

    if (!process.env.OPENAI_API_KEY) {
      return reply.status(503).send({
        error: 'OPENAI_API_KEY not set — distillation requires LLM',
        stored: [],
      });
    }

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const prompt = `You are an AI memory curator. Extract up to ${max_facts} concise, reusable facts from this agent run output.

Agent Run Output:
---
${output.slice(0, 4000)}
---
${error ? `\nError (if any): ${error.slice(0, 500)}` : ''}

Return JSON array only — no explanation. Each item:
{
  "type": "fact"|"summary"|"error"|"preference",
  "content": "concise, self-contained statement (max 200 chars)",
  "importance": 1-5  // 5=critical project invariant, 1=ephemeral
}

Examples of good facts:
- "FormValidator.validate() throws NullPointerException when input is empty string"
- "Unit tests should always be generated alongside bug fixes per team preference"
- "The deploy pipeline requires a passing CI build before merging"`;

    try {
      const res = await client.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
        max_tokens: 800,
        temperature: 0.2,
      });

      const raw = res.choices[0].message.content ?? '{"facts":[]}';
      let facts: any[] = [];
      try {
        const parsed = JSON.parse(raw);
        facts = Array.isArray(parsed) ? parsed : (parsed.facts ?? []);
      } catch { facts = []; }

      const stored: any[] = [];
      for (const f of facts.slice(0, max_facts)) {
        if (!f.content || typeof f.content !== 'string') continue;
        const entry = memoryDb.insert.get({
          paperclip_agent_id,
          paperclip_company_id,
          type: ['fact', 'summary', 'error', 'preference'].includes(f.type) ? f.type : 'fact',
          content: String(f.content).slice(0, 500),
          source: run_id ?? null,
          importance: Math.min(5, Math.max(1, parseInt(f.importance, 10) || 3)),
          token_count: estimateTokens(f.content),
          expires_at: null,
        }) as any;
        stored.push(entry);
      }

      return reply.send({
        extracted: facts.length,
        stored: stored.length,
        entries: stored,
        model_used: 'gpt-4o-mini',
      });

    } catch (err: any) {
      return reply.status(500).send({ error: 'Distillation failed', detail: err.message });
    }
  });
};
