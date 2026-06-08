import type { Metadata } from 'next';
import { getCompanies, getAgentsByCompany, getSession, getCostSummary, type Agent } from '@/lib/api';
import { DashboardRealtime } from './DashboardRealtime';

export const metadata: Metadata = { title: 'Dashboard' };

export default async function DashboardPage() {
  const [companies, session, costSummary] = await Promise.all([
    getCompanies(), getSession(), getCostSummary(),
  ]);

  const safeCompanies = companies ?? [];
  const agentLists = await Promise.all(safeCompanies.map(c => getAgentsByCompany(c.id)));

  const allAgents: (Agent & { companyName: string; companyPrefix: string })[] = [];
  safeCompanies.forEach((c, i) =>
    (agentLists[i] ?? []).forEach(a =>
      allAgents.push({ ...a, companyName: c.name, companyPrefix: c.issuePrefix })
    )
  );

  return (
    <DashboardRealtime
      safeCompanies={safeCompanies}
      allAgents={allAgents}
      agentLists={agentLists}
      session={session}
      costSummary={costSummary}
    />
  );
}
