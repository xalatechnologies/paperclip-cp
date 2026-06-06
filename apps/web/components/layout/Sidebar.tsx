'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Building2,
  Bot,
  BookOpen,
  KeyRound,
  DollarSign,
  Heart,
  Server,
  Target,
  FileText,
  Settings,
  Plug,
} from 'lucide-react';

const navItems = [
  {
    section: 'Overview',
    links: [
      { href: '/', label: 'Dashboard', icon: LayoutDashboard },
    ],
  },
  {
    section: 'Operations',
    links: [
      { href: '/companies', label: 'Companies', icon: Building2 },
      { href: '/agents', label: 'Agents', icon: Bot },
      { href: '/skills', label: 'Skills', icon: BookOpen },
      { href: '/goals', label: 'Goals & Tasks', icon: Target },
    ],
  },
  {
    section: 'Infrastructure',
    links: [
      { href: '/servers', label: 'VPS Servers', icon: Server },
      { href: '/secrets', label: 'Secrets', icon: KeyRound },
      { href: '/integrations', label: 'Integrations', icon: Plug },
    ],
  },
  {
    section: 'Monitoring',
    links: [
      { href: '/costs', label: 'Costs', icon: DollarSign },
      { href: '/heartbeats', label: 'Heartbeats', icon: Heart },
      { href: '/audit', label: 'Audit Log', icon: FileText },
    ],
  },
  {
    section: 'System',
    links: [
      { href: '/settings', label: 'Settings', icon: Settings },
    ],
  },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <div className="sidebar-logo-icon">⬡</div>
        <div>
          <div className="sidebar-logo-text">PCC</div>
          <div className="sidebar-logo-sub">Control Center</div>
        </div>
      </div>

      <nav className="sidebar-nav">
        {navItems.map((group) => (
          <div key={group.section}>
            <div className="sidebar-section-label">{group.section}</div>
            {group.links.map(({ href, label, icon: Icon }) => {
              const isActive = href === '/' ? pathname === '/' : pathname.startsWith(href);
              return (
                <Link
                  key={href}
                  href={href}
                  className={`sidebar-link ${isActive ? 'active' : ''}`}
                >
                  <Icon size={16} />
                  {label}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border-subtle)' }}>
        <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
          v0.1.0 — Phase 1
        </div>
        <div style={{ fontSize: '11px', color: 'var(--text-disabled)', marginTop: '2px' }}>
          Doxis · Xala · NorChain
        </div>
      </div>
    </aside>
  );
}
