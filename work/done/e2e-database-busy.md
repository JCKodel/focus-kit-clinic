# e2e-database-busy

**Objective.** `npm run verify` never fails because two connections write
to the same SQLite file at once: a connection that finds the file locked
waits for it instead of failing with `SQLITE_BUSY`.

**Behaviour.**

Found in `weekly-hours` (work/done/weekly-hours.md, §What happened): the
`OwnerView.e2e.ts` test "shows the form for a session older than 30 days"
opens a second connection to the shared e2e database and writes to it; the
server's connection has no busy timeout, so a write racing it fails with
`SQLITE_BUSY`, answers `500`, and the owner screen reads "The server cannot
be reached. Try again." About once in 300 tests.

* Every connection opened by `openDatabase` (`src/server/database.server.ts`)
  waits up to 5000 ms for a lock held by another connection before failing.
  `PRAGMA busy_timeout` on such a connection answers `5000`.
* Two connections opened by `openDatabase` on one file: while the first
  holds a write transaction, a write from the second waits and succeeds
  once the first commits. No `SQLITE_BUSY`.
* `transaction()` starts with `BEGIN IMMEDIATE`, so it takes the write lock
  at the start and waits for it under the timeout. A plain `BEGIN` that
  reads first and writes later can fail at once, without waiting: SQLite
  skips the wait there to avoid a deadlock.
* The `OwnerView.e2e.ts` test above opens its connection through
  `openDatabase`, not `new DatabaseSync`, so its write waits too.
* The server, `npm run setup` and every later command get the timeout
  through `openMigratedDatabase`, which calls `openDatabase`. Nothing else
  changes for the owner or the client.

**Contract.** None. No table, column, route or message shape changes. The
database file stays in its current journal mode (rollback journal, one
file).

**Out of scope.**

* WAL journal mode: adds `-wal` and `-shm` files next to the database and
  breaks docs/01's "backup is a copy"; `deploy` decides the backup.
* A route that ages a session so the test goes through the API: a test-only
  door in production code.
* Running Playwright with one worker: hides the race instead of fixing it
  and slows every run.
* Retries in `query()` or in the routes: the timeout is SQLite's own retry.

**Done when.**

* [x] Vitest in `database.server.test.ts`: a connection from `openDatabase`
      on a temporary file answers `5000` to `PRAGMA busy_timeout`.
* [x] Vitest in `database.server.test.ts`: a worker thread (`node:worker_threads`)
      opens a temporary file through `openDatabase`, holds `BEGIN IMMEDIATE`
      with a write for about 200 ms, then commits; meanwhile the main thread's
      write through its own `openDatabase` connection waits and succeeds, and
      both rows are there.
* [x] Vitest: `transaction()` begins with `BEGIN IMMEDIATE`; the existing
      `saveClinicAndOwner` and `replaceWorkingPeriods` tests stay green.
* [x] `OwnerView.e2e.ts` opens the e2e database with `openDatabase`.
* [x] `npx playwright test --repeat-each=10` passes, with no "The server
      cannot be reached" failure; the page records the count of tests run.
* [x] `npm run verify` is green.
* [x] docs/02 §Start and migrations says the file is opened with a 5000 ms
      busy timeout and that `transaction` uses `BEGIN IMMEDIATE`; docs/04
      says a Playwright test that writes to the e2e database opens it
      through `openDatabase`.

## What happened

**Built.** `openDatabase` passes `{ timeout: busyTimeoutMs }` (5000) to
`DatabaseSync`, the driver's own busy timeout, instead of a
`PRAGMA busy_timeout` statement after opening: one line, and the pragma
still answers `5000`. `transaction` begins with `BEGIN IMMEDIATE`.
`OwnerView.e2e.ts` opens the e2e database through `openDatabase`.

**Tests.** Three new Vitest cases in `database.server.test.ts`:

* the pragma answers `{ timeout: 5000 }`;
* a worker thread, started with `eval: true`, imports `database.server.ts`
  in plain Node (type stripping), writes inside `BEGIN IMMEDIATE`, posts a
  message and holds the lock 200 ms with `Atomics.wait`; the main thread's
  `transaction` write waits (at least 100 ms, checked) and succeeds, and
  both rows are there;
* inside `transaction`, before any statement, a second connection without a
  timeout fails `BEGIN IMMEDIATE` with "database is locked": the lock was
  taken at the start.

Each of the three was run against the old code (no timeout, plain `BEGIN`)
and failed; with the change they pass.

**Diverged.** Nothing from the plan. `migrate` still uses a plain `BEGIN`:
the page names only `transaction`, and migrations run before the server
answers anything (in Playwright, setup finishes before the server starts),
so no other connection writes then. It stays as is.

**Proof.** `npm run verify` green: 115 Playwright tests. `npx playwright
test --repeat-each=10` ran three times, 1150 tests each, 3450 in all: the
first and third ended `1150 passed`; the output of the second was only
searched for "The server cannot be reached. Try again." and it was not
there. The weekly-hours page saw the race about once in 300 tests.

**Decisions.** No ADR: the timeout and `BEGIN IMMEDIATE` sit inside
docs/02's "Start and migrations"; the journal mode does not change.
