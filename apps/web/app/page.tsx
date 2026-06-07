import type { Metadata } from 'next';
import Link from 'next/link';
import {
  Building2, Bot, AlertCircle, Activity, Zap,
  Shield, BookOpen, Heart, Target, ArrowUpRight,
} from 'lucide-react';
import { getCompanies, getAgentsByCompany, getSession, getCostSummary, type Agent } from '@/lib/api';
import { getStatusConfig, fmtTokens, ICON_RINGS, TEXT, LAYOUT } from '@/lib/tokens';
import { cn } from '@/lib/utils';
import {
  PageHeader, PageBody, PageLayout,
  StatCard, StatGrid,
  SectionHeader,
  StatusBadge, MonoBadge, AlertBanner,
  DataTable, TR, TD,
  RightSidebar, SidebarSection, SidebarDivider, SidebarRow, SidebarMetricCard, SidebarNavLink,
  MiniProgressBar,
} from '@/components/ui';

export const metadata: Metadata = { title: 'Dashboard' };

export default async function DashboardPage() {
  const [companies, session, costSummary] = await Promise.all([
    getCompanies(), getSession(), getCostSummary(),
  ]);

  const safeCompanies = companies ?? [];
  const agentLists = await Promise.all(safeCompanies.map(c => getAgentsByCompany(c.id)));

  const allAgents: (Agent & { companyName: string; companyPrefix: string })[] = [];
  safeCompanies.forEach((c, i) =>
    (agentLists[i] ?? []).forEach(a =>
      allAgents.push({ ...a, companyName: c.name, companyPrefix: c.issuePrefix })
    )
  );

  const totalAgents  = allAgents.length;
  const errorAgents  = allAgents.filter(a => a.status === 'error').length;
  const activeAgents = allAgents.filter(a => a.status === 'active').length;
  const idleAgents   = allAgents.filter(a => a.status === 'idle').length;

  const totalTokens  = costSummary ? Number(costSummary.total?.total_tokens  ?? 0) : 0;
  const todayTokens  = costSummary ? Number(costSummary.today?.tokens        ?? 0) : 0;
  const cachedTokens = costSummary ? Number(costSummary.total?.cached_tokens ?? 0) : 0;
  const cacheRate    = (cachedTokens + totalTokens) > 0
    ? Math.round((cachedTokens / (cachedTokens + totalTokens)) * 100) : 0;
  const todayEvents  = costSummary ? Number(costSummary.today?.events ?? 0) : 0;
  const topAgents    = costSummary?.topAgents ?? [];

  const sidebar = (
    <RightSidebar>
      <SidebarSection title="Quick Access">
        <div className="space-y-0.5 -mx-1">
          <SidebarNavLink href="/costs"      label="Token Usage"      sub={fmtTokens(totalTokens)} icon={Zap} />
          <SidebarNavLink href="/skills"     label="Skills Registry"  sub="Governance"             icon={BookOpen} />
          <SidebarNavLink href="/heartbeats" label="Runtime Control"  sub="Agent configs"          icon={Heart} />
          <SidebarNavLink href="/audit"      label="Anti-Bloat Audit" sub="Run checks"             icon={Shield} />
          <SidebarNavLink href="/secrets"    label="Secrets"          sub="AES-256-GCM"            icon={Target} />
        </div>
      </SidebarSection>

      <SidebarDivider />

      <SidebarSection title="Token Health">
        <SidebarMetricCard
          label="Cache Hit Rate"
          value={`${cacheRate}%`}
          valueClass="text-success"
          bar={{ value: cacheRate, max: 100 }}
          barColor="bg-success/50"
        />
        <div className="space-y-1 mt-3">
          <SidebarRow label="Total"  value={fmtTokens(totalTokens)} />
          <SidebarRow label="Today"  value={fmtTokens(todayTokens)} />
          <SidebarRow label="Cached" value={fmtTokens(cachedTokens)} valueClass="text-success" />
        </div>
      </SidebarSection>

      <SidebarDivider />

      <SidebarSection title="System">
        <div className="space-y-1">
          <SidebarRow label="Phase"     value="1 — Foundation" />
          <SidebarRow label="Companies" value={String(safeCompanies.length)} />
          <SidebarRow label="API"       value={session ? 'Connected' : 'Down'} valueClass={session ? 'text-success' : 'text-destructive'} />
          <SidebarRow label="Context"   value="Thin" valueClass="text-success" />
        </div>
      </SidebarSection>
    </RightSidebar>
  );

  return (
    <PageLayout sidebar={sidebar}>
      {/* Header */}
      <PageHeader
        title="Control Center"
        subtitle={new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
        badge={session ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span className="w-2 h-2 rounded-full bg-success animate-pulse" />
            <span className="text-success font-semibold">Live</span>
            <span className="text-muted-foreground/40">·</span>
            <span>{session.email}</span>
          </div>
        ) : undefined}
      />

      <PageBody>
        {/* Error banner */}
        {errorAgents > 0 && (
          <AlertBanner
            icon={AlertCircle}
            title={`${errorAgents} agent${errorAgents > 1 ? 's' : ''} need attention`}
            detail={allAgents.filter(a => a.status === 'error').map(a => `${a.companyPrefix} → ${a.name}`).join(' · ')}
            href="/agents"
            variant="error"
          />
        )}

        {/* Stats */}
        <StatGrid cols={5}>
          <StatCard label="Companies"   value={safeCompanies.length} sub={`${safeCompanies.filter(c => c.status === 'active').length} active`} icon={Building2} color="text-primary"     ring="primary"                                                                href="/companies" />
          <StatCard label="Agents"      value={totalAgents}          sub={`${activeAgents} active · ${idleAgents} idle`}                       icon={Bot}        color="text-chart-2"     ring="chart2"                                                                href="/agents" />
          <StatCard label="Errors"      value={errorAgents}          sub={errorAgents > 0 ? 'Needs attention' : 'All healthy'}                  icon={AlertCircle} color={errorAgents > 0 ? 'text-destructive' : 'text-success'} ring={errorAgents > 0 ? 'destructive' : 'success'} href="/agents" />
          <StatCard label="Total Tokens" value={fmtTokens(totalTokens)} sub={`${fmtTokens(todayTokens)} today`}                               icon={Zap}        color="text-warning"     ring="warning"                                                                href="/costs" />
          <StatCard label="Cache Rate"  value={`${cacheRate}%`}      sub={`${fmtTokens(cachedTokens)} saved`}                                  icon={Activity}   color="text-success"     ring="success"                                                                href="/costs" />
        </StatGrid>

        {/* Mid grid */}
        <div className="grid grid-cols-5 gap-6">
          {/* Companies + Agent Fleet — 3 col */}
          <div className="col-span-3 space-y-6">
            <div>
              <SectionHeader title="Companies" subtitle={`${safeCompanies.length} registered organizations`} href="/companies" />
              <DataTable
                columns={[
                  { key: 'company', label: 'Company' },
                  { key: 'agents',  label: 'Agents' },
                  { key: 'prefix',  label: 'Prefix' },
                  { key: 'status',  label: 'Status' },
                  { key: 'nav',     label: '' },
                ]}
                hasRows={safeCompanies.length > 0}
                empty={{ icon: Building2, message: 'No companies found' }}
              >
                {safeCompanies.map((company, i) => {
                  const agents = agentLists[i] ?? [];
                  const errs   = agents.filter(a => a.status === 'error').length;
                  return (
                    <TR key={company.id}>
                      <TD sub={undefined}>
                        <Link href={`/companies/${company.id}`} className={TEXT.link}>{company.name}</Link>
                      </TD>
                      <TD>
                        <div className="flex items-center gap-2">
                          <span className="text-[14px] font-semibold text-card-foreground">{agents.length}</span>
                          {errs > 0 && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-destructive/10 text-destructive">{errs} err</span>}
                        </div>
                      </TD>
                      <TD><MonoBadge>{company.issuePrefix}</MonoBadge></TD>
                      <TD><StatusBadge status={company.status} /></TD>
                      <td className="px-5 py-4 border-b border-border/40 text-right">
                        <Link href={`/companies/${company.id}`} className="text-muted-foreground/30 hover:text-primary transition-colors no-underline">
                          <ArrowUpRight className="w-4 h-4 inline" />
                        </Link>
                      </td>
                    </TR>
                  );
                })}
              </DataTable>
            </div>

            {/* Agent Fleet */}
            <div>
              <SectionHeader
                title="Agent Fleet"
                subtitle={`${totalAgents} agents across ${safeCompanies.length} companies`}
                href="/agents"
              />
              {allAgents.length === 0 ? (
                <div className="bg-card border border-border rounded-xl py-12 text-center">
                  <Activity size={24} className="text-muted-foreground/15 mx-auto mb-3" />
                  <p className="text-sm text-muted-foreground">No agents registered</p>
                </div>
              ) : (
                <div className="bg-card border border-border rounded-xl overflow-hidden">
                  {/* Status bar */}
                  <div className="flex h-1.5">
                    <div className="bg-success transition-all duration-700" style={{ flex: activeAgents || 0 }} />
                    <div className="bg-destructive transition-all duration-700" style={{ flex: errorAgents || 0 }} />
                    <div className="bg-muted-foreground/20 transition-all duration-700" style={{ flex: idleAgents || 0 }} />
                  </div>
                  {/* Summary */}
                  <div className="flex items-center gap-8 px-6 py-4 border-b border-border">
                    {[
                      { label: 'Active', value: activeAgents, cls: 'text-success' },
                      { label: 'Error',  value: errorAgents,  cls: errorAgents > 0 ? 'text-destructive' : 'text-muted-foreground' },
                      { label: 'Idle',   value: idleAgents,   cls: 'text-foreground' },
                      { label: 'Total',  value: totalAgents,  cls: 'text-foreground' },
                    ].map(s => (
                      <div key={s.label} className="flex items-baseline gap-1.5">
                        <span className={cn('text-xl font-bold', s.cls)} style={{ letterSpacing: '-0.03em' }}>{s.value}</span>
                        <span className={TEXT.label}>{s.label}</span>
                      </div>
                    ))}
                  </div>
                  {/* Grid */}
                  <div className="grid grid-cols-2 divide-x divide-border">
                    {allAgents
                      .sort((a, b) => a.status === 'error' ? -1 : b.status === 'error' ? 1 : 0)
                      .slice(0, 6)
                      .map(agent => (
                        <div key={agent.id} className="px-5 py-3.5 border-b border-border/40 hover:bg-muted/20 transition-colors">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="text-[13px] font-semibold text-card-foreground truncate leading-snug">{agent.name}</div>
                              <div className="text-[11px] text-muted-foreground mt-0.5">{agent.companyName}</div>
                            </div>
                            <StatusBadge status={agent.status} />
                          </div>
                        </div>
                      ))}
                  </div>
                  {allAgents.length > 6 && (
                    <div className="px-6 py-3 border-t border-border bg-muted/20">
                      <Link href="/agents" className={TEXT.viewAll}>
                        View all {allAgents.length} agents <ArrowUpRight size={13} />
                      </Link>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Activity — 2 col */}
          <div className="col-span-2 space-y-4">
            <SectionHeader title="Today's Activity" subtitle="Real-time agent metrics" />

            {/* Token usage */}
            <div className="bg-card border border-border rounded-xl p-5">
              <div className="flex items-end justify-between mb-3">
                <div>
                  <div className={cn(TEXT.label, 'mb-1')}>Token Usage</div>
                  <div className="text-2xl font-bold text-card-foreground" style={{ letterSpacing: '-0.04em' }}>{fmtTokens(todayTokens)}</div>
                </div>
                <div className="text-right">
                  <div className={cn(TEXT.label, 'mb-1')}>Runs</div>
                  <div className="text-2xl font-bold text-chart-2" style={{ letterSpacing: '-0.04em' }}>{todayEvents}</div>
                </div>
              </div>
              <MiniProgressBar value={todayTokens} max={totalTokens * 0.33} colorClass="bg-primary/50" />
              <div className="text-[11px] text-muted-foreground mt-1.5">of {fmtTokens(totalTokens)} total</div>
            </div>

            {/* Cache rate */}
            <div className="bg-card border border-border rounded-xl p-5">
              <div className="flex items-center justify-between mb-3">
                <div className={TEXT.label}>Cache Hit Rate</div>
                <span className={cn('text-[11px] font-bold px-2 py-0.5 rounded-md', cacheRate >= 80 ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning')}>
                  {cacheRate >= 80 ? 'Excellent' : 'Good'}
                </span>
              </div>
              <div className="text-3xl font-bold text-success mb-3" style={{ letterSpacing: '-0.04em' }}>{cacheRate}%</div>
              <MiniProgressBar value={cacheRate} max={100} colorClass="bg-success/60" height="h-2" />
              <div className="text-[11px] text-muted-foreground mt-2">{fmtTokens(cachedTokens)} tokens saved</div>
            </div>

            {/* Top agents */}
            {topAgents.length > 0 && (
              <div className="bg-card border border-border rounded-xl p-5">
                <div className={cn(TEXT.label, 'mb-3')}>Top Agents</div>
                <div className="space-y-3">
                  {topAgents.slice(0, 4).map((a, idx) => {
                    const maxT = Number(topAgents[0]?.tokens ?? 1);
                    return (
                      <div key={a.name}>
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-bold text-muted-foreground/30 w-4 tabular-nums">{idx + 1}</span>
                            <span className="text-[13px] font-medium text-card-foreground">{a.name}</span>
                          </div>
                          <span className="font-mono text-[11px] text-muted-foreground tabular-nums">{fmtTokens(Number(a.tokens))}</span>
                        </div>
                        <MiniProgressBar value={Number(a.tokens)} max={maxT} colorClass="bg-chart-2/40" height="h-1" />
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>


      </PageBody>
    </PageLayout>
  );
}
