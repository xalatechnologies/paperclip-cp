import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Bot, BookOpen, AlertCircle } from 'lucide-react';
import { getCompany, getAgentsByCompany, getIssuesByCompany, statusVariant, fmtDate, type Issue } from '@/lib/api';

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const company = await getCompany(params.id);
  return { title: company?.name ?? 'Company' };
}

export default async function CompanyDetailPage({ params }: { params: { id: string } }) {
  const [company, agents, issuesRaw] = await Promise.all([
    getCompany(params.id),
    getAgentsByCompany(params.id),
    getIssuesByCompany(params.id, 10),
  ]);

  if (!company) notFound();

  const safeAgents = agents ?? [];
  const issues: Issue[] = Array.isArray(issuesRaw)
    ? issuesRaw
    : (issuesRaw as any)?.items ?? [];

  const errorAgents  = safeAgents.filter(a => a.status === 'error');
  const activeAgents = safeAgents.filter(a => a.status === 'active');
  const idleAgents   = safeAgents.filter(a => a.status === 'idle');

  return (
    <>
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div>
            <Link
              href="/companies"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-muted)', textDecoration: 'none', marginBottom: 8 }}
            >
              <ArrowLeft size={12} /> Companies
            </Link>
            <h1 className="page-header-title">{company.name}</h1>
            <div className="page-header-sub">
              <span className="mono" style={{ marginRight: 8 }}>{company.issuePrefix}</span>
              <span className={`badge ${statusVariant(company.status)}`}>{company.status}</span>
              <span style={{ marginLeft: 12, color: 'var(--text-disabled)' }}>ID: {company.id.slice(0, 12)}…</span>
            </div>
          </div>
        </div>
      </div>

      <div className="page-body">

        {/* Error alert */}
        {errorAgents.length > 0 && (
          <div className="alert alert-danger" style={{ marginBottom: 24 }}>
            <AlertCircle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
            <div>
              <div style={{ fontWeight: 600 }}>{errorAgents.length} agent{errorAgents.length > 1 ? 's' : ''} in error state</div>
              <div style={{ fontSize: 12, marginTop: 2 }}>{errorAgents.map(a => a.name).join(', ')}</div>
            </div>
          </div>
        )}

        {/* Description */}
        {company.description && (
          <div className="card card-gradient mb-6" style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
              {company.description}
            </div>
          </div>
        )}

        {/* Stats row */}
        <div className="grid-4 mb-6" style={{ marginBottom: 24 }}>
          <div className="stat-card">
            <div className="stat-icon stat-icon-purple"><Bot size={20} /></div>
            <div className="card-label">Agents</div>
            <div className="card-value">{safeAgents.length}</div>
            <div className="card-description mt-4">{activeAgents.length} active · {idleAgents.length} idle</div>
          </div>
          <div className="stat-card">
            <div className={`stat-icon ${errorAgents.length > 0 ? 'stat-icon-red' : 'stat-icon-green'}`}>
              <AlertCircle size={20} />
            </div>
            <div className="card-label">Errors</div>
            <div className="card-value">{errorAgents.length}</div>
            <div className="card-description mt-4">{errorAgents.length === 0 ? 'All healthy' : 'Needs attention'}</div>
          </div>
          <div className="stat-card">
            <div className="stat-icon stat-icon-teal"><BookOpen size={20} /></div>
            <div className="card-label">Issues</div>
            <div className="card-value">{issues.length > 0 ? issues.length : '–'}</div>
            <div className="card-description mt-4">{issues.length > 0 ? 'Open issues' : 'No open issues'}</div>
          </div>
          <div className="stat-card">
            <div className="stat-icon stat-icon-blue"><Bot size={20} /></div>
            <div className="card-label">Prefix</div>
            <div className="card-value" style={{ fontSize: 22 }}>{company.issuePrefix}</div>
            <div className="card-description mt-4">Issue counter: #{company.issueCounter}</div>
          </div>
        </div>

        <div className="grid-2">

          {/* Agents table */}
          <div>
            <div className="section-header mb-4">
              <div>
                <div className="section-title">Agents</div>
                <div className="section-subtitle">{safeAgents.length} agents in this company</div>
              </div>
            </div>
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              {safeAgents.length === 0 ? (
                <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)' }}>
                  <Bot size={28} style={{ opacity: 0.3, margin: '0 auto 8px' }} />
                  <div style={{ fontSize: 13 }}>No agents</div>
                </div>
              ) : (
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Agent</th>
                      <th>Type</th>
                      <th>Status</th>
                      <th>Since</th>
                    </tr>
                  </thead>
                  <tbody>
                    {safeAgents
                      .sort((a, b) => (a.status === 'error' ? -1 : b.status === 'error' ? 1 : 0))
                      .map(agent => (
                        <tr key={agent.id}>
                          <td>
                            <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{agent.name}</div>
                            <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                              {agent.id.slice(0, 8)}
                            </div>
                          </td>
                          <td>
                            {agent.adapterType ? (
                              <span className="mono" style={{ fontSize: 11 }}>{agent.adapterType}</span>
                            ) : (
                              <span style={{ color: 'var(--text-disabled)', fontSize: 12 }}>–</span>
                            )}
                          </td>
                          <td>
                            <span className={`badge ${statusVariant(agent.status)}`}>
                              {agent.status}
                            </span>
                          </td>
                          <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                            {fmtDate(agent.createdAt)}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* Issues panel */}
          <div>
            <div className="section-header mb-4">
              <div>
                <div className="section-title">Recent Issues</div>
                <div className="section-subtitle">Latest work items</div>
              </div>
            </div>
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              {issues.length === 0 ? (
                <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)' }}>
                  <BookOpen size={28} style={{ opacity: 0.3, margin: '0 auto 8px' }} />
                  <div style={{ fontSize: 13 }}>No open issues</div>
                </div>
              ) : (
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Issue</th>
                      <th>Status</th>
                      <th>Priority</th>
                    </tr>
                  </thead>
                  <tbody>
                    {issues.map(issue => (
                      <tr key={issue.id}>
                        <td>
                          <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                            <span className="mono" style={{ marginRight: 8 }}>
                              {issue.prefix}-{issue.number}
                            </span>
                            {issue.title}
                          </div>
                        </td>
                        <td>
                          <span className={`badge ${statusVariant(issue.status)}`}>
                            {issue.status}
                          </span>
                        </td>
                        <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                          {issue.priority ?? '–'}
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
    </>
  );
}
