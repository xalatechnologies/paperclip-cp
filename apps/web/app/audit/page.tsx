'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  RefreshCw, CheckCircle, XCircle, AlertTriangle, Shield,
  BookOpen, Cpu, Activity, DollarSign, Clock, Users, Key,
  ChevronDown, ChevronUp, Lock,
} from 'lucide-react';
import { TEXT, LAYOUT, CARD } from '@/lib/tokens';
import { cn } from '@/lib/utils';
import { SidebarSection, SidebarDivider, SidebarRow, MiniProgressBar } from '@/components/ui';

const API  = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
const KEY  = process.env.NEXT_PUBLIC_CONTROL_CENTER_API_KEY ?? '';
const AUTH = { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };

// ── Types ──────────────────────────────────────────────────────────────────

interface AuditDetail  { type: string; test: string; message: string }
interface AuditResult  {
  passes: number; warnings: number; failures: number;
  verdict?: string; timestamp?: string;
  details: AuditDetail[];
}

interface AuditLog {
  id: number; action: string; actor_id: string;
  resource_type: string; resource_id: string;
  metadata: Record<string, any> | null;
  ip_address: string | null; created_at: string;
}

// ── Category definitions ───────────────────────────────────────────────────

const CATEGORIES: Array<{
  key: string; label: string; icon: React.ElementType;
  desc: string; color: string; ring: string;
}> = [
  {
    key: 'skills',
    label: 'Mandatory Skills',
    icon: BookOpen,
    desc: 'Every company must have context-budget-guard, thin-context-policy, and no-progress-guard registered as active skills.',
    color: 'text-chart-2',
    ring: 'ring-chart-2/20 bg-chart-2/8',
  },
  {
    key: 'turns',
    label: 'Turn Limits',
    icon: Cpu,
    desc: 'Every agent must have a maxTurnsPerRun set in adapter_config. Unlimited turns cause runaway loops and token waste.',
    color: 'text-primary',
    ring: 'ring-primary/20 bg-primary/8',
  },
  {
    key: 'grace',
    label: 'Grace Timeouts',
    icon: Clock,
    desc: 'Every agent must declare a graceSec timeout. Without it, stuck agents block VPS threads indefinitely.',
    color: 'text-warning',
    ring: 'ring-warning/20 bg-warning/8',
  },
  {
    key: 'heartbeat',
    label: 'Heartbeat Off',
    icon: Activity,
    desc: 'Heartbeat polling should be disabled (runtime_config.heartbeat.enabled = false) unless explicitly needed. Idle polling wastes tokens.',
    color: 'text-success',
    ring: 'ring-success/20 bg-success/8',
  },
  {
    key: 'concurrent',
    label: 'Concurrency Cap',
    icon: Users,
    desc: 'maxConcurrentRuns must be between 1 and 5. Uncapped concurrency can saturate the VPS and cause OOM.',
    color: 'text-info',
    ring: 'ring-info/20 bg-info/8',
  },
  {
    key: 'budget',
    label: 'Budget Policies',
    icon: DollarSign,
    desc: 'Every agent must have an active budget policy with hard_stop_enabled. Every company needs a daily spending cap.',
    color: 'text-danger',
    ring: 'ring-danger/20 bg-danger/8',
  },
];

// ── Helpers ────────────────────────────────────────────────────────────────

function fmtTs(iso: string) {
  try {
    return new Date(iso).toLocaleString('en-US', {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  } catch { return iso; }
}

function classifyDetail(d: AuditDetail): string {
  const t = d.test.toLowerCase();
  if (t.includes('skill') || t.includes('skills')) return 'skills';
  if (t.includes('turn') || t.includes('turns'))  return 'turns';
  if (t.includes('grace'))                         return 'grace';
  if (t.includes('heartbeat'))                     return 'heartbeat';
  if (t.includes('concurrent'))                    return 'concurrent';
  if (t.includes('budget') || t.includes('company_budget')) return 'budget';
  return 'other';
}

function actionColor(action: string) {
  if (action === 'secret.used')   return 'text-warning';
  if (action === 'secret.create') return 'text-success';
  if (action === 'secret.delete') return 'text-destructive';
  return 'text-muted-foreground';
}

function actionDot(action: string) {
  if (action === 'secret.used')   return 'bg-warning';
  if (action === 'secret.create') return 'bg-success';
  if (action === 'secret.delete') return 'bg-destructive';
  return 'bg-muted-foreground';
}

// ══════════════════════════════════════════════════════════════════════════
export default function AuditPage() {
  // Governance audit
  const [audit, setAudit]       = useState<AuditResult | null>(null);
  const [auditLoading, setAL]   = useState(false);
  const [auditErr, setAE]       = useState<string | null>(null);
  const [ranOnce, setRanOnce]   = useState(false);

  // Access log
  const [logs, setLogs]         = useState<AuditLog[]>([]);
  const [logsLoading, setLL]    = useState(true);
  const [logsErr, setLE]        = useState<string | null>(null);

  // UI state
  const [openCats, setOpenCats] = useState<Set<string>>(new Set());

  const runAudit = useCallback(async () => {
    setAL(true); setAE(null);
    try {
      const res = await fetch(`${API}/api/control/audit`, { headers: AUTH });
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      setAudit(await res.json());
      setRanOnce(true);
    } catch (e: any) { setAE(e.message); setRanOnce(true); }
    finally { setAL(false); }
  }, []);

  const fetchLogs = useCallback(async () => {
    setLL(true); setLE(null);
    try {
      const res = await fetch(`${API}/api/audit?limit=50`, { headers: AUTH });
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      const json = await res.json();
      setLogs(Array.isArray(json) ? json : (json.data ?? []));
    } catch (e: any) { setLE(e.message); }
    finally { setLL(false); }
  }, []);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  const total = audit ? audit.passes + audit.warnings + audit.failures : 0;
  const score = total > 0 ? Math.round((audit!.passes / total) * 100) : 0;

  const toggleCat = (key: string) => {
    setOpenCats(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const failsByCat = (cat: string) =>
    (audit?.details ?? []).filter(d => d.type === 'fail' && classifyDetail(d) === cat);
  const warnsByCat = (cat: string) =>
    (audit?.details ?? []).filter(d => d.type === 'warn' && classifyDetail(d) === cat);

  const passedCats  = CATEGORIES.filter(c => failsByCat(c.key).length === 0 && warnsByCat(c.key).length === 0);
  const failedCats  = CATEGORIES.filter(c => failsByCat(c.key).length > 0);
  const warnedCats  = CATEGORIES.filter(c => failsByCat(c.key).length === 0 && warnsByCat(c.key).length > 0);

  return (
    <>
      {/* ── Page Header ────────────────────────────────────────────── */}
      <div className={LAYOUT.pageHeader}>
        <div className="flex items-center justify-between">
          <div>
            <h1 className={TEXT.pageTitle}>Audit Center</h1>
            <p className={cn(TEXT.pageSub, 'mt-0.5')}>
              Governance compliance · Secret access trail · Anti-bloat verification
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={fetchLogs} disabled={logsLoading}
              className="flex items-center gap-2 px-4 py-2 text-[13px] font-medium rounded-lg border border-border bg-card hover:bg-muted text-foreground transition-colors disabled:opacity-50">
              <RefreshCw className={cn('w-3.5 h-3.5', logsLoading && 'animate-spin')} />
              Refresh Log
            </button>
            <button onClick={runAudit} disabled={auditLoading}
              className="flex items-center gap-2 px-4 py-2 text-[13px] font-semibold rounded-lg bg-primary/90 hover:bg-primary text-white transition-colors disabled:opacity-50">
              <Shield className={cn('w-3.5 h-3.5', auditLoading && 'animate-spin')} />
              Run Governance Audit
            </button>
          </div>
        </div>
      </div>

      <div className="flex flex-1 min-h-0">
        <div className="flex-1 overflow-y-auto">
          <div className={LAYOUT.pageBody}>

            {/* ── Section 1: Governance Audit ──────────────────────── */}
            <div>
              <div className="flex items-center gap-3 mb-5">
                <div className="p-2 rounded-lg bg-primary/10 ring-1 ring-primary/20">
                  <Shield className="w-4 h-4 text-primary" strokeWidth={2} />
                </div>
                <div>
                  <h2 className={TEXT.sectionTitle}>Anti-Bloat Governance</h2>
                  <p className={cn(TEXT.sectionSub, 'mt-0')}>
                    Verifies every agent and company satisfies the 6 mandatory governance controls
                  </p>
                </div>
                {audit && (
                  <div className={cn(
                    'ml-auto text-[13px] font-bold px-3 py-1 rounded-lg',
                    audit.failures === 0
                      ? 'bg-success/10 text-success ring-1 ring-success/20'
                      : 'bg-destructive/10 text-destructive ring-1 ring-destructive/20'
                  )}>
                    {audit.failures === 0 ? '✓ PASSED' : `✗ ${audit.failures} failures`}
                  </div>
                )}
              </div>

              {/* Pre-audit state: show what will be checked */}
              {!ranOnce && !auditLoading && (
                <div className="grid grid-cols-3 gap-3 mb-4">
                  {CATEGORIES.map(cat => (
                    <div key={cat.key} className="bg-card border border-border rounded-xl p-4">
                      <div className="flex items-start gap-3">
                        <div className={cn('p-1.5 rounded-lg ring-1 flex-shrink-0 mt-0.5', cat.ring)}>
                          <cat.icon className={cn('w-3.5 h-3.5', cat.color)} strokeWidth={2} />
                        </div>
                        <div>
                          <div className="text-[13px] font-semibold text-card-foreground mb-1">{cat.label}</div>
                          <p className="text-[12px] text-muted-foreground leading-relaxed">{cat.desc}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Running state */}
              {auditLoading && (
                <div className={cn(CARD.table, 'py-16 text-center')}>
                  <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-4 text-primary/30" />
                  <div className="text-[15px] font-medium text-muted-foreground">Running 6 governance checks against VPS…</div>
                  <p className="text-[13px] text-muted-foreground/60 mt-1">Checking all agents and companies</p>
                </div>
              )}

              {/* Error state */}
              {auditErr && !auditLoading && (
                <div className="flex items-start gap-3 p-4 rounded-xl border border-destructive/15 bg-destructive/5 mb-4">
                  <XCircle className="w-4 h-4 text-destructive flex-shrink-0 mt-0.5" />
                  <div>
                    <div className="text-[13px] font-semibold text-destructive">Audit failed to run</div>
                    <div className="text-[12px] text-destructive/70 mt-0.5">{auditErr}</div>
                    <div className="text-[12px] text-muted-foreground mt-1">
                      This usually means the VPS is unreachable or the SSH connection timed out.
                    </div>
                  </div>
                </div>
              )}

              {/* Results */}
              {audit && !auditLoading && (
                <>
                  {/* Summary stat cards */}
                  <div className="grid grid-cols-3 gap-4 mb-5">
                    {[
                      { label: 'Passed',   value: audit.passes,   color: 'text-success',     ring: 'ring-success/20 bg-success/8',         Icon: CheckCircle },
                      { label: 'Warnings', value: audit.warnings, color: 'text-warning',     ring: 'ring-warning/20 bg-warning/8',         Icon: AlertTriangle },
                      { label: 'Failures', value: audit.failures, color: audit.failures > 0 ? 'text-destructive' : 'text-success',
                        ring: audit.failures > 0 ? 'ring-destructive/20 bg-destructive/8' : 'ring-success/20 bg-success/8',
                        Icon: audit.failures > 0 ? XCircle : Shield },
                    ].map(s => (
                      <div key={s.label} className={CARD.stat}>
                        <div className="flex items-center justify-between mb-4">
                          <span className={TEXT.label}>{s.label}</span>
                          <div className={cn('p-2 rounded-lg ring-1', s.ring)}>
                            <s.Icon className={cn('w-3.5 h-3.5', s.color)} strokeWidth={2} />
                          </div>
                        </div>
                        <div className={cn(TEXT.statValue, s.color)} style={{ letterSpacing: '-0.04em' }}>{s.value}</div>
                      </div>
                    ))}
                  </div>

                  {/* Category breakdown — collapsible */}
                  <div className="space-y-2">
                    {[...failedCats, ...warnedCats, ...passedCats].map(cat => {
                      const fails  = failsByCat(cat.key);
                      const warns  = warnsByCat(cat.key);
                      const passed = fails.length === 0 && warns.length === 0;
                      const open   = openCats.has(cat.key);
                      const hasDetails = fails.length > 0 || warns.length > 0;

                      return (
                        <div key={cat.key} className={cn(
                          'border rounded-xl overflow-hidden transition-all',
                          !passed ? 'border-destructive/20 bg-destructive/[0.02]' : 'border-border bg-card'
                        )}>
                          <button
                            onClick={() => hasDetails && toggleCat(cat.key)}
                            className={cn(
                              'w-full flex items-center gap-3 px-5 py-3.5 text-left',
                              hasDetails ? 'cursor-pointer hover:bg-muted/20' : 'cursor-default'
                            )}
                          >
                            <div className={cn('p-1.5 rounded-lg ring-1 flex-shrink-0', cat.ring)}>
                              <cat.icon className={cn('w-3.5 h-3.5', cat.color)} strokeWidth={2} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="text-[14px] font-semibold text-card-foreground">{cat.label}</span>
                                {!passed && fails.length > 0 && (
                                  <span className="text-[10px] font-bold bg-destructive/10 text-destructive px-1.5 py-0.5 rounded">
                                    {fails.length} failing
                                  </span>
                                )}
                                {warns.length > 0 && (
                                  <span className="text-[10px] font-bold bg-warning/10 text-warning px-1.5 py-0.5 rounded">
                                    {warns.length} warning
                                  </span>
                                )}
                              </div>
                              <p className="text-[12px] text-muted-foreground mt-0.5 leading-relaxed">{cat.desc}</p>
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0">
                              {passed ? (
                                <CheckCircle className="w-4 h-4 text-success" />
                              ) : (
                                <XCircle className="w-4 h-4 text-destructive" />
                              )}
                              {hasDetails && (
                                open ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
                              )}
                            </div>
                          </button>

                          {open && hasDetails && (
                            <div className="border-t border-border/60 divide-y divide-border/40">
                              {[...fails, ...warns].map((d, i) => (
                                <div key={i} className="flex items-center gap-4 px-5 py-3 bg-muted/10">
                                  {d.type === 'fail'
                                    ? <XCircle className="w-3.5 h-3.5 text-destructive flex-shrink-0" />
                                    : <AlertTriangle className="w-3.5 h-3.5 text-warning flex-shrink-0" />
                                  }
                                  <span className="font-mono text-[11px] text-muted-foreground w-28 flex-shrink-0">{d.test}</span>
                                  <span className="text-[13px] text-foreground">{d.message}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {audit.timestamp && (
                    <p className="text-[12px] text-muted-foreground/50 mt-3 text-right">
                      Last run: {fmtTs(audit.timestamp)}
                    </p>
                  )}
                </>
              )}
            </div>

            {/* ── Section 2: Access Audit Trail ────────────────────── */}
            <div>
              <div className="flex items-center gap-3 mb-5">
                <div className="p-2 rounded-lg bg-warning/10 ring-1 ring-warning/20">
                  <Lock className="w-4 h-4 text-warning" strokeWidth={2} />
                </div>
                <div>
                  <h2 className={TEXT.sectionTitle}>Secret Access Trail</h2>
                  <p className={cn(TEXT.sectionSub, 'mt-0')}>
                    Immutable log of every secret creation, access, and deletion — last 50 events
                  </p>
                </div>
                <span className="ml-auto text-[12px] text-muted-foreground">{logs.length} events</span>
              </div>

              {logsErr && (
                <div className="flex items-center gap-3 p-4 rounded-xl border border-destructive/15 bg-destructive/5 mb-4">
                  <AlertTriangle className="w-4 h-4 text-destructive flex-shrink-0" />
                  <span className="text-[13px] text-destructive">Failed to load access log: {logsErr}</span>
                </div>
              )}

              <div className={CARD.table}>
                {logsLoading ? (
                  <div className="py-12 text-center">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-3 text-muted-foreground/30" />
                    <div className="text-[13px] text-muted-foreground">Loading access log…</div>
                  </div>
                ) : logs.length === 0 ? (
                  <div className="py-14 text-center">
                    <Key size={28} className="text-muted-foreground/15 mx-auto mb-3" />
                    <div className="text-[14px] font-medium text-muted-foreground">No access events yet</div>
                    <p className="text-[12px] text-muted-foreground/60 mt-1">
                      Events are logged whenever a secret is created, accessed, or deleted
                    </p>
                  </div>
                ) : (
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="border-b border-border">
                        {['Time', 'Action', 'Actor', 'Resource', 'IP', 'Details'].map(h => (
                          <th key={h} className="text-left px-5 py-3.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-[0.06em] bg-muted/30">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {logs.map(log => (
                        <tr key={log.id} className="border-b border-border/40 last:border-0 hover:bg-muted/20 transition-colors">
                          <td className="px-5 py-3.5">
                            <span className="text-[13px] text-muted-foreground tabular-nums">{fmtTs(log.created_at)}</span>
                          </td>
                          <td className="px-5 py-3.5">
                            <span className={cn('flex items-center gap-1.5 text-[12px] font-semibold', actionColor(log.action))}>
                              <span className={cn('w-1.5 h-1.5 rounded-full flex-shrink-0', actionDot(log.action))} />
                              {log.action}
                            </span>
                          </td>
                          <td className="px-5 py-3.5">
                            <span className="font-mono text-[11px] text-muted-foreground">
                              {log.actor_id ? log.actor_id.slice(0, 12) + '…' : '—'}
                            </span>
                          </td>
                          <td className="px-5 py-3.5">
                            <div>
                              <div className="text-[12px] font-medium text-card-foreground">{log.resource_type}</div>
                              <div className="font-mono text-[10px] text-muted-foreground mt-0.5">
                                {log.resource_id ? log.resource_id.slice(0, 10) + '…' : '—'}
                              </div>
                            </div>
                          </td>
                          <td className="px-5 py-3.5">
                            <span className="font-mono text-[11px] text-muted-foreground">{log.ip_address ?? '—'}</span>
                          </td>
                          <td className="px-5 py-3.5">
                            {log.metadata ? (
                              <span className="text-[12px] text-muted-foreground">
                                {log.metadata.reason ?? log.metadata.name ?? JSON.stringify(log.metadata).slice(0, 40)}
                              </span>
                            ) : <span className="text-muted-foreground/30">—</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>

          </div>
        </div>

        {/* ── Right Sidebar ────────────────────────────────────────── */}
        <div className={LAYOUT.rightSidebar}>

          {/* Governance score */}
          {audit && (
            <>
              <SidebarSection title="Compliance Score">
                <div className={cn(CARD.panel, 'text-center')}>
                  <div className={cn(
                    'text-[36px] font-bold mb-1',
                    audit.failures === 0 ? 'text-success' : 'text-destructive'
                  )} style={{ letterSpacing: '-0.05em' }}>
                    {score}%
                  </div>
                  <div className="text-[11px] text-muted-foreground mb-3">{total} total checks</div>
                  {/* Stacked bar */}
                  <div className="h-2.5 bg-muted rounded-full overflow-hidden flex">
                    <div className="bg-success/70 h-full transition-all" style={{ flex: audit.passes }} />
                    <div className="bg-warning/70 h-full transition-all" style={{ flex: audit.warnings }} />
                    <div className="bg-destructive/70 h-full transition-all" style={{ flex: audit.failures }} />
                  </div>
                  <div className="flex justify-between mt-2 text-[10px] text-muted-foreground">
                    <span className="text-success">{audit.passes} pass</span>
                    <span className="text-warning">{audit.warnings} warn</span>
                    <span className="text-destructive">{audit.failures} fail</span>
                  </div>
                </div>
              </SidebarSection>

              <SidebarDivider />

              <SidebarSection title="Category Status">
                <div className="space-y-2">
                  {CATEGORIES.map(cat => {
                    const fails = failsByCat(cat.key).length;
                    const warns = warnsByCat(cat.key).length;
                    return (
                      <div key={cat.key} className="flex items-center gap-2 py-0.5">
                        <cat.icon className={cn('w-3.5 h-3.5 flex-shrink-0', cat.color)} strokeWidth={2} />
                        <span className="text-[12px] text-foreground flex-1">{cat.label}</span>
                        {fails > 0 ? (
                          <XCircle className="w-3.5 h-3.5 text-destructive" />
                        ) : warns > 0 ? (
                          <AlertTriangle className="w-3.5 h-3.5 text-warning" />
                        ) : (
                          <CheckCircle className="w-3.5 h-3.5 text-success" />
                        )}
                      </div>
                    );
                  })}
                </div>
              </SidebarSection>

              <SidebarDivider />
            </>
          )}

          {/* What is audited — always visible */}
          <SidebarSection title="What Gets Checked">
            <div className="space-y-3">
              {CATEGORIES.map(cat => (
                <div key={cat.key} className="flex items-start gap-2">
                  <div className={cn('p-1 rounded flex-shrink-0 mt-0.5 ring-1', cat.ring)}>
                    <cat.icon className={cn('w-3 h-3', cat.color)} strokeWidth={2} />
                  </div>
                  <div>
                    <div className="text-[12px] font-semibold text-card-foreground">{cat.label}</div>
                  </div>
                </div>
              ))}
            </div>
          </SidebarSection>

          <SidebarDivider />

          {/* Access log stats */}
          <SidebarSection title="Access Log">
            <div className="space-y-1">
              <SidebarRow label="Total events" value={logs.length} />
              <SidebarRow label="Secret used"   value={logs.filter(l => l.action === 'secret.used').length}   valueClass="text-warning" />
              <SidebarRow label="Secret created" value={logs.filter(l => l.action === 'secret.create').length} valueClass="text-success" />
              <SidebarRow label="Secret deleted" value={logs.filter(l => l.action === 'secret.delete').length} valueClass="text-destructive" />
            </div>
          </SidebarSection>

          {!audit && !auditLoading && (
            <>
              <SidebarDivider />
              <div className="p-4 rounded-xl bg-primary/5 border border-primary/15">
                <div className="flex items-center gap-2 mb-2">
                  <Shield className="w-3.5 h-3.5 text-primary" />
                  <span className="text-[12px] font-semibold text-primary">How it works</span>
                </div>
                <p className="text-[11px] text-primary/70 leading-relaxed">
                  The audit SSH-connects to your VPS, runs SQL against the Paperclip DB, and verifies all 6 governance controls in real-time. Results are not stored — run it on-demand.
                </p>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
