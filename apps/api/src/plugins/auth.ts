import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import fp from 'fastify-plugin';

// =============================================================================
// Bearer API Key Authentication Plugin
//
// All routes automatically require X-API-Key or Authorization: Bearer <key>
// The key is validated against CONTROL_CENTER_API_KEY env var.
// The /health endpoint is excluded.
// =============================================================================

const PUBLIC_PATHS = ['/health'];

const authPlugin: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
    // Skip auth for public paths
    if (PUBLIC_PATHS.some((p) => request.url.startsWith(p))) {
      return;
    }

    const apiKey = process.env.CONTROL_CENTER_API_KEY;
    if (!apiKey) {
      fastify.log.warn('CONTROL_CENTER_API_KEY not set — API is unprotected!');
      return;
    }

    // Extract key from Authorization: Bearer <key> or X-API-Key: <key>
    const authHeader = request.headers.authorization;
    const xApiKey = request.headers['x-api-key'];

    let providedKey: string | undefined;

    if (authHeader?.startsWith('Bearer ')) {
      providedKey = authHeader.slice(7);
    } else if (typeof xApiKey === 'string') {
      providedKey = xApiKey;
    }

    if (!providedKey || providedKey !== apiKey) {
      reply.status(401).send({
        success: false,
        error: 'Unauthorized. Provide a valid API key via Authorization: Bearer <key> or X-API-Key header.',
      });
      return;
    }
  });
};

export { authPlugin };
// Use fastify-plugin so the hook applies globally (not scoped)
export default fp(authPlugin, { name: 'auth' });
