# Backend

The server holds every rule the client must not be trusted with: no double
booking, the 24 hour cancellation limit, the booking window, and who may
change the clinic. The client reuses the same use cases only for display
(docs/01).

Each part below is created by the delivery named beside it, which writes
its exact contract on its page and updates this document.

## Schema

| Table | Holds | Created by |
|---|---|---|
| `schema_migration` | one row per applied migration: file name, UTC instant applied | `skeleton` (the migration runner, not a migration file) |
| `clinic` | the one clinic: name, time zone, appointment length | `clinic-setup` |
| `owner` | the one owner: email, password hash | `clinic-setup` |
| `session` | owner sessions | `clinic-setup` |
| `professional` | name, active or removed | `professionals` |
| `working_period` | professional, weekday, start and end wall clock time | `weekly-hours` |
| `appointment` | professional, start instant, client name, client phone, booking code, status | `book-appointment` |

A unique index on `appointment (professional_id, starts_at)` over booked
appointments is the last guard against two bookings racing for one slot.

## Start and migrations

At start the server opens the SQLite file at `DATABASE_PATH` (default
`data/clinic.sqlite`, ignored by git), creating the folder and the file when
missing, then runs `migrate` (`src/server/migrate.server.ts`) over
`src/server/migrations/`:

* Files named `NNNN-<name>.sql` (four digits) are applied in file name order;
  other files are ignored.
* Each file runs in its own transaction together with its `schema_migration`
  row, so a file is either applied and recorded or neither.
* A file already recorded is skipped; a second start applies nothing.
* A failing file is rolled back and not recorded, and the start stops with
  exit code 1 and `Migration <file> failed: <SQLite error>`.

| Variable | Default | Meaning |
|---|---|---|
| `PORT` | `3000` | Port of the Hono server. |
| `DATABASE_PATH` | `data/clinic.sqlite` | The SQLite file. |

## Access rules

* The client side needs no session. It may read professionals and free
  slots, book, and cancel an appointment it proves with phone and booking
  code.
* Everything else needs the owner's session.

## Routes

Listed here as each delivery creates them. In development Vite serves the
client and forwards `/api/*` to the server.

| Route | Session | Answer | Created by |
|---|---|---|---|
| `GET /api/health` | none | `200 { "status": "ok" }` | `skeleton` |
