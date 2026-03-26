-- WAL mode + foreign_keys + busy_timeout applied on every open

CREATE TABLE tasks (
  id TEXT PRIMARY KEY,
  worktree TEXT NOT NULL,
  title TEXT NOT NULL,
  goal TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  session_id TEXT,
  started_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  archived_at TEXT
);

CREATE TABLE task_state (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES tasks(id),
  session_id TEXT,
  summary TEXT,
  completed TEXT NOT NULL DEFAULT '[]',
  in_progress TEXT,
  next_steps TEXT NOT NULL DEFAULT '[]',
  key_files TEXT NOT NULL DEFAULT '[]',
  constraints TEXT NOT NULL DEFAULT '[]',
  decisions TEXT NOT NULL DEFAULT '[]',
  updated_at TEXT NOT NULL
);

CREATE TABLE snapshots (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES tasks(id),
  state_json TEXT NOT NULL,
  trigger TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE worktree_activity (
  worktree TEXT PRIMARY KEY,
  task_id TEXT,
  active_files TEXT NOT NULL DEFAULT '[]',
  last_heartbeat TEXT NOT NULL
);

CREATE TABLE _schema_version (
  version INTEGER PRIMARY KEY,
  applied_at TEXT NOT NULL
);

CREATE INDEX idx_tasks_worktree ON tasks(worktree);
CREATE INDEX idx_tasks_status ON tasks(status);
