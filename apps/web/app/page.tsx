import type { Metadata } from 'next';
import Link from 'next/link';
import { Building2, Bot, AlertCircle, Activity, Zap, RefreshCw, ChevronRight } from 'lucide-react';
import {
  getCompanies, getAgentsByCompany, getSession,
  statusVariant, fmtRelative, type Company, type Agent,
} from '@/lib/api';

export const metadata: Metadata = { title: 'Dashboard' };

export default async function DashboardPage() {
  const [companies, session] = await Promise.all([
    getCompanies(),
    getSession(),
  ]);

  const safeCompanies = companies ?? [];

  // Fetch agents for all companies in parallel
  const agentLists = await Promise.all(
    safeCompanies.map(c => getAgentsByCompany(c.id))
  );

  const allAgents: (Agent & { companyName: string; companyPrefix: string })[] = [];
  safeCompanies.forEach((c, i) => {
    (agentLists[i] ?? []).forEach(a =>
      allAgents.push({ ...a, companyName: c.name, companyPrefix: c.issuePrefix })
    );
  });

  const totalAgents  = allAgents.length;
  const errorAgents  = allAgents.filter(a => a.status === 'error').length;
  const activeAgents = allAgents.filter(a => a.status === 'active').length;
  const idleAgents   = allAgents.filter(a => a.status === 'idle').length;

  const stats = [
    {
      label: 'Companies',
      value: safeCompanies.length,
      icon: Building2,
      iconClass: 'stat-icon-blue',
      href: '/companies',
      sub: `${safeCompanies.filter(c => c.status === 'active').length} active`,
    },
    {
      label: 'Total Agents',
      value: totalAgents,
      icon: Bot,
      iconClass: 'stat-icon-purple',
      href: '/agents',
      sub: `${activeAgents} active · ${idleAgents} idle`,
    },
    {
      label: 'Agent Errors',
      value: errorAgents,
      icon: AlertCircle,
      iconClass: errorAgents > 0 ? 'stat-icon-red' : 'stat-icon-green',
      href: '/agents',
      sub: errorAgents > 0 ? 'Requires attention' : 'All healthy',
    },
    {
      label: 'Connected',
      value: session ? '✓' : '✗',
      icon: Activity,
      iconClass: session ? 'stat-icon-green' : 'stat-icon-red',
      href: '/settings',
      sub: session ? `${session.email}` : 'Auth error',
    },
  ];

  return (
    <>
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h1 className="page-header-title">Control Center</h1>
            <div className="page-header-sub">
              AI operations overview — {new Date().toLocaleDateString('en-US', {
                weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
              })}
            </div>
          </div>
          {session && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div className="badge badge-active">Live</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                {session.email}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="page-body">

        {/* Error alert */}
        {errorAgents > 0 && (
          <div className="alert alert-danger" style={{ marginBottom: 24 }}>
            <AlertCircle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
            <div>
              <div style={{ fontWeight: 600 }}>
                {errorAgents} agent{errorAgents > 1 ? 's' : ''} in error state
              </div>
              <div style={{ fontSize: 12, marginTop: 2, opacity: 0.85 }}>
                {allAgents.filter(a => a.status === 'error').map(a => `${a.companyPrefix} → ${a.name}`).join(' · ')}
              </div>
            </div>
          </div>
        )}

        {/* No API warning */}
        {!session && (
          <div className="alert alert-warning" style={{ marginBottom: 24 }}>
            <Zap size={16} style={{ flexShrink: 0, marginTop: 1 }} />
            <div>
              <div style={{ fontWeight: 600 }}>API connection issue</div>
              <div style={{ fontSize: 12, marginTop: 2, opacity: 0.85 }}>
                Make sure the PCC API is running on <code>localhost:3001</code>
              </div>
            </div>
          </div>
        )}

        {/* Stat cards */}
        <div className="grid-4 mb-6">
          {stats.map(stat => (
            <Link key={stat.label} href={stat.href} style={{ textDecoration: 'none' }}>
              <div className="stat-card">
                <div className={`stat-icon ${stat.iconClass}`}>
                  <stat.icon size={20} />
                </div>
                <div className="card-label">{stat.label}</div>
                <div className="card-value">{stat.value}</div>
                <div className="card-description mt-4">{stat.sub}</div>
              </div>
            </Link>
          ))}
        </div>

        <div className="grid-2">

          {/* Companies panel */}
          <div>
            <div className="section-header mb-4">
              <div>
                <div className="section-title">Companies</div>
                <div className="section-subtitle">Registered Paperclip companies</div>
              </div>
              <Link href="/companies" className="btn btn-secondary btn-sm">
                View All
              </Link>
            </div>

            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              {safeCompanies.length === 0 ? (
                <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)' }}>
                  <Building2 size={32} style={{ opacity: 0.3, margin: '0 auto 12px' }} />
                  <div style={{ fontSize: 13 }}>No companies found</div>
                </div>
              ) : (
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Company</th>
                      <th>Agents</th>
                      <th>Prefix</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {safeCompanies.map((company, i) => {
                      const agents = agentLists[i] ?? [];
                      const errs = agents.filter(a => a.status === 'error').length;
                      return (
                        <tr key={company.id}>
                          <td>
                            <Link
                              href={`/companies/${company.id}`}
                              style={{ color: 'var(--accent-primary)', textDecoration: 'none', fontWeight: 600 }}
                            >
                              {company.name}
                            </Link>
                          </td>
                          <td>
                            <span style={{ fontWeight: 600 }}>{agents.length}</span>
                            {errs > 0 && (
                              <span style={{ color: 'var(--accent-danger)', marginLeft: 6, fontSize: 11 }}>
                                {errs} error
                              </span>
                            )}
                          </td>
                          <td><span className="mono">{company.issuePrefix}</span></td>
                          <td>
                            <span className={`badge ${statusVariant(company.status)}`}>
                              {company.status}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* Agent status panel */}
          <div>
            <div className="section-header mb-4">
              <div>
                <div className="section-title">Agent Status</div>
                <div className="section-subtitle">All agents across companies</div>
              </div>
              <Link href="/agents" className="btn btn-secondary btn-sm">
                View All
              </Link>
            </div>

            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              {allAgents.length === 0 ? (
                <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)' }}>
                  <Activity size={28} style={{ opacity: 0.3, margin: '0 auto 8px' }} />
                  <div style={{ fontSize: 13 }}>No agents registered</div>
                </div>
              ) : (
                <>
                  {/* Progress bar */}
                  <div style={{ display: 'flex', height: 4 }}>
                    <div style={{ flex: activeAgents, background: 'var(--accent-success)', transition: 'flex 0.5s' }} />
                    <div style={{ flex: errorAgents, background: 'var(--accent-danger)', transition: 'flex 0.5s' }} />
                    <div style={{ flex: idleAgents, background: 'var(--border-strong)', transition: 'flex 0.5s' }} />
                  </div>

                  {/* Summary row */}
                  <div style={{ display: 'flex', gap: 20, padding: '12px 16px', borderBottom: '1px solid var(--border-subtle)' }}>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <span style={{ fontSize: 18, fontWeight: 800, color: 'var(--accent-success)' }}>{activeAgents}</span>
                      <span style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Active</span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <span style={{ fontSize: 18, fontWeight: 800, color: errorAgents > 0 ? 'var(--accent-danger)' : 'var(--text-muted)' }}>{errorAgents}</span>
                      <span style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Error</span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <span style={{ fontSize: 18, fontWeight: 800, color: 'var(--text-secondary)' }}>{idleAgents}</span>
                      <span style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Idle</span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <span style={{ fontSize: 18, fontWeight: 800, color: 'var(--text-secondary)' }}>{totalAgents}</span>
                      <span style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Total</span>
                    </div>
                  </div>

                  {/* Top agents list */}
                  <table className="data-table">
                    <tbody>
                      {allAgents
                        .sort((a, b) => (a.status === 'error' ? -1 : b.status === 'error' ? 1 : 0))
                        .slice(0, 8)
                        .map(agent => (
                          <tr key={agent.id}>
                            <td>
                              <div style={{ fontWeight: 600, fontSize: 13 }}>{agent.name}</div>
                              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                                {agent.companyName}
                              </div>
                            </td>
                            <td style={{ textAlign: 'right' }}>
                              <span className={`badge ${statusVariant(agent.status)}`}>
                                {agent.status}
                              </span>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>

                  {allAgents.length > 8 && (
                    <div style={{ padding: '10px 16px', borderTop: '1px solid var(--border-subtle)' }}>
                      <Link
                        href="/agents"
                        style={{ fontSize: 12, color: 'var(--accent-primary)', display: 'flex', alignItems: 'center', gap: 4 }}
                      >
                        View all {allAgents.length} agents <ChevronRight size={12} />
                      </Link>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
