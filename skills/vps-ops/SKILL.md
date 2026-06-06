# VPS Ops Skill

## Purpose
Safely inspect, monitor, and operate VPS servers through SSH using a strict command allowlist and mandatory audit trail.

## When to Use
- Checking server health (disk, memory, CPU, uptime)
- Inspecting Docker containers or systemd services
- Reading logs from running services
- Restarting safe services with approval
- Verifying deployment state

## Inputs Required
- Server name or IP (from registry)
- Service or component to inspect
- Specific task (health check / log read / service restart / etc.)

## Allowed Actions (SAFE — no approval needed)
```
systemctl status <service>
docker ps
docker ps -a
docker logs <container> --tail <n>
docker stats --no-stream
df -h
free -m
top -bn1
uptime
hostname
uname -a
git status
git log --oneline -10
pm2 status
pm2 list
journalctl -u <service> --since "1 hour ago"
tail -n 200 <log file>
nginx -t
```

## Requires Approval (will pause and ask before running)
```
systemctl restart <service>
systemctl stop <service>
docker restart <container>
git pull
pnpm install
pnpm build
pm2 restart <app>
kill <pid>
service <name> restart
```

## Always Blocked (no exceptions, no override)
```
rm -rf *
drop database
truncate table
chmod 777
reboot
shutdown
halt
poweroff
curl ... | bash
wget ... | sh
docker system prune
dd if=
mkfs
> /dev/
```

## Step-by-Step Workflow

### Step 1 — Identify the task
- What information is needed? (health check / log / service status / deployment check)
- Which server and service?

### Step 2 — Evaluate command safety
- Classify the command: SAFE / REQUIRES_APPROVAL / BLOCKED
- If BLOCKED: refuse and explain why
- If REQUIRES_APPROVAL: state the command, state the reason, wait for user confirmation

### Step 3 — Execute
- Run the safe command
- Capture the output
- Do not run additional commands beyond what was requested

### Step 4 — Report
- Summarize the output clearly (do not dump raw output > 50 lines without summary)
- Flag any anomalies (high CPU, full disk, failing services)
- Suggest next action if appropriate

### Step 5 — Audit
- All commands are logged automatically
- Do not attempt to suppress or hide audit events

## Output Format
```
VPS OPS REPORT
==============
Server: <name>
Command: <command executed>
Safety level: SAFE | APPROVED

Result:
<summarized output>

Anomalies:
- <any issues found>

Recommended next action:
- <optional>
```

## Token Budget Rules
- Do not load server logs > 200 lines without summarizing
- Do not run multiple commands in sequence without reporting between them
- Token budget per VPS session: < 4,000 tokens

## Escalation Rules
- Disk > 90% → alert immediately
- Service down → alert and suggest restart (with approval)
- Unknown error in logs → capture and escalate to Engineering Lead
- Cannot connect to server → escalate to infrastructure owner

## Security Notes
- SSH private keys are stored encrypted in the secrets vault
- Never log or display private keys or passwords
- Command output is sanitized of credentials before logging
- All sessions are audit-logged
