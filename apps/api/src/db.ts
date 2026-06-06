import Database from 'better-sqlite3';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync } from 'node:fs';

// =============================================================================
// PCC SQLite database — replaces Convex
// Stores: secrets (encrypted), audit logs, notification channels
// File: <project-root>/.pcc/pcc.db
// =============================================================================

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_DIR = resolve(__dirname, '../../../../.pcc');
const DB_PATH = resolve(DB_DIR, 'pcc.db');

mkdirSync(DB_DIR, { recursive: true });

export const db = new Database(DB_PATH);

// Enable WAL mode for better concurrent read performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ---------------------------------------------------------------------------
// Schema bootstrap — idempotent, runs on every startup
// ---------------------------------------------------------------------------
db.exec(`
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
