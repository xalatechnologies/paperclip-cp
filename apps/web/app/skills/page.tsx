'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  BookOpen, Shield, RefreshCw, ChevronDown, ChevronRight,
  Search, Building2, Cpu, AlertTriangle, CheckCircle,
} from 'lucide-react';
import { TEXT, LAYOUT, CARD } from '@/lib/tokens';
import { cn } from '@/lib/utils';
import {
  SidebarSection, SidebarDivider, MiniProgressBar,
} from '@/components/ui';

const API  = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
const KEY  = process.env.NEXT_PUBLIC_CONTROL_CENTER_API_KEY ?? '';
const AUTH = { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };

interface VpsSkill {
  slug: string; name: string; description: string | null;
  source_type: string; trust_level: string;
  company_id: string; company_name: string;
}

const GOVERNANCE_SLUGS = [
  'context-budget-guard', 'thin-context-policy', 'no-progress-guard',
  'doxis-context-policy', 'idempotent-execution-guard',
];

export default function SkillsPage() {
  const [skills, setSkills] = useState<VpsSkill[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'governance' | 'operational'>('all');

  const refresh = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await fetch(`${API}/api/control/skills`, { headers: AUTH });
      if (!res.ok) throw new Error(`${res.status}`);
      const data = await res.json();
      setSkills(Array.isArray(data) ? data : []);
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const companies       = Array.from(new Set(skills.map(s => s.company_name))).sort();
  const governanceCount = skills.filter(s => GOVERNANCE_SLUGS.includes(s.slug)).length;
  const operationalCount = skills.length - governanceCount;
  const sourceTypes     = Array.from(new Set(skills.map(s => s.source_type)));

  const filtered = skills.filter(s => {
    const matchSearch = !search || s.slug.includes(search.toLowerCase()) || s.name.toLowerCase().includes(search.toLowerCase());
    const isGov = GOVERNANCE_SLUGS.includes(s.slug);
    const matchFilter = filter === 'all' || (filter === 'governance' && isGov) || (filter === 'operational' && !isGov);
    return matchSearch && matchFilter;
  });

  return (
    <>
      {/* Sticky Header */}
      <div className={LAYOUT.pageHeader}>
        <div className="flex items-center justify-between">
          <div>
            <h1 className={TEXT.pageTitle}>Skills Registry</h1>
            <p className={cn(TEXT.pageSub, 'mt-0.5')}>
              {skills.length} skills · {governanceCount} governance · {operationalCount} operational
            </p>
          </div>
          <button onClick={refresh} disabled={loading}
            className="flex items-center gap-2 px-4 py-2 text-[13px] font-medium rounded-lg border border-border bg-card hover:bg-muted text-foreground transition-colors disabled:opacity-50">
            <RefreshCw className={cn('w-3.5 h-3.5', loading && 'animate-spin')} />
            Refresh
          </button>
        </div>
      </div>

      <div className="flex flex-1 min-h-0">
        {/* Main */}
        <div className="flex-1 overflow-y-auto">
          <div className={LAYOUT.pageBody}>

            {/* Error */}
            {error && (
              <div className="flex items-center gap-3 p-4 rounded-xl border border-destructive/15 bg-destructive/5">
                <AlertTriangle className="w-4 h-4 text-destructive flex-shrink-0" />
                <span className="text-[13px] text-destructive">Failed to load skills: {error}</span>
              </div>
            )}

            {/* Stats row */}
            <div className="grid grid-cols-4 gap-4">
              {[
                { label: 'Total Skills',  value: skills.length,       icon: BookOpen, color: 'text-primary', ring: 'ring-primary/20 bg-primary/8' },
                { label: 'Governance',    value: governanceCount,     icon: Shield,   color: 'text-warning',  ring: 'ring-warning/20 bg-warning/8' },
                { label: 'Operational',   value: operationalCount,    icon: Cpu,      color: 'text-chart-2',  ring: 'ring-chart-2/20 bg-chart-2/8' },
                { label: 'Companies',     value: companies.length,    icon: Building2,color: 'text-foreground',ring: 'ring-border bg-muted' },
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

            {/* Search + Filter */}
            <div className="flex items-center gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <input
                  type="text" placeholder="Search by name or slug…"
                  value={search} onChange={e => setSearch(e.target.value)}
                  className="w-full pl-9 pr-4 py-2.5 bg-card border border-border rounded-xl text-[13px] text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-ring/30 transition-shadow"
                />
              </div>
              <div className="flex rounded-xl border border-border overflow-hidden flex-shrink-0">
                {(['all', 'governance', 'operational'] as const).map(f => (
                  <button key={f} onClick={() => setFilter(f)}
                    className={cn(
                      'px-4 py-2.5 text-[12px] font-semibold transition-all',
                      filter === f ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:bg-muted hover:text-foreground'
                    )}>
                    {f === 'all' ? `All (${skills.length})` : f === 'governance' ? `Governance (${governanceCount})` : `Operational (${operationalCount})`}
                  </button>
                ))}
              </div>
            </div>

            {/* Skills by Company */}
            {companies.map(company => {
              const companySkills = filtered.filter(s => s.company_name === company);
              if (companySkills.length === 0) return null;

              return (
                <div key={company}>
                  <div className="flex items-center gap-2.5 mb-3">
                    <Building2 className="w-4 h-4 text-muted-foreground" />
                    <h2 className={TEXT.sectionTitle}>{company}</h2>
                    <span className="text-[11px] font-semibold text-muted-foreground bg-muted px-2 py-0.5 rounded-full">{companySkills.length}</span>
                  </div>

                  <div className={cn(CARD.table, 'divide-y divide-border')}>
                    {companySkills.map(skill => {
                      const isGov  = GOVERNANCE_SLUGS.includes(skill.slug);
                      const key    = `${skill.company_id}-${skill.slug}`;
                      const isOpen = expanded === key;

                      return (
                        <div key={key}>
                          <div
                            className="flex items-center gap-4 px-5 py-4 hover:bg-muted/25 transition-colors cursor-pointer"
                            onClick={() => setExpanded(isOpen ? null : key)}
                          >
                            <div className={cn(
                              'w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0',
                              isGov ? 'bg-warning/10 text-warning' : 'bg-chart-2/10 text-chart-2'
                            )}>
                              {isGov ? <Shield size={15} /> : <Cpu size={15} />}
                            </div>

                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2.5">
                                <span className="text-[14px] font-semibold text-card-foreground truncate">{skill.name}</span>
                                {isGov && (
                                  <span className="text-[10px] px-2 py-0.5 rounded-md bg-warning/10 text-warning font-bold uppercase tracking-wider flex-shrink-0">
                                    Governance
                                  </span>
                                )}
                              </div>
                              <span className="font-mono text-[11px] text-muted-foreground">{skill.slug}</span>
                            </div>

                            <span className="font-mono text-[11px] text-muted-foreground bg-muted px-2 py-0.5 rounded-md flex-shrink-0">{skill.source_type}</span>
                            <div className="text-muted-foreground/50 flex-shrink-0">
                              {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                            </div>
                          </div>

                          {isOpen && (
                            <div className="px-5 py-5 bg-muted/20 border-t border-border">
                              <div className="grid grid-cols-3 gap-6 mb-4">
                                {[
                                  { label: 'Slug',        value: skill.slug,         mono: true },
                                  { label: 'Source',      value: skill.source_type,  mono: false },
                                  { label: 'Trust Level', value: skill.trust_level,  mono: false },
                                ].map(f => (
                                  <div key={f.label}>
                                    <div className={cn(TEXT.label, 'mb-1')}>{f.label}</div>
                                    <span className={cn('text-[13px] text-foreground', f.mono && 'font-mono')}>{f.value}</span>
                                  </div>
                                ))}
                              </div>
                              {skill.description && (
                                <p className="text-[13px] text-muted-foreground leading-relaxed">{skill.description}</p>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}

            {filtered.length === 0 && !loading && (
              <div className={cn(CARD.table, 'py-20 text-center')}>
                <BookOpen size={32} className="text-muted-foreground/15 mx-auto mb-4" />
                <div className="text-[15px] font-medium text-muted-foreground">No skills found</div>
                <p className="text-[13px] text-muted-foreground/60 mt-1">
                  {search ? 'Try a different search term.' : 'Skills will appear here once deployed.'}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Right Sidebar */}
        <div className={LAYOUT.rightSidebar}>
          <SidebarSection title="Overview">
            <div className="space-y-1.5">
              {[
                { label: 'Total',      value: skills.length },
                { label: 'Governance', value: governanceCount },
                { label: 'Operational',value: operationalCount },
                { label: 'Companies',  value: companies.length },
              ].map(r => (
                <div key={r.label} className="flex items-center justify-between py-1">
                  <span className="text-[13px] text-muted-foreground">{r.label}</span>
                  <span className="text-[13px] font-bold text-card-foreground tabular-nums">{r.value}</span>
                </div>
              ))}
            </div>
          </SidebarSection>

          <SidebarDivider />

          <SidebarSection title="Governance Checklist">
            <div className="space-y-2">
              {GOVERNANCE_SLUGS.map(slug => {
                const deployed = skills.some(s => s.slug === slug);
                return (
                  <div key={slug} className="flex items-center gap-2.5 py-0.5">
                    {deployed
                      ? <CheckCircle className="w-4 h-4 text-success flex-shrink-0" />
                      : <AlertTriangle className="w-4 h-4 text-destructive flex-shrink-0" />}
                    <span className={cn('font-mono text-[11px] leading-tight', deployed ? 'text-muted-foreground' : 'text-destructive')}>
                      {slug}
                    </span>
                  </div>
                );
              })}
            </div>
          </SidebarSection>

          <SidebarDivider />

          <SidebarSection title="Source Types">
            <div className="space-y-1.5">
              {sourceTypes.map(st => {
                const count = skills.filter(s => s.source_type === st).length;
                return (
                  <div key={st} className="flex items-center justify-between py-1">
                    <span className="font-mono text-[12px] text-muted-foreground">{st}</span>
                    <span className="text-[12px] font-semibold text-card-foreground bg-muted px-2 py-0.5 rounded-md tabular-nums">{count}</span>
                  </div>
                );
              })}
            </div>
          </SidebarSection>

          <SidebarDivider />

          <SidebarSection title="By Company">
            <div className="space-y-3">
              {companies.map(c => {
                const count    = skills.filter(s => s.company_name === c).length;
                const govCount = skills.filter(s => s.company_name === c && GOVERNANCE_SLUGS.includes(s.slug)).length;
                return (
                  <div key={c}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[13px] font-medium text-foreground truncate">{c}</span>
                      <span className="text-[11px] text-muted-foreground">{count} skills</span>
                    </div>
                    <MiniProgressBar value={count} max={Math.max(skills.length, 1)} colorClass="bg-primary/50" />
                    <span className="text-[11px] text-muted-foreground/60">{govCount} governance</span>
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
