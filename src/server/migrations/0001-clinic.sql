CREATE TABLE clinic (
  id           INTEGER PRIMARY KEY CHECK (id = 1),
  name         TEXT    NOT NULL,
  time_zone    TEXT    NOT NULL,  -- IANA name, e.g. Europe/Lisbon
  slot_minutes INTEGER NOT NULL
               CHECK (slot_minutes BETWEEN 5 AND 240 AND slot_minutes % 5 = 0)
);

CREATE TABLE owner (
  id            INTEGER PRIMARY KEY CHECK (id = 1),
  email         TEXT NOT NULL,  -- trimmed, lower case
  password_hash TEXT NOT NULL   -- scrypt$N$r$p$<salt base64url>$<key base64url>
);

CREATE TABLE session (
  token_hash TEXT PRIMARY KEY,  -- SHA-256 of the cookie token, lower-case hex
  created_at TEXT NOT NULL,     -- UTC instant, ISO 8601
  expires_at TEXT NOT NULL      -- created_at plus sessionDays (30)
);
