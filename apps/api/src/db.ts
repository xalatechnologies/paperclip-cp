import Database from 'better-sqlite3';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync } from 'node:fs';

// =============================================================================
// PCC SQLite database
// Stores: secrets, audit logs, notification channels,
//         goals/milestones/tasks, routines, agent memory,
//         knowledge collections/documents, context rules
// File: <project-root>/.pcc/pcc.db
// =============================================================================

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_DIR = resolve(__dirname, '../../../../.pcc');
const DB_PATH = resolve(DB_DIR, 'pcc.db');

mkdirSync(DB_DIR, { recursive: true });

export const db = new Database(DB_PATH);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ---------------------------------------------------------------------------
// Schema bootstrap — idempotent
// ---------------------------------------------------------------------------
db.exec(`
  -- ── Existing tables ───────────────────────────────────────────────────────

  CREATE TABLE IF NOT EXISTS secrets (
    id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    name        TEXT NOT NULL,
    encrypted_value TEXT NOT NULL,
    scope       TEXT NOT NULL DEFAULT 'global',
    paperclip_company_id TEXT,
    paperclip_agent_id   TEXT,
    description TEXT,
    rotate_after_days INTEGER,
    created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at  INTEGER NOT NULL DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS audit_logs (
    id            TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    action        TEXT NOT NULL,
    actor_id      TEXT,
    resource_type TEXT NOT NULL,
    resource_id   TEXT,
    metadata      TEXT,
    ip_address    TEXT,
    created_at    INTEGER NOT NULL DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS notification_channels (
    id                   TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    name                 TEXT NOT NULL,
    type                 TEXT NOT NULL,
    enabled              INTEGER NOT NULL DEFAULT 1,
    paperclip_company_id TEXT,
    encrypted_config     TEXT NOT NULL,
    events               TEXT NOT NULL DEFAULT '[]',
    created_at           INTEGER NOT NULL DEFAULT (unixepoch())
  );

  -- ── Goals & Tasks ─────────────────────────────────────────────────────────

  CREATE TABLE IF NOT EXISTS goals (
    id                   TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    paperclip_company_id TEXT NOT NULL,
    title                TEXT NOT NULL,
    description          TEXT,
    status               TEXT NOT NULL DEFAULT 'planned',
    priority             TEXT NOT NULL DEFAULT 'medium',
    due_date             TEXT,
    created_at           INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at           INTEGER NOT NULL DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS milestones (
    id         TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    goal_id    TEXT NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
    title      TEXT NOT NULL,
    status     TEXT NOT NULL DEFAULT 'planned',
    position   INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS tasks (
    id                 TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    milestone_id       TEXT NOT NULL REFERENCES milestones(id) ON DELETE CASCADE,
    title              TEXT NOT NULL,
    paperclip_agent_id TEXT,
    skill_slug         TEXT,
    status             TEXT NOT NULL DEFAULT 'planned',
    created_at         INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at         INTEGER NOT NULL DEFAULT (unixepoch())
  );

  -- ── Routines ──────────────────────────────────────────────────────────────

  CREATE TABLE IF NOT EXISTS routines (
    id                   TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    name                 TEXT NOT NULL,
    paperclip_company_id TEXT NOT NULL,
    paperclip_agent_id   TEXT NOT NULL,
    skill_slug           TEXT,
    schedule             TEXT NOT NULL,
    enabled              INTEGER NOT NULL DEFAULT 1,
    last_run_at          INTEGER,
    last_status          TEXT,
    last_error           TEXT,
    run_count            INTEGER NOT NULL DEFAULT 0,
    avg_duration_sec     REAL,
    created_at           INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at           INTEGER NOT NULL DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS routine_runs (
    id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    routine_id  TEXT NOT NULL REFERENCES routines(id) ON DELETE CASCADE,
    started_at  INTEGER NOT NULL DEFAULT (unixepoch()),
    finished_at INTEGER,
    status      TEXT NOT NULL DEFAULT 'running',
    duration_sec REAL,
    output      TEXT,
    error       TEXT
  );

  -- ── Agent Memory ──────────────────────────────────────────────────────────

  CREATE TABLE IF NOT EXISTS agent_memory (
    id                   TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    paperclip_agent_id   TEXT NOT NULL,
    paperclip_company_id TEXT NOT NULL,
    type                 TEXT NOT NULL DEFAULT 'fact',
    content              TEXT NOT NULL,
    source               TEXT,
    importance           INTEGER NOT NULL DEFAULT 3,
    token_count          INTEGER NOT NULL DEFAULT 0,
    created_at           INTEGER NOT NULL DEFAULT (unixepoch()),
    expires_at           INTEGER
  );

  -- ── Knowledge Base (RAG) ──────────────────────────────────────────────────

  CREATE TABLE IF NOT EXISTS knowledge_collections (
    id                   TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    name                 TEXT NOT NULL,
    paperclip_company_id TEXT NOT NULL,
    description          TEXT,
    embedding_model      TEXT NOT NULL DEFAULT 'text-embedding-3-small',
    chunk_strategy       TEXT NOT NULL DEFAULT 'sliding_512',
    bound_agent_ids      TEXT NOT NULL DEFAULT '[]',
    status               TEXT NOT NULL DEFAULT 'ready',
    doc_count            INTEGER NOT NULL DEFAULT 0,
    chunk_count          INTEGER NOT NULL DEFAULT 0,
    created_at           INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at           INTEGER NOT NULL DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS knowledge_documents (
    id              TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    collection_id   TEXT NOT NULL REFERENCES knowledge_collections(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    file_type       TEXT NOT NULL DEFAULT 'text',
    content         TEXT NOT NULL,
    chunk_count     INTEGER NOT NULL DEFAULT 0,
    size_bytes      INTEGER NOT NULL DEFAULT 0,
    created_at      INTEGER NOT NULL DEFAULT (unixepoch())
  );

  -- ── Context Engineering ───────────────────────────────────────────────────

  CREATE TABLE IF NOT EXISTS context_rules (
    id                   TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    paperclip_agent_id   TEXT NOT NULL,
    paperclip_company_id TEXT NOT NULL,
    rule_type            TEXT NOT NULL,
    label                TEXT NOT NULL,
    config               TEXT NOT NULL DEFAULT '{}',
    enabled              INTEGER NOT NULL DEFAULT 1,
    priority             INTEGER NOT NULL DEFAULT 5,
    created_at           INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at           INTEGER NOT NULL DEFAULT (unixepoch())
  );
`);

// ---------------------------------------------------------------------------
// Prepared statement helpers
// ---------------------------------------------------------------------------

// SECRETS
export const secretsDb = {
  list: db.prepare(`
    SELECT id, name, scope, paperclip_company_id, paperclip_agent_id,
           description, rotate_after_days, created_at, updated_at
    FROM secrets ORDER BY created_at DESC
  `),

  listByCompany: db.prepare(`
    SELECT id, name, scope, paperclip_company_id, paperclip_agent_id,
           description, rotate_after_days, created_at, updated_at
    FROM secrets WHERE paperclip_company_id = ? ORDER BY created_at DESC
  `),

  getEncrypted: db.prepare(`SELECT * FROM secrets WHERE id = ?`),

  insert: db.prepare(`
    INSERT INTO secrets (name, encrypted_value, scope, paperclip_company_id,
                         paperclip_agent_id, description, rotate_after_days)
    VALUES (@name, @encrypted_value, @scope, @paperclip_company_id,
            @paperclip_agent_id, @description, @rotate_after_days)
    RETURNING id, name, scope
  `),

  delete: db.prepare(`DELETE FROM secrets WHERE id = ? RETURNING name`),

  update: db.prepare(`
    UPDATE secrets SET encrypted_value = COALESCE(@encrypted_value, encrypted_value),
                       description = COALESCE(@description, description),
                       updated_at = unixepoch()
    WHERE id = @id
    RETURNING id, name, scope, description, updated_at
  `),
};

// AUDIT LOGS
export const auditDb = {
  insert: db.prepare(`
    INSERT INTO audit_logs (action, actor_id, resource_type, resource_id, metadata, ip_address)
    VALUES (@action, @actor_id, @resource_type, @resource_id, @metadata, @ip_address)
  `),

  list: db.prepare(`
    SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT ?
  `),

  listByAction: db.prepare(`
    SELECT * FROM audit_logs WHERE action = ? ORDER BY created_at DESC LIMIT ?
  `),
};

// NOTIFICATION CHANNELS
export const channelsDb = {
  list: db.prepare(`
    SELECT id, name, type, enabled, paperclip_company_id, events, created_at
    FROM notification_channels ORDER BY created_at DESC
  `),

  listByCompany: db.prepare(`
    SELECT id, name, type, enabled, paperclip_company_id, events, created_at
    FROM notification_channels WHERE paperclip_company_id = ?
  `),

  getWithConfig: db.prepare(`SELECT * FROM notification_channels WHERE id = ?`),

  insert: db.prepare(`
    INSERT INTO notification_channels (name, type, enabled, paperclip_company_id, encrypted_config, events)
    VALUES (@name, @type, @enabled, @paperclip_company_id, @encrypted_config, @events)
    RETURNING id, name, type
  `),

  toggle: db.prepare(`UPDATE notification_channels SET enabled = ? WHERE id = ?`),

  delete: db.prepare(`DELETE FROM notification_channels WHERE id = ? RETURNING name`),
};

// GOALS
export const goalsDb = {
  list: db.prepare(`
    SELECT * FROM goals ORDER BY created_at DESC
  `),
  listByCompany: db.prepare(`SELECT * FROM goals WHERE paperclip_company_id = ? ORDER BY created_at DESC`),
  get: db.prepare(`SELECT * FROM goals WHERE id = ?`),
  insert: db.prepare(`
    INSERT INTO goals (paperclip_company_id, title, description, status, priority, due_date)
    VALUES (@paperclip_company_id, @title, @description, @status, @priority, @due_date)
    RETURNING *
  `),
  update: db.prepare(`
    UPDATE goals SET title = COALESCE(@title, title), description = COALESCE(@description, description),
      status = COALESCE(@status, status), priority = COALESCE(@priority, priority),
      due_date = COALESCE(@due_date, due_date), updated_at = unixepoch()
    WHERE id = @id RETURNING *
  `),
  delete: db.prepare(`DELETE FROM goals WHERE id = ?`),
};

// MILESTONES
export const milestonesDb = {
  listByGoal: db.prepare(`SELECT * FROM milestones WHERE goal_id = ? ORDER BY position, created_at`),
  insert: db.prepare(`
    INSERT INTO milestones (goal_id, title, status, position)
    VALUES (@goal_id, @title, @status, @position) RETURNING *
  `),
  update: db.prepare(`
    UPDATE milestones SET title = COALESCE(@title, title), status = COALESCE(@status, status)
    WHERE id = @id RETURNING *
  `),
  delete: db.prepare(`DELETE FROM milestones WHERE id = ?`),
};

// TASKS
export const tasksDb = {
  listByMilestone: db.prepare(`SELECT * FROM tasks WHERE milestone_id = ? ORDER BY created_at`),
  insert: db.prepare(`
    INSERT INTO tasks (milestone_id, title, paperclip_agent_id, skill_slug, status)
    VALUES (@milestone_id, @title, @paperclip_agent_id, @skill_slug, @status) RETURNING *
  `),
  update: db.prepare(`
    UPDATE tasks SET status = COALESCE(@status, status), paperclip_agent_id = COALESCE(@paperclip_agent_id, paperclip_agent_id),
      updated_at = unixepoch()
    WHERE id = @id RETURNING *
  `),
  delete: db.prepare(`DELETE FROM tasks WHERE id = ?`),
};

// ROUTINES
export const routinesDb = {
  list: db.prepare(`SELECT * FROM routines ORDER BY created_at DESC`),
  listByCompany: db.prepare(`SELECT * FROM routines WHERE paperclip_company_id = ? ORDER BY created_at DESC`),
  get: db.prepare(`SELECT * FROM routines WHERE id = ?`),
  insert: db.prepare(`
    INSERT INTO routines (name, paperclip_company_id, paperclip_agent_id, skill_slug, schedule, enabled)
    VALUES (@name, @paperclip_company_id, @paperclip_agent_id, @skill_slug, @schedule, @enabled)
    RETURNING *
  `),
  toggle: db.prepare(`UPDATE routines SET enabled = @enabled, updated_at = unixepoch() WHERE id = @id`),
  delete: db.prepare(`DELETE FROM routines WHERE id = ?`),
  recordRun: db.prepare(`
    UPDATE routines SET
      last_run_at = unixepoch(), last_status = @status, last_error = @error,
      run_count = run_count + 1,
      avg_duration_sec = CASE WHEN avg_duration_sec IS NULL
        THEN @duration ELSE (avg_duration_sec * (run_count) + @duration) / (run_count + 1) END,
      updated_at = unixepoch()
    WHERE id = @id
  `),
};

export const routineRunsDb = {
  list: db.prepare(`SELECT * FROM routine_runs WHERE routine_id = ? ORDER BY started_at DESC LIMIT 20`),
  insert: db.prepare(`
    INSERT INTO routine_runs (routine_id) VALUES (?) RETURNING id
  `),
  finish: db.prepare(`
    UPDATE routine_runs SET finished_at = unixepoch(), status = @status,
      duration_sec = @duration_sec, output = @output, error = @error
    WHERE id = @id
  `),
};

// AGENT MEMORY
export const memoryDb = {
  list: db.prepare(`SELECT * FROM agent_memory ORDER BY importance DESC, created_at DESC`),
  listByAgent: db.prepare(`
    SELECT * FROM agent_memory
    WHERE paperclip_agent_id = ?
      AND (expires_at IS NULL OR expires_at > unixepoch())
    ORDER BY importance DESC, created_at DESC
  `),
  listByCompany: db.prepare(`
    SELECT * FROM agent_memory WHERE paperclip_company_id = ?
      AND (expires_at IS NULL OR expires_at > unixepoch())
    ORDER BY importance DESC, created_at DESC
  `),
  insert: db.prepare(`
    INSERT INTO agent_memory (paperclip_agent_id, paperclip_company_id, type, content, source, importance, token_count, expires_at)
    VALUES (@paperclip_agent_id, @paperclip_company_id, @type, @content, @source, @importance, @token_count, @expires_at)
    RETURNING *
  `),
  delete: db.prepare(`DELETE FROM agent_memory WHERE id = ?`),
  purgeExpired: db.prepare(`DELETE FROM agent_memory WHERE expires_at IS NOT NULL AND expires_at <= unixepoch()`),
};

// KNOWLEDGE
export const knowledgeDb = {
  listCollections: db.prepare(`SELECT * FROM knowledge_collections ORDER BY created_at DESC`),
  listByCompany: db.prepare(`SELECT * FROM knowledge_collections WHERE paperclip_company_id = ? ORDER BY created_at DESC`),
  getCollection: db.prepare(`SELECT * FROM knowledge_collections WHERE id = ?`),
  insertCollection: db.prepare(`
    INSERT INTO knowledge_collections (name, paperclip_company_id, description, embedding_model, chunk_strategy, bound_agent_ids)
    VALUES (@name, @paperclip_company_id, @description, @embedding_model, @chunk_strategy, @bound_agent_ids)
    RETURNING *
  `),
  updateCollectionMeta: db.prepare(`
    UPDATE knowledge_collections SET doc_count = @doc_count, chunk_count = @chunk_count,
      status = @status, updated_at = unixepoch()
    WHERE id = @id
  `),
  bindAgents: db.prepare(`
    UPDATE knowledge_collections SET bound_agent_ids = @bound_agent_ids, updated_at = unixepoch()
    WHERE id = @id
  `),
  deleteCollection: db.prepare(`DELETE FROM knowledge_collections WHERE id = ?`),

  listDocuments: db.prepare(`SELECT * FROM knowledge_documents WHERE collection_id = ? ORDER BY created_at DESC`),
  insertDocument: db.prepare(`
    INSERT INTO knowledge_documents (collection_id, name, file_type, content, chunk_count, size_bytes)
    VALUES (@collection_id, @name, @file_type, @content, @chunk_count, @size_bytes)
    RETURNING *
  `),
  deleteDocument: db.prepare(`DELETE FROM knowledge_documents WHERE id = ?`),
};

// CONTEXT RULES
export const contextDb = {
  list: db.prepare(`SELECT * FROM context_rules ORDER BY priority DESC, created_at DESC`),
  listByAgent: db.prepare(`
    SELECT * FROM context_rules WHERE paperclip_agent_id = ? ORDER BY priority DESC
  `),
  listByCompany: db.prepare(`
    SELECT * FROM context_rules WHERE paperclip_company_id = ? ORDER BY priority DESC
  `),
  insert: db.prepare(`
    INSERT INTO context_rules (paperclip_agent_id, paperclip_company_id, rule_type, label, config, enabled, priority)
    VALUES (@paperclip_agent_id, @paperclip_company_id, @rule_type, @label, @config, @enabled, @priority)
    RETURNING *
  `),
  toggle: db.prepare(`UPDATE context_rules SET enabled = @enabled, updated_at = unixepoch() WHERE id = @id`),
  update: db.prepare(`
    UPDATE context_rules SET label = COALESCE(@label, label), config = COALESCE(@config, config),
      priority = COALESCE(@priority, priority), updated_at = unixepoch()
    WHERE id = @id RETURNING *
  `),
  delete: db.prepare(`DELETE FROM context_rules WHERE id = ?`),
};
