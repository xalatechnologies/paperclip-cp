'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  Heart, RefreshCw, AlertTriangle,
  XCircle, Activity, Shield, Clock, Gauge,
} from 'lucide-react';
import { TEXT, LAYOUT, CARD } from '@/lib/tokens';
import { cn } from '@/lib/utils';
import { StatusBadge, MonoBadge, SidebarSection, SidebarDivider, SidebarMetricCard, SidebarRow, MiniProgressBar } from '@/components/ui';

const API  = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
const KEY  = process.env.NEXT_PUBLIC_CONTROL_CENTER_API_KEY ?? '';
const AUTH = { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };

interface AgentInfo {
  id: string; name: string; model: string | null; context_mode: string | null;
  max_turns: string | null; status: string; company_name: string;
  retry_max: string | null; concurrent: string | null;
  heartbeat_enabled: boolean | null; grace_sec: string | null;
}

export default function HeartbeatsPage() {
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await fetch(`${API}/api/control/agents`, { headers: AUTH });
      if (!res.ok) throw new Error(`${res.status}`);
      setAgents(await res.json());
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const thinCount    = agents.filter(a => a.context_mode === 'thin').length;
  const errorCount   = agents.filter(a => a.status === 'error').length;
  const activeCount  = agents.filter(a => a.status === 'active').length;
  const idleCount    = agents.filter(a => a.status === 'idle').length;
  const companies    = Array.from(new Set(agents.map(a => a.company_name)));
  const models       = Array.from(new Set(agents.map(a => a.model).filter(Boolean)));
  const thinCoverage = agents.length > 0 ? Math.round((thinCount / agents.length) * 100) : 0;

  const HEADERS = ['Agent', 'Company', 'Model', 'Context', 'Max Turns', 'Grace', 'Retries', 'Status'];

  return (
    <>
      {/* Header */}
      <div className={LAYOUT.pageHeader}>
        <div className="flex items-center justify-between">
          <div>
            <h1 className={TEXT.pageTitle}>Agent Runtime Control</h1>
            <p className={cn(TEXT.pageSub, 'mt-0.5')}>{agents.length} agents — model, context, turns, retries</p>
          </div>
          <button onClick={refresh} disabled={loading}
            className="flex items-center gap-2 px-4 py-2 text-[13px] font-medium rounded-lg border border-border bg-card hover:bg-muted text-foreground transition-colors disabled:opacity-50">
            <RefreshCw className={cn('w-3.5 h-3.5', loading && 'animate-spin')} />
            Refresh
          </button>
        </div>
      </div>

      <div className="flex flex-1 min-h-0">
        <div className="flex-1 overflow-y-auto">
          <div className={LAYOUT.pageBody}>

            {error && (
              <div className="flex items-center gap-3 p-4 rounded-xl border border-destructive/15 bg-destructive/5">
                <AlertTriangle className="w-4 h-4 text-destructive flex-shrink-0" />
                <span className="text-[13px] text-destructive">Failed to load: {error}</span>
              </div>
            )}

            {/* Stats */}
            <div className="grid grid-cols-5 gap-4">
              {[
                { label: 'Total',        value: agents.length, color: 'text-primary',     ring: 'ring-primary/20 bg-primary/8',     icon: Heart },
                { label: 'Active',       value: activeCount,   color: 'text-success',     ring: 'ring-success/20 bg-success/8',     icon: Activity },
                { label: 'Idle',         value: idleCount,     color: 'text-foreground',  ring: 'ring-border bg-muted',             icon: Clock },
                { label: 'Error',        value: errorCount,    color: errorCount > 0 ? 'text-destructive' : 'text-success', ring: errorCount > 0 ? 'ring-destructive/20 bg-destructive/8' : 'ring-success/20 bg-success/8', icon: XCircle },
                { label: 'Thin Context', value: thinCount,     color: 'text-success',     ring: 'ring-success/20 bg-success/8',     icon: Shield },
              ].map(s => (
                <div key={s.label} className={CARD.stat}>
                  <div className="flex items-center justify-between mb-4">
                    <span className={TEXT.label}>{s.label}</span>
                    <div className={cn('p-2 rounded-lg ring-1', s.ring)}>
                      <s.icon className={cn('w-3.5 h-3.5', s.color)} strokeWidth={2} />
                    </div>
                  </div>
                  <div className={cn(TEXT.statValue, s.color)} style={{ letterSpacing: '-0.04em' }}>{s.value}</div>
                </div>
              ))}
            </div>

            {/* Agent runtime table */}
            <div className={CARD.table}>
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b border-border">
                    {HEADERS.map(h => (
                      <th key={h} className={TABLE_TH}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {agents.map(a => (
                    <tr key={a.id} className="border-b border-border/40 last:border-0 hover:bg-muted/25 transition-colors">
                      <td className="px-5 py-4">
                        <div className="text-[14px] font-semibold text-card-foreground leading-snug">{a.name}</div>
                      </td>
                      <td className="px-5 py-4">
                        <span className="text-[13px] text-muted-foreground">{a.company_name}</span>
                      </td>
                      <td className="px-5 py-4">
                        <MonoBadge>{a.model || '—'}</MonoBadge>
                      </td>
                      <td className="px-5 py-4">
                        <span className={cn(
                          'text-[11px] px-2.5 py-1 rounded-md font-semibold',
                          a.context_mode === 'thin' ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning'
                        )}>
                          {a.context_mode || 'default'}
                        </span>
                      </td>
                      <td className="px-5 py-4 font-mono text-[13px] text-card-foreground text-center tabular-nums">
                        {a.max_turns || '—'}
                      </td>
                      <td className="px-5 py-4 font-mono text-[12px] text-muted-foreground text-center tabular-nums">
                        {a.grace_sec ? `${a.grace_sec}s` : '—'}
                      </td>
                      <td className="px-5 py-4 font-mono text-[13px] text-card-foreground text-center tabular-nums">
                        {a.retry_max || '—'}
                      </td>
                      <td className="px-5 py-4">
                        <StatusBadge status={a.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Right Sidebar */}
        <div className={LAYOUT.rightSidebar}>
          <SidebarSection title="Agent Health">
            <SidebarMetricCard
              label="Thin Context Coverage"
              value={`${thinCoverage}%`}
              valueClass="text-success"
              bar={{ value: thinCount, max: agents.length }}
              barColor="bg-success/50"
            />
            <p className="text-[11px] text-muted-foreground mt-2">{thinCount} of {agents.length} agents on thin context</p>
          </SidebarSection>

          <SidebarDivider />

          <SidebarSection title="Turn Limits">
            <div className="space-y-1.5">
              {[5, 10, 15, 25, 50].map(t => {
                const count = agents.filter(a => Number(a.max_turns) === t).length;
                if (!count) return null;
                return (
                  <div key={t} className="flex items-center justify-between py-1">
                    <span className="text-[13px] text-muted-foreground">{t} turns</span>
                    <span className="text-[12px] font-bold text-card-foreground bg-muted px-2 py-0.5 rounded-md tabular-nums">{count} agents</span>
                  </div>
                );
              })}
              {agents.filter(a => !a.max_turns).length > 0 && (
                <div className="flex items-center justify-between py-1">
                  <span className="text-[13px] text-muted-foreground/50 italic">no limit</span>
                  <span className="text-[12px] font-bold text-muted-foreground tabular-nums">{agents.filter(a => !a.max_turns).length}</span>
                </div>
              )}
            </div>
          </SidebarSection>

          <SidebarDivider />

          <SidebarSection title="Models in Use">
            <div className="space-y-1.5">
              {models.map(m => {
                const count = agents.filter(a => a.model === m).length;
                return (
                  <div key={m} className="flex items-center justify-between py-1">
                    <span className="font-mono text-[12px] text-muted-foreground truncate max-w-[150px]">{m}</span>
                    <span className="text-[12px] font-bold text-card-foreground tabular-nums">{count}</span>
                  </div>
                );
              })}
            </div>
          </SidebarSection>

          <SidebarDivider />

          <SidebarSection title="By Company">
            <div className="space-y-2">
              {companies.map(c => {
                const count = agents.filter(a => a.company_name === c).length;
                const errs  = agents.filter(a => a.company_name === c && a.status === 'error').length;
                return (
                  <div key={c} className="flex items-center justify-between py-1">
                    <span className="text-[13px] text-foreground">{c}</span>
                    <div className="flex items-center gap-1.5">
                      {errs > 0 && <span className="text-[11px] text-destructive font-bold">{errs} err</span>}
                      <span className="text-[13px] font-bold text-card-foreground tabular-nums">{count}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </SidebarSection>
        </div>
      </div>
    </>
  );
}

const TABLE_TH = 'text-left px-5 py-3.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-[0.06em] bg-muted/30';
