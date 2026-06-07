import type { Metadata } from 'next';
import Link from 'next/link';
import { Bot, AlertCircle, Building2, Activity, Clock } from 'lucide-react';
import { getCompanies, getAgentsByCompany, fmtDate, type Agent } from '@/lib/api';
import { TEXT } from '@/lib/tokens';
import { cn } from '@/lib/utils';
import {
  PageHeader, PageBody, PageLayout,
  StatCard, StatGrid,
  StatusBadge, MonoBadge, AlertBanner,
  DataTable, TR, TD,
  RightSidebar, SidebarSection, SidebarDivider, SidebarRow,
  MiniProgressBar, EmptyState,
} from '@/components/ui';

export const metadata: Metadata = { title: 'Agents' };

export default async function AgentsPage() {
  const companies = await getCompanies() ?? [];
  const agentLists = await Promise.all(companies.map(c => getAgentsByCompany(c.id)));

  const allAgents: (Agent & { companyName: string; companyId: string; prefix: string })[] = [];
  companies.forEach((c, i) =>
    (agentLists[i] ?? []).forEach(a =>
      allAgents.push({ ...a, companyName: c.name, companyId: c.id, prefix: c.issuePrefix })
    )
  );

  const sorted = [...allAgents].sort((a, b) => {
    const order = { error: 0, active: 1, idle: 2, paused: 3 };
    return (order[a.status as keyof typeof order] ?? 4) - (order[b.status as keyof typeof order] ?? 4);
  });

  const errorCount  = allAgents.filter(a => a.status === 'error').length;
  const activeCount = allAgents.filter(a => a.status === 'active').length;
  const idleCount   = allAgents.filter(a => a.status === 'idle').length;
  const pausedCount = allAgents.filter(a => a.status === 'paused').length;

  const adapterTypes = Array.from(new Set(allAgents.map(a => a.adapterType).filter(Boolean)));

  const sidebar = (
    <RightSidebar>
      <SidebarSection title="Status Overview">
        <div className="space-y-2.5">
          {[
            { label: 'Active', value: activeCount, barClass: 'bg-success/60' },
            { label: 'Error',  value: errorCount,  barClass: 'bg-destructive/60' },
            { label: 'Idle',   value: idleCount,   barClass: 'bg-muted-foreground/30' },
            { label: 'Paused', value: pausedCount, barClass: 'bg-warning/60' },
          ].map(s => (
            <div key={s.label}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[13px] text-muted-foreground">{s.label}</span>
                <span className="text-[13px] font-bold text-card-foreground tabular-nums">{s.value}</span>
              </div>
              <MiniProgressBar value={s.value} max={allAgents.length} colorClass={s.barClass} />
            </div>
          ))}
        </div>
      </SidebarSection>

      <SidebarDivider />

      <SidebarSection title="Adapter Types">
        <div className="space-y-1.5">
          {adapterTypes.map(at => {
            const count = allAgents.filter(a => a.adapterType === at).length;
            return (
              <div key={at} className="flex items-center justify-between py-1">
                <span className="font-mono text-[12px] text-muted-foreground">{at}</span>
                <span className="text-[12px] font-semibold text-card-foreground bg-muted px-2 py-0.5 rounded-md tabular-nums">{count}</span>
              </div>
            );
          })}
          {allAgents.filter(a => !a.adapterType).length > 0 && (
            <div className="flex items-center justify-between py-1">
              <span className="text-[12px] text-muted-foreground/50 italic">no adapter</span>
              <span className="text-[12px] font-semibold text-muted-foreground tabular-nums">{allAgents.filter(a => !a.adapterType).length}</span>
            </div>
          )}
        </div>
      </SidebarSection>

      <SidebarDivider />

      <SidebarSection title="By Company">
        <div className="space-y-2.5">
          {companies.map((c, i) => {
            const ags  = agentLists[i] ?? [];
            const errs = ags.filter(a => a.status === 'error').length;
            return (
              <div key={c.id}>
                <div className="flex items-center justify-between mb-1">
                  <Link href={`/companies/${c.id}`} className="text-[13px] font-medium text-foreground no-underline hover:text-primary transition-colors">{c.name}</Link>
                  <div className="flex items-center gap-1.5">
                    {errs > 0 && <span className="text-[11px] text-destructive font-bold">{errs} err</span>}
                    <span className="text-[13px] font-bold text-card-foreground tabular-nums">{ags.length}</span>
                  </div>
                </div>
                <MiniProgressBar value={ags.length} max={allAgents.length} colorClass="bg-primary/40" height="h-1" />
              </div>
            );
          })}
        </div>
      </SidebarSection>

      <SidebarDivider />

      <SidebarSection title="Runtime">
        <Link href="/heartbeats"
          className="flex items-center gap-3 px-4 py-3 rounded-xl bg-primary/5 border border-primary/15 hover:bg-primary/10 transition-all no-underline group">
          <Activity className="w-4 h-4 text-primary flex-shrink-0" />
          <div>
            <div className="text-[13px] font-semibold text-primary">Runtime Control</div>
            <div className="text-[11px] text-muted-foreground">Model, turns, retries</div>
          </div>
        </Link>
      </SidebarSection>
    </RightSidebar>
  );

  return (
    <PageLayout sidebar={sidebar}>
      <PageHeader
        title="Agents"
        subtitle={`${allAgents.length} agents across ${companies.length} companies`}
        action={{ label: 'Runtime Control', href: '/heartbeats' }}
      />

      <PageBody>
        {/* Stats */}
        <StatGrid cols={5}>
          <StatCard label="Total"  value={allAgents.length} icon={Bot}         color="text-primary"     ring="primary" />
          <StatCard label="Active" value={activeCount}      icon={Activity}    color="text-success"     ring="success" />
          <StatCard label="Idle"   value={idleCount}        icon={Clock}       color="text-foreground"  ring="muted" />
          <StatCard label="Paused" value={pausedCount}      icon={Clock}       color="text-warning"     ring="warning" />
          <StatCard label="Error"  value={errorCount}       icon={AlertCircle} color={errorCount > 0 ? 'text-destructive' : 'text-success'} ring={errorCount > 0 ? 'destructive' : 'success'} />
        </StatGrid>

        {/* Alert */}
        {errorCount > 0 && (
          <AlertBanner
            icon={AlertCircle}
            title={`${errorCount} agent${errorCount > 1 ? 's' : ''} need attention`}
            detail={allAgents.filter(a => a.status === 'error').map(a => `${a.prefix} → ${a.name}`).join(' · ')}
            variant="error"
          />
        )}

        {/* Agent table */}
        <DataTable
          columns={[
            { key: 'agent',    label: 'Agent' },
            { key: 'company',  label: 'Company' },
            { key: 'adapter',  label: 'Adapter' },
            { key: 'status',   label: 'Status' },
            { key: 'desc',     label: 'Description' },
            { key: 'created',  label: 'Created' },
          ]}
          hasRows={sorted.length > 0}
          empty={{ icon: Bot, message: 'No agents registered yet' }}
        >
          {sorted.map(agent => (
            <TR key={agent.id}>
              <TD sub={<span className="font-mono">{agent.id.slice(0, 10)}…</span>}>
                {agent.name}
              </TD>
              <TD sub={<>{agent.prefix}</>}>
                <Link href={`/companies/${agent.companyId}`} className={TEXT.link}>{agent.companyName}</Link>
              </TD>
              <TD>
                {agent.adapterType ? <MonoBadge>{agent.adapterType}</MonoBadge> : <span className="text-muted-foreground/30">—</span>}
              </TD>
              <TD>
                <StatusBadge status={agent.status} />
              </TD>
              <td className="px-5 py-4 border-b border-border/40 text-[13px] text-muted-foreground max-w-[200px]">
                <span className="truncate block">{agent.description ?? '—'}</span>
              </td>
              <TD>{fmtDate(agent.createdAt)}</TD>
            </TR>
          ))}
        </DataTable>
      </PageBody>
    </PageLayout>
  );
}
