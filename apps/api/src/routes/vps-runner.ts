/**
 * VPS Runner Routes — Phase 2
 *
 * POST /api/vps/run     → evaluate + execute a shell command on the VPS
 * GET  /api/vps/health  → system vitals (disk, memory, uptime, docker)
 * GET  /api/vps/docker  → docker ps output
 */

import type { FastifyPluginAsync } from 'fastify';
import { vpsCommand } from '../vps-db.js';
import { evaluateCommand, CommandSafety } from '@pcc/config';

export const vpsRunnerRoutes: FastifyPluginAsync = async (app) => {

  /**
   * POST /api/vps/run
   * Evaluate a command against the safety harness, then run it if safe/approved.
   * Body: { command: string, approved?: boolean }
   */
  app.post<{
    Body: { command: string; approved?: boolean };
  }>('/run', async (req, reply) => {
    const { command, approved = false } = req.body;
    if (!command?.trim()) {
      return reply.status(400).send({ error: 'command is required' });
    }

    const evaluation = evaluateCommand(command.trim());

    // Always reject blocked commands
    if (evaluation.safety === CommandSafety.BLOCKED) {
      return reply.status(403).send({
        success: false,
        safety: evaluation.safety,
        reason: evaluation.reason,
        output: null,
      });
    }

    // Requires approval — if not explicitly approved, return for confirmation
    if (evaluation.safety === CommandSafety.REQUIRES_APPROVAL && !approved) {
      return reply.status(202).send({
        success: false,
        safety: evaluation.safety,
        reason: evaluation.reason,
        requiresApproval: true,
        output: null,
      });
    }

    // SAFE or explicitly approved REQUIRES_APPROVAL — run it
    try {
      const { stdout, stderr } = await vpsCommand(evaluation.command);
      return reply.send({
        success: true,
        safety: evaluation.safety,
        command: evaluation.command,
        stdout: stdout || null,
        stderr: stderr || null,
        output: stdout || stderr || '(no output)',
        executedAt: new Date().toISOString(),
      });
    } catch (err: any) {
      return reply.status(503).send({
        success: false,
        safety: evaluation.safety,
        error: 'VPS unreachable or command failed',
        detail: err.message,
      });
    }
  });

  /**
   * GET /api/vps/health
   * Returns system vitals from the VPS: uptime, disk, memory, docker.
   */
  app.get('/health', async (_req, reply) => {
    try {
      const [uptime, disk, memory, docker] = await Promise.all([
        vpsCommand('uptime').catch(() => ({ stdout: '', stderr: 'unreachable' })),
        vpsCommand('df -h /').catch(() => ({ stdout: '', stderr: '' })),
        vpsCommand('free -m').catch(() => ({ stdout: '', stderr: '' })),
        vpsCommand('docker ps --format "{{.Names}}\t{{.Status}}\t{{.Image}}"').catch(() => ({ stdout: '', stderr: '' })),
      ]);

      // Parse memory: free -m gives line 2 = Mem: total used free ...
      const memLines = memory.stdout.trim().split('\n');
      const memParts = memLines[1]?.trim().split(/\s+/) ?? [];
      const memTotal = parseInt(memParts[1] ?? '0', 10);
      const memUsed  = parseInt(memParts[2] ?? '0', 10);
      const memFree  = parseInt(memParts[3] ?? '0', 10);

      // Parse disk: df -h / line 2 = /dev/... size used avail use% mount
      const diskLines = disk.stdout.trim().split('\n');
      const diskParts = diskLines[1]?.trim().split(/\s+/) ?? [];
      const diskTotal  = diskParts[1] ?? '?';
      const diskUsed   = diskParts[2] ?? '?';
      const diskAvail  = diskParts[3] ?? '?';
      const diskUseStr = diskParts[4] ?? '?';

      // Parse docker containers
      const containers = docker.stdout.trim().split('\n').filter(Boolean).map(line => {
        const [name, ...rest] = line.split('\t');
        const status = rest[0] ?? '';
        const image  = rest[1] ?? '';
        const running = status.toLowerCase().startsWith('up');
        return { name, status, image, running };
      });

      return reply.send({
        ok: true,
        uptime: uptime.stdout.trim() || null,
        memory: memTotal > 0 ? { total: memTotal, used: memUsed, free: memFree, pct: Math.round((memUsed / memTotal) * 100) } : null,
        disk: { total: diskTotal, used: diskUsed, avail: diskAvail, usePct: diskUseStr },
        containers,
        checkedAt: new Date().toISOString(),
      });
    } catch (err: any) {
      return reply.status(503).send({ ok: false, error: 'VPS unreachable', detail: err.message });
    }
  });

  /**
   * GET /api/vps/docker
   * More detailed docker ps -a
   */
  app.get('/docker', async (_req, reply) => {
    try {
      const { stdout } = await vpsCommand('docker ps -a --format "{{.Names}}\t{{.Status}}\t{{.Image}}\t{{.Ports}}"');
      const containers = stdout.trim().split('\n').filter(Boolean).map(line => {
        const [name, status, image, ports] = line.split('\t');
        return { name, status, image, ports: ports || '', running: (status ?? '').toLowerCase().startsWith('up') };
      });
      return reply.send({ success: true, containers });
    } catch (err: any) {
      return reply.status(503).send({ success: false, error: 'VPS unreachable', detail: err.message });
    }
  });
};
