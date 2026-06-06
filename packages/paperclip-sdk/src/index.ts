/**
 * Paperclip SDK
 *
 * Typed HTTP client for the Paperclip API.
 * All endpoint paths verified from live API discovery (June 2026).
 *
 * Auth model: session cookie (handled by the PCC API proxy).
 * Direct SDK usage requires a valid session cookie.
 */

export interface PaperclipSDKConfig {
  baseUrl: string;
  /** Session cookie string (format: "key=value; key2=value2") */
  sessionCookie: string;
  timeoutMs?: number;
}

export interface PaperclipCompany {
  id: string;
  name: string;
  issuePrefix: string;       // e.g. "XAL", "DOX"
  issueCounter?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface PaperclipAgent {
  id: string;
  name: string;
  role?: string;
  status: string;            // "idle" | "busy" | "error" | "offline"
  companyId: string;
  adapter?: string;          // "claude_local" | "openclaw_gateway"
  adapterModel?: string;     // e.g. "claude-opus-4-5"
  adapterConfig?: Record<string, unknown>;
  skills?: string[];
  urlKey?: string;           // URL-safe identifier for the agent
  createdAt?: string;
}

export interface PaperclipSession {
  userId: string;
  email: string;
  name?: string;
  boardId?: string;
}

export interface PaperclipSkill {
  id: string;
  name: string;
  slug: string;
  description?: string;
  tokenEstimate?: number;
}

export interface HeartbeatLogEntry {
  timestamp: string;
  level: 'info' | 'warn' | 'error';
  message: string;
}

export class PaperclipAPIError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = 'PaperclipAPIError';
  }
}

// =============================================================================
// HTTP Client
// =============================================================================

class PaperclipHttpClient {
  private readonly baseUrl: string;
  private sessionCookie: string;
  private readonly timeoutMs: number;

  constructor(config: PaperclipSDKConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, '');
    this.sessionCookie = config.sessionCookie;
    this.timeoutMs = config.timeoutMs ?? 30_000;
  }

  updateCookie(cookie: string) {
    this.sessionCookie = cookie;
  }

  private headers(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Cookie: this.sessionCookie,
    };
  }

  async get<T>(path: string): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: 'GET',
      headers: this.headers(),
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new PaperclipAPIError(res.status, `GET ${path} failed: ${body}`);
    }
    return res.json() as Promise<T>;
  }

  async post<T>(path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: this.headers(),
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (!res.ok) {
      const responseBody = await res.text();
      throw new PaperclipAPIError(res.status, `POST ${path} failed: ${responseBody}`);
    }
    return res.json() as Promise<T>;
  }

  async patch<T>(path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: 'PATCH',
      headers: this.headers(),
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (!res.ok) {
      const responseBody = await res.text();
      throw new PaperclipAPIError(res.status, `PATCH ${path} failed: ${responseBody}`);
    }
    return res.json() as Promise<T>;
  }
}

// =============================================================================
// SDK Client
// =============================================================================

export class PaperclipSDK {
  private readonly http: PaperclipHttpClient;

  constructor(config: PaperclipSDKConfig) {
    this.http = new PaperclipHttpClient(config);
  }

  updateSession(cookie: string) {
    this.http.updateCookie(cookie);
  }

  // ---------------------------------------------------------------------------
  // Auth & Session
  // ---------------------------------------------------------------------------

  readonly auth = {
    /** Get current session info. Returns user ID, email, board info. */
    getSession: (): Promise<PaperclipSession> =>
      this.http.get<PaperclipSession>('/api/auth/get-session'),

    /** Health check — public, no auth required. */
    health: (): Promise<{ status: string; version: string }> =>
      this.http.get('/api/health'),
  };

  // ---------------------------------------------------------------------------
  // Companies
  // ---------------------------------------------------------------------------

  readonly companies = {
    /** List all companies accessible to the authenticated user. */
    list: (): Promise<PaperclipCompany[]> =>
      this.http.get<PaperclipCompany[]>('/api/companies'),

    /** Get a single company by ID. */
    get: (companyId: string): Promise<PaperclipCompany> =>
      this.http.get<PaperclipCompany>(`/api/companies/${companyId}`),

    /** List all agents in a company. */
    agents: (companyId: string): Promise<PaperclipAgent[]> =>
      this.http.get<PaperclipAgent[]>(`/api/agents/list?companyId=${companyId}`),
  };

  // ---------------------------------------------------------------------------
  // Agents
  // ---------------------------------------------------------------------------

  readonly agents = {
    /** Get detailed agent info by ID. */
    get: (agentId: string): Promise<PaperclipAgent> =>
      this.http.get<PaperclipAgent>(`/api/agents/${agentId}`),

    /** List agents by company ID. */
    listByCompany: (companyId: string): Promise<PaperclipAgent[]> =>
      this.http.get<PaperclipAgent[]>(`/api/agents/list?companyId=${companyId}`),

    /** Get heartbeat log for an agent's run. */
    heartbeatLog: (runId: string): Promise<HeartbeatLogEntry[]> =>
      this.http.get<HeartbeatLogEntry[]>(`/api/heartbeat-runs/${runId}/log`),
  };

  // ---------------------------------------------------------------------------
  // Skills
  // ---------------------------------------------------------------------------

  readonly skills = {
    /** Get the skills catalog (all available skills). */
    catalog: (): Promise<PaperclipSkill[]> =>
      this.http.get<PaperclipSkill[]>('/api/skills/catalog'),
  };
}

// =============================================================================
// Factory
// =============================================================================

export function createPaperclipSDK(config?: Partial<PaperclipSDKConfig>): PaperclipSDK {
  const baseUrl = config?.baseUrl ?? process.env.PAPERCLIP_BASE_URL ?? '';
  const sessionCookie = config?.sessionCookie ?? process.env.PAPERCLIP_SESSION_COOKIE ?? '';

  if (!baseUrl) throw new Error('PAPERCLIP_BASE_URL is not set');

  return new PaperclipSDK({ baseUrl, sessionCookie, ...config });
}

export default PaperclipSDK;
