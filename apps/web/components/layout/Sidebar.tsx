'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard, Building2, Bot, BookOpen, KeyRound,
  DollarSign, Activity, Server, Target, FileText,
  Settings, Plug, CalendarClock, BrainCircuit,
  SlidersHorizontal, Database,
} from 'lucide-react';

const NAV = [
  {
    section: 'OVERVIEW',
    links: [
      { href: '/', label: 'Dashboard', icon: LayoutDashboard },
    ],
  },
  {
    section: 'OPERATIONS',
    links: [
      { href: '/companies', label: 'Companies',    icon: Building2 },
      { href: '/agents',    label: 'Agents',       icon: Bot },
      { href: '/skills',    label: 'Skills',       icon: BookOpen },
      { href: '/goals',     label: 'Goals & Tasks', icon: Target },
      { href: '/routines',  label: 'Routines',     icon: CalendarClock },
    ],
  },
  {
    section: 'INTELLIGENCE',
    links: [
      { href: '/knowledge', label: 'Knowledge Base', icon: Database },
      { href: '/memory',    label: 'Memory',         icon: BrainCircuit },
      { href: '/context',   label: 'Context Eng.',   icon: SlidersHorizontal },
    ],
  },
  {
    section: 'INFRASTRUCTURE',
    links: [
      { href: '/servers',      label: 'VPS Servers',   icon: Server },
      { href: '/secrets',      label: 'Secrets',        icon: KeyRound },
      { href: '/integrations', label: 'Integrations',   icon: Plug },
    ],
  },
  {
    section: 'MONITORING',
    links: [
      { href: '/costs',      label: 'Costs',      icon: DollarSign },
      { href: '/heartbeats', label: 'Heartbeats', icon: Activity },
      { href: '/audit',      label: 'Audit Log',  icon: FileText },
    ],
  },
  {
    section: 'SYSTEM',
    links: [
      { href: '/settings', label: 'Settings', icon: Settings },
    ],
  },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-[220px] bg-sidebar border-r border-sidebar-border flex flex-col fixed top-0 left-0 h-screen z-50">
      {/* Logo */}
      <div className="flex items-center gap-3 px-5 h-[60px] border-b border-sidebar-border flex-shrink-0">
        <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center flex-shrink-0">
          <span className="text-white text-sm font-bold tracking-tight">P</span>
        </div>
        <div>
          <div className="text-[14px] font-bold text-sidebar-foreground tracking-tight leading-none">Paperclip</div>
          <div className="text-[11px] text-muted-foreground mt-0.5 leading-none">Control Center</div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-3 px-3">
        {NAV.map((group, gi) => (
          <div key={group.section} className={gi > 0 ? 'mt-5' : ''}>
            <div className="px-2.5 mb-1.5 text-[10px] font-semibold text-muted-foreground/50 tracking-[0.08em]">
              {group.section}
            </div>
            <div className="space-y-0.5">
              {group.links.map(({ href, label, icon: Icon }) => {
                const active = href === '/' ? pathname === '/' : pathname.startsWith(href);
                return (
                  <Link
                    key={href}
                    href={href as any}
                    className={[
                      'group flex items-center justify-between px-3 py-2 rounded-lg text-[13.5px] font-medium transition-all duration-150 no-underline',
                      active
                        ? 'bg-sidebar-accent text-sidebar-accent-foreground shadow-xs'
                        : 'text-muted-foreground hover:text-sidebar-foreground hover:bg-sidebar-accent/60',
                    ].join(' ')}
                  >
                    <span className="flex items-center gap-2.5">
                      <Icon
                        size={15}
                        className={active
                          ? 'text-primary'
                          : 'text-muted-foreground/50 group-hover:text-muted-foreground transition-colors'}
                        strokeWidth={active ? 2.2 : 1.8}
                      />
                      {label}
                    </span>
                    {active && (
                      <span className="w-1.5 h-1.5 rounded-full bg-primary flex-shrink-0" />
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="px-5 py-4 border-t border-sidebar-border flex-shrink-0">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[11px] font-semibold text-muted-foreground/60">Phases 1–3</span>
          <span className="text-[10px] text-muted-foreground/40">v0.1.0</span>
        </div>
        <div className="text-[11px] text-muted-foreground/40 truncate">Doxis · Xala · NorChain</div>
      </div>
    </aside>
  );
}
