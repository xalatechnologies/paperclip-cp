import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { apiGet } from '../api-client.js';

export const costsCommand = new Command('costs')
  .description('View cost and usage data');

costsCommand
  .command('today')
  .description("Show today's costs across all companies")
  .option('-c, --company <slug>', 'Filter by company slug')
  .action(async (opts: any) => {
    const spinner = ora("Fetching today's costs...").start();
    try {
      const data = await apiGet<any>('/api/costs/today');
      spinner.stop();

      const today = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
      console.log('\n' + chalk.bold.cyan(`Cost Report — ${today}`));
      console.log(chalk.dim('─'.repeat(50)));
      console.log(`Total USD:    ${chalk.green.bold('$' + (data.totalUsd ?? 0).toFixed(4))}`);
      console.log(`Total Tokens: ${chalk.yellow((data.totalTokens ?? 0).toLocaleString())}`);

      if (data.breakdown?.length > 0) {
        console.log('\n' + chalk.bold('Breakdown:'));
        data.breakdown.forEach((row: any) => {
          console.log(`  ${chalk.dim('•')} ${chalk.cyan(row.agentId ?? row.companyId ?? '—')} — $${parseFloat(row.totalCostUsd).toFixed(4)} (${row.totalTokens?.toLocaleString() ?? 0} tokens)`);
        });
      } else {
        console.log(chalk.dim('\nNo cost data recorded yet today.'));
      }
      console.log();
    } catch (err: any) {
      spinner.fail(chalk.red(`Error: ${err.message}`));
      process.exit(1);
    }
  });

export const heartbeatCommand = new Command('heartbeat')
  .description('Check agent heartbeat health');

heartbeatCommand
  .command('check')
  .description('Check heartbeat status for all agents')
  .option('-c, --company <slug>', 'Filter by company slug')
  .action(async (_opts: any) => {
    const spinner = ora('Checking heartbeats...').start();
    try {
      const data = await apiGet<any>('/api/heartbeats/check');
      spinner.stop();

      console.log('\n' + chalk.bold.cyan('Heartbeat Status'));
      console.log(chalk.dim('─'.repeat(50)));
      console.log(`Total:   ${data.total}`);
      console.log(`Healthy: ${chalk.green(data.healthy)}`);
      console.log(`Failing: ${data.failing > 0 ? chalk.red(data.failing) : chalk.green(data.failing)}`);

      if (data.alerts?.length > 0) {
        console.log('\n' + chalk.bold.red('⚠ Alerts:'));
        data.alerts.forEach((alert: string) => console.log(`  ${chalk.red('!')} ${alert}`));
      }

      if (data.agents?.length > 0) {
        console.log('\n' + chalk.bold('Agent Status:'));
        data.agents.forEach((a: any) => {
          const icon = a.isHealthy && !a.isStale ? chalk.green('✓') : chalk.red('✗');
          const stale = a.isStale ? chalk.red(' [STALE]') : '';
          console.log(`  ${icon} ${chalk.cyan(a.agentSlug)} — ${a.isHealthy ? chalk.green('healthy') : chalk.red('unhealthy')}${stale} ${a.minutesSinceHeartbeat !== null ? chalk.dim(`(${a.minutesSinceHeartbeat}m ago)`) : chalk.dim('(never)')}`);
        });
      }
      console.log();
    } catch (err: any) {
      spinner.fail(chalk.red(`Error: ${err.message}`));
      process.exit(1);
    }
  });
