CREATE TABLE error_patterns (
  id              TEXT PRIMARY KEY,
  signature       TEXT NOT NULL UNIQUE,
  error_raw       TEXT NOT NULL,
  error_normalized TEXT NOT NULL,
  cause           TEXT,
  fix             TEXT,
  scope           TEXT NOT NULL DEFAULT 'general',
  recurrence      INTEGER NOT NULL DEFAULT 1,
  last_seen       TEXT NOT NULL,
  created_at      TEXT NOT NULL
);

CREATE INDEX idx_errors_signature  ON error_patterns(signature);
CREATE INDEX idx_errors_scope      ON error_patterns(scope);
CREATE INDEX idx_errors_recurrence ON error_patterns(recurrence DESC);
CREATE INDEX idx_errors_last_seen  ON error_patterns(last_seen DESC);
