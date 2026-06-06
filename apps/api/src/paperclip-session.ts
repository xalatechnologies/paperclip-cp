/**
 * Paperclip Session Manager
 *
 * Handles programmatic authentication with the Paperclip API.
 * Paperclip uses better-auth with email/password credentials.
 *
 * Discovered auth flow (via VPS exploration):
 *   1. POST /api/auth/sign-in/email  →  200 + Set-Cookie + token in body
 *   2. Use cookie `paperclip-default.session_token` for all subsequent calls
 *   3. GET /api/auth/get-session  →  verify session is alive
 *
 * Cookie format: `<token>.<hmac-signature>` (better-auth signed session)
 * The full cookie value (including signature) is in the Set-Cookie header.
 *
 * NO CSRF tokens required. Just the Origin header.
 */

export interface PaperclipSession {
  cookie: string;          // Full cookie string: "name=value"
  token: string;           // Raw token (from JSON response)
  userId: string;
  email: string;
  name: string;
  loggedInAt: number;
}

const SESSION_TTL_MS = 6 * 24 * 60 * 60 * 1000; // Re-login after 6 days (cookie expires in 7 days)
const COOKIE_NAME = 'paperclip-default.session_token';

let _session: PaperclipSession | null = null;
let _loginPromise: Promise<PaperclipSession> | null = null;

export function getBaseUrl(): string {
  return (process.env.PAPERCLIP_BASE_URL ?? '').replace(/\/$/, '');
}

/**
 * Perform the better-auth email/password sign-in.
 * Returns a session with the cookie string ready to use.
 */
async function doLogin(): Promise<PaperclipSession> {
  const base = getBaseUrl();
  const email = process.env.PAPERCLIP_EMAIL ?? '';
  const password = process.env.PAPERCLIP_PASSWORD ?? '';

  if (!base) throw new Error('PAPERCLIP_BASE_URL is not set');
  if (!email || !password) throw new Error('PAPERCLIP_EMAIL and PAPERCLIP_PASSWORD must be set in .env');

  const res = await fetch(`${base}/api/auth/sign-in/email`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      // better-auth requires Origin header for CSRF protection
      Origin: base,
      Referer: `${base}/auth`,
    },
    body: JSON.stringify({ email, password }),
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Paperclip login failed (${res.status}): ${body}`);
  }

  const data = (await res.json()) as {
    token: string;
    user: { id: string; email: string; name: string };
    redirect?: boolean;
  };

  if (!data.token) {
    throw new Error('Paperclip login returned no token — check credentials');
  }

  // Extract the full signed cookie value from the Set-Cookie header
  const setCookieHeader = res.headers.get('set-cookie') ?? '';
  const cookieValue = setCookieHeader
    ? setCookieHeader.split(';')[0].replace(`${COOKIE_NAME}=`, '')
    : data.token;

  const cookie = `${COOKIE_NAME}=${cookieValue}`;
  const session: PaperclipSession = {
    cookie,
    token: data.token,
    userId: data.user.id,
    email: data.user.email,
    name: data.user.name,
    loggedInAt: Date.now(),
  };

  console.log(`✅ Paperclip authenticated: ${session.email} (userId: ${session.userId})`);
  return session;
}

/**
 * Get (or create) the current Paperclip session.
 * Deduplicates concurrent login calls via promise sharing.
 */
export async function getSession(forceRefresh = false): Promise<PaperclipSession> {
  const isStale = _session && (Date.now() - _session.loggedInAt > SESSION_TTL_MS);

  if (!_session || forceRefresh || isStale) {
    _loginPromise ??= doLogin()
      .then((s) => {
        _session = s;
        _loginPromise = null;
        return s;
      })
      .catch((err) => {
        _loginPromise = null;
        throw err;
      });
    return _loginPromise;
  }

  return _session;
}

/**
 * Invalidate the cached session — triggers fresh login on next use.
 */
export function invalidateSession(): void {
  _session = null;
}

/**
 * Return the cookie name used by Paperclip (useful for reference).
 */
export const PAPERCLIP_COOKIE_NAME = COOKIE_NAME;
