/**
 * Secrets Routes — /api/secrets
 *
 * All reads/writes go through Convex (replaced SQLite).
 * Encryption happens in this file — Convex only ever stores the cipher.
 * internalQuery `getEncrypted` requires CONVEX_DEPLOY_KEY (admin client).
 */

import type { FastifyPluginAsync } from 'fastify';
import { encrypt, decrypt } from '@pcc/config';
import { convex, convexAdmin, callInternalMutation, callInternalQuery, api, internal } from '../convex-client.js';

export const secretsRoutes: FastifyPluginAsync = async (fastify) => {

  // List all secrets — metadata only, never the encrypted value
  fastify.get('/', async (_req, reply) => {
    const data = await convex.query(api.secrets.list, {});
    return reply.send({ success: true, data });
  });

  fastify.get<{ Querystring: { companyId?: string } }>('/by-company', async (req, reply) => {
    if (!req.query.companyId) {
      return reply.status(400).send({ success: false, error: 'companyId required' });
    }
    const data = await convex.query(api.secrets.listByCompany, {
      paperclip_company_id: req.query.companyId,
    });
    return reply.send({ success: true, data });
  });

  // Store a new secret — value is encrypted server-side, never stored in plaintext
  fastify.post<{
    Body: {
      name: string;
      value: string;
      scope?: string;
      paperclipCompanyId?: string;
      paperclipAgentId?: string;
      description?: string;
      rotateAfterDays?: number;
    };
  }>('/', async (req, reply) => {
    const { name, value, scope = 'global', paperclipCompanyId, paperclipAgentId, description, rotateAfterDays } = req.body;
    if (!name || !value) {
      return reply.status(400).send({ success: false, error: 'name and value are required' });
    }

    const encryptedValue = encrypt(value);
    const result = await convex.mutation(api.secrets.create, {
      name,
      encryptedValue,
      scope,
      paperclip_company_id: paperclipCompanyId,
      paperclip_agent_id:   paperclipAgentId,
      description,
      rotate_after_days:    rotateAfterDays,
    });

    // Fire-and-forget audit log via admin client
    callInternalMutation(internal.audit.append, {
      action:        'secret.create',
      actor_id:      'api',
      resource_type: 'secret',
      resource_id:   result._id as string,
      metadata:      JSON.stringify({ name, scope }),
      ip_address:    req.ip,
    }).catch(console.error);

    return reply.status(201).send({
      success: true,
      data: result,
      message: 'Secret stored (AES-256-GCM encrypted)',
    });
  });

  // Use a secret — decrypt + return value, ALWAYS audited, never a GET
  fastify.post<{ Params: { id: string }; Body: { reason: string } }>(
    '/:id/use',
    async (req, reply) => {
      const { reason } = req.body ?? {};
      if (!reason) {
        return reply.status(400).send({ success: false, error: 'reason is required for audit trail' });
      }

      // Internal query — only accessible with admin key
      const secret = await callInternalQuery(internal.secrets.getEncrypted, {
        id: req.params.id as any,
      });
      if (!secret) return reply.status(404).send({ success: false, error: 'Secret not found' });

      let value: string;
      try {
        value = decrypt(secret.encryptedValue);
      } catch {
        return reply.status(500).send({ success: false, error: 'Decryption failed — key mismatch?' });
      }

      callInternalMutation(internal.audit.append, {
        action:        'secret.read',
        actor_id:      'api',
        resource_type: 'secret',
        resource_id:   secret._id as string,
        metadata:      JSON.stringify({ name: secret.name, reason }),
        ip_address:    req.ip,
      }).catch(console.error);

      return reply.send({
        success: true,
        data: { id: secret._id, name: secret.name, value },
      });
    },
  );

  // Update secret description / rotate value
  fastify.patch<{
    Params: { id: string };
    Body: { value?: string; description?: string; rotateAfterDays?: number };
  }>('/:id', async (req, reply) => {
    const updates: Record<string, unknown> = {};
    if (req.body.value !== undefined) updates.encryptedValue = encrypt(req.body.value);
    if (req.body.description !== undefined) updates.description = req.body.description;
    if (req.body.rotateAfterDays !== undefined) updates.rotate_after_days = req.body.rotateAfterDays;

    const result = await convex.mutation(api.secrets.update, {
      id: req.params.id as any,
      ...updates,
    });
    return reply.send({ success: true, data: result });
  });

  // Delete a secret
  fastify.delete<{ Params: { id: string } }>('/:id', async (req, reply) => {
    const result = await convex.mutation(api.secrets.remove, { id: req.params.id as any });

    callInternalMutation(internal.audit.append, {
      action:        'secret.delete',
      actor_id:      'api',
      resource_type: 'secret',
      resource_id:   req.params.id,
      metadata:      JSON.stringify({ name: (result as any).name }),
      ip_address:    req.ip,
    }).catch(console.error);

    return reply.send({ success: true, message: `Secret "${(result as any).name}" deleted` });
  });
};
