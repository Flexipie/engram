CREATE TABLE memories (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  scope TEXT NOT NULL,
  content TEXT NOT NULL,
  confidence REAL NOT NULL DEFAULT 0.5,
  source TEXT NOT NULL DEFAULT 'agent',
  evidence_count INTEGER NOT NULL DEFAULT 1,
  invalidated INTEGER NOT NULL DEFAULT 0,
  invalidation_reason TEXT,
  last_validated TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE VIRTUAL TABLE memories_fts USING fts5(
  content, scope, type,
  content='memories',
  content_rowid='rowid',
  tokenize='porter unicode61'
);

CREATE TRIGGER memories_ai AFTER INSERT ON memories BEGIN
  INSERT INTO memories_fts(rowid, content, scope, type)
  VALUES (new.rowid, new.content, new.scope, new.type);
END;

CREATE TRIGGER memories_au AFTER UPDATE ON memories BEGIN
  INSERT INTO memories_fts(memories_fts, rowid, content, scope, type)
  VALUES ('delete', old.rowid, old.content, old.scope, old.type);
  INSERT INTO memories_fts(rowid, content, scope, type)
  VALUES (new.rowid, new.content, new.scope, new.type);
END;

CREATE TRIGGER memories_ad AFTER DELETE ON memories BEGIN
  INSERT INTO memories_fts(memories_fts, rowid, content, scope, type)
  VALUES ('delete', old.rowid, old.content, old.scope, old.type);
END;

CREATE INDEX idx_memories_scope ON memories(scope);
CREATE INDEX idx_memories_type ON memories(type);
CREATE INDEX idx_memories_conf ON memories(confidence DESC);
CREATE INDEX idx_memories_valid ON memories(invalidated);
