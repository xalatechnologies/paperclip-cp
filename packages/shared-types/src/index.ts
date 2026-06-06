import { z } from 'zod';

// =============================================================================
// Enums
// =============================================================================

export enum AgentStatus {
  ACTIVE = 'active',
  PAUSED = 'paused',
  IDLE = 'idle',
  RUNNING = 'running',
  ERROR = 'error',
  UNKNOWN = 'unknown',
}

export enum TaskStatus {
  PENDING = 'pending',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}

export enum SecretScope {
  GLOBAL = 'global',
  COMPANY = 'company',
  PROJECT = 'project',
  AGENT = 'agent',
}

export enum IntegrationType {
  SLACK = 'slack',
  TEAMS = 'teams',
  GITHUB = 'github',
  LINEAR = 'linear',
  TELEGRAM = 'telegram',
  WHATSAPP = 'whatsapp',
}

export enum AuditAction {
  SECRET_READ = 'secret.read',
  SECRET_CREATE = 'secret.create',
  SECRET_DELETE = 'secret.delete',
  AGENT_PAUSE = 'agent.pause',
  AGENT_RESUME = 'agent.resume',
  AGENT_SKILL_UPDATE = 'agent.skill_update',
  SSH_COMMAND_RUN = 'ssh.command_run',
  COMPANY_CREATE = 'company.create',
  COMPANY_UPDATE = 'company.update',
  SKILL_DEPLOY = 'skill.deploy',
}

export enum CommandSafetyLevel {
  SAFE = 'safe',
  REQUIRES_APPROVAL = 'requires_approval',
  BLOCKED = 'blocked',
}

// =============================================================================
// Core Entities
// =============================================================================

export const CompanySchema = z.object({
  id: z.string().uuid(),
  slug: z.string().min(1).max(64),
  displayName: z.string().min(1).max(128),
  paperclipCompanyId: z.string().optional(),
  mission: z.string().max(500).optional(),
  budgetPerDay: z.number().positive().optional(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
export type Company = z.infer<typeof CompanySchema>;

export const ProjectSchema = z.object({
  id: z.string().uuid(),
  companyId: z.string().uuid(),
  slug: z.string().min(1).max(64),
  displayName: z.string().min(1).max(128),
  description: z.string().max(1000).optional(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
export type Project = z.infer<typeof ProjectSchema>;

export const AgentSchema = z.object({
  id: z.string().uuid(),
  companyId: z.string().uuid(),
  projectId: z.string().uuid().optional(),
  slug: z.string().min(1).max(64),
  displayName: z.string().min(1).max(128),
  role: z.string().max(128).optional(),
  paperclipAgentId: z.string().optional(),
  status: z.nativeEnum(AgentStatus).default(AgentStatus.UNKNOWN),
  budgetPerDay: z.number().positive().optional(),
  heartbeatIntervalSeconds: z.number().int().positive().default(60),
  lastHeartbeatAt: z.coerce.date().optional(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
export type Agent = z.infer<typeof AgentSchema>;

export const SkillSchema = z.object({
  id: z.string().uuid(),
  slug: z.string().min(1).max(64),
  displayName: z.string().min(1).max(128),
  description: z.string().max(500).optional(),
  content: z.string(), // SKILL.md content
  version: z.string().default('1.0.0'),
  tokenEstimate: z.number().int().nonnegative().optional(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
export type Skill = z.infer<typeof SkillSchema>;

export const SecretMetaSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(128),
  scope: z.nativeEnum(SecretScope),
  companyId: z.string().uuid().optional(),
  projectId: z.string().uuid().optional(),
  agentId: z.string().uuid().optional(),
  description: z.string().max(500).optional(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
  // NOTE: value is NEVER included in this type — only stored encrypted in DB
});
export type SecretMeta = z.infer<typeof SecretMetaSchema>;

export const ServerSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(128),
  host: z.string().min(1),
  port: z.number().int().default(22),
  username: z.string().min(1),
  description: z.string().max(500).optional(),
  tags: z.array(z.string()).default([]),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
export type Server = z.infer<typeof ServerSchema>;

export const GoalSchema = z.object({
  id: z.string().uuid(),
  companyId: z.string().uuid(),
  projectId: z.string().uuid().optional(),
  title: z.string().min(1).max(256),
  description: z.string().max(2000).optional(),
  status: z.enum(['active', 'completed', 'paused', 'cancelled']).default('active'),
  deadline: z.coerce.date().optional(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
export type Goal = z.infer<typeof GoalSchema>;

export const TaskSchema = z.object({
  id: z.string().uuid(),
  companyId: z.string().uuid(),
  projectId: z.string().uuid().optional(),
  milestoneId: z.string().uuid().optional(),
  assignedAgentId: z.string().uuid().optional(),
  title: z.string().min(1).max(256),
  description: z.string().max(5000).optional(),
  status: z.nativeEnum(TaskStatus).default(TaskStatus.PENDING),
  priority: z.enum(['low', 'medium', 'high', 'critical']).default('medium'),
  deadline: z.coerce.date().optional(),
  linkedPR: z.string().url().optional(),
  linkedIssue: z.string().url().optional(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
export type Task = z.infer<typeof TaskSchema>;

export const AuditLogSchema = z.object({
  id: z.string().uuid(),
  action: z.nativeEnum(AuditAction),
  actorId: z.string().optional(), // user ID or 'system'
  resourceType: z.string(),
  resourceId: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
  ipAddress: z.string().optional(),
  createdAt: z.coerce.date(),
});
export type AuditLog = z.infer<typeof AuditLogSchema>;

// =============================================================================
// Paperclip API response types (mapped from Paperclip API)
// =============================================================================

export const PaperclipAgentStatusSchema = z.object({
  agentId: z.string(),
  status: z.string(),
  lastActivity: z.coerce.date().optional(),
  currentTask: z.string().optional(),
  tokensUsedToday: z.number().optional(),
  costToday: z.number().optional(),
});
export type PaperclipAgentStatus = z.infer<typeof PaperclipAgentStatusSchema>;

export const PaperclipHeartbeatSchema = z.object({
  agentId: z.string(),
  timestamp: z.coerce.date(),
  healthy: z.boolean(),
  message: z.string().optional(),
});
export type PaperclipHeartbeat = z.infer<typeof PaperclipHeartbeatSchema>;

export const CostSummarySchema = z.object({
  companyId: z.string().optional(),
  agentId: z.string().optional(),
  date: z.string(), // YYYY-MM-DD
  totalCostUsd: z.number(),
  totalTokens: z.number().int(),
  breakdown: z.array(z.object({
    agentId: z.string(),
    costUsd: z.number(),
    tokens: z.number().int(),
  })).optional(),
});
export type CostSummary = z.infer<typeof CostSummarySchema>;

// =============================================================================
// SSH / VPS types
// =============================================================================

export const CommandRunSchema = z.object({
  id: z.string().uuid(),
  serverId: z.string().uuid(),
  command: z.string(),
  safetyLevel: z.nativeEnum(CommandSafetyLevel),
  output: z.string().optional(),
  exitCode: z.number().int().optional(),
  actorId: z.string().optional(),
  approvedBy: z.string().optional(),
  durationMs: z.number().int().optional(),
  createdAt: z.coerce.date(),
});
export type CommandRun = z.infer<typeof CommandRunSchema>;

// =============================================================================
// API response wrappers
// =============================================================================

export const ApiResponseSchema = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z.object({
    success: z.boolean(),
    data: dataSchema.optional(),
    error: z.string().optional(),
    message: z.string().optional(),
  });

export type ApiResponse<T> = {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
};

export type PaginatedResponse<T> = ApiResponse<T[]> & {
  pagination: {
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  };
};
