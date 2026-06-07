'use client';

import { useEffect, useState, useCallback } from 'react';
import { Zap, Activity, TrendingUp, Shield, BarChart3, AlertTriangle, RefreshCw, DollarSign } from 'lucide-react';
import { TEXT, LAYOUT, CARD } from '@/lib/tokens';
import { cn } from '@/lib/utils';
import { SidebarSection, SidebarDivider, SidebarRow, SidebarMetricCard, MiniProgressBar } from '@/components/ui';

const API  = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
const KEY  = process.env.NEXT_PUBLIC_CONTROL_CENTER_API_KEY ?? '';
const AUTH = { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };

interface CostSummary {
  total: { total_tokens: string; cached_tokens: string; total_cost_cents: string; event_count: string };
  today: { tokens: string; events: string };
  topAgents: Array<{ name: string; adapter_type: string; tokens: string; cached: string; events: string; cost_cents: string }>;
}
interface DailyUsage {
  day: string; input_tokens: string; output_tokens: string; cached_tokens: string; cost_cents: string; events: string;
}
interface BudgetPolicy {
  scope_type: string; scope_name: string; metric: string; window_kind: string;
  amount: string; warn_percent: string; hard_stop_enabled: boolean;
}

function fmtT(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}
function fmtD(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function CostsPage() {
  const [summary, setSummary] = useState<CostSummary | null>(null);
  const [daily, setDaily]     = useState<DailyUsage[]>([]);
  const [budgets, setBudgets] = useState<BudgetPolicy[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [sumRes, dailyRes, budgetRes] = await Promise.all([
        fetch(`${API}/api/control/costs/summary`, { headers: AUTH }),
        fetch(`${API}/api/control/costs/daily?days=14`, { headers: AUTH }),
        fetch(`${API}/api/control/budget`, { headers: AUTH }).catch(() => null),
      ]);
      if (!sumRes.ok) throw new Error(`Summary: ${sumRes.status}`);
      setSummary(await sumRes.json());
      if (dailyRes.ok) setDaily(await dailyRes.json());
      if (budgetRes?.ok) setBudgets(await budgetRes.json());
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const totalTokens  = summary ? Number(summary.total?.total_tokens  ?? 0) : 0;
  const cachedTokens = summary ? Number(summary.total?.cached_tokens ?? 0) : 0;
  const todayTokens  = summary ? Number(summary.today?.tokens        ?? 0) : 0;
  const eventCount   = summary ? Number(summary.total?.event_count   ?? 0) : 0;
  const todayEvents  = summary ? Number(summary.today?.events        ?? 0) : 0;
  const cacheRate    = totalTokens > 0 ? Math.round((cachedTokens / (cachedTokens + totalTokens)) * 100) : 0;

  const maxDayTokens = daily.reduce((max, d) => {
    const t = Number(d.input_tokens) + Number(d.output_tokens);
    return t > max ? t : max;
  }, 1);

  return (
    <>
      {/* Header */}
      <div className={LAYOUT.pageHeader}>
        <div className="flex items-center justify-between">
          <div>
            <h1 className={TEXT.pageTitle}>Token Usage &amp; Costs</h1>
            <p className={cn(TEXT.pageSub, 'mt-0.5')}>Monitor agent token consumption and budget policies</p>
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

            {/* Stat cards */}
            <div className="grid grid-cols-4 gap-4">
              {[
                { label: 'Total Tokens',    value: fmtT(totalTokens),  sub: `${eventCount} events`,        icon: Zap,        color: 'text-primary',     ring: 'ring-primary/20 bg-primary/8' },
                { label: 'Cached',          value: fmtT(cachedTokens), sub: `${cacheRate}% hit rate`,      icon: Activity,   color: 'text-chart-2',     ring: 'ring-chart-2/20 bg-chart-2/8' },
                { label: 'Today',           value: fmtT(todayTokens),  sub: `${todayEvents} runs`,         icon: TrendingUp, color: 'text-success',     ring: 'ring-success/20 bg-success/8' },
                { label: 'Budget Policies', value: String(budgets.length), sub: budgets.length > 0 ? `${budgets.filter(b => b.hard_stop_enabled).length} hard stops` : 'No limits set', icon: Shield, color: budgets.length > 0 ? 'text-primary' : 'text-destructive', ring: budgets.length > 0 ? 'ring-primary/20 bg-primary/8' : 'ring-destructive/20 bg-destructive/8' },
              ].map(s => (
                <div key={s.label} className={CARD.stat}>
                  <div className="flex items-center justify-between mb-4">
                    <span className={TEXT.label}>{s.label}</span>
                    <div className={cn('p-2 rounded-lg ring-1', s.ring)}>
                      <s.icon className={cn('w-3.5 h-3.5', s.color)} strokeWidth={2} />
                    </div>
                  </div>
                  <div className={cn(TEXT.statValue, s.color)} style={{ letterSpacing: '-0.04em' }}>{s.value}</div>
                  <div className="text-[13px] font-medium text-muted-foreground mt-2">{s.sub}</div>
                </div>
              ))}
            </div>

            {/* Daily usage chart */}
            <div className={cn(CARD.base, 'p-6')}>
              <div className="flex items-center justify-between mb-5">
                <div>
                  <h2 className={TEXT.sectionTitle}>Daily Token Usage</h2>
                  <p className={cn(TEXT.sectionSub, 'mt-0.5')}>Last 14 days · bars show input + output</p>
                </div>
                <BarChart3 className="w-4 h-4 text-muted-foreground" />
              </div>

              {daily.length === 0 && !loading ? (
                <p className="text-[13px] text-muted-foreground text-center py-8">No usage data yet</p>
              ) : (
                <div className="space-y-2.5">
                  {[...daily].reverse().map(d => {
                    const total  = Number(d.input_tokens) + Number(d.output_tokens);
                    const cached = Number(d.cached_tokens);
                    const pct    = (total / maxDayTokens) * 100;
                    const cacPct = total > 0 ? (cached / (total + cached)) * 100 : 0;
                    const isHigh = total > 5_000_000;
                    return (
                      <div key={d.day} className="flex items-center gap-4">
                        <span className="text-[12px] text-muted-foreground w-16 flex-shrink-0 text-right tabular-nums">{fmtD(d.day)}</span>
                        <div className="flex-1 flex flex-col gap-0.5">
                          <div className="h-5 bg-muted/40 rounded-md overflow-hidden relative">
                            <div
                              className={cn('h-full rounded-md transition-all duration-500', isHigh ? 'bg-destructive/60' : 'bg-primary/50')}
                              style={{ width: `${Math.max(pct, 0.5)}%` }}
                            />
                            <span className="absolute inset-y-0 right-2 flex items-center text-[10px] font-medium text-muted-foreground tabular-nums">
                              {fmtT(total)}
                            </span>
                          </div>
                        </div>
                        <div className="text-right w-16 flex-shrink-0">
                          <div className="text-[11px] font-medium text-muted-foreground tabular-nums">{d.events} runs</div>
                          {cacPct > 0 && <div className="text-[10px] text-success">{Math.round(cacPct)}% cache</div>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Top consumers */}
            <div className={CARD.table}>
              <div className="px-6 py-4 border-b border-border">
                <h2 className={TEXT.sectionTitle}>Top Token Consumers</h2>
                <p className={cn(TEXT.sectionSub, 'mt-0.5')}>Agents ranked by total token usage</p>
              </div>

              {!summary?.topAgents?.length && !loading ? (
                <div className="py-12 text-center">
                  <Zap size={28} className="text-muted-foreground/15 mx-auto mb-3" />
                  <p className="text-[13px] text-muted-foreground">No agent cost data available</p>
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {(summary?.topAgents ?? []).map((agent, i) => {
                    const total   = Number(agent.tokens);
                    const cached  = Number(agent.cached);
                    const isHeavy = total > 5_000_000;
                    const maxT    = Number(summary?.topAgents[0]?.tokens ?? 1);

                    return (
                      <div key={agent.name} className="px-6 py-4 hover:bg-muted/20 transition-colors">
                        <div className="flex items-center gap-4 mb-2">
                          <span className={cn('text-[13px] font-bold w-6 text-center tabular-nums', i < 3 ? 'text-primary' : 'text-muted-foreground/40')}>
                            {i + 1}
                          </span>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2.5">
                              <span className="text-[14px] font-semibold text-card-foreground">{agent.name}</span>
                              <span className="font-mono text-[11px] text-muted-foreground bg-muted px-2 py-0.5 rounded-md">{agent.adapter_type}</span>
                              {isHeavy && <span className="text-[10px] px-2 py-0.5 rounded-md bg-destructive/10 text-destructive font-bold">HIGH</span>}
                            </div>
                            <div className="flex items-center gap-4 mt-0.5">
                              <span className="text-[12px] text-muted-foreground">{agent.events} runs</span>
                              <span className="text-[12px] text-muted-foreground">Cached: {fmtT(cached)}</span>
                            </div>
                          </div>
                          <div className="text-right flex-shrink-0">
                            <div className={cn('text-[16px] font-bold tabular-nums', isHeavy ? 'text-destructive' : 'text-card-foreground')}>
                              {fmtT(total)}
                            </div>
                            <div className="text-[11px] text-muted-foreground">tokens</div>
                          </div>
                        </div>
                        <div className="pl-10">
                          <MiniProgressBar value={total} max={maxT} colorClass={isHeavy ? 'bg-destructive/40' : 'bg-primary/30'} height="h-1" />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Sidebar */}
        <div className={LAYOUT.rightSidebar}>
          <SidebarSection title="Token Health">
            <SidebarMetricCard
              label="Cache Hit Rate"
              value={`${cacheRate}%`}
              valueClass={cacheRate >= 80 ? 'text-success' : cacheRate >= 50 ? 'text-warning' : 'text-destructive'}
              bar={{ value: cacheRate, max: 100 }}
              barColor="bg-success/50"
            />
          </SidebarSection>

          <SidebarDivider />

          <SidebarSection title="Summary">
            <div className="space-y-1">
              <SidebarRow label="Total"        value={fmtT(totalTokens)} />
              <SidebarRow label="Cached"       value={fmtT(cachedTokens)} valueClass="text-success" />
              <SidebarRow label="Today"        value={fmtT(todayTokens)} />
              <SidebarRow label="Events total" value={eventCount.toLocaleString()} />
              <SidebarRow label="Runs today"   value={String(todayEvents)} />
            </div>
          </SidebarSection>

          <SidebarDivider />

          <SidebarSection title="Budget Policies">
            {budgets.length === 0 ? (
              <p className="text-[13px] text-muted-foreground">No policies configured</p>
            ) : (
              <div className="space-y-2.5">
                {budgets.slice(0, 6).map((b, i) => (
                  <div key={i} className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-[13px] font-medium text-foreground truncate">{b.scope_name}</div>
                      <div className="text-[11px] text-muted-foreground">{b.scope_type} · {b.window_kind}</div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className="font-mono text-[12px] text-card-foreground">{fmtT(Number(b.amount))}</div>
                      {b.hard_stop_enabled && <span className="text-[10px] text-destructive font-bold">HARD</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </SidebarSection>

          <SidebarDivider />

          <SidebarSection title="Cost Controls">
            <div className="space-y-1">
              <SidebarRow label="Context Mode"  value="Thin"       valueClass="text-success" />
              <SidebarRow label="Retry Policy"  value="1 max" />
              <SidebarRow label="Default Model" value="Sonnet" />
              <SidebarRow label="Opus"          value="Manual only" valueClass="text-warning" />
            </div>
          </SidebarSection>
        </div>
      </div>
    </>
  );
}
