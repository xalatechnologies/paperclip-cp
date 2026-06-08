/**
 * Remote Config Bootstrap
 *
 * Fetches all non-bootstrap secrets from Convex at API startup.
 * Injects them into process.env so every module (cron, routes, embeddings)
 * can use process.env.OPENAI_API_KEY etc. without any local file.
 *
 * Required local .env vars (bootstrap only):
 *   CONVEX_DEPLOY_KEY    — admin key to call internal.config.get
 *   CONVEX_URL           — Convex deployment URL
 *   SECRETS_ENCRYPTION_KEY — AES-256 key (cannot live in Convex)
 *   CONTROL_CENTER_API_KEY — Bearer token for API auth
 *
 * All other secrets live in Convex via `npx convex env set`.
 */

import { ConvexHttpClient } from 'convex/browser';
import { internal } from '../../../convex/_generated/api.js';
// Import side-effect: applies the module augmentation that adds setAdminAuth to ConvexHttpClient types
import './convex-client.js';

const CONVEX_URL =
  process.env.NEXT_PUBLIC_CONVEX_URL ??
  process.env.CONVEX_URL ??
  'http://127.0.0.1:3210';

/**
 * Load all remote config vars from Convex and inject into process.env.
 * Call once before starting the Fastify server.
 */
export async function loadRemoteConfig(): Promise<void> {
  // Read key lazily — by the time this runs, --env-file and initAdminAuth() have fired
  const DEPLOY_KEY = process.env.PCC_ADMIN_KEY ?? process.env.CONVEX_DEPLOY_KEY;

  if (!DEPLOY_KEY) {
    console.warn('[config] CONVEX_DEPLOY_KEY not set — skipping remote config load (add it to .env)');
    return;
  }

  let config: Record<string, string | undefined>;

  try {
    const client = new ConvexHttpClient(CONVEX_URL);
    client.setAdminAuth(DEPLOY_KEY);
    config = await (client as any).query(internal.config.get, {});
    console.log('[config] Remote config loaded from Convex ✓');
  } catch (err: any) {
    // Non-fatal on dev if Convex isn't running yet — fall back to local .env
    console.warn(`[config] Remote config load failed (${err.message}) — using local .env only`);
    return;
  }

  // Inject remote values into process.env.
  // Local .env values take precedence (already set), so only inject missing ones.
  let injected = 0;
  for (const [key, value] of Object.entries(config)) {
    if (value && !process.env[key]) {
      process.env[key] = value;
      injected++;
    }
  }

  console.log(`[config] Injected ${injected} remote env vars into process.env`);
}
