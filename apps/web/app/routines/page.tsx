'use client';

import { useState, useCallback, useEffect } from 'react';
import {
  CalendarClock, Play, RefreshCw, Clock,
  Bot, CheckCircle, AlertTriangle, Activity,
  ToggleRight, ToggleLeft, ChevronDown, ChevronRight,
  Building2, Zap, Timer,
} from 'lucide-react';
import { TEXT, LAYOUT, CARD } from '@/lib/tokens';
import { cn } from '@/lib/utils';
import {
  PageHeader, PageBody, PageLayout,
  StatCard, StatGrid,
  SidebarSection, SidebarDivider, SidebarRow,
  EmptyState,
} from '@/components/ui';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
const AUTH = {
  Authorization: `Bearer ${process.env.NEXT_PUBLIC_CONTROL_CENTER_API_KEY ?? ''}`,
  'Content-Type': 'application/json',
};

async function safeArr(res: Response): Promise<any[]> {
  if (!res.ok) return [];
  try { const d = await res.json(); return Array.isArray(d) ? d : []; }
  catch { return []; }
}

// ── Types (Paperclip VPS schema) ──────────────────────────────────────────

interface Routine {
  id: string;
  name: string;
  cron_expression: string;
  enabled: boolean;
  agent_id: string;
  skill_slug: string | null;
  company_id: string;
  last_run_at: string | null;
  last_status: 'success' | 'failed' | 'triggered' | null;
  run_count: number;
  avg_duration_sec: number | null;
  agent_name: string | null;
  adapter_type: string | null;
  company_name: string | null;
  company_issue_prefix?: string | null;
}

interface RunRecord {
  id: string;
  scheduled_job_id: string;
  started_at: string;
  finished_at: string | null;
  status: string;
  duration_sec: number | null;
  output: string | null;
  error: string | null;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function fmtDuration(sec: number | null) {
  if (sec == null) return '—';
  if (sec < 60) return `${sec.toFixed(0)}s`;
  return `${Math.floor(sec / 60)}m ${(sec % 60).toFixed(0)}s`;
}

function fmtRelative(ts: string | null) {
  if (!ts) return 'Never';
  const diff = Date.now() - new Date(ts).getTime();
  if (diff < 60000) return 'Just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function StatusBadge({ status }: { status: Routine['last_status'] }) {
  if (status === 'success') return (
    <span className="flex items-center gap-1 text-[11px] font-semibold text-success bg-success/10 px-2 py-0.5 rounded-full">
      <CheckCircle className="w-3 h-3" /> success
    </span>
  );
  if (status === 'failed') return (
    <span className="flex items-center gap-1 text-[11px] font-semibold text-destructive bg-destructive/10 px-2 py-0.5 rounded-full">
      <AlertTriangle className="w-3 h-3" /> failed
    </span>
  );
  if (status === 'triggered') return (
    <span className="flex items-center gap-1 text-[11px] font-semibold text-warning bg-warning/10 px-2 py-0.5 rounded-full">
      <Activity className="w-3 h-3" /> triggered
    </span>
  );
  return <span className="text-[11px] text-muted-foreground/50">—</span>;
}

// ── Routine Row ────────────────────────────────────────────────────────────

function RoutineRow({
  routine,
  onToggle,
  onRun,
}: {
  routine: Routine;
  onToggle: (id: string, enabled: boolean) => Promise<void>;
  onRun: (id: string) => Promise<void>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [runs, setRuns] = useState<RunRecord[]>([]);
  const [loadingRuns, setLoadingRuns] = useState(false);
  const [running, setRunning] = useState(false);
  const [toggling, setToggling] = useState(false);

  const fetchRuns = async () => {
    setLoadingRuns(true);
    const res = await fetch(`${API}/api/control/routines/${routine.id}/runs`, { headers: AUTH });
    setRuns(await safeArr(res));
    setLoadingRuns(false);
  };

  const handleExpand = () => {
    const next = !expanded;
    setExpanded(next);
    if (next && runs.length === 0) fetchRuns();
  };

  const handleRun = async () => {
    setRunning(true);
    try { await onRun(routine.id); await fetchRuns(); }
    finally { setRunning(false); }
  };

  const handleToggle = async () => {
    setToggling(true);
    try { await onToggle(routine.id, !routine.enabled); }
    finally { setToggling(false); }
  };

  return (
    <div className={cn('border-b border-border/40 last:border-0 transition-colors', routine.enabled ? '' : 'opacity-60')}>
      <div className="flex items-center gap-4 px-5 py-4 hover:bg-muted/10">
        {/* Expand toggle */}
        <button onClick={handleExpand} className="text-muted-foreground/40 hover:text-muted-foreground transition-colors flex-shrink-0">
          {expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
        </button>

        {/* Name + meta */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2.5 mb-0.5">
            <span className="text-[13px] font-semibold text-card-foreground truncate">{routine.name}</span>
            <code className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded font-mono flex-shrink-0">
              {routine.cron_expression}
            </code>
          </div>
          <div className="flex items-center gap-3 text-[11px] text-muted-foreground flex-wrap">
            {routine.agent_name && (
              <span className="flex items-center gap-1">
                <Bot className="w-3 h-3" /> {routine.agent_name}
              </span>
            )}
            {routine.company_name && (
              <span className="flex items-center gap-1">
                <Building2 className="w-3 h-3" /> {routine.company_name}
              </span>
            )}
            {routine.skill_slug && (
              <span className="flex items-center gap-1">
                <Zap className="w-3 h-3" /> {routine.skill_slug}
              </span>
            )}
          </div>
        </div>

        {/* Stats */}
        <div className="hidden md:flex items-center gap-6 text-[12px] text-muted-foreground flex-shrink-0">
          <div className="text-right">
            <div className="text-[10px] text-muted-foreground/50 mb-0.5">Last run</div>
            <div>{fmtRelative(routine.last_run_at)}</div>
          </div>
          <div className="text-right">
            <div className="text-[10px] text-muted-foreground/50 mb-0.5">Avg</div>
            <div className="flex items-center gap-1"><Timer className="w-3 h-3" />{fmtDuration(routine.avg_duration_sec)}</div>
          </div>
          <div className="text-right">
            <div className="text-[10px] text-muted-foreground/50 mb-0.5">Runs</div>
            <div>{routine.run_count ?? 0}</div>
          </div>
        </div>

        {/* Status + actions */}
        <div className="flex items-center gap-3 flex-shrink-0">
          <StatusBadge status={routine.last_status} />

          <button onClick={handleRun} disabled={running}
            title="Run now"
            className="p-1.5 rounded-lg border border-border bg-card hover:bg-primary/10 hover:border-primary/30 hover:text-primary text-muted-foreground transition-all disabled:opacity-40">
            {running ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
          </button>

          <button onClick={handleToggle} disabled={toggling}
            title={routine.enabled ? 'Disable' : 'Enable'}
            className="transition-colors disabled:opacity-40">
            {routine.enabled
              ? <ToggleRight className="w-5 h-5 text-primary" />
              : <ToggleLeft className="w-5 h-5 text-muted-foreground/40" />}
          </button>
        </div>
      </div>

      {/* Run history panel */}
      {expanded && (
        <div className="px-10 pb-4">
          {loadingRuns ? (
            <div className="py-3 text-center"><RefreshCw className="w-4 h-4 animate-spin mx-auto text-muted-foreground/30" /></div>
          ) : runs.length === 0 ? (
            <div className="text-[12px] text-muted-foreground py-3">No run history yet.</div>
          ) : (
            <div className="space-y-1">
              {runs.map(r => (
                <div key={r.id} className="flex items-start gap-3 py-1.5 border-b border-border/20 last:border-0">
                  <span className={cn('text-[10px] font-semibold px-1.5 py-0.5 rounded flex-shrink-0 mt-0.5',
                    r.status === 'success' ? 'bg-success/10 text-success'
                    : r.status === 'failed' ? 'bg-destructive/10 text-destructive'
                    : 'bg-warning/10 text-warning'
                  )}>{r.status}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                      <span>{fmtRelative(r.started_at)}</span>
                      {r.duration_sec != null && <span className="flex items-center gap-1"><Timer className="w-3 h-3" />{fmtDuration(r.duration_sec)}</span>}
                    </div>
                    {r.error && <div className="text-[11px] text-destructive mt-1 font-mono truncate">{r.error}</div>}
                    {r.output && !r.error && <div className="text-[11px] text-muted-foreground mt-1 font-mono truncate">{r.output}</div>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════
export default function RoutinesPage() {
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [loading, setLoading]   = useState(true);
  const [err, setErr]           = useState<string | null>(null);
  const [filter, setFilter]     = useState<'all' | 'enabled' | 'disabled'>('all');

  const fetchAll = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const res = await fetch(`${API}/api/control/routines`, { headers: AUTH });
      const data = await safeArr(res);
      setRoutines(data);
    } catch (e: any) { setErr(e.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const handleToggle = async (id: string, enabled: boolean) => {
    await fetch(`${API}/api/control/routines/${id}/toggle`, {
      method: 'PATCH', headers: AUTH,
      body: JSON.stringify({ enabled }),
    });
    setRoutines(prev => prev.map(r => r.id === id ? { ...r, enabled } : r));
  };

  const handleRun = async (id: string) => {
    await fetch(`${API}/api/control/routines/${id}/run`, { method: 'POST', headers: AUTH });
    // Refresh after 1s to pick up run_count update
    setTimeout(fetchAll, 1500);
  };

  const filtered = routines.filter(r =>
    filter === 'all' ? true : filter === 'enabled' ? r.enabled : !r.enabled
  );

  const enabledCount  = routines.filter(r => r.enabled).length;
  const successCount  = routines.filter(r => r.last_status === 'success').length;
  const failedCount   = routines.filter(r => r.last_status === 'failed').length;
  const totalRuns     = routines.reduce((a, r) => a + (r.run_count ?? 0), 0);

  // Group by company
  const byCompany = new Map<string, Routine[]>();
  for (const r of filtered) {
    const key = r.company_name ?? 'Unknown';
    const arr = byCompany.get(key) ?? [];
    arr.push(r);
    byCompany.set(key, arr);
  }

  const sidebar = (
    <div className={LAYOUT.rightSidebar}>
      <SidebarSection title="Stats">
        <SidebarRow label="Total"    value={routines.length} />
        <SidebarRow label="Enabled"  value={enabledCount} valueClass="text-primary" />
        <SidebarRow label="Total runs" value={totalRuns} />
        <SidebarRow label="Success"  value={successCount} valueClass="text-success" />
        <SidebarRow label="Failed"   value={failedCount}  valueClass="text-destructive" />
      </SidebarSection>
      <SidebarDivider />
      <SidebarSection title="Filter">
        {(['all', 'enabled', 'disabled'] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={cn('w-full text-left text-[12px] px-2 py-1.5 rounded-lg capitalize transition-colors',
              filter === f ? 'bg-primary/10 text-primary font-semibold' : 'text-muted-foreground hover:bg-muted/50')}>
            {f === 'all' ? `All (${routines.length})` : f === 'enabled' ? `Enabled (${enabledCount})` : `Disabled (${routines.length - enabledCount})`}
          </button>
        ))}
      </SidebarSection>
      <SidebarDivider />
      <SidebarSection title="Source">
        <div className="text-[11px] text-muted-foreground leading-relaxed">
          Routines are read directly from the <strong className="text-foreground">Paperclip VPS</strong> <code className="bg-muted px-1 rounded">scheduled_jobs</code> table. Toggle and Run actions write back to the VPS.
        </div>
      </SidebarSection>
    </div>
  );

  return (
    <PageLayout sidebar={sidebar}>
      <PageHeader
        title="Routines"
        subtitle="Scheduled agent jobs from Paperclip VPS · real-time status · run history"
        badge={
          <button onClick={fetchAll} disabled={loading}
            className="p-2 rounded-lg border border-border bg-card hover:bg-muted transition-colors disabled:opacity-40">
            <RefreshCw className={cn('w-4 h-4 text-muted-foreground', loading && 'animate-spin')} />
          </button>
        }
      />
      <PageBody>
        <StatGrid cols={4}>
          <StatCard label="Scheduled Jobs" value={routines.length}  sub="from VPS"         icon={CalendarClock} color="text-primary"     ring="primary"  />
          <StatCard label="Enabled"         value={enabledCount}     sub="active schedules"  icon={ToggleRight}   color="text-success"     ring="success"  />
          <StatCard label="Total Runs"      value={totalRuns}        sub="all time"          icon={Activity}      color="text-chart-2"     ring="chart2"   />
          <StatCard label="Failed"          value={failedCount}      sub="last status"       icon={AlertTriangle} color="text-destructive" ring="destructive"    />
        </StatGrid>

        {err && (
          <div className="flex items-center gap-3 p-4 rounded-xl border border-warning/20 bg-warning/5">
            <AlertTriangle className="w-4 h-4 text-warning" />
            <div>
              <div className="text-[13px] font-medium text-warning">VPS unavailable</div>
              <div className="text-[11px] text-muted-foreground mt-0.5">{err} — routines will appear when VPS SSH is connected.</div>
            </div>
          </div>
        )}

        {/* Routines by company */}
        {loading ? (
          <div className="py-12 text-center">
            <RefreshCw className="w-5 h-5 animate-spin mx-auto text-muted-foreground/30" />
            <div className="text-[12px] text-muted-foreground/50 mt-2">Loading from VPS…</div>
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={CalendarClock}
            title={routines.length === 0 ? "No scheduled jobs found" : "No routines match filter"}
            description={routines.length === 0
              ? "Scheduled jobs are managed in Paperclip. Once the VPS is connected, they appear here."
              : "Try selecting a different filter."}
          />
        ) : (
          <div className="space-y-6">
            {Array.from(byCompany.entries()).map(([company, rows]) => (
              <div key={company}>
                <div className="flex items-center gap-2 mb-2">
                  <Building2 className="w-3.5 h-3.5 text-muted-foreground/50" />
                  <h2 className={cn(TEXT.sectionTitle)}>{company}</h2>
                  <span className="text-[11px] text-muted-foreground">({rows.length})</span>
                </div>
                <div className={CARD.table}>
                  <div className="px-5 py-2.5 border-b border-border bg-muted/20">
                    <div className="grid grid-cols-[auto_1fr_auto] gap-4 text-[10px] font-semibold text-muted-foreground uppercase tracking-[0.07em]">
                      <span />
                      <span>Job</span>
                      <span className="text-right">Status / Actions</span>
                    </div>
                  </div>
                  {rows.map(r => (
                    <RoutineRow key={r.id} routine={r} onToggle={handleToggle} onRun={handleRun} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </PageBody>
    </PageLayout>
  );
}
