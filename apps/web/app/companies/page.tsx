import type { Metadata } from 'next';
import Link from 'next/link';
import { Building2, Bot, AlertCircle, ChevronRight } from 'lucide-react';
import { getCompanies, getAgentsByCompany, statusVariant, fmtDate } from '@/lib/api';

export const metadata: Metadata = { title: 'Companies' };

export default async function CompaniesPage() {
  const companies = await getCompanies() ?? [];

  const agentLists = await Promise.all(
    companies.map(c => getAgentsByCompany(c.id))
  );

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-header-title">Companies</h1>
          <div className="page-header-sub">
            {companies.length} registered Paperclip companies
          </div>
        </div>
      </div>

      <div className="page-body">

        {companies.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', padding: '64px 32px' }}>
            <Building2 size={48} style={{ opacity: 0.2, margin: '0 auto 16px' }} />
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>No companies found</div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
              Check that the PCC API is running and the Paperclip instance is reachable.
            </div>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 16 }}>
            {companies.map((company, i) => {
              const agents = agentLists[i] ?? [];
              const errorCount = agents.filter(a => a.status === 'error').length;
              const activeCount = agents.filter(a => a.status === 'active').length;

              return (
                <Link
                  key={company.id}
                  href={`/companies/${company.id}`}
                  style={{ textDecoration: 'none' }}
                >
                  <div className="card" style={{ cursor: 'pointer', transition: 'all 250ms ease' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>

                      {/* Left: info */}
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                          <div
                            style={{
                              width: 36,
                              height: 36,
                              borderRadius: 8,
                              background: company.brandColor
                                ? `${company.brandColor}22`
                                : 'var(--accent-primary-glow)',
                              border: `1px solid ${company.brandColor ?? 'var(--border-accent)'}40`,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              color: company.brandColor ?? 'var(--accent-primary)',
                              fontSize: 14,
                              fontWeight: 700,
                            }}
                          >
                            {company.issuePrefix.slice(0, 2)}
                          </div>
                          <div>
                            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>
                              {company.name}
                            </div>
                            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                              {company.id.slice(0, 8)}…
                            </div>
                          </div>
                        </div>

                        {company.description && (
                          <div style={{
                            fontSize: 12,
                            color: 'var(--text-muted)',
                            lineHeight: 1.5,
                            marginBottom: 12,
                            maxWidth: 600,
                          }}>
                            {company.description.slice(0, 200)}{company.description.length > 200 ? '…' : ''}
                          </div>
                        )}

                        {/* Tags */}
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          <span className="mono">{company.issuePrefix}</span>
                          <span className={`badge ${statusVariant(company.status)}`}>
                            {company.status}
                          </span>
                          {errorCount > 0 && (
                            <span className="badge badge-error">
                              {errorCount} error{errorCount > 1 ? 's' : ''}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Right: stats */}
                      <div style={{ display: 'flex', gap: 24, alignItems: 'center', flexShrink: 0 }}>
                        <div style={{ textAlign: 'center' }}>
                          <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-primary)' }}>
                            {agents.length}
                          </div>
                          <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                            Agents
                          </div>
                        </div>

                        {activeCount > 0 && (
                          <div style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--accent-success)' }}>
                              {activeCount}
                            </div>
                            <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                              Active
                            </div>
                          </div>
                        )}

                        {errorCount > 0 && (
                          <div style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--accent-danger)' }}>
                              {errorCount}
                            </div>
                            <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                              Errors
                            </div>
                          </div>
                        )}

                        <div style={{ color: 'var(--text-muted)' }}>
                          <ChevronRight size={18} />
                        </div>
                      </div>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
