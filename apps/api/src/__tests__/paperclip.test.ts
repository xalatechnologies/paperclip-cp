import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import Fastify from 'fastify';
import { paperclipProxyRoutes } from '../routes/paperclip';

describe('Paperclip Proxy Routes', () => {
  const fastify = Fastify();
  let fetchMock: any;

  beforeAll(async () => {
    // Add the paperclip routes to our dummy app
    fastify.register(paperclipProxyRoutes, { prefix: '/api/paperclip' });
    await fastify.ready();
    fetchMock = vi.spyOn(global, 'fetch');
  });

  afterAll(async () => {
    await fastify.close();
  });

  it('proxies GET /api/paperclip/companies correctly', async () => {
    // Mock the session fetch
    fetchMock.mockResolvedValueOnce({
      ok: true,
      headers: { get: () => 'session-cookie=123' },
      json: async () => ({}),
    });

    // Mock the target API fetch
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      json: async () => [{ id: 'company-1', name: 'Test Company' }],
    });

    const response = await fastify.inject({
      method: 'GET',
      url: '/api/paperclip/companies',
    });

    console.log('Response:', response.statusCode, response.json());
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual([{ id: 'company-1', name: 'Test Company' }]);
    
    // Check that fetch was called correctly for the target API
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/companies'),
      expect.objectContaining({
        headers: expect.objectContaining({
          cookie: 'session-cookie=123',
        }),
      })
    );
  });
});
