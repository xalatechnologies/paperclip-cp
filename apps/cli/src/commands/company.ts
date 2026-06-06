import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { table } from 'table';
import { apiGet, apiPost } from '../api-client.js';

export const companyCommand = new Command('company')
  .description('Manage Paperclip companies');

// pcc company list
companyCommand
  .command('list')
  .description('List all registered companies')
  .action(async () => {
    const spinner = ora('Fetching companies...').start();
    try {
      const companies = await apiGet<any[]>('/api/companies');
      spinner.stop();

      if (companies.length === 0) {
        console.log(chalk.yellow('\nNo companies registered yet.'));
        console.log(chalk.dim('Run: pcc company create <slug> --name "Display Name"\n'));
        return;
      }

      const rows = [
        [chalk.bold('Slug'), chalk.bold('Display Name'), chalk.bold('Paperclip ID'), chalk.bold('Created')],
        ...companies.map((c) => [
          chalk.cyan(c.slug),
          c.displayName,
          c.paperclipCompanyId ? chalk.green(c.paperclipCompanyId) : chalk.dim('—'),
          new Date(c.createdAt).toLocaleDateString(),
        ]),
      ];

      console.log('\n' + table(rows, {
        border: { topBody: '─', topJoin: '┬', topLeft: '╭', topRight: '╮',
                  bottomBody: '─', bottomJoin: '┴', bottomLeft: '╰', bottomRight: '╯',
                  bodyLeft: '│', bodyRight: '│', bodyJoin: '│', joinBody: '─', joinLeft: '├', joinRight: '┤', joinJoin: '┼' },
      }));
    } catch (err: any) {
      spinner.fail(chalk.red(`Error: ${err.message}`));
      process.exit(1);
    }
  });

// pcc company status <slug>
companyCommand
  .command('status <slug>')
  .description('Show detailed status of a company')
  .action(async (slug: string) => {
    const spinner = ora(`Fetching status for ${chalk.cyan(slug)}...`).start();
    try {
      const companies = await apiGet<any[]>('/api/companies');
      const company = companies.find((c) => c.slug === slug);

      if (!company) {
        spinner.fail(chalk.red(`Company "${slug}" not found`));
        process.exit(1);
      }

      const detail = await apiGet<any>(`/api/companies/${company.id}`);
      spinner.stop();

      console.log('\n' + chalk.bold.cyan(`━━ ${detail.displayName} ━━`));
      console.log(chalk.dim(`ID: ${detail.id}`));
      if (detail.paperclipCompanyId) console.log(`Paperclip ID: ${chalk.green(detail.paperclipCompanyId)}`);
      if (detail.mission) console.log(`Mission: ${chalk.italic(detail.mission)}`);
      console.log(`\n${chalk.bold('Agents:')} ${detail.agents?.length ?? 0}`);

      if (detail.agents?.length > 0) {
        detail.agents.forEach((a: any) => {
          const statusColor = a.status === 'active' ? chalk.green : a.status === 'paused' ? chalk.yellow : chalk.red;
          console.log(`  ${chalk.dim('•')} ${a.displayName} ${chalk.dim(`[${a.slug}]`)} — ${statusColor(a.status)}`);
        });
      }

      console.log(`\n${chalk.bold('Projects:')} ${detail.projects?.length ?? 0}`);
      detail.projects?.forEach((p: any) => {
        console.log(`  ${chalk.dim('•')} ${p.displayName}`);
      });
      console.log();
    } catch (err: any) {
      spinner.fail(chalk.red(`Error: ${err.message}`));
      process.exit(1);
    }
  });

// pcc company create <slug>
companyCommand
  .command('create <slug>')
  .description('Register a new company')
  .requiredOption('-n, --name <name>', 'Display name for the company')
  .option('-p, --paperclip-id <id>', 'Paperclip company ID')
  .option('-m, --mission <mission>', 'Company mission statement')
  .action(async (slug: string, opts: any) => {
    const spinner = ora(`Creating company ${chalk.cyan(slug)}...`).start();
    try {
      const company = await apiPost<any>('/api/companies', {
        slug,
        displayName: opts.name,
        paperclipCompanyId: opts.paperclipId,
        mission: opts.mission,
      });
      spinner.succeed(chalk.green(`Company "${opts.name}" created!`));
      console.log(chalk.dim(`ID: ${company.id}`));
    } catch (err: any) {
      spinner.fail(chalk.red(`Error: ${err.message}`));
      process.exit(1);
    }
  });
