CREATE TABLE professional (
  id         INTEGER PRIMARY KEY,
  name       TEXT NOT NULL,  -- trimmed, 1 to 80 characters
  removed_at TEXT            -- UTC instant, ISO 8601; NULL while active
);
