import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Bot, BookOpen, AlertCircle, ChevronRight, Activity, Calendar, Hash } from 'lucide-react';
import { getCompany, getAgentsByCompany, getIssuesByCompany, statusClasses, fmtDate, fmtRelative, type Issue } from '@/lib/api';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const company = await getCompany(id);
  return { title: company?.name ?? 'Company' };
}

const priorityClasses = (p: string | null) => {
  if (p === 'urgent') return 'text-destructive bg-destructive/10';
  if (p === 'high') return 'text-warning bg-warning/10';
  if (p === 'medium') return 'text-chart-2 bg-chart-2/10';
  return 'text-muted-foreground bg-muted';
};

export default async function CompanyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [company, agents, issuesRaw] = await Promise.all([
    getCompany(id),
    getAgentsByCompany(id),
    getIssuesByCompany(id, 20),
  ]);

  if (!company) notFound();

  const safeAgents = agents ?? [];
  const issues: Issue[] = Array.isArray(issuesRaw)
    ? issuesRaw
    : (issuesRaw as any)?.items ?? [];

  const errorAgents  = safeAgents.filter(a => a.status === 'error');
  const activeAgents = safeAgents.filter(a => a.status === 'active');
  const idleAgents   = safeAgents.filter(a => a.status === 'idle');

  const issuesByStatus: Record<string, number> = {};
  issues.forEach(i => { issuesByStatus[i.status] = (issuesByStatus[i.status] || 0) + 1; });

  const adapterTypes = Array.from(new Set(safeAgents.map(a => a.adapterType).filter(Boolean)));

  return (
    <>
      {/* Header */}
      <div className="px-7 py-5 border-b border-border bg-card sticky top-0 z-40">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Link href="/companies" className="text-xs text-muted-foreground no-underline hover:text-primary flex items-center gap-1 transition-colors">
                <ArrowLeft size={12} /> Companies
              </Link>
              <span className="text-muted-foreground/30">/</span>
              <span className="text-xs text-muted-foreground">{company.name}</span>
            </div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-lg font-semibold text-card-foreground tracking-tight">{company.name}</h1>
              <span className="font-mono text-[11px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">{company.issuePrefix}</span>
              <span className={`inline-flex items-center gap-1.5 text-[11px] font-semibold px-2 py-0.5 rounded ${statusClasses(company.status)}`}>
                <span className="w-1.5 h-1.5 rounded-full bg-current" />{company.status}
              </span>
            </div>
            {company.description && (
              <p className="text-xs text-muted-foreground mt-1">{company.description}</p>
            )}
          </div>
          <div className="text-right">
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Company ID</div>
            <div className="font-mono text-[11px] text-muted-foreground">{company.id.slice(0, 16)}…</div>
          </div>
        </div>
      </div>

      <div className="flex flex-1 min-h-0">
        {/* Main */}
        <div className="flex-1 p-7 overflow-y-auto space-y-5">

          {errorAgents.length > 0 && (
            <div className="flex items-start gap-2.5 p-3.5 rounded-lg bg-destructive/5 border border-destructive/15 text-destructive">
              <AlertCircle size={16} className="shrink-0 mt-0.5" />
              <div>
                <div className="text-sm font-semibold">{errorAgents.length} agent{errorAgents.length > 1 ? 's' : ''} in error state</div>
                <div className="text-xs mt-0.5 opacity-80">{errorAgents.map(a => a.name).join(', ')}</div>
              </div>
            </div>
          )}

          {/* Stat cards */}
          <div className="grid grid-cols-4 gap-3">
            {[
              { label: 'Total Agents', value: safeAgents.length, sub: `${activeAgents.length} active`, icon: Bot, color: 'text-chart-2', bg: 'bg-chart-2/10' },
              { label: 'Errors', value: errorAgents.length, sub: errorAgents.length === 0 ? 'All healthy' : 'Needs attention', icon: AlertCircle, color: errorAgents.length > 0 ? 'text-destructive' : 'text-success', bg: errorAgents.length > 0 ? 'bg-destructive/10' : 'bg-success/10' },
              { label: 'Open Issues', value: issues.length || '—', sub: issues.length > 0 ? `${issuesByStatus['in_progress'] || 0} in progress` : 'No open issues', icon: BookOpen, color: 'text-primary', bg: 'bg-primary/10' },
              { label: 'Issue Counter', value: `#${company.issueCounter}`, sub: `Prefix: ${company.issuePrefix}`, icon: Hash, color: 'text-foreground', bg: 'bg-muted' },
            ].map(s => (
              <div key={s.label} className="bg-card border border-border rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">{s.label}</span>
                  <div className={`p-1.5 rounded-md ${s.bg}`}><s.icon className={`w-3.5 h-3.5 ${s.color}`} /></div>
                </div>
                <div className="text-2xl font-bold text-card-foreground">{s.value}</div>
                <div className="text-xs text-muted-foreground mt-2">{s.sub}</div>
              </div>
            ))}
          </div>

          {/* Agents + Issues grid */}
          <div className="grid grid-cols-2 gap-5">
            {/* Agents */}
            <div>
              <h2 className="text-sm font-semibold text-card-foreground mb-3 flex items-center gap-2">
                Agents
                <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">{safeAgents.length}</span>
              </h2>
              <div className="bg-card border border-border rounded-lg overflow-hidden">
                {safeAgents.length === 0 ? (
                  <div className="p-8 text-center text-muted-foreground">
                    <Bot size={24} className="opacity-20 mx-auto mb-2" />
                    <div className="text-[13px]">No agents registered</div>
                  </div>
                ) : (
                  <table className="w-full text-[13px] border-collapse">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="text-left px-4 py-2.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Agent</th>
                        <th className="text-left px-4 py-2.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Adapter</th>
                        <th className="text-left px-4 py-2.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Status</th>
                        <th className="text-left px-4 py-2.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Since</th>
                      </tr>
                    </thead>
                    <tbody>
                      {safeAgents
                        .sort((a, b) => (a.status === 'error' ? -1 : b.status === 'error' ? 1 : 0))
                        .map(agent => (
                          <tr key={agent.id} className="border-b border-border/50 last:border-0 hover:bg-muted/30 transition-colors">
                            <td className="px-4 py-2.5">
                              <div className="font-semibold text-card-foreground">{agent.name}</div>
                              {agent.description && <div className="text-[10px] text-muted-foreground">{agent.description}</div>}
                            </td>
                            <td className="px-4 py-2.5">
                              {agent.adapterType ? (
                                <span className="font-mono text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">{agent.adapterType}</span>
                              ) : <span className="text-muted-foreground/40">—</span>}
                            </td>
                            <td className="px-4 py-2.5">
                              <span className={`inline-flex items-center gap-1.5 text-[10px] font-semibold px-2 py-0.5 rounded ${statusClasses(agent.status)}`}>
                                <span className={`w-1.5 h-1.5 rounded-full bg-current ${agent.status === 'active' ? 'animate-pulse' : ''}`} />
                                {agent.status}
                              </span>
                            </td>
                            <td className="px-4 py-2.5 text-xs text-muted-foreground">{fmtDate(agent.createdAt)}</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>

            {/* Issues */}
            <div>
              <h2 className="text-sm font-semibold text-card-foreground mb-3 flex items-center gap-2">
                Open Issues
                <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">{issues.length}</span>
              </h2>
              <div className="bg-card border border-border rounded-lg overflow-hidden">
                {issues.length === 0 ? (
                  <div className="p-8 text-center text-muted-foreground">
                    <BookOpen size={24} className="opacity-20 mx-auto mb-2" />
                    <div className="text-[13px]">No open issues</div>
                  </div>
                ) : (
                  <div className="divide-y divide-border">
                    {issues.map(issue => (
                      <div key={issue.id} className="px-4 py-3 hover:bg-muted/30 transition-colors">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="font-mono text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded flex-shrink-0">
                                {issue.prefix}-{issue.number}
                              </span>
                              <span className="text-[13px] font-medium text-card-foreground truncate">{issue.title}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded ${statusClasses(issue.status)}`}>
                                <span className="w-1 h-1 rounded-full bg-current" />{issue.status}
                              </span>
                              {issue.priority && (
                                <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${priorityClasses(issue.priority)}`}>
                                  {issue.priority}
                                </span>
                              )}
                            </div>
                          </div>
                          <span className="text-[10px] text-muted-foreground flex-shrink-0 mt-0.5">{fmtRelative(issue.updatedAt)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Right Sidebar */}
        <div className="w-[260px] border-l border-border bg-card/50 p-5 space-y-5 flex-shrink-0 overflow-y-auto hidden xl:block">
          <div>
            <h3 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-3">Agent Health</h3>
            <div className="space-y-2">
              {[
                { label: 'Active', value: activeAgents.length, color: 'bg-success' },
                { label: 'Idle', value: idleAgents.length, color: 'bg-muted-foreground/30' },
                { label: 'Error', value: errorAgents.length, color: 'bg-destructive' },
              ].map(s => (
                <div key={s.label}>
                  <div className="flex justify-between mb-1">
                    <span className="text-xs text-muted-foreground">{s.label}</span>
                    <span className="text-xs font-bold text-card-foreground">{s.value}</span>
                  </div>
                  <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                    <div className={`h-full ${s.color} rounded-full`}
                      style={{ width: `${safeAgents.length > 0 ? (s.value / safeAgents.length) * 100 : 0}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="border-t border-border" />

          <div>
            <h3 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-3">Adapters</h3>
            <div className="space-y-1">
              {adapterTypes.map(at => (
                <div key={at} className="flex justify-between py-1">
                  <span className="font-mono text-[10px] text-muted-foreground">{at}</span>
                  <span className="text-xs font-semibold">{safeAgents.filter(a => a.adapterType === at).length}</span>
                </div>
              ))}
            </div>
          </div>

          {issues.length > 0 && (
            <>
              <div className="border-t border-border" />
              <div>
                <h3 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-3">Issues by Status</h3>
                <div className="space-y-1">
                  {Object.entries(issuesByStatus).map(([status, count]) => (
                    <div key={status} className="flex justify-between py-1">
                      <span className="text-xs text-muted-foreground">{status}</span>
                      <span className="text-xs font-bold text-card-foreground">{count}</span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          <div className="border-t border-border" />

          <div>
            <h3 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-3">Company Info</h3>
            <div className="space-y-1.5 text-xs">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Prefix</span>
                <span className="font-mono text-foreground">{company.issuePrefix}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Counter</span>
                <span className="text-foreground">#{company.issueCounter}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Created</span>
                <span className="text-foreground">{fmtDate(company.createdAt)}</span>
              </div>
            </div>
          </div>

          <div className="border-t border-border" />

          <Link href="/companies" className="flex items-center gap-2 text-xs text-muted-foreground hover:text-primary transition-colors no-underline">
            <ArrowLeft className="w-3.5 h-3.5" /> All Companies
          </Link>
        </div>
      </div>
    </>
  );
}
