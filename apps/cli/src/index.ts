#!/usr/bin/env tsx
import { config } from 'dotenv';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

// Load .env from workspace root
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
config({ path: resolve(__dirname, '../../../.env') });

import { Command } from 'commander';
import chalk from 'chalk';
import { companyCommand } from './commands/company.js';
import { agentCommand } from './commands/agent.js';
import { skillCommand } from './commands/skill.js';
import { secretCommand } from './commands/secret.js';
import { costsCommand, heartbeatCommand } from './commands/costs.js';

const program = new Command();

program
  .name('pcc')
  .description(chalk.cyan('Paperclip Control Center CLI'))
  .version('0.1.0')
  .addHelpText('before', `
${chalk.bold.cyan('╔══════════════════════════════════════╗')}
${chalk.bold.cyan('║')} ${chalk.white.bold('Paperclip Control Center')} ${chalk.dim('v0.1.0')}        ${chalk.bold.cyan('║')}
${chalk.bold.cyan('╚══════════════════════════════════════╝')}
`);

program.addCommand(companyCommand);
program.addCommand(agentCommand);
program.addCommand(skillCommand);
program.addCommand(secretCommand);
program.addCommand(costsCommand);
program.addCommand(heartbeatCommand);

program.parse(process.argv);
