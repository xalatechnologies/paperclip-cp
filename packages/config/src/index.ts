export * from './encryption';

// =============================================================================
// SSH Command Safety Harness
//
// Every SSH command is evaluated before execution.
// SAFE commands run immediately.
// REQUIRES_APPROVAL commands need explicit confirmation.
// BLOCKED commands are rejected with no path to approval.
// =============================================================================

export enum CommandSafety {
  SAFE = 'safe',
  REQUIRES_APPROVAL = 'requires_approval',
  BLOCKED = 'blocked',
}

const SAFE_PATTERNS: RegExp[] = [
  /^systemctl status .+/,
  /^docker ps$/,
  /^docker ps -a$/,
  /^docker logs .+/,
  /^docker stats --no-stream/,
  /^df -h/,
  /^free -m/,
  /^free -h/,
  /^top -bn1/,
  /^htop$/,
  /^ps aux/,
  /^ps -ef/,
  /^uptime$/,
  /^hostname$/,
  /^cat \/etc\/os-release/,
  /^uname -a/,
  /^git status/,
  /^git log.+/,
  /^git diff/,
  /^pm2 status/,
  /^pm2 list/,
  /^pm2 logs .+ --lines \d+/,
  /^journalctl -u .+/,
  /^tail -n \d+ .+/,
  /^cat .+\.log/,
  /^ls -la? .*/,
  /^pwd$/,
  /^echo .+/,
  /^env$/,
  /^printenv$/,
  /^nginx -t$/,
  /^nginx -v$/,
  /^node --version$/,
  /^pnpm --version$/,
  /^npm --version$/,
];

const APPROVAL_PATTERNS: RegExp[] = [
  /^systemctl (restart|stop|start) .+/,
  /^docker (restart|stop|start) .+/,
  /^docker-compose (up|down|restart).*/,
  /^pm2 (restart|stop|start) .+/,
  /^git pull/,
  /^git fetch/,
  /^pnpm install/,
  /^pnpm build/,
  /^pnpm (run )?migrate/,
  /^npm install/,
  /^npm run build/,
  /^kill \d+/,
  /^pkill .+/,
  /^service .+ (restart|stop|start)/,
];

const BLOCKED_PATTERNS: RegExp[] = [
  /rm\s+-rf/,
  /drop\s+database/i,
  /truncate\s+table/i,
  /chmod\s+777/,
  /reboot/,
  /shutdown/,
  /halt/,
  /poweroff/,
  /curl.+\|\s*(bash|sh)/,
  /wget.+\|\s*(bash|sh)/,
  /docker\s+system\s+prune/,
  /dd\s+if=/,
  /mkfs/,
  /format/,
  />\s*\/dev\//,
  /fork\s*bomb/,
  /:\(\)\s*\{/,
];

export interface CommandEvaluation {
  command: string;
  safety: CommandSafety;
  reason: string;
  matchedPattern?: string;
}

export function evaluateCommand(command: string): CommandEvaluation {
  const trimmed = command.trim();

  // Check blocked first — no exceptions
  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(trimmed)) {
      return {
        command: trimmed,
        safety: CommandSafety.BLOCKED,
        reason: `Command contains a blocked pattern: ${pattern.source}`,
        matchedPattern: pattern.source,
      };
    }
  }

  // Check safe patterns
  for (const pattern of SAFE_PATTERNS) {
    if (pattern.test(trimmed)) {
      return {
        command: trimmed,
        safety: CommandSafety.SAFE,
        reason: `Command matches safe pattern: ${pattern.source}`,
        matchedPattern: pattern.source,
      };
    }
  }

  // Check approval-required patterns
  for (const pattern of APPROVAL_PATTERNS) {
    if (pattern.test(trimmed)) {
      return {
        command: trimmed,
        safety: CommandSafety.REQUIRES_APPROVAL,
        reason: `Command requires explicit approval: ${pattern.source}`,
        matchedPattern: pattern.source,
      };
    }
  }

  // Default: unknown commands require approval
  return {
    command: trimmed,
    safety: CommandSafety.REQUIRES_APPROVAL,
    reason: 'Command not in safe list — requires explicit approval',
  };
}
