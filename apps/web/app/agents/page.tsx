import type { Metadata } from 'next';
import Link from 'next/link';
import { Bot, AlertCircle } from 'lucide-react';
import { getCompanies, getAgentsByCompany, statusVariant, fmtDate, type Agent } from '@/lib/api';

export const metadata: Metadata = { title: 'Agents' };

export default async function AgentsPage() {
  const companies = await getCompanies() ?? [];

  const agentLists = await Promise.all(
    companies.map(c => getAgentsByCompany(c.id))
  );

  const allAgents: (Agent & { companyName: string; companyId: string; prefix: string })[] = [];
  companies.forEach((c, i) => {
    (agentLists[i] ?? []).forEach(a =>
      allAgents.push({ ...a, companyName: c.name, companyId: c.id, prefix: c.issuePrefix })
    );
  });

  const errorCount  = allAgents.filter(a => a.status === 'error').length;
  const activeCount = allAgents.filter(a => a.status === 'active').length;
  const idleCount   = allAgents.filter(a => a.status === 'idle').length;

  // Sort: errors first, then active, then idle
  const sorted = [...allAgents].sort((a, b) => {
    const order = { error: 0, active: 1, idle: 2, paused: 3 };
    return (order[a.status as keyof typeof order] ?? 4) - (order[b.status as keyof typeof order] ?? 4);
  });

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-header-title">Agents</h1>
          <div className="page-header-sub">
            {allAgents.length} agents across {companies.length} companies
          </div>
        </div>
      </div>

      <div className="page-body">

        {/* Status summary */}
        <div className="grid-4 mb-6" style={{ marginBottom: 24 }}>
          {[
            { label: 'Total', value: allAgents.length, color: 'var(--text-primary)', bg: 'stat-icon-blue' },
            { label: 'Active', value: activeCount, color: 'var(--accent-success)', bg: 'stat-icon-green' },
            { label: 'Errors', value: errorCount, color: errorCount > 0 ? 'var(--accent-danger)' : 'var(--text-muted)', bg: errorCount > 0 ? 'stat-icon-red' : 'stat-icon-green' },
            { label: 'Idle', value: idleCount, color: 'var(--text-secondary)', bg: 'stat-icon-teal' },
          ].map(s => (
            <div key={s.label} className="stat-card">
              <div className={`stat-icon ${s.bg}`}><Bot size={20} /></div>
              <div className="card-label">{s.label}</div>
              <div className="card-value" style={{ color: s.color }}>{s.value}</div>
            </div>
          ))}
        </div>

        {errorCount > 0 && (
          <div className="alert alert-danger" style={{ marginBottom: 24 }}>
            <AlertCircle size={16} style={{ flexShrink: 0 }} />
            <div>
              <div style={{ fontWeight: 600 }}>{errorCount} agents need attention</div>
              <div style={{ fontSize: 12, marginTop: 2 }}>
                {allAgents.filter(a => a.status === 'error').map(a => `${a.prefix} → ${a.name}`).join(' · ')}
              </div>
            </div>
          </div>
        )}

        {/* Full agents table */}
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Agent</th>
                <th>Company</th>
                <th>Adapter</th>
                <th>Status</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map(agent => (
                <tr key={agent.id}>
                  <td>
                    <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{agent.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                      {agent.id.slice(0, 8)}
                    </div>
                  </td>
                  <td>
                    <Link
                      href={`/companies/${agent.companyId}`}
                      style={{ color: 'var(--accent-primary)', textDecoration: 'none' }}
                    >
                      {agent.companyName}
                    </Link>
                    <div style={{ fontSize: 11 }}>
                      <span className="mono" style={{ fontSize: 10 }}>{agent.prefix}</span>
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
        </div>
      </div>
    </>
  );
}
