'use client';
// Force recompile to pick up NEXT_PUBLIC_ env var
/**
 * Agents Page — Live Client Component
 *
 * Uses /api/control/agents (VPS Postgres direct) for enriched live data.
 * Polls every 30s. "Needs attention" banner only fires on confirmed errors.
 * Expandable rows show model, turn limit, grace timeout, heartbeat config.
 */

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  Bot, AlertCircle, Activity, Clock,
  RefreshCw, ChevronDown, ChevronRight,
  CheckCircle, PauseCircle, XCircle, Loader2,
} from 'lucide-react';
import { TEXT } from '@/lib/tokens';
import { cn } from '@/lib/utils';
import {
  PageHeader, PageBody, PageLayout,
  StatCard, StatGrid,
  MonoBadge,
  DataTable, TR, TD,
  RightSidebar, SidebarSection, SidebarDivider,
  MiniProgressBar,
} from '@/components/ui';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
const KEY = process.env.NEXT_PUBLIC_CONTROL_CENTER_API_KEY ?? '';

// ── Types ──────────────────────────────────────────────────────────────────

/** Matches the VPS control route: GET /api/control/agents */
interface Agent {
  id: string;
  company_id: string;
  company_name: string;
  name: string;
  role: string | null;
  title: string | null;
  status: 'idle' | 'active' | 'error' | 'paused';
  adapter_type: string | null;
  model: string | null;             // extracted from adapter_config->>model
  max_turns: string | null;         // from adapter_config->>maxTurnsPerRun
  grace_sec: string | null;         // from adapter_config->>graceSec
  runtime_config: Record<string, any> | null;
  budget_monthly_cents: number | null;
  spent_monthly_cents: number | null;
  last_heartbeat_at: string | null;
}

// ── Helpers ────────────────────────────────────────────────────────────────

async function safeFetch(path: string): Promise<any[]> {
  try {
    const res = await fetch(`${API}${path}`, {
      headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    });
    if (!res.ok) return [];
    const d = await res.json();
    return Array.isArray(d) ? d : [];
  } catch { return []; }
}

function fmtRelative(iso: string | null): string {
  if (!iso) return 'never';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1)  return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// ── Status Badge ──────────────────────────────────────────────────────────

function AgentStatusBadge({ status }: { status: Agent['status'] }) {
  const configs: Record<Agent['status'], { icon: any; label: string; cls: string }> = {
    active: { icon: Activity,     label: 'Active',  cls: 'text-success bg-success/10 border-success/20' },
    idle:   { icon: CheckCircle,  label: 'Idle',    cls: 'text-muted-foreground bg-muted/30 border-border' },
    paused: { icon: PauseCircle,  label: 'Paused',  cls: 'text-warning bg-warning/10 border-warning/20' },
    error:  { icon: XCircle,      label: 'Error',   cls: 'text-destructive bg-destructive/10 border-destructive/20' },
  };
  const { icon: Icon, label, cls } = configs[status] ?? configs.idle;
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-[11px] font-semibold px-2 py-1 rounded-full border', cls)}>
      <Icon className="w-3 h-3" />
      {label}
    </span>
  );
}

// ── Agent Row ─────────────────────────────────────────────────────────────

function AgentRow({ agent }: { agent: Agent }) {
  const [expanded, setExpanded] = useState(false);
  const hb = agent.runtime_config ?? {};

  return (
    <>
      <tr className="hover:bg-muted/20 transition-colors">
        {/* Expand toggle */}
        <td className="px-3 py-4 border-b border-border/40 w-8">
          <button
            onClick={() => setExpanded(v => !v)}
            className="text-muted-foreground/30 hover:text-muted-foreground transition-colors"
          >
            {expanded
              ? <ChevronDown className="w-3.5 h-3.5" />
              : <ChevronRight className="w-3.5 h-3.5" />}
          </button>
        </td>

        <TD sub={<span className="font-mono">{agent.id.slice(0, 10)}…</span>}>
          {agent.name}
          {agent.title && (
            <span className="ml-1.5 text-[10px] text-muted-foreground/50">· {agent.title}</span>
          )}
        </TD>

        <TD sub={<span className="text-muted-foreground/40">{agent.company_id.slice(0, 8)}…</span>}>
          <Link href={`/companies/${agent.company_id}`} className={TEXT.link}>
            {agent.company_name}
          </Link>
        </TD>

        <TD>
          {agent.adapter_type
            ? <MonoBadge>{agent.adapter_type}</MonoBadge>
            : <span className="text-muted-foreground/30">—</span>}
        </TD>

        <TD>
          <AgentStatusBadge status={agent.status} />
        </TD>

        <TD>
          {agent.model
            ? <span className="text-[11px] font-mono text-muted-foreground">{agent.model}</span>
            : <span className="text-muted-foreground/30">—</span>}
        </TD>

        <TD>
          <span className="text-[12px] text-muted-foreground">
            {fmtRelative(agent.last_heartbeat_at)}
          </span>
        </TD>
      </tr>

      {/* Expanded config details */}
      {expanded && (
        <tr>
          <td colSpan={7} className="px-10 py-4 border-b border-border/40 bg-muted/5">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-3">
              <div>
                <div className="text-[10px] font-semibold text-muted-foreground/50 uppercase tracking-wider mb-1">
                  Max Turns / Run
                </div>
                <div className="text-[13px] text-card-foreground font-mono">
                  {agent.max_turns ?? '—'}
                </div>
              </div>
              <div>
                <div className="text-[10px] font-semibold text-muted-foreground/50 uppercase tracking-wider mb-1">
                  Grace Timeout
                </div>
                <div className="text-[13px] text-card-foreground font-mono">
                  {agent.grace_sec != null ? `${agent.grace_sec}s` : '—'}
                </div>
              </div>
              <div>
                <div className="text-[10px] font-semibold text-muted-foreground/50 uppercase tracking-wider mb-1">
                  Heartbeat
                </div>
                <div className={cn('text-[13px] font-semibold',
                  (hb as any).heartbeat?.enabled === false ? 'text-success' : 'text-warning')}>
                  {(hb as any).heartbeat?.enabled === false ? 'Disabled ✓' : 'Enabled'}
                </div>
              </div>
              <div>
                <div className="text-[10px] font-semibold text-muted-foreground/50 uppercase tracking-wider mb-1">
                  Budget
                </div>
                <div className="text-[13px] text-card-foreground">
                  {agent.budget_monthly_cents != null
                    ? `$${(agent.budget_monthly_cents / 100).toFixed(0)}/mo`
                    : '—'}
                </div>
              </div>
            </div>

            {agent.status === 'error' && (
              <div className="p-3 rounded-lg bg-destructive/5 border border-destructive/15 text-[12px] text-destructive">
                <span className="font-semibold">Status: Error</span>
                {' — Check VPS logs or '}
                <Link href="/heartbeats" className="underline">heartbeat page</Link>
                {' for details.'}
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

// ══════════════════════════════════════════════════════════════════════════

export default function AgentsPage() {
  const [agents, setAgents]           = useState<Agent[]>([]);
  const [loading, setLoading]         = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [refreshing, setRefreshing]   = useState(false);

  const fetchAll = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    else        setRefreshing(true);

    const data = await safeFetch('/api/control/agents');

    // Sort: error → active → idle → paused
    const order: Record<string, number> = { error: 0, active: 1, idle: 2, paused: 3 };
    data.sort((a: Agent, b: Agent) =>
      (order[a.status] ?? 4) - (order[b.status] ?? 4)
    );

    setAgents(data);
    setLastRefresh(new Date());
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    fetchAll();
    const interval = setInterval(() => fetchAll(true), 30_000);
    return () => clearInterval(interval);
  }, [fetchAll]);

  // ── Derived stats ──────────────────────────────────────────────────────
  const errorAgents  = agents.filter(a => a.status === 'error');
  const activeCount  = agents.filter(a => a.status === 'active').length;
  const idleCount    = agents.filter(a => a.status === 'idle').length;
  const pausedCount  = agents.filter(a => a.status === 'paused').length;
  const adapterTypes = Array.from(new Set(agents.map(a => a.adapter_type).filter(Boolean)));

  // Group by company for sidebar
  const byCompany = agents.reduce<Record<string, Agent[]>>((acc, a) => {
    if (!acc[a.company_id]) acc[a.company_id] = [];
    acc[a.company_id].push(a);
    return acc;
  }, {});

  // ── Sidebar ────────────────────────────────────────────────────────────
  const sidebar = (
    <RightSidebar>
      <SidebarSection title="Status Overview">
        <div className="space-y-2.5">
          {[
            { label: 'Active', value: activeCount,        barClass: 'bg-success/60' },
            { label: 'Error',  value: errorAgents.length, barClass: 'bg-destructive/60' },
            { label: 'Idle',   value: idleCount,          barClass: 'bg-muted-foreground/30' },
            { label: 'Paused', value: pausedCount,        barClass: 'bg-warning/60' },
          ].map(s => (
            <div key={s.label}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[13px] text-muted-foreground">{s.label}</span>
                <span className="text-[13px] font-bold text-card-foreground tabular-nums">{s.value}</span>
              </div>
              <MiniProgressBar value={s.value} max={Math.max(agents.length, 1)} colorClass={s.barClass} />
            </div>
          ))}
        </div>
      </SidebarSection>

      <SidebarDivider />

      <SidebarSection title="Adapter Types">
        <div className="space-y-1.5">
          {adapterTypes.map(at => {
            const count = agents.filter(a => a.adapter_type === at).length;
            return (
              <div key={at} className="flex items-center justify-between py-1">
                <span className="font-mono text-[12px] text-muted-foreground">{at}</span>
                <span className="text-[12px] font-semibold text-card-foreground bg-muted px-2 py-0.5 rounded-md tabular-nums">
                  {count}
                </span>
              </div>
            );
          })}
          {agents.filter(a => !a.adapter_type).length > 0 && (
            <div className="flex items-center justify-between py-1">
              <span className="text-[12px] text-muted-foreground/50 italic">no adapter</span>
              <span className="text-[12px] font-semibold text-muted-foreground tabular-nums">
                {agents.filter(a => !a.adapter_type).length}
              </span>
            </div>
          )}
        </div>
      </SidebarSection>

      <SidebarDivider />

      <SidebarSection title="By Company">
        <div className="space-y-2.5">
          {Object.entries(byCompany).map(([companyId, ags]) => {
            const errs = ags.filter(a => a.status === 'error').length;
            return (
              <div key={companyId}>
                <div className="flex items-center justify-between mb-1">
                  <Link href={`/companies/${companyId}`}
                    className="text-[13px] font-medium text-foreground no-underline hover:text-primary transition-colors">
                    {ags[0].company_name}
                  </Link>
                  <div className="flex items-center gap-1.5">
                    {errs > 0 && <span className="text-[11px] text-destructive font-bold">{errs} err</span>}
                    <span className="text-[13px] font-bold text-card-foreground tabular-nums">{ags.length}</span>
                  </div>
                </div>
                <MiniProgressBar value={ags.length} max={Math.max(agents.length, 1)} colorClass="bg-primary/40" height="h-1" />
              </div>
            );
          })}
        </div>
      </SidebarSection>

      <SidebarDivider />

      <SidebarSection title="Live Status">
        <div className="text-[11px] text-muted-foreground leading-relaxed space-y-1.5">
          <div className="flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
            Auto-refreshes every 30s
          </div>
          {lastRefresh && (
            <div className="text-muted-foreground/50">
              Last: {lastRefresh.toLocaleTimeString()}
            </div>
          )}
        </div>
        <Link href="/heartbeats"
          className="mt-2 flex items-center gap-2 px-3 py-2.5 rounded-lg bg-primary/5 border border-primary/15 hover:bg-primary/10 transition-all no-underline">
          <Activity className="w-3.5 h-3.5 text-primary flex-shrink-0" />
          <div>
            <div className="text-[12px] font-semibold text-primary">Runtime Control</div>
            <div className="text-[10px] text-muted-foreground">Model, turns, retries</div>
          </div>
        </Link>
      </SidebarSection>
    </RightSidebar>
  );

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <PageLayout sidebar={sidebar}>
      <PageHeader
        title="Agents"
        subtitle={loading
          ? 'Loading…'
          : `${agents.length} agents · live status · refreshes every 30s`}
        action={{ label: 'Runtime Control', href: '/heartbeats' }}
        badge={
          <button
            onClick={() => fetchAll(true)}
            disabled={refreshing}
            title="Refresh now"
            className="p-2 rounded-lg border border-border bg-card hover:bg-muted transition-colors disabled:opacity-40"
          >
            <RefreshCw className={cn('w-4 h-4 text-muted-foreground', refreshing && 'animate-spin')} />
          </button>
        }
      />

      <PageBody>
        <StatGrid cols={5}>
          <StatCard label="Total"  value={agents.length}        icon={Bot}         color="text-primary"    ring="primary" />
          <StatCard label="Active" value={activeCount}          icon={Activity}    color="text-success"    ring="success" />
          <StatCard label="Idle"   value={idleCount}            icon={Clock}       color="text-foreground" ring="muted" />
          <StatCard label="Paused" value={pausedCount}          icon={Clock}       color="text-warning"    ring="warning" />
          <StatCard label="Error"  value={errorAgents.length}   icon={AlertCircle}
            color={errorAgents.length > 0 ? 'text-destructive' : 'text-success'}
            ring={errorAgents.length > 0 ? 'destructive' : 'success'} />
        </StatGrid>

        {/* Only shows for confirmed errors from live VPS data */}
        {!loading && errorAgents.length > 0 && (
          <div className="flex items-start gap-3 p-4 rounded-xl border border-destructive/20 bg-destructive/5">
            <AlertCircle className="w-4 h-4 text-destructive flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <div className="text-[13px] font-semibold text-destructive mb-0.5">
                {errorAgents.length} agent{errorAgents.length > 1 ? 's' : ''} need attention
              </div>
              <div className="text-[12px] text-muted-foreground">
                {errorAgents.map(a => `${a.company_name} → ${a.name}`).join(' · ')}
              </div>
              <Link href="/heartbeats" className="text-[11px] text-destructive underline mt-1 inline-block">
                View heartbeats for details →
              </Link>
            </div>
          </div>
        )}

        {loading ? (
          <div className="py-12 flex items-center justify-center gap-2 text-muted-foreground/40">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="text-[13px]">Loading agents from VPS…</span>
          </div>
        ) : (
          <DataTable
            columns={[
              { key: 'expand',    label: '' },
              { key: 'agent',     label: 'Agent' },
              { key: 'company',   label: 'Company' },
              { key: 'adapter',   label: 'Adapter' },
              { key: 'status',    label: 'Status' },
              { key: 'model',     label: 'Model' },
              { key: 'heartbeat', label: 'Heartbeat' },
            ]}
            hasRows={agents.length > 0}
            empty={{ icon: Bot, message: 'No agents registered on VPS' }}
          >
            {agents.map(agent => (
              <AgentRow key={agent.id} agent={agent} />
            ))}
          </DataTable>
        )}
      </PageBody>
    </PageLayout>
  );
}
