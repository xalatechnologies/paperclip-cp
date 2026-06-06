/**
 * Paperclip API Proxy Route
 *
 * Transparently proxies all requests to the hosted Paperclip instance.
 * Authentication is handled via session cookies (managed by paperclip-session.ts).
 *
 * Route: /api/paperclip/* → https://<PAPERCLIP_BASE_URL>/*
 *
 * Known endpoints (discovered from live VPS + DB exploration):
 *   Auth framework:  better-auth (NOT NextAuth)
 *   Cookie name:     paperclip-default.session_token
 *
 *   POST /api/auth/sign-in/email              → login (requires Origin header!)
 *   GET  /api/auth/get-session                → current session info
 *   GET  /api/health                          → public health check
 *   GET  /api/companies                       → list all companies  
 *   GET  /api/companies/:id                   → single company
 *   GET  /api/companies/:id/agents            → agents in company
 *   GET  /api/companies/:id/issues            → issues for company
 *   GET  /api/agents/:id                      → agent detail
 *   GET  /api/skills/catalog                  → all available skills
 */

import type { FastifyPluginAsync } from 'fastify';
import { getSession, invalidateSession, getBaseUrl } from '../paperclip-session.js';

const UPSTREAM_TIMEOUT_MS = 30_000;

export const paperclipProxyRoutes: FastifyPluginAsync = async (fastify) => {

  // Health check for the upstream Paperclip instance (no auth needed)
  fastify.get('/health', async (_req, reply) => {
    const base = getBaseUrl();
    if (!base) return reply.status(503).send({ error: 'PAPERCLIP_BASE_URL not configured' });

    const r = await fetch(`${base}/api/health`, {
      signal: AbortSignal.timeout(5_000),
    }).catch((e) => ({ ok: false, status: 0, json: async () => ({ error: e.message }) }));

    const body = await (r as Response).json().catch(() => ({}));
    return reply.status((r as Response).status ?? 200).send(body);
  });

  // Session info
  fastify.get('/session', async (_req, reply) => {
    try {
      const session = await getSession();
      return reply.send({
        userId: session.userId,
        email: session.email,
        loggedInAt: new Date(session.loggedInAt).toISOString(),
        baseUrl: getBaseUrl(),
      });
    } catch (err: any) {
      return reply.status(503).send({ error: 'Not authenticated', detail: err.message });
    }
  });

  // Refresh/reset session
  fastify.post('/session/refresh', async (_req, reply) => {
    invalidateSession();
    try {
      const session = await getSession(true);
      return reply.send({ success: true, userId: session.userId, email: session.email });
    } catch (err: any) {
      return reply.status(503).send({ success: false, error: err.message });
    }
  });

  // Wildcard proxy — forwards everything else to the Paperclip API with auth
  fastify.all<{ Params: { '*': string } }>('/*', async (req, reply) => {
    const base = getBaseUrl();
    if (!base) return reply.status(503).send({ error: 'PAPERCLIP_BASE_URL not configured' });

    const upstream = `${base}/api/${req.params['*']}${req.url.includes('?') ? '?' + req.url.split('?')[1] : ''}`;

    const proxyRequest = async (retry = false): Promise<Response> => {
      const session = await getSession(retry);

      const headers: Record<string, string> = {
        'Content-Type': req.headers['content-type'] ?? 'application/json',
        Accept: req.headers['accept'] ?? 'application/json',
        Cookie: session.cookie,
        'X-Forwarded-For': req.ip,
        'X-PCC-Proxy': '1',
      };

      return fetch(upstream, {
        method: req.method,
        headers,
        body: ['GET', 'HEAD'].includes(req.method) ? undefined : JSON.stringify(req.body),
        signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
        redirect: 'follow',
      });
    };

    let res = await proxyRequest(false).catch((e) => {
      throw new Error(`Upstream unreachable: ${e.message}`);
    });

    // Auto-retry with fresh session on auth failures
    if (res.status === 401 || res.status === 403) {
      fastify.log.warn(`Paperclip auth failed (${res.status}) — refreshing session`);
      invalidateSession();
      res = await proxyRequest(true);
    }

    const ct = res.headers.get('content-type') ?? 'application/json';
    reply.header('content-type', ct);
    reply.header('x-paperclip-status', String(res.status));

    const body = ct.includes('json')
      ? await res.json().catch(() => null)
      : await res.text();

    return reply.status(res.status).send(body);
  });
};
