CREATE TABLE working_period (
  id              INTEGER PRIMARY KEY,
  professional_id INTEGER NOT NULL REFERENCES professional (id),
  weekday         INTEGER NOT NULL CHECK (weekday BETWEEN 1 AND 7), -- ISO: 1 Monday, 7 Sunday
  start_time      TEXT NOT NULL,  -- 'HH:MM', clinic time
  end_time        TEXT NOT NULL,  -- 'HH:MM', clinic time
  CHECK (start_time < end_time)
);

CREATE INDEX working_period_by_professional
  ON working_period (professional_id, weekday, start_time);
