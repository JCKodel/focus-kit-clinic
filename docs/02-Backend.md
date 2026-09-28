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
| `clinic` | the one clinic (`CHECK (id = 1)`): name, IANA time zone, `slot_minutes` from 5 to 240 in steps of 5 | `clinic-setup` (`0001-clinic.sql`) |
| `owner` | the one owner (`CHECK (id = 1)`): email trimmed and in lower case, password hash | `clinic-setup` (`0001-clinic.sql`) |
| `session` | owner sessions: SHA-256 of the cookie token (lower-case hex), created and expiry UTC instants; no owner column, there is one owner | `clinic-setup` (`0001-clinic.sql`) |
| `professional` | name trimmed, 1 to 80 characters; `removed_at`, the UTC removal instant, `NULL` while active. Removing keeps the row. No unique index on the name: SQLite's `lower()` folds ASCII only, so the use case enforces docs/03 rule 10 | `professionals` (`0002-professional.sql`) |
| `working_period` | professional, ISO weekday (`CHECK` 1 to 7), `start_time` and `end_time` as zero-padded `HH:MM` in clinic time (`CHECK (start_time < end_time)`), indexed by professional, weekday and start. Overlap and minimum length have no database guard: the use case enforces them. A removed professional's rows stay | `weekly-hours` (`0003-working-period.sql`) |
| `appointment` | professional; `starts_at`, the UTC start instant, always written with `toISOString()` so equal instants are equal text and text order is time order; client name trimmed, 1 to 80 characters; client phone as digits only, 6 to 15; `booking_code`, 6 characters of `ABCDEFGHJKMNPQRSTUVWXYZ23456789`, `UNIQUE`; `status` `booked` or `cancelled` (`CHECK`), `booked` by default | `book-appointment` (`0004-appointment.sql`) |

The partial unique index `appointment_booked_slot` on `appointment
(professional_id, starts_at) WHERE status = 'booked'` is the last guard
against two bookings racing for one slot. Slots never partly overlap
(ADR-0005), so one index on the start suffices; a cancelled row does not
hold its slot. The booking code is drawn by the server with
`crypto.randomInt(31)` per character; a clash fails the `UNIQUE` and
answers `500 DatabaseFailed`, and the client's "Try again" draws a new one.
No retry loop.

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
| `DATABASE_PATH` | `data/clinic.sqlite` | The SQLite file, for the server and for `npm run setup`. |

Opening the file and applying migrations is one function,
`openMigratedDatabase` in `src/server/start.server.ts`, shared by the server
start and the setup command.

The file is opened by `openDatabase` (`src/server/database.server.ts`) with a
5000 ms busy timeout: a connection that finds the file locked by another
waits up to that long instead of failing at once with `SQLITE_BUSY`. The
journal mode stays the default rollback journal, one file, so a backup is
still a copy. `transaction` begins with `BEGIN IMMEDIATE`, taking the write
lock at the start, where the timeout applies; a deferred `BEGIN` that reads
first and writes later would fail at once, since SQLite skips the wait there
to avoid a deadlock.

## Setup command

`npm run setup` (`src/server/setup.server.ts`) creates the clinic and the
owner, once, on the machine that runs the server:

* It applies pending migrations, then refuses with `The clinic is already
  set up.` and exit code 1 when the clinic exists, before asking anything.
* It asks the clinic name, the IANA time zone, the appointment length
  (empty means 30), the owner email and the password twice, hidden. Each
  refused answer prints its message and is asked again; two passwords that
  differ ask both again. The checks are the use cases of
  `src/features/clinic/rules.ts`.
* It writes the clinic and the owner in one transaction, the password as a
  scrypt hash, and exits with code 0.
* With piped input it reads one answer per line; input that ends early
  writes nothing and exits with code 1.

There is no setup page: an open setup page on a public host would let the
first visitor become the owner.

## Owner sign-in

* Password hash (`src/server/password.server.ts`): `node:crypto` scrypt, N
  16384, r 8, p 1, a random 16 byte salt, a 64 byte key, stored as
  `scrypt$16384$8$1$<salt base64url>$<key base64url>` and checked with
  `timingSafeEqual`, reading N, r and p from the string.
* Sign-in always runs one scrypt check: when the email is not the owner's,
  or the clinic is not set up, it checks against a fixed hash made at server
  start from a random password and never stored, and refuses.
* Session (`src/server/session.server.ts`): a token of 32 random bytes,
  base64url, sent only in the cookie
  `session=<token>; HttpOnly; SameSite=Lax; Path=/; Max-Age=2592000`; the
  database keeps only its SHA-256. It lasts `sessionDays` (30) from sign-in,
  never slides, and an expired row is deleted when met. Sign-out deletes the
  row and sends `session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`.
* The owner route check is `requireSession` in `session.server.ts`: no live
  session answers `401 NotSignedIn`. Every `/api/owner/*` route but sign-in
  and sign-out uses it.
* Not yet: the `Secure` flag (`deploy` adds it) and a limit on wrong
  attempts (`sign-in-limit`).

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
| `GET /api/clinic` | none | `200 { "name", "timeZone", "slotMinutes" }` · `404 ClinicNotSetUp` | `clinic-setup` |
| `POST /api/owner/sign-in` | none | body `{ "email", "password" }`; `200 { "email" }` and the cookie · `401 SignInRefused` (also before setup) · `400 BadRequest` when the body is not that shape | `clinic-setup` |
| `POST /api/owner/sign-out` | optional | `204`, deletes the session row if any and clears the cookie | `clinic-setup` |
| `GET /api/owner/session` | yes | `200 { "email" }` · `401 NotSignedIn` | `clinic-setup` |
| `GET /api/professionals` | none | `200 { "professionals": [ { "id", "name" } ] }`, active only, alphabetical ignoring case, ties by id | `professionals` |
| `POST /api/owner/professionals` | yes | body `{ "name" }`; `201 { "id", "name" }` · `400 InvalidProfessionalName` · `409 ProfessionalNameTaken` · `400 BadRequest` · `401 NotSignedIn` | `professionals` |
| `PATCH /api/owner/professionals/:id` | yes | body `{ "name" }`; `200 { "id", "name" }` · `400 InvalidProfessionalName` · `409 ProfessionalNameTaken` · `404 ProfessionalNotFound` · `400 BadRequest` · `401 NotSignedIn` | `professionals` |
| `DELETE /api/owner/professionals/:id` | yes | `204`, sets `removed_at`, never deletes the row · `404 ProfessionalNotFound` · `401 NotSignedIn` | `professionals` |
| `GET /api/owner/professionals/:id/hours` | yes | `200 { "slotMinutes", "periods": [ { "weekday", "start", "end" } ] }`, ordered by weekday then start · `404 ProfessionalNotFound` · `401 NotSignedIn` | `weekly-hours` |
| `PUT /api/owner/professionals/:id/hours` | yes | body `{ "periods": [ { "weekday": 1..7, "start", "end" } ] }`; replaces the whole week in one transaction; `200`, the same shape as `GET` · `400 InvalidWorkingPeriod` · `400 WorkingPeriodTooShort` · `400 WorkingPeriodsOverlap` · `404 ProfessionalNotFound` · `400 BadRequest` · `401 NotSignedIn` | `weekly-hours` |

| `GET /api/professionals/:id/slots` | none | `200 { "timeZone", "slots": [ "<UTC instant>" ] }`, the free slot starts of the next 30 days, ascending; `[]` when none · `404 ProfessionalNotFound` | `book-appointment` |
| `POST /api/appointments` | none | body `{ "professionalId", "startsAt", "clientName", "clientPhone" }`; `201 { "bookingCode", "startsAt", "clientPhone", "professional": { "id", "name" } }` · `400 BadRequest` · `404 ProfessionalNotFound` · `400 InvalidClientName` · `400 InvalidPhoneNumber` · `409 OutsideBookingWindow` · `409 OutsideWorkingHours` · `409 SlotTaken` | `book-appointment` |
| `POST /api/appointments/cancel` | none | body `{ "clientPhone", "bookingCode" }`; sets `status` to `cancelled`, never deletes the row; `200 { "startsAt", "timeZone", "professional": { "id", "name" } }` · `400 BadRequest` · `404 AppointmentNotFound` · `409 CancellationTooLate` | `cancel-appointment` |

Public routes that take a professional check in this order: body shape
(`400 BadRequest`), the professional exists and is active (`404`), then the
use case in its own order, then the insert, where a conflict on
`appointment_booked_slot` is `409 SlotTaken`. The three time refusals share
`409` because the client shows them alike; the body keeps the exact code.
The booking route reads the periods and the booked starts, runs `book` and
inserts with no `await` between them, so no other request of the process
interleaves; the unique index covers any other process. Before setup there
is no professional, so both answer `404`; a professional without a clinic
answers `500 ClinicNotSetUp`.

The cancellation route checks in this order: body shape (`400
BadRequest`); the phone through `checkClientPhone` and the code through
`normalizeBookingCode`, where a refusal of either is `404
AppointmentNotFound`, so a guess learns nothing; the booked appointment with
that code and those digits, whose professional may be removed (`404`); the
use case `cancel` (`409 CancellationTooLate`); the update `WHERE status =
'booked'`, where no row changed is `404`. It reads, runs `cancel` and
updates with no `await` between them; the update's condition covers any
other process, so of two cancellations racing one is `200` and the other
`404`. Phone and code travel in the body, never in the path, so they stay
out of access logs. An appointment without a clinic answers `500
ClinicNotSetUp`. No limit on guesses yet (`sign-in-limit`,
`fake-bookings`).

Owner routes check in this order: session (`401`), body shape (`400
BadRequest`), the professional exists and is active (`404`), then the rule
(`400`, then `409`). An `:id` that is not a positive whole number answers
`404` like an unknown one.

Errors are `{ "error": { "code": "<Code>" } }`. Besides the domain codes of
docs/03, two infrastructure codes exist: `BadRequest` (400, a body of the
wrong shape) and `DatabaseFailed` (500, a SQLite exception caught by a
repository through `query` or `transaction` in `database.server.ts`).
