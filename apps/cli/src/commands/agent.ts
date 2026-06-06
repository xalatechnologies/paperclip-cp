import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { table } from 'table';
import { apiGet, apiPost } from '../api-client.js';

export const agentCommand = new Command('agent')
  .description('Manage Paperclip agents');

// pcc agent list --company <slug>
agentCommand
  .command('list')
  .description('List agents for a company')
  .requiredOption('-c, --company <slug>', 'Company slug')
  .action(async (opts: any) => {
    const spinner = ora(`Fetching agents for ${chalk.cyan(opts.company)}...`).start();
    try {
      const companies = await apiGet<any[]>('/api/companies');
      const company = companies.find((c) => c.slug === opts.company);
      if (!company) throw new Error(`Company "${opts.company}" not found`);

      const agents = await apiGet<any[]>(`/api/companies/${company.id}/agents`);
      spinner.stop();

      if (agents.length === 0) {
        console.log(chalk.yellow(`\nNo agents in "${opts.company}" yet.\n`));
        return;
      }

      const statusColor = (s: string) =>
        s === 'active' ? chalk.green(s) :
        s === 'paused' ? chalk.yellow(s) :
        s === 'running' ? chalk.blue(s) : chalk.red(s);

      const rows = [
        [chalk.bold('Slug'), chalk.bold('Name'), chalk.bold('Role'), chalk.bold('Status'), chalk.bold('Last Heartbeat')],
        ...agents.map((a) => [
          chalk.cyan(a.slug),
          a.displayName,
          a.role ?? chalk.dim('—'),
          statusColor(a.status),
          a.lastHeartbeatAt ? new Date(a.lastHeartbeatAt).toLocaleString() : chalk.dim('Never'),
        ]),
      ];

      console.log('\n' + table(rows));
    } catch (err: any) {
      spinner.fail(chalk.red(`Error: ${err.message}`));
      process.exit(1);
    }
  });

// pcc agent status <company.agent>
agentCommand
  .command('status <ref>')
  .description('Show agent status (format: company.agent)')
  .action(async (ref: string) => {
    const [companySlug, agentSlug] = ref.split('.');
    if (!companySlug || !agentSlug) {
      console.error(chalk.red('Format must be: company.agent (e.g. doxis.bug-fix)'));
      process.exit(1);
    }

    const spinner = ora(`Fetching status for ${chalk.cyan(ref)}...`).start();
    try {
      const companies = await apiGet<any[]>('/api/companies');
      const company = companies.find((c) => c.slug === companySlug);
      if (!company) throw new Error(`Company "${companySlug}" not found`);

      const agents = await apiGet<any[]>(`/api/companies/${company.id}/agents`);
      const agent = agents.find((a: any) => a.slug === agentSlug);
      if (!agent) throw new Error(`Agent "${agentSlug}" not found`);

      const detail = await apiGet<any>(`/api/agents/${agent.id}`);
      spinner.stop();

      const statusColor = detail.status === 'active' ? chalk.green :
        detail.status === 'paused' ? chalk.yellow : chalk.red;

      console.log('\n' + chalk.bold.cyan(`━━ ${detail.displayName} ━━`));
      console.log(`Status:    ${statusColor(detail.status)}`);
      console.log(`Role:      ${detail.role ?? chalk.dim('—')}`);
      console.log(`Skills:    ${detail.skills?.length ?? 0}`);
      if (detail.skills?.length > 0) {
        detail.skills.forEach((s: any) => console.log(`  ${chalk.dim('•')} ${s.skill?.displayName ?? s.skillId}`));
      }
      console.log(`Last HB:   ${detail.lastHeartbeatAt ? new Date(detail.lastHeartbeatAt).toLocaleString() : chalk.dim('Never')}`);
      console.log();
    } catch (err: any) {
      spinner.fail(chalk.red(`Error: ${err.message}`));
      process.exit(1);
    }
  });

// pcc agent pause <company.agent>
agentCommand
  .command('pause <ref>')
  .description('Pause an agent (format: company.agent)')
  .action(async (ref: string) => {
    const [companySlug, agentSlug] = ref.split('.');
    const spinner = ora(`Pausing ${chalk.cyan(ref)}...`).start();
    try {
      const companies = await apiGet<any[]>('/api/companies');
      const company = companies.find((c) => c.slug === companySlug);
      if (!company) throw new Error(`Company "${companySlug}" not found`);
      const agents = await apiGet<any[]>(`/api/companies/${company.id}/agents`);
      const agent = agents.find((a: any) => a.slug === agentSlug);
      if (!agent) throw new Error(`Agent "${agentSlug}" not found`);

      await apiPost(`/api/agents/${agent.id}/pause`);
      spinner.succeed(chalk.yellow(`Agent "${ref}" paused`));
    } catch (err: any) {
      spinner.fail(chalk.red(`Error: ${err.message}`));
      process.exit(1);
    }
  });

// pcc agent resume <company.agent>
agentCommand
  .command('resume <ref>')
  .description('Resume a paused agent (format: company.agent)')
  .action(async (ref: string) => {
    const [companySlug, agentSlug] = ref.split('.');
    const spinner = ora(`Resuming ${chalk.cyan(ref)}...`).start();
    try {
      const companies = await apiGet<any[]>('/api/companies');
      const company = companies.find((c) => c.slug === companySlug);
      if (!company) throw new Error(`Company "${companySlug}" not found`);
      const agents = await apiGet<any[]>(`/api/companies/${company.id}/agents`);
      const agent = agents.find((a: any) => a.slug === agentSlug);
      if (!agent) throw new Error(`Agent "${agentSlug}" not found`);

      await apiPost(`/api/agents/${agent.id}/resume`);
      spinner.succeed(chalk.green(`Agent "${ref}" resumed`));
    } catch (err: any) {
      spinner.fail(chalk.red(`Error: ${err.message}`));
      process.exit(1);
    }
  });
