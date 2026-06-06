import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { table } from 'table';
import { apiGet, apiPost } from '../api-client.js';

export const skillCommand = new Command('skill')
  .description('Manage skills in the registry');

skillCommand
  .command('list')
  .description('List all skills in the registry')
  .action(async () => {
    const spinner = ora('Fetching skills...').start();
    try {
      const skills = await apiGet<any[]>('/api/skills');
      spinner.stop();

      if (skills.length === 0) {
        console.log(chalk.yellow('\nNo skills in registry yet.\n'));
        return;
      }

      const rows = [
        [chalk.bold('Slug'), chalk.bold('Name'), chalk.bold('Version'), chalk.bold('Est. Tokens')],
        ...skills.map((s) => [
          chalk.cyan(s.slug),
          s.displayName,
          chalk.dim(s.version),
          s.tokenEstimate ? chalk.yellow(s.tokenEstimate.toLocaleString()) : chalk.dim('—'),
        ]),
      ];
      console.log('\n' + table(rows));
    } catch (err: any) {
      spinner.fail(chalk.red(`Error: ${err.message}`));
      process.exit(1);
    }
  });

skillCommand
  .command('validate <slug>')
  .description('Validate a skill by its slug')
  .action(async (slug: string) => {
    const spinner = ora(`Validating skill ${chalk.cyan(slug)}...`).start();
    try {
      const skills = await apiGet<any[]>('/api/skills');
      const skill = skills.find((s: any) => s.slug === slug);
      if (!skill) throw new Error(`Skill "${slug}" not found in registry`);

      const result = await apiPost<any>(`/api/skills/${skill.id}/validate`);
      spinner.stop();

      if (result.valid) {
        console.log(chalk.green(`\n✓ Skill "${slug}" is valid`));
        console.log(`  Token estimate: ${chalk.yellow(result.tokenEstimate?.toLocaleString() ?? '?')}`);
      } else {
        console.log(chalk.red(`\n✗ Skill "${slug}" has issues:`));
        result.issues?.forEach((issue: string) => console.log(`  ${chalk.red('•')} ${issue}`));
      }
      console.log();
    } catch (err: any) {
      spinner.fail(chalk.red(`Error: ${err.message}`));
      process.exit(1);
    }
  });
