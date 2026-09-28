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
| `DATABASE_PATH` | `data/clinic.sqlite` | The SQLite file, for the server and for `npm run setup`. |

Opening the file and applying migrations is one function,
`openMigratedDatabase` in `src/server/start.server.ts`, shared by the server
start and the setup command.

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

Owner routes check in this order: session (`401`), body shape (`400
BadRequest`), the professional exists and is active (`404`), then the rule
(`400`, then `409`). An `:id` that is not a positive whole number answers
`404` like an unknown one.

Errors are `{ "error": { "code": "<Code>" } }`. Besides the domain codes of
docs/03, two infrastructure codes exist: `BadRequest` (400, a body of the
wrong shape) and `DatabaseFailed` (500, a SQLite exception caught by a
repository through `query` in `database.server.ts`).
