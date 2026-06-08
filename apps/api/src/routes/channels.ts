/**
 * Channels (audit + notification channels) Routes
 *
 * auditRoutes    → /api/audit
 * notificationsRoutes → /api/notifications
 *
 * Both migrated from SQLite to Convex.
 */

import type { FastifyPluginAsync } from 'fastify';
import { encrypt } from '@pcc/config';
import { convex, api } from '../convex-client.js';
import { paginationOptsValidator } from 'convex/server';

// ── Audit Routes — /api/audit ─────────────────────────────────────────────

export const auditRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get<{ Querystring: { limit?: string } }>(
    '/',
    async (req, reply) => {
      const limit = parseInt(req.query.limit ?? '100', 10);
      const data = await convex.query(api.audit.listRecent, {
        limit: Math.min(limit, 200),
      });
      return reply.send({ success: true, data });
    },
  );
};

// ── Notification Channels Routes — /api/notifications ─────────────────────

export const notificationsRoutes: FastifyPluginAsync = async (fastify) => {

  fastify.get<{ Querystring: { company_id?: string } }>('/', async (req, reply) => {
    const data = await convex.query(api.channels.list, {
      paperclip_company_id: req.query.company_id,
    });
    return reply.send({ success: true, data });
  });

  fastify.post<{
    Body: {
      name:   string;
      type:   'slack' | 'teams' | 'webhook' | 'email';
      config: Record<string, string>;
      events: string[];
      paperclipCompanyId?: string;
      enabled?: boolean;
    };
  }>('/', async (req, reply) => {
    const { name, type, config, events, paperclipCompanyId, enabled = true } = req.body;
    if (!name || !type || !config || !events?.length) {
      return reply.status(400).send({ success: false, error: 'name, type, config, events required' });
    }

    const encryptedConfig = encrypt(JSON.stringify(config));
    const result = await convex.mutation(api.channels.create, {
      name,
      type,
      enabled,
      paperclip_company_id: paperclipCompanyId,
      encryptedConfig,
      events,
    });

    return reply.status(201).send({ success: true, data: result });
  });

  fastify.patch<{ Params: { id: string }; Body: { enabled: boolean } }>(
    '/:id/toggle',
    async (req, reply) => {
      await convex.mutation(api.channels.toggle, {
        id:      req.params.id as any,
        enabled: req.body.enabled,
      });
      return reply.send({ success: true });
    },
  );

  fastify.delete<{ Params: { id: string } }>('/:id', async (req, reply) => {
    const result = await convex.mutation(api.channels.remove, { id: req.params.id as any });
    if (!result) return reply.status(404).send({ success: false, error: 'Channel not found' });
    return reply.send({ success: true, message: `Channel "${(result as any).name}" removed` });
  });

  fastify.post<{ Params: { id: string } }>('/:id/test', async (_req, reply) => {
    return reply.send({
      success: true,
      message: 'Test ping queued (Slack/Teams integration coming in Phase 3)',
    });
  });
};
