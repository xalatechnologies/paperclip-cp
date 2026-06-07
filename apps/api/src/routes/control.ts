/**
 * Control Routes
 * 
 * Write channel for PCC → Paperclip VPS.
 * All routes write/read from the Paperclip Postgres via SSH.
 * 
 * /api/control/costs         — token usage analytics
 * /api/control/budget        — budget policy management
 * /api/control/agents        — agent runtime/model config
 * /api/control/skills        — skill push & management
 */

import type { FastifyPluginAsync } from 'fastify';
import { vpsQuery, vpsExec } from '../vps-db.js';

// =============================================================================
// Cost Analytics
// =============================================================================

export const controlRoutes: FastifyPluginAsync = async (app) => {

  /**
   * GET /api/control/costs/summary
   * Top-level token usage summary
   */
  app.get('/costs/summary', async (_req, reply) => {
    try {
      const result = await vpsQuery<any>(`
        const total = await sql\`
          SELECT 
            COALESCE(SUM(input_tokens + output_tokens), 0) as total_tokens,
            COALESCE(SUM(cached_input_tokens), 0) as cached_tokens,
            COALESCE(SUM(cost_cents), 0) as total_cost_cents,
            COUNT(*) as event_count
          FROM cost_events
        \`;
        
        const today = await sql\`
          SELECT 
            COALESCE(SUM(input_tokens + output_tokens), 0) as tokens,
            COUNT(*) as events
          FROM cost_events 
          WHERE occurred_at::date = CURRENT_DATE
        \`;

        const topAgents = await sql\`
          SELECT 
            a.name,
            a.adapter_type,
            SUM(ce.input_tokens + ce.output_tokens) as tokens,
            SUM(ce.cached_input_tokens) as cached,
            COUNT(ce.id) as events,
            SUM(ce.cost_cents) as cost_cents
          FROM cost_events ce
          JOIN agents a ON a.id = ce.agent_id
          GROUP BY a.name, a.adapter_type
          ORDER BY SUM(ce.input_tokens + ce.output_tokens) DESC
          LIMIT 10
        \`;

        return {
          total: total[0],
          today: today[0],
          topAgents,
        };
      `);
      return reply.send(result);
    } catch (err: any) {
      return reply.status(503).send({ error: 'VPS query failed', detail: err.message });
    }
  });

  /**
   * GET /api/control/costs/daily
   * Daily token usage for the last N days
   */
  app.get<{ Querystring: { days?: string } }>('/costs/daily', async (req, reply) => {
    const days = parseInt(req.query.days ?? '14', 10);
    try {
      const result = await vpsQuery<any>(`
        const rows = await sql\`
          SELECT 
            occurred_at::date as day,
            SUM(input_tokens) as input_tokens,
            SUM(output_tokens) as output_tokens,
            SUM(cached_input_tokens) as cached_tokens,
            SUM(cost_cents) as cost_cents,
            COUNT(*) as events
          FROM cost_events
          WHERE occurred_at > NOW() - interval '${days} days'
          GROUP BY day
          ORDER BY day DESC
        \`;
        return rows;
      `);
      return reply.send(result);
    } catch (err: any) {
      return reply.status(503).send({ error: 'VPS query failed', detail: err.message });
    }
  });

  /**
   * GET /api/control/costs/by-agent
   * Per-agent token breakdown
   */
  app.get('/costs/by-agent', async (_req, reply) => {
    try {
      const result = await vpsQuery<any>(`
        const rows = await sql\`
          SELECT 
            a.id as agent_id,
            a.name,
            a.adapter_type,
            a.adapter_config->>'model' as model,
            SUM(ce.input_tokens + ce.output_tokens) as total_tokens,
            SUM(ce.cached_input_tokens) as cached_tokens,
            SUM(ce.cost_cents) as cost_cents,
            COUNT(ce.id) as runs,
            MAX(ce.occurred_at) as last_active
          FROM cost_events ce
          JOIN agents a ON a.id = ce.agent_id
          GROUP BY a.id, a.name, a.adapter_type, a.adapter_config->>'model'
          ORDER BY SUM(ce.input_tokens + ce.output_tokens) DESC
        \`;
        return rows;
      `);
      return reply.send(result);
    } catch (err: any) {
      return reply.status(503).send({ error: 'VPS query failed', detail: err.message });
    }
  });

  // =============================================================================
  // Budget Policies
  // =============================================================================

  /**
   * GET /api/control/budget
   * List all budget policies
   */
  app.get('/budget', async (_req, reply) => {
    try {
      const result = await vpsQuery<any>(`
        const rows = await sql\`
          SELECT bp.*, 
            a.name as agent_name,
            c.name as company_name
          FROM budget_policies bp
          LEFT JOIN agents a ON bp.scope_type = 'agent' AND bp.scope_id = a.id
          LEFT JOIN companies c ON bp.scope_type = 'company' AND bp.scope_id = c.id
          ORDER BY bp.created_at DESC
        \`;
        return rows;
      `);
      return reply.send(result);
    } catch (err: any) {
      return reply.status(503).send({ error: 'VPS query failed', detail: err.message });
    }
  });

  /**
   * POST /api/control/budget
   * Create or update a budget policy
   */
  app.post<{
    Body: {
      company_id: string;
      scope_type: 'company' | 'agent';
      scope_id: string;
      metric: string;
      window_kind: string;
      amount: number;
      warn_percent?: number;
      hard_stop_enabled?: boolean;
    };
  }>('/budget', async (req, reply) => {
    const { company_id, scope_type, scope_id, metric, window_kind, amount, warn_percent, hard_stop_enabled } = req.body;
    try {
      const result = await vpsExec(`
        const existing = await sql\`
          SELECT id FROM budget_policies 
          WHERE company_id = '${company_id}' 
            AND scope_type = '${scope_type}' 
            AND scope_id = '${scope_id}'
            AND metric = '${metric}'
            AND window_kind = '${window_kind}'
          LIMIT 1
        \`;

        if (existing.length > 0) {
          await sql\`
            UPDATE budget_policies SET
              amount = ${amount},
              warn_percent = ${warn_percent ?? 80},
              hard_stop_enabled = ${hard_stop_enabled ?? false},
              is_active = true,
              updated_at = NOW()
            WHERE id = \${existing[0].id}
          \`;
          return { action: 'updated', id: existing[0].id };
        } else {
          const row = await sql\`
            INSERT INTO budget_policies (
              id, company_id, scope_type, scope_id, metric, window_kind,
              amount, warn_percent, hard_stop_enabled, notify_enabled, is_active,
              created_at, updated_at
            ) VALUES (
              gen_random_uuid(), '${company_id}', '${scope_type}', '${scope_id}',
              '${metric}', '${window_kind}', ${amount}, ${warn_percent ?? 80},
              ${hard_stop_enabled ?? false}, true, true, NOW(), NOW()
            ) RETURNING id
          \`;
          return { action: 'created', id: row[0].id };
        }
      `);
      return reply.send(result);
    } catch (err: any) {
      return reply.status(503).send({ error: 'Budget write failed', detail: err.message });
    }
  });

  // =============================================================================
  // Agent Config
  // =============================================================================

  /**
   * GET /api/control/agents
   * List all agents with config
   */
  app.get('/agents', async (_req, reply) => {
    try {
      const result = await vpsQuery<any>(`
        const rows = await sql\`
          SELECT 
            a.id, a.name, a.role, a.title, a.status, a.adapter_type,
            a.adapter_config->>'model' as model,
            a.adapter_config->>'maxTurnsPerRun' as max_turns,
            a.adapter_config->>'graceSec' as grace_sec,
            a.runtime_config,
            a.budget_monthly_cents,
            a.spent_monthly_cents,
            a.last_heartbeat_at,
            a.company_id,
            c.name as company_name
          FROM agents a
          JOIN companies c ON c.id = a.company_id
          ORDER BY c.name, a.name
        \`;
        return rows;
      `);
      return reply.send(result);
    } catch (err: any) {
      return reply.status(503).send({ error: 'VPS query failed', detail: err.message });
    }
  });

  /**
   * PATCH /api/control/agents/:id
   * Update agent adapter_config or runtime_config
   */
  app.patch<{
    Params: { id: string };
    Body: {
      model?: string;
      maxTurnsPerRun?: number;
      graceSec?: number;
      runtime_config?: Record<string, unknown>;
    };
  }>('/agents/:id', async (req, reply) => {
    const { id } = req.params;
    const { model, maxTurnsPerRun, graceSec, runtime_config } = req.body;
    try {
      const result = await vpsExec(`
        const agent = await sql\`SELECT adapter_config, runtime_config FROM agents WHERE id = '${id}'\`;
        if (!agent.length) return { error: 'Agent not found' };

        const ac = { ...agent[0].adapter_config };
        const rc = { ...agent[0].runtime_config };

        ${model ? `ac.model = "${model}";` : ''}
        ${maxTurnsPerRun ? `ac.maxTurnsPerRun = ${maxTurnsPerRun};` : ''}
        ${graceSec ? `ac.graceSec = ${graceSec};` : ''}
        ${runtime_config ? `Object.assign(rc, ${JSON.stringify(runtime_config)});` : ''}

        await sql\`
          UPDATE agents SET 
            adapter_config = \${sql.json(ac)},
            runtime_config = \${sql.json(rc)},
            updated_at = NOW()
          WHERE id = '${id}'
        \`;
        return { updated: true, adapter_config: ac, runtime_config: rc };
      `);
      return reply.send(result);
    } catch (err: any) {
      return reply.status(503).send({ error: 'Agent config update failed', detail: err.message });
    }
  });

  // =============================================================================
  // Routines — read/manage from Paperclip VPS scheduled_jobs table
  // =============================================================================

  /**
   * GET /api/control/routines
   * List all scheduled jobs on the VPS with their last run status
   */
  app.get('/routines', async (_req, reply) => {
    try {
      const result = await vpsQuery<any>(`
        // Check table exists first — return [] gracefully if not yet created
        const tableCheck = await sql\`
          SELECT EXISTS (
            SELECT 1 FROM information_schema.tables
            WHERE table_name = 'scheduled_jobs'
          ) as exists
        \`;
        if (!tableCheck[0]?.exists) return [];

        const rows = await sql\`
          SELECT
            sj.id,
            sj.name,
            sj.cron_expression,
            sj.enabled,
            sj.agent_id,
            sj.skill_slug,
            sj.company_id,
            sj.last_run_at,
            sj.last_status,
            sj.run_count,
            sj.avg_duration_sec,
            a.name as agent_name,
            a.adapter_type,
            c.name as company_name,
            c.issue_prefix
          FROM scheduled_jobs sj
          LEFT JOIN agents a ON a.id = sj.agent_id
          LEFT JOIN companies c ON c.id = sj.company_id
          ORDER BY c.name, sj.name
        \`;
        return rows;
      `);
      return reply.send(Array.isArray(result) ? result : []);
    } catch (err: any) {
      // Return empty array instead of 503 — UI shows "VPS unavailable" gracefully
      return reply.send([]);
    }
  });

  /**
   * GET /api/control/routines/:id/runs
   * Run history for a specific scheduled job
   */
  app.get<{ Params: { id: string } }>('/routines/:id/runs', async (req, reply) => {
    try {
      const result = await vpsQuery<any>(`
        const rows = await sql\`
          SELECT
            jr.id,
            jr.scheduled_job_id,
            jr.started_at,
            jr.finished_at,
            jr.status,
            jr.duration_sec,
            SUBSTRING(jr.output, 1, 500) as output,
            SUBSTRING(jr.error, 1, 500) as error
          FROM job_runs jr
          WHERE jr.scheduled_job_id = '${req.params.id}'
          ORDER BY jr.started_at DESC
          LIMIT 20
        \`;
        return rows;
      `);
      return reply.send(result);
    } catch (err: any) {
      return reply.status(503).send({ error: 'VPS query failed', detail: err.message });
    }
  });

  /**
   * PATCH /api/control/routines/:id/toggle
   * Enable or disable a scheduled job
   */
  app.patch<{ Params: { id: string }; Body: { enabled: boolean } }>(
    '/routines/:id/toggle', async (req, reply) => {
      try {
        const result = await vpsExec(`
          const row = await sql\`
            UPDATE scheduled_jobs
            SET enabled = ${req.body.enabled}, updated_at = NOW()
            WHERE id = '${req.params.id}'
            RETURNING id, name, enabled
          \`;
          return row[0] ?? null;
        `);
        return reply.send(result);
      } catch (err: any) {
        return reply.status(503).send({ error: 'Toggle failed', detail: err.message });
      }
    }
  );

  /**
   * POST /api/control/routines/:id/run
   * Manually trigger a scheduled job immediately
   */
  app.post<{ Params: { id: string } }>('/routines/:id/run', async (req, reply) => {
    try {
      const result = await vpsExec(`
        // Create a manual run record
        const job = await sql\`SELECT * FROM scheduled_jobs WHERE id = '${req.params.id}' LIMIT 1\`;
        if (!job.length) return { error: 'Job not found' };

        const run = await sql\`
          INSERT INTO job_runs (scheduled_job_id, started_at, status)
          VALUES ('${req.params.id}', NOW(), 'triggered')
          RETURNING id, started_at
        \`;

        // Update last_run_at
        await sql\`
          UPDATE scheduled_jobs SET last_run_at = NOW(), run_count = run_count + 1
          WHERE id = '${req.params.id}'
        \`;

        return { triggered: true, run_id: run[0].id, job_name: job[0].name };
      `);
      return reply.status(202).send(result);
    } catch (err: any) {
      return reply.status(503).send({ error: 'Trigger failed', detail: err.message });
    }
  });

  // =============================================================================
  // Skills

  // =============================================================================

  /**
   * GET /api/control/skills
   * List skills on the VPS
   */
  app.get('/skills', async (_req, reply) => {
    try {
      const result = await vpsQuery<any>(`
        const rows = await sql\`
          SELECT 
            cs.slug, cs.name, cs.description, cs.source_type, cs.trust_level,
            cs.company_id,
            c.name as company_name
          FROM company_skills cs
          JOIN companies c ON c.id = cs.company_id
          ORDER BY c.name, cs.name
        \`;
        return rows;
      `);
      return reply.send(result);
    } catch (err: any) {
      return reply.status(503).send({ error: 'VPS query failed', detail: err.message });
    }
  });

  /**
   * POST /api/control/skills/push
   * Push a skill from PCC to a company on the VPS
   */
  app.post<{
    Body: {
      company_id: string;
      slug: string;
      name: string;
      description: string;
      markdown: string;
    };
  }>('/skills/push', async (req, reply) => {
    const { company_id, slug, name, description, markdown } = req.body;
    try {
      const result = await vpsExec(`
        const existing = await sql\`
          SELECT id FROM company_skills 
          WHERE company_id = '${company_id}' AND slug = '${slug}'
          LIMIT 1
        \`;

        const escaped = ${JSON.stringify(markdown)};

        if (existing.length > 0) {
          await sql\`
            UPDATE company_skills SET
              name = '${name}',
              description = '${description}',
              markdown = \${escaped},
              updated_at = NOW()
            WHERE id = \${existing[0].id}
          \`;
          return { action: 'updated', id: existing[0].id };
        } else {
          const row = await sql\`
            INSERT INTO company_skills (
              id, company_id, slug, name, description, markdown,
              source_type, trust_level, created_at, updated_at
            ) VALUES (
              gen_random_uuid(), '${company_id}', '${slug}', '${name}',
              '${description}', \${escaped},
              'managed', 'markdown_only', NOW(), NOW()
            ) RETURNING id
          \`;
          return { action: 'created', id: row[0].id };
        }
      `);
      return reply.send(result);
    } catch (err: any) {
      return reply.status(503).send({ error: 'Skill push failed', detail: err.message });
    }
  });

  // =============================================================================
  // Companies & Projects (read from VPS)
  // =============================================================================

  /**
   * GET /api/control/companies
   * List companies with agent/project counts
   */
  app.get('/companies', async (_req, reply) => {
    try {
      const result = await vpsQuery<any>(`
        const rows = await sql\`
          SELECT 
            c.id, c.name, c.issue_prefix,
            (SELECT COUNT(*) FROM agents a WHERE a.company_id = c.id) as agent_count,
            (SELECT COUNT(*) FROM projects p WHERE p.company_id = c.id) as project_count,
            (SELECT COALESCE(SUM(input_tokens + output_tokens), 0) 
             FROM cost_events ce WHERE ce.company_id = c.id) as total_tokens,
            (SELECT COUNT(*) FROM company_skills cs WHERE cs.company_id = c.id) as skill_count,
            (SELECT COUNT(*) FROM company_secrets sec WHERE sec.company_id = c.id) as secret_count
          FROM companies c
          ORDER BY c.name
        \`;
        return rows;
      `);
      return reply.send(result);
    } catch (err: any) {
      return reply.status(503).send({ error: 'VPS query failed', detail: err.message });
    }
  });

  /**
   * GET /api/control/secrets
   * List secrets (names only, never values)
   */
  app.get('/secrets', async (_req, reply) => {
    try {
      const result = await vpsQuery<any>(`
        const rows = await sql\`
          SELECT 
            s.id, s.company_id, s.name, s.provider, s.key, s.status,
            s.last_resolved_at, s.last_rotated_at,
            c.name as company_name,
            (SELECT COUNT(*) FROM secret_access_events sae WHERE sae.secret_id = s.id) as access_count
          FROM company_secrets s
          JOIN companies c ON c.id = s.company_id
          ORDER BY c.name, s.name
        \`;
        return rows;
      `);
      return reply.send(result);
    } catch (err: any) {
      return reply.status(503).send({ error: 'VPS query failed', detail: err.message });
    }
  });
  // =============================================================================
  // Audit — comprehensive anti-bloat verification
  // =============================================================================

  /**
   * GET /api/control/audit
   * Run full anti-bloat verification across all agents and companies.
   * Executes the audit script directly on the VPS container.
   */
  app.get('/audit', async (_req, reply) => {
    try {
      const result = await vpsQuery<any>(`
        const results = { passes: 0, warnings: 0, failures: 0, details: [] };
        function pass(t, m) { results.passes++; }
        function warn(t, m) { results.warnings++; results.details.push({status:'warn',test:t,msg:m}); }
        function fail(t, m) { results.failures++; results.details.push({status:'fail',test:t,msg:m}); }

        const mandatory = ['context-budget-guard','thin-context-policy','no-progress-guard'];
        const companies = await sql\`SELECT id, name FROM companies\`;
        
        for (const c of companies) {
          const sk = await sql\`SELECT slug FROM company_skills WHERE company_id = \${c.id} AND slug = ANY(\${mandatory})\`;
          const found = sk.map(s=>s.slug);
          for (const m of mandatory) { if(found.includes(m)) pass('s',m); else fail('skills', c.name+' MISSING '+m); }
        }
        
        const agents = await sql\`
          SELECT a.id, a.name, a.status,
            a.adapter_config->>'maxTurnsPerRun' as turns,
            a.adapter_config->>'graceSec' as grace,
            a.runtime_config as rc,
            c.name as cname
          FROM agents a JOIN companies c ON c.id = a.company_id
        \`;
        
        for (const a of agents) {
          const l = a.cname+'/'+a.name;
          if(parseInt(a.turns||'0')>0) pass('t',l); else fail('turns',l+' NO turn limit');
          if(parseInt(a.grace||'0')>0) pass('g',l); else fail('grace',l+' NO timeout');
          const hb = (a.rc||{}).heartbeat||{};
          if(hb.enabled===false) pass('h',l); else fail('heartbeat',l+' ENABLED');
          if(hb.maxConcurrentRuns>0 && hb.maxConcurrentRuns<=5) pass('c',l); else fail('concurrent',l+' '+hb.maxConcurrentRuns);
          if(a.status==='error') fail('status',l+' ERROR'); else pass('s',l);
          
          const bp = await sql\`SELECT hard_stop_enabled FROM budget_policies WHERE scope_type='agent' AND scope_id=\${a.id} AND is_active=true LIMIT 1\`;
          if(bp.length>0 && bp[0].hard_stop_enabled) pass('b',l); else fail('budget',l+' NO budget');
        }
        
        for (const c of companies) {
          const bp = await sql\`SELECT amount FROM budget_policies WHERE scope_type='company' AND scope_id=\${c.id} AND window_kind='daily' AND is_active=true LIMIT 1\`;
          if(bp.length>0) pass('cb',c.name); else fail('company_budget',c.name+' NO daily budget');
        }
        
        return {
          timestamp: new Date().toISOString(),
          passes: results.passes,
          warnings: results.warnings,
          failures: results.failures,
          verdict: results.failures===0 ? 'PASSED' : 'FAILED',
          details: results.details,
        };
      `);
      return reply.send(result);
    } catch (err: any) {
      return reply.status(503).send({ error: 'Audit failed', detail: err.message });
    }
  });
};

