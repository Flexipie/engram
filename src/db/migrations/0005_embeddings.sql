ALTER TABLE memories ADD COLUMN embedding BLOB;

CREATE TABLE memory_edges (
  id         TEXT PRIMARY KEY,
  from_id    TEXT NOT NULL REFERENCES memories(id),
  to_id      TEXT NOT NULL REFERENCES memories(id),
  relation   TEXT NOT NULL,
  score      REAL NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX idx_edges_from ON memory_edges(from_id);
CREATE INDEX idx_edges_to   ON memory_edges(to_id);
