import type { Metadata } from 'next';
import Link from 'next/link';
import { Building2, Bot, AlertCircle, TrendingUp, ArrowUpRight } from 'lucide-react';
import { getCompanies, getAgentsByCompany, fmtDate } from '@/lib/api';
import { TEXT, CARD } from '@/lib/tokens';
import { cn } from '@/lib/utils';
import {
  PageHeader, PageBody, PageLayout,
  StatCard, StatGrid,
  SectionHeader,
  StatusBadge, MonoBadge,
  RightSidebar, SidebarSection, SidebarDivider, SidebarRow,
  MiniProgressBar,
} from '@/components/ui';

export const metadata: Metadata = { title: 'Companies' };

function fmtBudget(cents: number) {
  if (!cents) return '—';
  return `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 0 })}`;
}

export default async function CompaniesPage() {
  const companies = await getCompanies() ?? [];
  const agentLists = await Promise.all(companies.map(c => getAgentsByCompany(c.id)));

  const rows = companies.map((c, i) => ({
    ...c,
    agents:       agentLists[i] ?? [],
    errorAgents:  (agentLists[i] ?? []).filter(a => a.status === 'error').length,
    activeAgents: (agentLists[i] ?? []).filter(a => a.status === 'active').length,
  }));

  const totalAgents     = rows.reduce((s, r) => s + r.agents.length, 0);
  const totalErrors     = rows.reduce((s, r) => s + r.errorAgents, 0);
  const activeCompanies = rows.filter(r => r.status === 'active').length;

  const sidebar = (
    <RightSidebar>
      <SidebarSection title="Fleet Overview">
        <div className="space-y-3">
          {rows.map(r => {
            const pct = totalAgents > 0 ? Math.round((r.agents.length / totalAgents) * 100) : 0;
            return (
              <div key={r.id}>
                <div className="flex items-center justify-between mb-1">
                  <Link href={`/companies/${r.id}`} className="text-[13px] font-medium text-foreground no-underline hover:text-primary transition-colors">{r.name}</Link>
                  <span className="text-[11px] text-muted-foreground">{r.agents.length} agents</span>
                </div>
                <MiniProgressBar
                  value={r.agents.length}
                  max={totalAgents}
                  colorClass={r.errorAgents > 0 ? 'bg-destructive/50' : 'bg-primary/50'}
                />
                <div className="flex justify-between mt-1">
                  <span className="text-[11px] text-muted-foreground/60">{pct}% of fleet</span>
                  {r.errorAgents > 0 && <span className="text-[11px] text-destructive font-semibold">{r.errorAgents} err</span>}
                </div>
              </div>
            );
          })}
        </div>
      </SidebarSection>

      <SidebarDivider />

      <SidebarSection title="Budget">
        {rows.filter(r => r.budgetMonthlyCents > 0).length === 0 ? (
          <p className="text-[13px] text-muted-foreground">No budgets configured</p>
        ) : (
          <div className="space-y-3">
            {rows.filter(r => r.budgetMonthlyCents > 0).map(r => {
              const spentPct = r.budgetMonthlyCents > 0 ? Math.min((r.spentMonthlyCents / r.budgetMonthlyCents) * 100, 100) : 0;
              return (
                <div key={r.id}>
                  <div className="flex justify-between mb-1">
                    <span className="text-[13px] font-medium text-foreground">{r.issuePrefix}</span>
                    <span className="text-[11px] text-muted-foreground">{fmtBudget(r.spentMonthlyCents)} / {fmtBudget(r.budgetMonthlyCents)}</span>
                  </div>
                  <MiniProgressBar value={spentPct} max={100} colorClass={spentPct > 80 ? 'bg-destructive/60' : 'bg-success/50'} />
                </div>
              );
            })}
          </div>
        )}
      </SidebarSection>

      <SidebarDivider />

      <SidebarSection title="Quick Links">
        <div className="space-y-0.5">
          {rows.map(r => (
            <Link key={r.id} href={`/companies/${r.id}`}
              className="group flex items-center justify-between px-3 py-2 rounded-lg hover:bg-muted/60 transition-all no-underline -mx-1">
              <span className="text-[13px] font-medium text-foreground group-hover:text-primary transition-colors">{r.name}</span>
              <ArrowUpRight className="w-3.5 h-3.5 text-muted-foreground/30 group-hover:text-primary transition-colors" />
            </Link>
          ))}
        </div>
      </SidebarSection>
    </RightSidebar>
  );

  return (
    <PageLayout sidebar={sidebar}>
      <PageHeader
        title="Companies"
        subtitle={`${companies.length} registered · ${activeCompanies} active`}
      />

      <PageBody>
        {/* Stats */}
        <StatGrid cols={4}>
          <StatCard label="Companies"    value={companies.length} icon={Building2}   color="text-primary"     ring="primary"                                                                    />
          <StatCard label="Active"       value={activeCompanies}  icon={TrendingUp}  color="text-success"     ring="success"                                                                    />
          <StatCard label="Total Agents" value={totalAgents}      icon={Bot}         color="text-chart-2"     ring="chart2"                                                                     />
          <StatCard label="Agent Errors" value={totalErrors}      icon={AlertCircle} color={totalErrors > 0 ? 'text-destructive' : 'text-success'} ring={totalErrors > 0 ? 'destructive' : 'success'} />
        </StatGrid>

        {/* Company cards */}
        <div>
          <SectionHeader
            title="Organizations"
            subtitle={`${rows.length} company${rows.length !== 1 ? 'ies' : 'y'} registered`}
          />

          {rows.length === 0 ? (
            <div className={cn(CARD.table, 'py-16 text-center')}>
              <Building2 size={28} className="text-muted-foreground/15 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">No companies registered</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-5">
              {rows.map(company => (
                <div key={company.id} className={cn(CARD.hover, 'overflow-hidden')}>
                  {/* Card header */}
                  <div className="px-6 py-5 border-b border-border">
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2.5 mb-2 flex-wrap">
                          <h2 className="text-[16px] font-bold text-card-foreground tracking-tight">{company.name}</h2>
                          <MonoBadge>{company.issuePrefix}</MonoBadge>
                          <StatusBadge status={company.status} />
                        </div>
                        {company.description && (
                          <p className="text-[13px] text-muted-foreground leading-relaxed line-clamp-2">{company.description}</p>
                        )}
                      </div>
                      <Link href={`/companies/${company.id}`}
                        className="p-2 rounded-lg hover:bg-muted text-muted-foreground/40 hover:text-primary transition-all no-underline flex-shrink-0 ml-3">
                        <ArrowUpRight className="w-4 h-4" />
                      </Link>
                    </div>
                  </div>

                  {/* Stats row */}
                  <div className="grid grid-cols-3 divide-x divide-border">
                    {[
                      { label: 'Agents', value: company.agents.length, sub: `${company.activeAgents} active`, color: 'text-card-foreground' },
                      { label: 'Errors', value: company.errorAgents, sub: company.errorAgents > 0 ? 'Needs attention' : 'All healthy', color: company.errorAgents > 0 ? 'text-destructive' : 'text-success' },
                      { label: 'Budget', value: fmtBudget(company.budgetMonthlyCents), sub: company.spentMonthlyCents > 0 ? `${fmtBudget(company.spentMonthlyCents)} spent` : 'monthly', color: 'text-card-foreground' },
                    ].map(stat => (
                      <div key={stat.label} className="px-5 py-4">
                        <div className={cn(TEXT.label, 'mb-1.5')}>{stat.label}</div>
                        <div className={cn('text-[18px] font-bold', stat.color)} style={{ letterSpacing: '-0.03em' }}>{stat.value}</div>
                        <div className="text-[11px] text-muted-foreground mt-0.5">{stat.sub}</div>
                      </div>
                    ))}
                  </div>

                  {/* Agent tags */}
                  {company.agents.length > 0 && (
                    <div className="px-6 pt-3 pb-4 border-t border-border/40">
                      <div className="flex flex-wrap gap-1.5">
                        {company.agents.slice(0, 5).map(a => (
                          <span key={a.id} className={cn(
                            'text-[11px] px-2.5 py-0.5 rounded-full font-medium',
                            a.status === 'error' ? 'bg-destructive/10 text-destructive' : 'bg-muted text-muted-foreground'
                          )}>
                            {a.name}
                          </span>
                        ))}
                        {company.agents.length > 5 && (
                          <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-muted text-muted-foreground">
                            +{company.agents.length - 5} more
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </PageBody>
    </PageLayout>
  );
}
