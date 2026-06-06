import type { Metadata } from 'next';
import { KeyRound, ShieldCheck } from 'lucide-react';
import { fmtDate } from '@/lib/api';

export const metadata: Metadata = { title: 'Secrets' };

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
const API_KEY = process.env.CONTROL_CENTER_API_KEY ?? '';

interface Secret {
  id: string;
  name: string;
  scope: string;
  paperclip_company_id: string | null;
  description: string | null;
  rotate_after_days: number | null;
  created_at: number;
  updated_at: number;
}

async function getSecrets(): Promise<Secret[]> {
  try {
    const r = await fetch(`${API_URL}/api/secrets`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
      cache: 'no-store',
    });
    if (!r.ok) return [];
    const data = await r.json();
    return data.data ?? data ?? [];
  } catch { return []; }
}

export default async function SecretsPage() {
  const secrets = await getSecrets();

  return (
    <>
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h1 className="page-header-title">Secret Vault</h1>
            <div className="page-header-sub">
              {secrets.length} encrypted secret{secrets.length !== 1 ? 's' : ''} · AES-256-GCM at rest
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <ShieldCheck size={16} style={{ color: 'var(--accent-success)' }} />
            <span style={{ fontSize: 12, color: 'var(--accent-success)' }}>Encrypted</span>
          </div>
        </div>
      </div>

      <div className="page-body">

        <div className="alert alert-info" style={{ marginBottom: 24 }}>
          <ShieldCheck size={16} style={{ flexShrink: 0 }} />
          <div style={{ fontSize: 12 }}>
            All secret values are encrypted with AES-256-GCM before storage. Values are never returned in API responses.
            Access is audit-logged on every read.
          </div>
        </div>

        {secrets.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', padding: '64px 32px' }}>
            <KeyRound size={48} style={{ opacity: 0.2, margin: '0 auto 16px' }} />
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>No secrets stored</div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
              Secrets can be added via the PCC CLI or API.
            </div>
          </div>
        ) : (
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Scope</th>
                  <th>Company</th>
                  <th>Rotation</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {secrets.map(secret => (
                  <tr key={secret.id}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <KeyRound size={14} style={{ color: 'var(--accent-warning)', flexShrink: 0 }} />
                        <div>
                          <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{secret.name}</div>
                          {secret.description && (
                            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{secret.description}</div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className={`badge ${secret.scope === 'global' ? 'badge-idle' : 'badge-active'}`}>
                        {secret.scope}
                      </span>
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                      {secret.paperclip_company_id
                        ? <span className="mono" style={{ fontSize: 10 }}>{secret.paperclip_company_id.slice(0, 8)}…</span>
                        : <span style={{ color: 'var(--text-disabled)' }}>–</span>
                      }
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                      {secret.rotate_after_days ? `${secret.rotate_after_days}d` : '–'}
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                      {new Date(secret.created_at * 1000).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
