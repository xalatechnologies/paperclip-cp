/**
 * PCC API Client
 * Typed wrapper for all PCC API calls from Next.js server components.
 * All requests go through the PCC Fastify API → Paperclip proxy.
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
const API_KEY = process.env.CONTROL_CENTER_API_KEY ?? '';

const AUTH = { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' };

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T | null> {
  try {
    const res = await fetch(`${API_URL}${path}`, {
      ...init,
      headers: { ...AUTH, ...(init?.headers ?? {}) },
      cache: 'no-store',
    });
    if (!res.ok) return null;
    return res.json() as Promise<T>;
  } catch {
    return null;
  }
}

// --- Types ---

export interface Company {
  id: string;
  name: string;
  description: string | null;
  status: string;
  issuePrefix: string;
  issueCounter: number;
  budgetMonthlyCents: number;
  spentMonthlyCents: number;
  brandColor: string | null;
  logoUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Agent {
  id: string;
  companyId: string;
  name: string;
  description: string | null;
  status: 'idle' | 'active' | 'error' | 'paused';
  adapterType: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Issue {
  id: string;
  companyId: string;
  title: string;
  description: string | null;
  status: string;
  priority: string | null;
  prefix: string;
  number: number;
  assignedAgentId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Skill {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  tokenEstimate: number;
  version: string;
  createdAt: string;
}

export interface PccSession {
  userId: string;
  email: string;
  loggedInAt: string;
  baseUrl: string;
}

// --- Company endpoints ---

export const getCompanies = () =>
  apiFetch<Company[]>('/api/paperclip/companies');

export const getCompany = (id: string) =>
  apiFetch<Company>(`/api/paperclip/companies/${id}`);

// --- Agent endpoints ---

export const getAgentsByCompany = (companyId: string) =>
  apiFetch<Agent[]>(`/api/paperclip/companies/${companyId}/agents`);

export const getAgent = (agentId: string) =>
  apiFetch<Agent>(`/api/paperclip/agents/${agentId}`);

// --- Issue endpoints ---

export const getIssuesByCompany = (companyId: string, limit = 20) =>
  apiFetch<Issue[] | { items: Issue[] }>(`/api/paperclip/companies/${companyId}/issues?limit=${limit}`);

// --- Skills ---

export const getSkillsCatalog = () =>
  apiFetch<Skill[]>('/api/paperclip/skills/catalog');

// --- Session ---

export const getSession = () =>
  apiFetch<PccSession>('/api/paperclip/session');

// --- Health ---

export const getHealth = () =>
  apiFetch<{ status: string; paperclip: string; db: string; version: string }>('/health');

// --- Control Plane (VPS DB reads) ---

export interface CostSummary {
  total: { total_tokens: string; cached_tokens: string; total_cost_cents: string; event_count: string };
  today: { tokens: string; events: string };
  topAgents: Array<{
    name: string; adapter_type: string; tokens: string; cached: string; events: string; cost_cents: string;
  }>;
}

export interface ControlCompany {
  id: string;
  name: string;
  issue_prefix: string;
  agent_count: string;
  project_count: string;
  total_tokens: string;
  skill_count: string;
  secret_count: string;
}

export async function getCostSummary(): Promise<CostSummary | null> {
  return apiFetch<CostSummary>('/api/control/costs/summary');
}

export async function getControlCompanies(): Promise<ControlCompany[] | null> {
  return apiFetch<ControlCompany[]>('/api/control/companies');
}

// --- Helpers ---

export function statusClasses(status: string): string {
  if (status === 'active') return 'bg-success/10 text-success';
  if (status === 'error') return 'bg-danger/10 text-danger';
  if (status === 'paused') return 'bg-warning/10 text-warning';
  return 'bg-muted text-muted-foreground';
}

export function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
  });
}

export function fmtRelative(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}
