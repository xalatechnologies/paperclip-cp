/**
 * Context Routes — /api/context
 *
 * CRUD for context rules + two key agent-facing endpoints:
 *   POST /inject/:agentId  — assemble system-prompt prefix (memory + RAG)
 *   POST /distill          — extract facts from agent run output via LLM
 *
 * Vector search: uses Convex native ANN (replaces manual cosineSimilarity loop).
 * Memory + context rules: reads from Convex.
 */

import type { FastifyPluginAsync } from 'fastify';
import { convex, convexAdmin, api, internal } from '../convex-client.js';
import { embedText, EMBEDDING_ENABLED } from '../embeddings.js';
import OpenAI from 'openai';

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export const contextRoutes: FastifyPluginAsync = async (app) => {

  // ── Context Rules CRUD ────────────────────────────────────────────────────

  app.get<{ Querystring: { agent_id?: string; company_id?: string } }>(
    '/', async (req, reply) => {
      const rules = await convex.query(api.context.list, {
        paperclip_agent_id:   req.query.agent_id,
        paperclip_company_id: req.query.company_id,
      });
      return reply.send(rules);
    }
  );

  app.post<{
    Body: {
      paperclip_agent_id:   string;
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
    const id = await convex.mutation(api.context.create, {
      paperclip_agent_id,
      paperclip_company_id,
      rule_type,
      label,
      config:   config ?? {},
      enabled:  enabled !== false,
      priority: priority ?? 5,
    });
    return reply.status(201).send({ _id: id });
  });

  app.patch<{ Params: { id: string }; Body: { enabled: boolean } }>(
    '/:id/toggle', async (req, reply) => {
      await convex.mutation(api.context.toggle, {
        id:      req.params.id as any,
        enabled: req.body.enabled,
      });
      return reply.send({ id: req.params.id, enabled: req.body.enabled });
    }
  );

  app.patch<{ Params: { id: string }; Body: { label?: string; config?: Record<string, unknown>; priority?: number } }>(
    '/:id', async (req, reply) => {
      const rule = await convex.mutation(api.context.update, {
        id:       req.params.id as any,
        label:    req.body.label,
        config:   req.body.config,
        priority: req.body.priority,
      });
      if (!rule) return reply.status(404).send({ error: 'Rule not found' });
      return reply.send(rule);
    }
  );

  app.delete<{ Params: { id: string } }>('/:id', async (req, reply) => {
    await convex.mutation(api.context.remove, { id: req.params.id as any });
    return reply.send({ deleted: true });
  });

  // ── Context Snapshot (preview) ────────────────────────────────────────────

  app.get<{
    Params: { agentId: string };
    Querystring: { max_tokens?: string };
  }>('/snapshot/:agentId', async (req, reply) => {
    const maxTokens = parseInt(req.query.max_tokens ?? '8000', 10);
    const agentId   = req.params.agentId;

    const allRules = await convex.query(api.context.list, { paperclip_agent_id: agentId });
    const rules    = allRules.filter((r: any) => r.enabled);
    const budgetRule = rules.find((r: any) => r.rule_type === 'budget');
    const memMaxTokens    = budgetRule?.config?.memory_max_tokens    ?? Math.floor(maxTokens * 0.3);
    const knowledgeMaxTok = budgetRule?.config?.knowledge_max_tokens ?? Math.floor(maxTokens * 0.5);
    const minImp = budgetRule?.config?.min_importance ?? 1;

    const memEntries = await convex.query(api.memory.listByAgent, {
      paperclip_agent_id: agentId,
      min_importance:     minImp,
    });

    let memTokens = 0;
    const includedMemory: any[] = [];
    for (const e of memEntries) {
      if (memTokens + e.token_count > memMaxTokens) break;
      includedMemory.push(e);
      memTokens += e.token_count;
    }

    const collections = await convex.query(api.knowledge.listCollections, {});
    const boundCols   = collections.filter((c: any) =>
      (c.bound_agent_ids ?? []).includes(agentId)
    );

    let knowledgeTokens = 0;
    const includedKnowledge: Array<{ collection: string; document: string; tokens: number }> = [];
    for (const col of boundCols) {
      const docs = await convex.query(api.knowledge.listDocuments, { collection_id: col._id });
      for (const doc of docs) {
        const docTokens = Math.ceil(doc.size_bytes / 4);
        if (knowledgeTokens + docTokens > knowledgeMaxTok) break;
        includedKnowledge.push({ collection: col.name, document: doc.name, tokens: docTokens });
        knowledgeTokens += docTokens;
      }
    }

    return reply.send({
      agent_id:        agentId,
      max_tokens:      maxTokens,
      total_tokens:    memTokens + knowledgeTokens,
      utilization_pct: Math.round(((memTokens + knowledgeTokens) / maxTokens) * 100),
      breakdown: {
        memory:    { tokens: memTokens,         entries:   includedMemory.length },
        knowledge: { tokens: knowledgeTokens,   documents: includedKnowledge.length },
      },
      memory:    includedMemory,
      knowledge: includedKnowledge,
      rules:     rules.map((r: any) => ({ id: r._id, type: r.rule_type, label: r.label, priority: r.priority })),
    });
  });

  // ── Context Injection ─────────────────────────────────────────────────────
  // Assembles system-prompt prefix. Replaces SQLite cosine search with
  // Convex native vectorSearch action.

  app.post<{
    Params: { agentId: string };
    Body: { query?: string; max_tokens?: number };
  }>('/inject/:agentId', async (req, reply) => {
    const agentId   = req.params.agentId;
    const query     = req.body.query ?? '';
    const maxTokens = req.body.max_tokens ?? 8000;

    const allRules = await convex.query(api.context.list, { paperclip_agent_id: agentId });
    const rules    = allRules.filter((r: any) => r.enabled);

    const budgetRule    = rules.find((r: any) => r.rule_type === 'budget');
    const injectionRule = rules.find((r: any) => r.rule_type === 'injection');
    const memFilterRule = rules.find((r: any) => r.rule_type === 'memory');
    const knowledgeRule = rules.find((r: any) => r.rule_type === 'knowledge');

    const memBudget = budgetRule?.config?.memory_max_tokens    ?? Math.floor(maxTokens * 0.3);
    const knBudget  = budgetRule?.config?.knowledge_max_tokens ?? Math.floor(maxTokens * 0.5);
    const minImp    = memFilterRule?.config?.min_importance ?? budgetRule?.config?.min_importance ?? 1;

    // 1. Memory entries
    const memEntries = await convex.query(api.memory.listByAgent, {
      paperclip_agent_id: agentId,
      min_importance:     minImp,
    });
    let memTokensUsed = 0;
    const pickedMem: any[] = [];
    for (const e of memEntries) {
      if (memTokensUsed + e.token_count > memBudget) break;
      pickedMem.push(e);
      memTokensUsed += e.token_count;
    }

    // 2. Knowledge chunks — Convex native vector search or first-fit
    const allCollections = await convex.query(api.knowledge.listCollections, {});
    const boundColIds: string[] = knowledgeRule?.config?.collection_ids?.length
      ? knowledgeRule.config.collection_ids as string[]
      : allCollections
          .filter((c: any) => (c.bound_agent_ids ?? []).includes(agentId))
          .map((c: any) => c._id);

    type ChunkResult = { collection_name: string; content: string; token_count: number; score?: number };
    let pickedChunks: ChunkResult[] = [];

    if (query && EMBEDDING_ENABLED()) {
      // Semantic search: embed query → Convex ANN
      const queryVec = await embedText(query);
      if (queryVec) {
        const maxChunks = knowledgeRule?.config?.max_chunks ?? 20;
        let knTokensUsed = 0;

        for (const colId of boundColIds) {
          const col = allCollections.find((c: any) => c._id === colId);
          // Convex vectorSearch returns [{ _id, _score }]
          const hits = await convex.action(api.knowledge.vectorSearch, {
            collection_id: colId as any,
            vector:        Array.from(queryVec),
            limit:         maxChunks,
          }) as Array<{ _id: string; _score: number }>;

          // Fetch content for top hits
          const chunks = await convex.query(api.knowledge.getChunksByIds, {
            ids: hits.map((h) => h._id as any),
          });

          for (let i = 0; i < chunks.length; i++) {
            const chunk = chunks[i] as any;
            if (!chunk || knTokensUsed + chunk.token_count > knBudget) continue;
            pickedChunks.push({
              collection_name: col?.name ?? colId,
              content:         chunk.content,
              token_count:     chunk.token_count,
              score:           hits[i]?._score,
            });
            knTokensUsed += chunk.token_count;
          }
        }
      }
    } else {
      // First-fit: include whole documents up to budget
      let knTokensUsed = 0;
      outer: for (const colId of boundColIds) {
        const col  = allCollections.find((c: any) => c._id === colId);
        const docs = await convex.query(api.knowledge.listDocuments, { collection_id: colId as any });
        for (const doc of docs as any[]) {
          const chunks = await convex.query(api.knowledge.listChunks, { document_id: doc._id });
          for (const ch of chunks as any[]) {
            if (knTokensUsed + ch.token_count > knBudget) break outer;
            // Chunk content is in snippet only (full content not returned by listChunks)
            // For first-fit we use the snippet approximation
            pickedChunks.push({ collection_name: col?.name ?? colId, content: ch.snippet, token_count: ch.token_count });
            knTokensUsed += ch.token_count;
          }
        }
      }
    }

    // 3. Injection order
    const order: ('memory' | 'knowledge')[] = injectionRule?.config?.order ?? ['knowledge', 'memory'];

    // 4. Build system prompt prefix
    const sections: string[] = [];
    for (const section of order) {
      if (section === 'memory' && pickedMem.length > 0) {
        sections.push([
          '## [MEMORY]',
          pickedMem.map((e: any) => `- (${e.type.toUpperCase()}, importance ${e.importance}/5) ${e.content}`).join('\n'),
        ].join('\n'));
      }
      if (section === 'knowledge' && pickedChunks.length > 0) {
        const grouped = new Map<string, ChunkResult[]>();
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
      agent_id:             agentId,
      system_prompt_prefix: systemPromptPrefix,
      total_tokens:         totalTokens,
      max_tokens:           maxTokens,
      utilization_pct:      Math.round((totalTokens / maxTokens) * 100),
      memory_count:         pickedMem.length,
      knowledge_chunks:     pickedChunks.length,
      semantic_search:      query.length > 0 && EMBEDDING_ENABLED(),
    });
  });

  // ── Memory Distillation ───────────────────────────────────────────────────

  app.post<{
    Body: {
      paperclip_agent_id:   string;
      paperclip_company_id: string;
      run_id?:   string;
      output:    string;
      error?:    string | null;
      max_facts?: number;
    };
  }>('/distill', async (req, reply) => {
    const { paperclip_agent_id, paperclip_company_id, run_id, output, error, max_facts = 5 } = req.body;

    if (!paperclip_agent_id || !paperclip_company_id || !output) {
      return reply.status(400).send({ error: 'agent_id, company_id, and output required' });
    }
    if (!process.env.OPENAI_API_KEY) {
      return reply.status(503).send({ error: 'OPENAI_API_KEY not set — distillation requires LLM', stored: [] });
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
  "importance": 1-5
}`;

    try {
      const res = await client.chat.completions.create({
        model:           'gpt-4o-mini',
        messages:        [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
        max_tokens:      800,
        temperature:     0.2,
      });

      const raw = res.choices[0].message.content ?? '{"facts":[]}';
      let facts: any[] = [];
      try {
        const parsed = JSON.parse(raw);
        facts = Array.isArray(parsed) ? parsed : (parsed.facts ?? []);
      } catch { facts = []; }

      const stored: string[] = [];
      for (const f of facts.slice(0, max_facts)) {
        if (!f.content || typeof f.content !== 'string') continue;
        const id = await convex.mutation(api.memory.insert, {
          paperclip_agent_id,
          paperclip_company_id,
          type:        ['fact', 'summary', 'error', 'preference'].includes(f.type) ? f.type : 'fact',
          content:     String(f.content).slice(0, 500),
          source:      run_id,
          importance:  Math.min(5, Math.max(1, parseInt(f.importance, 10) || 3)),
          token_count: estimateTokens(f.content),
        });
        stored.push(id as string);
      }

      return reply.send({
        extracted:  facts.length,
        stored:     stored.length,
        ids:        stored,
        model_used: 'gpt-4o-mini',
      });

    } catch (err: any) {
      return reply.status(500).send({ error: 'Distillation failed', detail: err.message });
    }
  });
};
