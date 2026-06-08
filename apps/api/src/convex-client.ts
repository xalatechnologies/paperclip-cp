/**
 * Convex HTTP Client — Fastify API singleton
 *
 * Two clients:
 *   `convex`      — public functions (api.*) — mirrors what the web client sees
 *   `convexAdmin` — internal functions (internal.*) — encrypted secrets, audit inserts
 *                   requires PCC_ADMIN_KEY from Convex dashboard → Settings → Deploy Keys
 *
 * PCC_ADMIN_KEY is intentionally NOT named CONVEX_DEPLOY_KEY — the Convex CLI
 * reads that env var and uses it for authentication, losing env-var management
 * permissions (which require account login, not a deploy key).
 *
 * Type notes:
 *   - setAdminAuth() exists at runtime but is not in Convex TypeScript types.
 *     We declare it via module augmentation below.
 *   - FunctionReference<T> defaults visibility to "public". Internal functions
 *     use callInternal* helpers that accept any visibility.
 */

import { ConvexHttpClient } from 'convex/browser';
import type { FunctionReference, FunctionReturnType, OptionalRestArgs } from 'convex/server';
import { api, internal } from '../../../convex/_generated/api.js';

// ── Module augmentation — add missing runtime method to the types ─────────────
declare module 'convex/browser' {
  interface ConvexHttpClient {
    /** Sets the admin deploy key for calling internal.* functions. */
    setAdminAuth(adminToken: string, actingAs?: { subject: string; issuer: string }): void;
  }
}

const CONVEX_URL =
  process.env.NEXT_PUBLIC_CONVEX_URL ??
  process.env.CONVEX_URL ??
  'https://blessed-bandicoot-99.eu-west-1.convex.cloud';

// Public client — used for all non-sensitive reads/writes
export const convex = new ConvexHttpClient(CONVEX_URL);

// Admin client — used when calling internalQuery / internalMutation from the API
// (e.g. secrets.getEncrypted, audit.append, knowledge.insertChunks, config.get)
export const convexAdmin = new ConvexHttpClient(CONVEX_URL);

/**
 * Initialize admin authentication on the convexAdmin client.
 * Must be called AFTER dotenv/env-file has loaded PCC_ADMIN_KEY.
 * Called from main() in index.ts once env is guaranteed to be set.
 */
export function initAdminAuth(): void {
  const key = process.env.PCC_ADMIN_KEY ?? process.env.CONVEX_DEPLOY_KEY;
  if (key) {
    convexAdmin.setAdminAuth(key);
    console.log('[convex] Admin auth initialized ✓');
  } else {
    console.warn(
      '[convex] PCC_ADMIN_KEY not set — internal functions will fail.\n' +
      '         Add PCC_ADMIN_KEY to root .env (get from Convex dashboard → Settings → Deploy Keys)'
    );
  }
}

// ── Type-safe helpers for calling internal functions ──────────────────────────
//
// ConvexHttpClient.mutation/query only accept FunctionReference<T, "public">.
// Internal functions have visibility "internal". These wrappers cast safely.

/** Call an internal Convex mutation (requires admin client). */
export function callInternalMutation<F extends FunctionReference<'mutation', any, any, any>>(
  fn: F,
  args?: F extends FunctionReference<'mutation', any, infer A, any> ? A : Record<string, unknown>,
): Promise<F extends FunctionReference<'mutation', any, any, infer R> ? R : unknown> {
  return (convexAdmin as any).mutation(fn, args);
}

/** Call an internal Convex query (requires admin client). */
export function callInternalQuery<F extends FunctionReference<'query', any, any, any>>(
  fn: F,
  args?: F extends FunctionReference<'query', any, infer A, any> ? A : Record<string, unknown>,
): Promise<F extends FunctionReference<'query', any, any, infer R> ? R : unknown> {
  return (convexAdmin as any).query(fn, args);
}

// Re-export for convenience — route files import everything from here
export { api, internal };
