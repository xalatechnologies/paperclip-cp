import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { createInterface } from 'node:readline/promises';
import { apiGet, apiPost } from '../api-client.js';

export const secretCommand = new Command('secret')
  .description('Manage secrets (stored AES-256 encrypted)');

// pcc secret list
secretCommand
  .command('list')
  .description('List secret names (values are never shown)')
  .option('-c, --company <id>', 'Filter by company ID')
  .action(async (opts: any) => {
    const spinner = ora('Fetching secrets...').start();
    try {
      const secrets = await apiGet<any[]>('/api/secrets');
      spinner.stop();

      if (secrets.length === 0) {
        console.log(chalk.yellow('\nNo secrets stored yet.'));
        return;
      }

      console.log('\n' + chalk.bold('Stored Secrets') + chalk.dim(' (values are encrypted and never displayed)'));
      console.log(chalk.dim('─'.repeat(50)));
      secrets.forEach((s) => {
        console.log(`${chalk.cyan(s.name)} ${chalk.dim(`[${s.scope}]`)} ${s.description ? chalk.italic.dim(s.description) : ''}`);
      });
      console.log();
    } catch (err: any) {
      spinner.fail(chalk.red(`Error: ${err.message}`));
      process.exit(1);
    }
  });

// pcc secret set <name>
secretCommand
  .command('set <name>')
  .description('Store or update a secret (prompts for value)')
  .option('-d, --description <desc>', 'Secret description')
  .option('-s, --scope <scope>', 'Scope: global|company|project|agent', 'global')
  .action(async (name: string, opts: any) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });

    process.stdout.write(chalk.yellow(`Enter value for ${chalk.bold(name)}: `));
    // Hide input
    const value = await new Promise<string>((resolve) => {
      process.stdin.setRawMode?.(true);
      let input = '';
      process.stdin.on('data', function handler(data) {
        const char = data.toString();
        if (char === '\r' || char === '\n') {
          process.stdin.setRawMode?.(false);
          process.stdin.removeListener('data', handler);
          process.stdout.write('\n');
          resolve(input);
        } else if (char === '\u0003') {
          process.exit(0);
        } else if (char === '\u007f') {
          input = input.slice(0, -1);
        } else {
          input += char;
          process.stdout.write('*');
        }
      });
    });
    rl.close();

    if (!value.trim()) {
      console.error(chalk.red('Value cannot be empty'));
      process.exit(1);
    }

    const spinner = ora(`Storing secret ${chalk.cyan(name)}...`).start();
    try {
      await apiPost('/api/secrets', {
        name,
        value,
        scope: opts.scope,
        description: opts.description,
      });
      spinner.succeed(chalk.green(`Secret "${name}" stored securely (AES-256 encrypted)`));
    } catch (err: any) {
      spinner.fail(chalk.red(`Error: ${err.message}`));
      process.exit(1);
    }
  });
