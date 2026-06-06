import type { Metadata } from 'next';
import { BookOpen, Cpu } from 'lucide-react';
import { getSkillsCatalog } from '@/lib/api';

export const metadata: Metadata = { title: 'Skills' };

export default async function SkillsPage() {
  const skills = await getSkillsCatalog() ?? [];

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-header-title">Skills Catalog</h1>
          <div className="page-header-sub">{skills.length} skills available in Paperclip</div>
        </div>
      </div>

      <div className="page-body">
        {skills.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', padding: '64px 32px' }}>
            <BookOpen size={48} style={{ opacity: 0.2, margin: '0 auto 16px' }} />
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>No skills found</div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
              Skills will appear here once they are registered in Paperclip.
            </div>
          </div>
        ) : (
          <div className="grid-3">
            {skills.map(skill => (
              <div key={skill.id} className="card">
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                  <div className="stat-icon stat-icon-purple" style={{ width: 32, height: 32, marginBottom: 0 }}>
                    <Cpu size={16} />
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-primary)' }}>{skill.name}</div>
                    <span className="mono" style={{ fontSize: 10 }}>{skill.slug}</span>
                  </div>
                </div>

                {skill.description && (
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6, marginBottom: 12 }}>
                    {skill.description.slice(0, 150)}{skill.description.length > 150 ? '…' : ''}
                  </div>
                )}

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    v{skill.version} · ~{skill.tokenEstimate.toLocaleString()} tokens
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
