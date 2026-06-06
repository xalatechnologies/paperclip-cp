import type { FastifyPluginAsync } from 'fastify';
import { auditDb, channelsDb } from '../db.js';
import { encrypt } from '@pcc/config';

export const auditRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get<{ Querystring: { action?: string; limit?: string } }>(
    '/',
    async (req, reply) => {
      const limit = parseInt(req.query.limit ?? '100', 10);
      const data = req.query.action
        ? auditDb.listByAction.all(req.query.action, limit)
        : auditDb.list.all(limit);

      // Parse metadata JSON field
      const parsed = (data as any[]).map((row) => ({
        ...row,
        metadata: row.metadata ? JSON.parse(row.metadata) : null,
      }));

      return reply.send({ success: true, data: parsed });
    },
  );
};

export const notificationsRoutes: FastifyPluginAsync = async (fastify) => {

  fastify.get('/', async (_req, reply) => {
    const data = (channelsDb.list.all() as any[]).map((r) => ({
      ...r,
      enabled: Boolean(r.enabled),
      events: JSON.parse(r.events),
    }));
    return reply.send({ success: true, data });
  });

  fastify.post<{
    Body: {
      name: string;
      type: 'slack' | 'teams' | 'webhook' | 'email';
      config: Record<string, string>;
      events: string[];
      paperclipCompanyId?: string;
      enabled?: boolean;
    }
  }>('/', async (req, reply) => {
    const { name, type, config, events, paperclipCompanyId, enabled = true } = req.body;
    if (!name || !type || !config || !events?.length) {
      return reply.status(400).send({ success: false, error: 'name, type, config, events required' });
    }

    const encrypted_config = encrypt(JSON.stringify(config));
    const result = channelsDb.insert.get({
      name, type,
      enabled: enabled ? 1 : 0,
      paperclip_company_id: paperclipCompanyId ?? null,
      encrypted_config,
      events: JSON.stringify(events),
    }) as any;

    return reply.status(201).send({ success: true, data: result });
  });

  fastify.patch<{ Params: { id: string }; Body: { enabled: boolean } }>(
    '/:id/toggle',
    async (req, reply) => {
      channelsDb.toggle.run(req.body.enabled ? 1 : 0, req.params.id);
      return reply.send({ success: true });
    },
  );

  fastify.delete<{ Params: { id: string } }>('/:id', async (req, reply) => {
    const result = channelsDb.delete.get(req.params.id) as any;
    if (!result) return reply.status(404).send({ success: false, error: 'Channel not found' });
    return reply.send({ success: true, message: `Channel "${result.name}" removed` });
  });

  // POST /notifications/:id/test — ping the channel (Phase 3: real Slack send)
  fastify.post<{ Params: { id: string } }>('/:id/test', async (_req, reply) => {
    return reply.send({
      success: true,
      message: 'Test ping queued (Slack/Teams integration coming in Phase 3)',
    });
  });
};
