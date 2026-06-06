import type { FastifyPluginAsync } from 'fastify';
import { secretsDb, auditDb } from '../db.js';
import { encrypt, decrypt } from '@pcc/config';

export const secretsRoutes: FastifyPluginAsync = async (fastify) => {

  // List all secrets — metadata only, never the encrypted value
  fastify.get('/', async (_req, reply) => {
    const data = secretsDb.list.all();
    return reply.send({ success: true, data });
  });

  fastify.get<{ Querystring: { companyId?: string } }>('/by-company', async (req, reply) => {
    if (!req.query.companyId) {
      return reply.status(400).send({ success: false, error: 'companyId required' });
    }
    const data = secretsDb.listByCompany.all(req.query.companyId);
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
    }
  }>('/', async (req, reply) => {
    const { name, value, scope = 'global', paperclipCompanyId, paperclipAgentId, description, rotateAfterDays } = req.body;
    if (!name || !value) {
      return reply.status(400).send({ success: false, error: 'name and value are required' });
    }

    const encrypted_value = encrypt(value);
    const result = secretsDb.insert.get({
      name, encrypted_value, scope,
      paperclip_company_id: paperclipCompanyId ?? null,
      paperclip_agent_id: paperclipAgentId ?? null,
      description: description ?? null,
      rotate_after_days: rotateAfterDays ?? null,
    }) as any;

    auditDb.insert.run({
      action: 'secret.create', actor_id: 'api',
      resource_type: 'secret', resource_id: result.id,
      metadata: JSON.stringify({ name, scope }), ip_address: req.ip,
    });

    return reply.status(201).send({
      success: true, data: result,
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

      const secret = secretsDb.getEncrypted.get(req.params.id) as any;
      if (!secret) return reply.status(404).send({ success: false, error: 'Secret not found' });

      let value: string;
      try {
        value = decrypt(secret.encrypted_value);
      } catch {
        return reply.status(500).send({ success: false, error: 'Decryption failed — key mismatch?' });
      }

      auditDb.insert.run({
        action: 'secret.read', actor_id: 'api',
        resource_type: 'secret', resource_id: secret.id,
        metadata: JSON.stringify({ name: secret.name, reason }), ip_address: req.ip,
      });

      return reply.send({
        success: true,
        data: { id: secret.id, name: secret.name, value },
      });
    },
  );

  // Delete a secret
  fastify.delete<{ Params: { id: string } }>('/:id', async (req, reply) => {
    const result = secretsDb.delete.get(req.params.id) as any;
    if (!result) return reply.status(404).send({ success: false, error: 'Secret not found' });

    auditDb.insert.run({
      action: 'secret.delete', actor_id: 'api',
      resource_type: 'secret', resource_id: req.params.id,
      metadata: JSON.stringify({ name: result.name }), ip_address: req.ip,
    });

    return reply.send({ success: true, message: `Secret "${result.name}" deleted` });
  });
};
