'use client';

import { useState, useEffect } from 'react';
import { Cpu, Shield, CheckCircle, XCircle, Loader, ChevronRight } from 'lucide-react';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
const KEY = process.env.NEXT_PUBLIC_CONTROL_CENTER_API_KEY ?? '';

const H = { 'Authorization': `Bearer ${KEY}`, 'Content-Type': 'application/json' };

interface LlmStatus {
  openai: { configured: boolean; baseUrl: string | null; model: string };
  anthropic: { configured: boolean };
  zai: { configured: boolean };
}

export default function SettingsPage() {
  const [status, setStatus] = useState<LlmStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [zaiKey, setZaiKey] = useState('');
  const [anthropicKey, setAnthropicKey] = useState('');
  const [updateModels, setUpdateModels] = useState(true);

  useEffect(() => {
    fetch(`${API}/api/vps/llm-status`, { headers: H })
      .then(r => r.json())
      .then(data => setStatus(data))
      .catch(() => setStatus(null))
      .finally(() => setLoading(false));
  }, []);

  const apply = async () => {
    if (!zaiKey && !anthropicKey) {
      setMessage({ type: 'error', text: 'Enter at least one API key.' });
      return;
    }

    setSaving(true);
    setMessage(null);
    try {
      // 1. Apply LLM keys to VPS container
      const r = await fetch(`${API}/api/vps/llm-config`, {
        method: 'POST',
        headers: H,
        body: JSON.stringify({
          openaiApiKey: zaiKey || undefined,
          openaiBaseUrl: zaiKey ? 'https://api.z.ai/api/coding/paas/v4' : undefined,
          openaiModel: zaiKey ? 'glm-5.1' : undefined,
          anthropicApiKey: anthropicKey || undefined,
          restart: true,
        }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? 'Failed');

      // 2. Optionally update agent model names
      if (zaiKey && updateModels) {
        await fetch(`${API}/api/vps/agent-models`, {
          method: 'POST',
          headers: H,
          body: JSON.stringify({ model: 'glm-5.1' }),
        });
      }

      setMessage({ type: 'success', text: 'LLM configuration applied! Container restarting…' });
      setZaiKey('');
      setAnthropicKey('');

      // Refresh status
      setTimeout(async () => {
        const r2 = await fetch(`${API}/api/vps/llm-status`, { headers: H });
        setStatus(await r2.json());
      }, 5000);

    } catch (e: any) {
      setMessage({ type: 'error', text: e.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="page-header">
        <h1 className="page-header-title">Settings</h1>
        <div className="page-header-sub">LLM providers, VPS configuration, system settings</div>
      </div>

      <div className="page-body">

        {/* LLM Provider Status */}
        <div className="section-header mb-4">
          <div>
            <div className="section-title">LLM Provider Status</div>
            <div className="section-subtitle">Current model configuration on the Paperclip VPS</div>
          </div>
        </div>

        <div className="grid-3" style={{ marginBottom: 28 }}>
          {/* Z.ai */}
          <div className="card">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <div className="stat-icon stat-icon-blue" style={{ width: 32, height: 32, marginBottom: 0 }}>
                <Cpu size={16} />
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 14 }}>Z.ai GLM-5.1</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Execution · Tests · Docs</div>
              </div>
            </div>
            {loading ? (
              <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>Checking…</div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {status?.zai?.configured ? (
                  <>
                    <CheckCircle size={16} style={{ color: 'var(--accent-success)' }} />
                    <span style={{ color: 'var(--accent-success)', fontSize: 13, fontWeight: 600 }}>Configured</span>
                  </>
                ) : (
                  <>
                    <XCircle size={16} style={{ color: 'var(--accent-danger)' }} />
                    <span style={{ color: 'var(--accent-danger)', fontSize: 13, fontWeight: 600 }}>Not set</span>
                  </>
                )}
              </div>
            )}
            {status?.openai?.baseUrl && (
              <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text-muted)' }}>
                <span className="mono" style={{ fontSize: 10 }}>{status.openai.baseUrl}</span>
              </div>
            )}
          </div>

          {/* OpenAI/Codex */}
          <div className="card">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <div className="stat-icon stat-icon-purple" style={{ width: 32, height: 32, marginBottom: 0 }}>
                <Cpu size={16} />
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 14 }}>OpenAI / Codex</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>codex_local adapter</div>
              </div>
            </div>
            {loading ? (
              <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>Checking…</div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {status?.openai?.configured ? (
                  <>
                    <CheckCircle size={16} style={{ color: 'var(--accent-success)' }} />
                    <span style={{ color: 'var(--accent-success)', fontSize: 13, fontWeight: 600 }}>
                      {status.openai.model ?? 'Configured'}
                    </span>
                  </>
                ) : (
                  <>
                    <XCircle size={16} style={{ color: 'var(--accent-danger)' }} />
                    <span style={{ color: 'var(--accent-danger)', fontSize: 13, fontWeight: 600 }}>Not set</span>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Anthropic */}
          <div className="card">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <div className="stat-icon stat-icon-orange" style={{ width: 32, height: 32, marginBottom: 0 }}>
                <Shield size={16} />
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 14 }}>Anthropic Claude</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Architect · Reviewer agents</div>
              </div>
            </div>
            {loading ? (
              <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>Checking…</div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {status?.anthropic?.configured ? (
                  <>
                    <CheckCircle size={16} style={{ color: 'var(--accent-success)' }} />
                    <span style={{ color: 'var(--accent-success)', fontSize: 13, fontWeight: 600 }}>Configured</span>
                  </>
                ) : (
                  <>
                    <XCircle size={16} style={{ color: 'var(--accent-danger)' }} />
                    <span style={{ color: 'var(--accent-danger)', fontSize: 13, fontWeight: 600 }}>Not set</span>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Configure Z.ai */}
        <div className="section-header mb-4">
          <div>
            <div className="section-title">Configure LLM Providers</div>
            <div className="section-subtitle">
              Apply keys directly to the Paperclip VPS container — restarts automatically
            </div>
          </div>
        </div>

        <div className="card card-gradient" style={{ maxWidth: 680 }}>
          {message && (
            <div className={`alert ${message.type === 'success' ? 'alert-info' : 'alert-danger'}`} style={{ marginBottom: 20 }}>
              {message.type === 'success' ? <CheckCircle size={16} style={{ flexShrink: 0 }} /> : <XCircle size={16} style={{ flexShrink: 0 }} />}
              <span>{message.text}</span>
            </div>
          )}

          {/* Z.ai section */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
              Z.ai API Key
              <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--text-muted)', fontWeight: 400 }}>
                → GLM-5.1 · 1600 prompts/5h Max plan
              </span>
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8 }}>
              Get yours at{' '}
              <a href="https://z.ai/subscribe" target="_blank" rel="noopener" style={{ color: 'var(--accent-primary)' }}>
                z.ai/subscribe
              </a>{' '}
              → GLM Coding Plan Max
            </div>
            <input
              className="input"
              type="password"
              placeholder="z-ai-xxxxxxxxxxxxxxxxxxxxxxxx"
              value={zaiKey}
              onChange={e => setZaiKey(e.target.value)}
              id="zai-api-key"
            />
            <div style={{ marginTop: 6, fontSize: 11, color: 'var(--text-muted)' }}>
              Will set: <span className="mono">OPENAI_API_KEY</span> + <span className="mono">OPENAI_BASE_URL=https://api.z.ai/api/coding/paas/v4</span>
            </div>
          </div>

          {/* Anthropic section */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
              Anthropic API Key
              <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--text-muted)', fontWeight: 400 }}>
                → Claude Sonnet · CEO + Deep Review agents
              </span>
            </div>
            <input
              className="input"
              type="password"
              placeholder="sk-ant-api03-xxxxxxxxxxxx"
              value={anthropicKey}
              onChange={e => setAnthropicKey(e.target.value)}
              id="anthropic-api-key"
            />
          </div>

          {/* Update models checkbox */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
            <input
              type="checkbox"
              id="update-models"
              checked={updateModels}
              onChange={e => setUpdateModels(e.target.checked)}
              style={{ width: 14, height: 14, accentColor: 'var(--accent-primary)' }}
            />
            <label htmlFor="update-models" style={{ fontSize: 13, color: 'var(--text-secondary)', cursor: 'pointer' }}>
              Update all <span className="mono">codex_local</span> agents to use <span className="mono">glm-5.1</span>
            </label>
          </div>

          <button
            className="btn btn-primary"
            onClick={apply}
            disabled={saving || (!zaiKey && !anthropicKey)}
            id="apply-llm-config"
          >
            {saving ? <Loader size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <ChevronRight size={14} />}
            {saving ? 'Applying…' : 'Apply to VPS & Restart Container'}
          </button>

          <div style={{ marginTop: 12, fontSize: 11, color: 'var(--text-muted)' }}>
            🔐 Keys are written directly to <span className="mono">/docker/paperclip-cumf/.env</span> on the VPS. Not stored in PCC.
          </div>
        </div>

        {/* Model roles guide */}
        <div style={{ marginTop: 32 }}>
          <div className="section-title" style={{ marginBottom: 12 }}>Recommended Model Assignment</div>
          <div className="card" style={{ padding: 0, overflow: 'hidden', maxWidth: 680 }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Role</th>
                  <th>Adapter</th>
                  <th>Model</th>
                  <th>Agents</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td style={{ fontWeight: 600 }}>Architect / Reviewer</td>
                  <td><span className="mono" style={{ fontSize: 11 }}>claude_local</span></td>
                  <td><span className="mono" style={{ fontSize: 11 }}>claude-sonnet</span></td>
                  <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>CEO, Deep Review Agent</td>
                </tr>
                <tr>
                  <td style={{ fontWeight: 600 }}>Executor / Tester</td>
                  <td><span className="mono" style={{ fontSize: 11 }}>codex_local</span></td>
                  <td><span className="mono" style={{ fontSize: 11 }}>glm-5.1</span></td>
                  <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>Bug Fix, QA, UI agents</td>
                </tr>
                <tr>
                  <td style={{ fontWeight: 600 }}>Gateway</td>
                  <td><span className="mono" style={{ fontSize: 11 }}>openclaw_gateway</span></td>
                  <td><span className="mono" style={{ fontSize: 11 }}>—</span></td>
                  <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>OpenClaw agents</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </>
  );
}
