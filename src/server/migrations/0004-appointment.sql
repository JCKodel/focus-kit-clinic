CREATE TABLE appointment (
  id              INTEGER PRIMARY KEY,
  professional_id INTEGER NOT NULL REFERENCES professional (id),
  starts_at       TEXT NOT NULL,  -- UTC instant, toISOString(): 'YYYY-MM-DDTHH:MM:SS.sssZ'
  client_name     TEXT NOT NULL,  -- trimmed, 1 to 80 characters
  client_phone    TEXT NOT NULL,  -- digits only, 6 to 15
  booking_code    TEXT NOT NULL UNIQUE,  -- 6 characters of the booking code alphabet
  status          TEXT NOT NULL DEFAULT 'booked'
                  CHECK (status IN ('booked', 'cancelled'))
);

CREATE UNIQUE INDEX appointment_booked_slot
  ON appointment (professional_id, starts_at) WHERE status = 'booked';
