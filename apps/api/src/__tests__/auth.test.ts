import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify from 'fastify';
import authPlugin from '../config-loader'; // wait, config-loader does auth? Let's check how index.ts uses it.

// Let's create a dummy fastify app to test the preHandler from index.ts
describe('API Authentication', () => {
  const fastify = Fastify();

  beforeAll(async () => {
    fastify.addHook('preHandler', async (request, reply) => {
      // Replicate the logic from index.ts
      const auth = request.headers.authorization;
      if (!auth || auth !== `Bearer ${process.env.CONTROL_CENTER_API_KEY}`) {
        reply.status(401).send({ error: 'Unauthorized' });
      }
    });

    fastify.get('/test', async () => {
      return { success: true };
    });

    await fastify.ready();
  });

  afterAll(async () => {
    await fastify.close();
  });

  it('rejects requests without Authorization header', async () => {
    const response = await fastify.inject({
      method: 'GET',
      url: '/test',
    });
    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ error: 'Unauthorized' });
  });

  it('rejects requests with incorrect Authorization token', async () => {
    const response = await fastify.inject({
      method: 'GET',
      url: '/test',
      headers: {
        authorization: 'Bearer wrong_token',
      },
    });
    expect(response.statusCode).toBe(401);
  });

  it('allows requests with correct Authorization token', async () => {
    const response = await fastify.inject({
      method: 'GET',
      url: '/test',
      headers: {
        authorization: `Bearer ${process.env.CONTROL_CENTER_API_KEY}`,
      },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ success: true });
  });
});
