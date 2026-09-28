# clinic-setup

**Objective.** The person who installs the app runs one command that creates
the clinic and the owner; afterwards the owner signs in at `/owner` from a
phone or a desktop and signs out again, and the home page shows the clinic's
name.

**Behaviour.**

Setup command (owner side, run on the server machine):

* `npm run setup` applies pending migrations, then asks in this order:
  `Clinic name:`, `Time zone (IANA, e.g. Europe/Lisbon):`,
  `Appointment length in minutes [30]:`, `Owner email:`,
  `Owner password (12 characters or more):`, `Password again:`.
* The two password answers are not shown on screen while typed.
* An empty answer to the length question means 30.
* An invalid answer prints the message for its refusal and asks the same
  question again: a blank name or one over 80 characters
  (`InvalidClinicName`), a time zone that is not an IANA name
  (`UnknownTimeZone`), a length that is not a whole number from 5 to 240 in
  steps of 5 (`InvalidSlotMinutes`), an email without exactly one `@` with
  text on both sides or with spaces (`InvalidEmail`), a password under 12
  characters (`PasswordTooShort`).
* When the second password differs from the first, it prints the message for
  `PasswordsDiffer` and asks both password questions again.
* The name is stored trimmed; the email trimmed and in lower case; the
  password as a scrypt hash, never as typed.
* On success it writes the clinic and the owner in one transaction, prints
  `Clinic <name> is set up. Sign in at /owner.` and exits with code 0.
* When the clinic already exists, it prints `The clinic is already set up.`
  before asking anything, changes nothing and exits with code 1.
* When its input is not a terminal it reads one answer per line, in the
  order above; when the input ends before every answer is valid, it writes
  nothing and exits with code 1.

Owner screen, at `/owner`:

* Signed out, it shows the heading "Owner sign-in", an Email field, a
  Password field and a "Sign in" button.
* A right email and password show "Signed in as <email>" and a "Sign out"
  button. The email matches in any case and with surrounding spaces.
* A wrong email or a wrong password shows "Wrong email or password." and
  keeps the email typed; the message is the same for both.
* After signing in, reloading `/owner` still shows "Signed in as <email>".
* "Sign out" returns to the sign-in form; reloading `/owner` then shows the
  form, and the old cookie no longer opens a session.
* A session older than 30 days is not live: `/owner` shows the form.

Home page, at `/` and any path other than `/owner` (client side):

* The heading shows the clinic's name instead of "Clinic".
* Before setup, the heading stays "Clinic" and the line "This clinic is not
  set up yet." appears under it.
* The "Server: ok" line of `skeleton` stays as it is.

**Contract.**

Migration `src/server/migrations/0001-clinic.sql`:

```sql
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
  password_hash TEXT NOT NULL   -- format below
);

CREATE TABLE session (
  token_hash TEXT PRIMARY KEY,  -- SHA-256 of the cookie token, lower-case hex
  created_at TEXT NOT NULL,     -- UTC instant, ISO 8601
  expires_at TEXT NOT NULL      -- created_at plus sessionDays (30)
);
```

`CHECK (id = 1)` makes "exactly one" a database fact. `session` has no owner
column: there is one owner.

Password hash, from `node:crypto` `scrypt`, N 16384, r 8, p 1, a random
16 byte salt, a 64 byte key, stored as one string:

```
scrypt$16384$8$1$<salt base64url>$<key base64url>
```

Checked with `timingSafeEqual`, reading N, r and p from the string.

Sign-in always runs one scrypt check. When the email is not the owner's, or
the clinic is not set up, the password is checked against a fixed hash in
`password.server.ts`, made once from a random password at server start and
never stored, and the answer is `401 SignInRefused` whatever that check
returns. A wrong email and a wrong password therefore take the same time.

Session token: 32 random bytes from `node:crypto`, base64url, sent only in
the cookie; the database keeps only its SHA-256.

Cookie, set on sign-in:

```
Set-Cookie: session=<token>; HttpOnly; SameSite=Lax; Path=/; Max-Age=2592000
```

Cleared on sign-out:

```
Set-Cookie: session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0
```

Routes (errors are `{ "error": { "code": "<Code>" } }`, docs/01):

| Route | Session | Body | Answers |
|---|---|---|---|
| `GET /api/clinic` | none | | `200 { "name": "Clinica Sol", "timeZone": "Europe/Lisbon", "slotMinutes": 30 }` · `404 ClinicNotSetUp` |
| `POST /api/owner/sign-in` | none | `{ "email": string, "password": string }` | `200 { "email": "owner@example.com" }` and the cookie · `401 SignInRefused` · `400 BadRequest` when the body is not that shape |
| `POST /api/owner/sign-out` | optional | | `204`, deletes the session row if any, clears the cookie; `204` also without a session |
| `GET /api/owner/session` | yes | | `200 { "email": "owner@example.com" }` · `401 NotSignedIn` |

* Sign-in before setup answers `401 SignInRefused`.
* A cookie whose token is unknown or expired answers `401 NotSignedIn`; an
  expired row is deleted when met.
* `BadRequest` is an infrastructure code, like `ServerUnreachable`, not a
  term of docs/03.

Use cases, pure, clock and existing state passed in:

```ts
// src/features/clinic/rules.ts
checkClinicName(raw: string): Result<string, "InvalidClinicName">        // trimmed
checkTimeZone(raw: string): Result<string, "UnknownTimeZone">            // in Intl.supportedValuesOf("timeZone"), or "UTC"
checkSlotMinutes(raw: string): Result<number, "InvalidSlotMinutes">      // "" gives 30
checkOwnerEmail(raw: string): Result<string, "InvalidEmail">             // trimmed, lower case
checkOwnerPassword(first: string, again: string):
  Result<string, "PasswordTooShort" | "PasswordsDiffer">
setUpClinic(answers: SetupAnswers, alreadySetUp: boolean):
  Result<ClinicSetup, SetupRefusal>                                      // runs every check; ClinicAlreadySetUp first

// src/features/signIn/rules.ts
isSessionLive(expiresAt: string, now: Date): boolean                     // now < expiresAt
sessionExpiry(now: Date): string                                         // now plus sessionDays, ISO 8601
```

Where the code lives:

* `src/features/clinic/`: the setup rules, `GET /api/clinic`, the home
  heading. The command itself is `src/server/setup.server.ts`, run by the
  new script `"setup": "node src/server/setup.server.ts"`; it reads
  `DATABASE_PATH` like the server.
* `src/features/signIn/`: the three owner routes, the owner screen.
* `src/server/password.server.ts` (hash and check) and
  `src/server/session.server.ts` (read the cookie, find a live session),
  since docs/01 places the session in the server shell.
* Email normalisation (trim, lower case): first use `checkOwnerEmail` at
  setup, second use sign-in. That second use is why it moves to
  `src/lib/email.ts` in this delivery.
* The owner route check (session required, else `NotSignedIn`): first use
  `GET /api/owner/session`. It stays in `session.server.ts`; `professionals`
  is its second use.
* Paths: `src/app/main.tsx` shows the owner screen when
  `location.pathname` is `/owner` and the home page otherwise. No router
  library.

No new dependency.

**States.**

* Home, loading: heading "Clinic" until `GET /api/clinic` answers.
* Home, not set up: "This clinic is not set up yet."
* Home, error or offline: heading "Clinic"; the health line already says
  "Server: unreachable".
* Owner, loading: "Checking your session" until `GET /api/owner/session`
  answers.
* Owner, signing in: the button reads "Signing in" and is disabled.
* Owner, error or offline (sign-in, session or sign-out): "The server cannot
  be reached. Try again." above the form, or above the "Sign out" button.
* Empty: not applicable, no list.

**Visual reference.** No design file. The style of `skeleton`: `system-ui`,
16px padding on each side, left-aligned, browser default colours. Fields
stacked, each with its label above, full width up to 320px. Screenshots:
home, signed out owner screen and signed in owner screen at 390×844; the two
owner screens also at 1280×800.

**Out of scope.**

* Changing the clinic's name, time zone or length after setup: its own
  delivery; changing the length is an open decision (docs/00).
* A forgotten password: queued as `owner-password`. Until then the only way
  back is a fresh database.
* Limiting wrong sign-in attempts: queued as `sign-in-limit`, before
  `deploy`; locally it does not matter.
* The `Secure` cookie flag: local runs on plain http; `deploy` adds it.
* Setup from a web page: an open setup page on a public host lets the first
  visitor become the owner.
* Sliding sessions or "remember me": 30 fixed days is enough for one owner.
* Removing expired session rows in bulk: one owner makes a handful a month.
* Anything on the owner screen beyond the signed-in line and "Sign out":
  `professionals` fills it.
* A link from the home page to `/owner`: clients must not be led there; the
  owner keeps the address.

**Done when.**

* [x] Vitest tests of every function in both `rules.ts` pass: each refusal,
      each boundary (4, 5, 240, 245 and 32 minutes; empty length gives 30;
      11 and 12 character passwords; 80 and 81 character names; "UTC" and
      "Mars/Olympus"), and a session live one millisecond before expiry and
      not at it.
* [x] Vitest tests of the repositories against an in-memory SQLite with the
      real migrations: setup writes clinic and owner together; a second
      insert fails at the database; a session is found by token hash and
      deleted.
* [x] Vitest tests of `password.server.ts`: a hash has the format above and
      checks true for its password, false for another.
* [x] A Vitest test runs `setup.server.ts` with answers piped in, against a
      temporary database: exit 0 and rows written; a second run exits 1 and
      changes nothing; input that ends early exits 1 and writes nothing.
* [x] Vitest tests of the owner routes through Hono's `app.request`: each
      answer in the Contract's table, and the `Set-Cookie` lines exactly;
      a session row whose `expires_at` is in the past answers
      `401 NotSignedIn` to `GET /api/owner/session` and the row is gone
      afterwards; sign-in with an unknown email calls the password check
      once, against the fixed hash, and answers `401 SignInRefused`.
* [x] Playwright tests of every Behaviour line with a screen, the database
      prepared by the setup rules before the run.
* [x] Screenshots saved once, as proof, to `work/done/`:
      `clinic-setup-home-390x844.png`,
      `clinic-setup-signed-out-390x844.png`,
      `clinic-setup-signed-out-1280x800.png`,
      `clinic-setup-signed-in-390x844.png`,
      `clinic-setup-signed-in-1280x800.png`.
* [x] `npm run verify` is green.
* [x] docs/02 lists the four routes, the three tables and `npm run setup`;
      docs/01 names `src/lib/email.ts` and the path switch in the app shell.
* [x] The person runs `npm run setup`, then `npm run dev`, and signs in at
      `http://localhost:5173/owner`.

## What happened

**Built.** Migration `0001-clinic.sql`; `src/lib/email.ts`; the `clinic`
slice (`rules.ts`, `repository.server.ts`, `route.server.ts`, `api.ts`,
`useClinic.ts`, `ClinicView.tsx`, `strings.ts`); the `signIn` slice
(`rules.ts`, `repository.server.ts`, `route.server.ts`, `api.ts`,
`useOwner.ts`, `OwnerView.tsx`, `strings.ts`); in the server shell
`setup.server.ts`, `password.server.ts`, `session.server.ts`,
`start.server.ts`, `testDatabase.server.ts` and `query` in
`database.server.ts`; the path switch in `src/app/main.tsx`; the script
`npm run setup`; `src/lib/request.ts`; `src/server/e2eClinic.server.ts` and
a `desktop` project in the Playwright config. Tests: 69 Vitest, 35
Playwright (owner screen at both widths).

**Diverged from the plan, and why.**

* `DatabaseFailed` (500) is a new infrastructure code, like `BadRequest`:
  docs/01 asks each repository to turn the SQLite exception into a Result,
  and the Contract named no code for it. Every repository runs its SQL
  inside `query` (`database.server.ts`). First use: the clinic repository;
  second: the session queries, in this same delivery.
* `openMigratedDatabase` (`src/server/start.server.ts`) holds open, migrate
  and the exit messages. First use: `main.server.ts`, as `skeleton` built
  it; second use: `setup.server.ts`.
* `testDatabase.server.ts` gives Vitest an in-memory SQLite with the real
  migrations. First use: the clinic repository test; second: the session
  and route tests.
* Session reads and writes (`saveSession`, `findSession`, `deleteSession`)
  live in `session.server.ts`, next to `requireSession`, since the page puts
  the session in the server shell. The owner row is read by
  `signIn/repository.server.ts`; the clinic repository writes it at setup.
* `signInRoute(db, { checkPassword })` takes the check as an option so the
  test can count its calls against the fixed hash. Routes that need the
  database are functions of it (`clinicRoute(db)`), noted in docs/01.
* The signed-in owner screen has the heading "Owner". The page gave no
  heading for that state and a screen without one reads poorly.
* Setup refusal messages were not written in the page; they are in
  `clinic/strings.ts` (`refusalStrings`), with the questions. The time zone
  answer is trimmed like the others.
* Name and password lengths count characters, not UTF-16 units: 80 "é" or
  80 emoji are a valid name.
* The fields have `box-sizing: border-box`, so "full width up to 320px"
  measures 320 with the border (see What the proof found).
* `src/app/strings.ts` is deleted: its one text, "Clinic", is now the
  heading fallback in `clinic/strings.ts`. The health Playwright test no
  longer checks the heading, which belongs to `clinic`.
* `migrate.server.test.ts` "finds nothing to apply in the real folder" now
  expects `0001-clinic.sql` on the first run and nothing on the second.
* The client's fetch-to-Result moved to `src/lib/request.ts` (`request`,
  `stringField`, and the one `ServerUnreachable` type). First use:
  `health/api.ts`, as `skeleton` built it; second use: `clinic/api.ts`;
  `signIn/api.ts` is the third. The page did not name it; at review the
  person pointed out that the rule applied as for `openMigratedDatabase`,
  and that `ServerUnreachable` was declared twice. `health/api.ts` now calls
  it too; its behaviour is unchanged (its Playwright tests pass as before).
  `request.test.ts` covers refusals, other statuses, a rejected body, a
  network failure and a 204.
* The Playwright fixture first sat at the repository root as `e2eClinic.ts`,
  outside the layout of docs/01. At review it moved to
  `src/server/e2eClinic.server.ts`, next to `testDatabase.server.ts`: both
  are fixtures used by more than one feature, read Node modules and must
  never reach client code. docs/04 says so.

**Dropped.** Nothing from Behaviour or Contract.

**What the proof found.** The five screenshots, in `work/done/`, show
`system-ui`, 16px on each side, left-aligned, browser default colours,
labels above stacked fields. The first shots had fields 328px wide (320 plus
padding and border); fixed with `border-box`, measured 320 at both widths,
and retaken. They were taken by a one-off Playwright file, removed after the
run. Playwright prepares its database by running the real setup command with
piped answers, so every run also proves the piped path end to end.
"Before setup" on the home page is proven with a mocked `404` from
`/api/clinic`, since the Playwright database is set up once per run.

Checked by the person, at review: the agent's session was headless and not
allowed a pseudo-terminal or a long-running process, so the person ran
`npm run setup` in a terminal (the passwords stayed hidden, a refused answer
was asked again), then `npm run dev`, and signed in and out at
`http://localhost:5173/owner`. It all worked.

**Decisions.** No ADR: scrypt and the httpOnly cookie sit inside docs/01's
stack table; the rest is in docs/01, docs/02 and docs/04.
