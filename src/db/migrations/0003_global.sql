CREATE TABLE IF NOT EXISTS global_memories (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  scope TEXT NOT NULL,
  content TEXT NOT NULL,
  confidence REAL NOT NULL DEFAULT 0.5,
  source TEXT NOT NULL DEFAULT 'agent',
  evidence_count INTEGER NOT NULL DEFAULT 1,
  invalidated INTEGER NOT NULL DEFAULT 0,
  invalidation_reason TEXT,
  project_origin TEXT NOT NULL,
  project_hint TEXT NOT NULL DEFAULT '',
  last_validated TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE VIRTUAL TABLE IF NOT EXISTS global_memories_fts USING fts5(
  content, scope, type, project_hint,
  content='global_memories',
  content_rowid='rowid',
  tokenize='porter unicode61'
);

CREATE TRIGGER IF NOT EXISTS global_memories_ai AFTER INSERT ON global_memories BEGIN
  INSERT INTO global_memories_fts(rowid, content, scope, type, project_hint)
  VALUES (new.rowid, new.content, new.scope, new.type, new.project_hint);
END;

CREATE TRIGGER IF NOT EXISTS global_memories_au AFTER UPDATE ON global_memories BEGIN
  INSERT INTO global_memories_fts(global_memories_fts, rowid, content, scope, type, project_hint)
  VALUES ('delete', old.rowid, old.content, old.scope, old.type, old.project_hint);
  INSERT INTO global_memories_fts(rowid, content, scope, type, project_hint)
  VALUES (new.rowid, new.content, new.scope, new.type, new.project_hint);
END;

CREATE TRIGGER IF NOT EXISTS global_memories_ad AFTER DELETE ON global_memories BEGIN
  INSERT INTO global_memories_fts(global_memories_fts, rowid, content, scope, type, project_hint)
  VALUES ('delete', old.rowid, old.content, old.scope, old.type, old.project_hint);
END;

CREATE TABLE IF NOT EXISTS _schema_version (
  version INTEGER PRIMARY KEY,
  applied_at TEXT NOT NULL
);
