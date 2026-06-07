'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  KeyRound, ShieldCheck, RefreshCw, Building2,
  AlertTriangle, Eye, EyeOff, CheckCircle,
} from 'lucide-react';
import { TEXT, LAYOUT, CARD } from '@/lib/tokens';
import { cn } from '@/lib/utils';
import { StatusBadge, MonoBadge, SidebarSection, SidebarDivider, SidebarRow, MiniProgressBar } from '@/components/ui';

const API  = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
const KEY  = process.env.NEXT_PUBLIC_CONTROL_CENTER_API_KEY ?? '';
const AUTH = { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };

interface VpsSecret {
  id: string; company_id: string; name: string;
  provider: string | null; key: string | null; status: string;
  last_resolved_at: string | null; last_rotated_at: string | null;
  company_name: string; access_count: string;
}

function fmtDate(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

const TH = 'text-left px-5 py-3.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-[0.06em] bg-muted/30';

export default function SecretsPage() {
  const [secrets, setSecrets] = useState<VpsSecret[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [masked, setMasked]   = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await fetch(`${API}/api/control/secrets`, { headers: AUTH });
      if (!res.ok) throw new Error(`${res.status}`);
      setSecrets(await res.json());
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const companies        = Array.from(new Set(secrets.map(s => s.company_name))).sort();
  const activeCount      = secrets.filter(s => s.status === 'active').length;
  const resolvedCount    = secrets.filter(s => s.last_resolved_at).length;
  const highAccessCount  = secrets.filter(s => Number(s.access_count) > 10).length;
  const statuses         = Array.from(new Set(secrets.map(s => s.status)));

  return (
    <>
      <div className={LAYOUT.pageHeader}>
        <div className="flex items-center justify-between">
          <div>
            <h1 className={TEXT.pageTitle}>Secret Vault</h1>
            <p className={cn(TEXT.pageSub, 'mt-0.5')}>{secrets.length} secrets · AES-256-GCM · values never returned</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setMasked(m => !m)}
              className="flex items-center gap-2 px-4 py-2 text-[13px] font-medium rounded-lg border border-border bg-card hover:bg-muted text-foreground transition-colors">
              {masked ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
              {masked ? 'Show Keys' : 'Hide Keys'}
            </button>
            <button onClick={refresh} disabled={loading}
              className="flex items-center gap-2 px-4 py-2 text-[13px] font-medium rounded-lg border border-border bg-card hover:bg-muted text-foreground transition-colors disabled:opacity-50">
              <RefreshCw className={cn('w-3.5 h-3.5', loading && 'animate-spin')} />
              Refresh
            </button>
          </div>
        </div>
      </div>

      <div className="flex flex-1 min-h-0">
        <div className="flex-1 overflow-y-auto">
          <div className={LAYOUT.pageBody}>

            {/* Security notice */}
            <div className="flex items-start gap-3 p-4 rounded-xl bg-primary/5 border border-primary/15">
              <ShieldCheck size={16} className="text-primary flex-shrink-0 mt-0.5" />
              <p className="text-[13px] text-primary leading-relaxed">
                All secret values are encrypted with AES-256-GCM before storage.
                Values are <strong>never</strong> returned in API responses.
                Every access is audit-logged automatically.
              </p>
            </div>

            {error && (
              <div className="flex items-center gap-3 p-4 rounded-xl border border-destructive/15 bg-destructive/5">
                <AlertTriangle className="w-4 h-4 text-destructive flex-shrink-0" />
                <span className="text-[13px] text-destructive">Failed to load: {error}</span>
              </div>
            )}

            {/* Stats */}
            <div className="grid grid-cols-4 gap-4">
              {[
                { label: 'Total Secrets', value: secrets.length,   icon: KeyRound,    color: 'text-primary',     ring: 'ring-primary/20 bg-primary/8' },
                { label: 'Active',        value: activeCount,      icon: CheckCircle, color: 'text-success',     ring: 'ring-success/20 bg-success/8' },
                { label: 'Resolved',      value: resolvedCount,    icon: ShieldCheck, color: 'text-chart-2',     ring: 'ring-chart-2/20 bg-chart-2/8' },
                { label: 'High Access',   value: highAccessCount,  icon: AlertTriangle, color: highAccessCount > 0 ? 'text-warning' : 'text-muted-foreground', ring: 'ring-border bg-muted' },
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

            {/* Secrets table */}
            <div className={CARD.table}>
              {secrets.length === 0 && !loading ? (
                <div className="py-16 text-center">
                  <KeyRound size={32} className="text-muted-foreground/15 mx-auto mb-4" />
                  <div className="text-[15px] font-medium text-muted-foreground">No secrets stored</div>
                  <p className="text-[13px] text-muted-foreground/60 mt-1">Secrets can be added via the PCC CLI or API</p>
                </div>
              ) : (
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="border-b border-border">
                      {['Secret', 'Company', 'Provider', 'Key (env var)', 'Status', 'Last Resolved', 'Accesses'].map(h => (
                        <th key={h} className={TH}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {secrets.map(secret => (
                      <tr key={secret.id} className="border-b border-border/40 last:border-0 hover:bg-muted/25 transition-colors">
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-2.5">
                            <KeyRound size={13} className="text-warning/70 flex-shrink-0" />
                            <div>
                              <div className="text-[14px] font-semibold text-card-foreground">{secret.name}</div>
                              <div className="font-mono text-[11px] text-muted-foreground mt-0.5">{secret.id.slice(0, 8)}…</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-4">
                          <span className="text-[13px] text-muted-foreground">{secret.company_name}</span>
                        </td>
                        <td className="px-5 py-4">
                          {secret.provider ? <MonoBadge>{secret.provider}</MonoBadge> : <span className="text-muted-foreground/30">—</span>}
                        </td>
                        <td className="px-5 py-4">
                          {secret.key ? (
                            masked
                              ? <span className="font-mono text-[13px] text-muted-foreground tracking-wider">••••••••</span>
                              : <span className="font-mono text-[12px] text-foreground">{secret.key}</span>
                          ) : <span className="text-muted-foreground/30">—</span>}
                        </td>
                        <td className="px-5 py-4">
                          <StatusBadge status={secret.status} />
                        </td>
                        <td className="px-5 py-4">
                          <span className="text-[13px] text-muted-foreground">{fmtDate(secret.last_resolved_at)}</span>
                        </td>
                        <td className="px-5 py-4">
                          <span className={cn('text-[13px] font-semibold tabular-nums', Number(secret.access_count) > 10 ? 'text-warning' : 'text-card-foreground')}>
                            {secret.access_count}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>

        {/* Right Sidebar */}
        <div className={LAYOUT.rightSidebar}>
          <SidebarSection title="Encryption">
            <div className="space-y-1">
              <SidebarRow label="Algorithm"   value="AES-256-GCM" />
              <SidebarRow label="Key storage" value=".env only" />
              <SidebarRow label="Values in API" value="Never"        valueClass="text-success" />
              <SidebarRow label="Audit log"   value="Every access"  valueClass="text-success" />
            </div>
          </SidebarSection>

          <SidebarDivider />

          <SidebarSection title="By Company">
            <div className="space-y-3">
              {companies.map(c => {
                const count = secrets.filter(s => s.company_name === c).length;
                const pct   = secrets.length > 0 ? Math.round((count / secrets.length) * 100) : 0;
                return (
                  <div key={c}>
                    <div className="flex justify-between mb-1">
                      <span className="text-[13px] font-medium text-foreground">{c}</span>
                      <span className="text-[11px] text-muted-foreground">{count}</span>
                    </div>
                    <MiniProgressBar value={count} max={secrets.length} colorClass="bg-warning/40" />
                  </div>
                );
              })}
            </div>
          </SidebarSection>

          <SidebarDivider />

          <SidebarSection title="Status Breakdown">
            <div className="space-y-1">
              {statuses.map(st => {
                const count = secrets.filter(s => s.status === st).length;
                return (
                  <div key={st} className="flex justify-between py-1">
                    <StatusBadge status={st} />
                    <span className="text-[13px] font-bold text-card-foreground tabular-nums">{count}</span>
                  </div>
                );
              })}
            </div>
          </SidebarSection>

          <SidebarDivider />

          <SidebarSection title="Top Accessed">
            <div className="space-y-2">
              {[...secrets]
                .sort((a, b) => Number(b.access_count) - Number(a.access_count))
                .slice(0, 5)
                .map(s => (
                  <div key={s.id} className="flex justify-between py-0.5">
                    <span className="text-[13px] text-muted-foreground truncate max-w-[150px]">{s.name}</span>
                    <span className={cn('text-[12px] font-bold tabular-nums', Number(s.access_count) > 10 ? 'text-warning' : 'text-card-foreground')}>
                      {s.access_count}
                    </span>
                  </div>
                ))}
            </div>
          </SidebarSection>
        </div>
      </div>
    </>
  );
}
