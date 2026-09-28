# weekly-hours

**Objective.** The signed-in owner sets each professional's weekly hours
(on which weekdays, from when to when, several periods a day if needed)
from the owner screen, on a phone or a desktop.

**Behaviour.**

Owner screen, at `/owner`, signed in (owner side):

* Each professional's row shows an "Hours" button between "Rename" and
  "Remove".
* "Hours" opens the row's hours editor under the name. Only one row is in
  hours, rename or remove mode at a time: opening one closes the other.
* The editor lists the seven days, Monday first: "Monday" to "Sunday".
  Under each day, its working periods in order of start, each with a
  "From" field, a "To" field and a "Remove period" button; a day with no
  period reads "Closed". Each day has an "Add period" button.
* "Add period" adds a period of 09:00 to 17:00 at the end of that day. The
  times are edited in the fields; "Remove period" takes the period out.
  Nothing is stored until "Save hours".
* At the bottom, "Save hours" and "Cancel". "Cancel" closes the editor and
  discards every change.
* "Save hours" with valid periods stores the whole week and closes the
  editor. Opening "Hours" again, or after a reload, shows the saved week,
  each day's periods in order of start.
* Saving a week with no period at all is accepted: the professional has no
  hours.
* A period whose From or To is empty, not on a step of 5 minutes, or whose
  To is not after its From, is refused with "Use times from 00:00 to 23:55
  in steps of 5 minutes, with To after From." beside that period.
* A period shorter than the appointment length is refused with "A period
  must last at least <slotMinutes> minutes." beside that period.
* Two periods of one day that share a minute are refused with "This period
  overlaps another on the same day." beside the later one. A period may
  start at the minute the previous one ends (09:00 to 13:00 and 13:00 to
  18:00 are accepted).
* On a refusal nothing is stored, the editor stays open and every field
  keeps what was typed. Only the first refused period shows a message.
* Saving or opening the hours of a professional removed meanwhile (another
  tab) shows "This professional no longer exists." and reloads the list,
  as the rename does today.
* Saving or opening after the session has ended shows "Your session has
  ended. Reload the page to sign in again." and changes nothing.

Server (both sides):

* Reading and saving hours without a live session answer `401
  NotSignedIn` and change nothing.
* A save replaces the professional's whole week in one transaction: a
  refused save leaves the previous week untouched (docs/03 invariant 11).
* A removed professional's periods stay in the table; reading or saving
  its hours answers `404 ProfessionalNotFound`.

**Contract.**

Migration `src/server/migrations/0003-working-period.sql`:

```sql
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
```

* Times are zero-padded `HH:MM`, so text order is time order and the
  `CHECK` holds.
* The `REFERENCES` documents the link; SQLite does not enforce it without
  `PRAGMA foreign_keys`, which the project does not set. It needs no
  enforcement: professional rows are never deleted, and the route checks
  that the professional is active before any write.
* The overlap and minimum length rules have no database guard; the use
  case enforces them, and one owner makes a race negligible.

Routes (errors are `{ "error": { "code": "<Code>" } }`, docs/01):

| Route | Session | Body | Answers |
|---|---|---|---|
| `GET /api/owner/professionals/:id/hours` | yes | | `200 { "slotMinutes": 30, "periods": [ { "weekday": 1, "start": "09:00", "end": "13:00" } ] }`, ordered by weekday then start; `[]` when none · `404 ProfessionalNotFound` · `401 NotSignedIn` |
| `PUT /api/owner/professionals/:id/hours` | yes | `{ "periods": [ { "weekday": 1..7, "start": string, "end": string } ] }` | `200`, the same shape as `GET`, as stored · `400 InvalidWorkingPeriod` · `400 WorkingPeriodTooShort` · `400 WorkingPeriodsOverlap` · `404 ProfessionalNotFound` · `400 BadRequest` · `401 NotSignedIn` |

* Checks run in this order: session (`401`), body shape (`400
  BadRequest`), professional exists and is active (`404`), then the rule
  (`400`, the first failing period in the order below).
* Body shape: an object whose `periods` is an array of objects, each with
  `weekday` a whole number from 1 to 7 and `start` and `end` strings.
  Anything else, including extra shapes a hand-made request could send,
  is `BadRequest`. The screen always sends this shape.
* An `:id` that is not a positive whole number answers `404
  ProfessionalNotFound`, like an unknown one.
* `slotMinutes` is in the `GET` answer so the editor needs one request
  and can say the minimum in its message.
* `PUT` deletes the professional's rows and inserts the new ones inside
  one transaction.

Use cases, pure, in `src/features/weeklyHours/rules.ts`:

```ts
type Weekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;
type WorkingPeriod = { weekday: Weekday; start: string; end: string };

type WeeklyHoursError = {
  code: "InvalidWorkingPeriod" | "WorkingPeriodTooShort" | "WorkingPeriodsOverlap";
  index: number; // position of the refused period in the input array
};

setWeeklyHours(periods: WorkingPeriod[], slotMinutes: number):
  Result<WorkingPeriod[], WeeklyHoursError>
  // the periods to store, ordered by weekday then start
```

* A valid time matches `^([01]\d|2[0-3]):[0-5][05]$` (00:00 to 23:55, on
  a 5 minute step).
* Order of checks: each period in input order, `InvalidWorkingPeriod`
  (start or end not valid, or end not after start) then
  `WorkingPeriodTooShort` (end minus start under `slotMinutes`); only when
  every period passes, overlap. Two periods of one weekday overlap when
  one starts before the other ends; the error names the one that starts
  later (on equal starts, the higher input index).
* The server calls it on `PUT` and maps `error.code` to the answer; the
  client calls it before sending, only to place the message beside
  `error.index`.

Where the code lives:

* `src/features/weeklyHours/`: `rules.ts`, `repository.server.ts`,
  `route.server.ts` (`weeklyHoursRoute(db)`, mounted in
  `main.server.ts`), `api.ts`, `useWeeklyHours.ts`, `WeeklyHoursView.tsx`,
  `strings.ts`.
* The route reads whether the professional is active and reads
  `slotMinutes` from the clinic through the existing repositories of
  `professionals` and `clinic`; it does not copy their SQL.
* `ProfessionalsView.tsx` gets the "Hours" button and renders
  `<WeeklyHoursView professional={...} />` under the row in hours mode.
  The one-row-open rule and the busy state stay in `useProfessionals.ts`.
* "This professional no longer exists." and "Your session has ended..."
  are the strings the professionals section already has; the hours editor
  reports those two codes up to the section, which shows them where it
  does today.
* `requireSession` in `session.server.ts` guards both routes.

No new dependency.

**States.**

* Loading: "Loading hours" in place of the editor until `GET` answers.
* Empty: every day reads "Closed".
* Busy: while a save is in flight, every button of the editor is
  disabled.
* Error or offline: "The server cannot be reached. Try again." at the top
  of the editor; whatever was typed stays. If the first `GET` fails, the
  message shows with "Cancel" only.

**Visual reference.** No design file. The style of `professionals`:
`system-ui`, 16px padding on each side, left-aligned, browser default
colours. From and To are `<input type="time" step="300">`, each with its
label above; one period on one line when it fits, wrapping on a phone.
Screenshots: the editor with Monday to Friday 09:00 to 13:00 and 14:00 to
18:00, at 390×844 and 1280×800; the editor of a professional with no
hours, at 390×844; an overlap refusal, at 390×844.

**Out of scope.**

* Slots, the booking grid and daylight saving gaps: `book-appointment`
  derives slots from these periods.
* Future appointments when hours change: an open decision in docs/00;
  none exist yet, and the default ("existing appointments stay") holds.
* A "No hours yet" mark in the list: the list comes from the public
  `GET /api/professionals`, and marking it would change that contract or
  need a second list route; opening "Hours" shows "Closed" all week.
* Hiding professionals without hours from clients: `book-appointment`
  decides what a client sees then.
* Copying a day to other days: seven days by hand is short enough for one
  owner.
* Periods that cross midnight or end at 24:00: a neighbourhood clinic
  does not work past 23:55.
* Absences, holidays and one-off changes: `absences`.
* Showing hours to clients: they see slots, not hours.

**Done when.**

* [x] Vitest tests of `setWeeklyHours`: an empty week; 00:00 and 23:55
      accepted; 24:00, 9:00, 09:03 and an empty string refused; end equal
      to start and before start refused; a period of exactly
      `slotMinutes` accepted and one 5 minutes shorter refused;
      back-to-back periods accepted; overlapping and equal periods on one
      day refused with the later one's index; the same times on two
      weekdays accepted; the first refused period is the one reported;
      the answer ordered by weekday then start.
* [x] Vitest tests of the repository against an in-memory SQLite with the
      real migrations: replace a week, read it back ordered, a second
      save replaces the first, other professionals' periods untouched.
* [x] Vitest tests of the routes through Hono's `app.request`: each answer
      in the Contract's table, the check order, a non-numeric `:id`, a
      removed professional, and that a `401`, a `400` or a `404` changes
      no row.
* [x] `migrate.server.test.ts` expects `0003-working-period.sql` and the
      `working_period` table.
* [x] Playwright tests of every Behaviour line with a screen, at 390×844
      and 1280×800 (`WeeklyHoursView.e2e.ts` added to the `desktop`
      project).
* [x] Screenshots saved once, as proof, to `work/done/`:
      `weekly-hours-week-390x844.png`, `weekly-hours-week-1280x800.png`,
      `weekly-hours-empty-390x844.png`,
      `weekly-hours-overlap-390x844.png`.
* [x] `npm run verify` is green.
* [x] docs/02 lists the two routes and the `working_period` table as
      built; docs/04 names `WeeklyHoursView.e2e.ts` in the `desktop`
      project.
* [x] The person runs `npm run dev`, signs in at
      `http://localhost:5173/owner`, sets a week with a lunch break for a
      professional, reloads and opens "Hours" to see it kept.

## What happened

**Built.** Migration `0003-working-period.sql`; the `weeklyHours` slice
(`rules.ts`, `repository.server.ts`, `route.server.ts`, `api.ts`,
`useWeeklyHours.ts`, `WeeklyHoursView.tsx`, `strings.ts`), mounted in
`main.server.ts` and rendered by `ProfessionalsView.tsx` under the row in
hours mode; `transaction` in `database.server.ts`; `src/lib/id.ts`. Tests:
153 Vitest (34 new), 115 Playwright (36 new: 18 scenarios at both widths).

**Diverged from the plan, and why.**

* `transaction(db, run)` in `src/server/database.server.ts`: `BEGIN`, the
  writes, `COMMIT`, and `ROLLBACK` on failure, as a `DatabaseFailed`
  Result. First use: `saveClinicAndOwner` (`clinic-setup`); second use:
  `replaceWorkingPeriods`. `saveClinicAndOwner` now calls it and its tests
  pass unchanged. `migrate` keeps its own transaction: it answers
  `MigrationFailed` with the file name, not `DatabaseFailed`. docs/01 and
  docs/02 say so.
* `idOf` moved from `professionals/route.server.ts` to `src/lib/id.ts`.
  First use: the professionals routes; second use: the hours routes.
  docs/01 lists it.
* `isWorkingPeriod` (the shape of one period, whatever its times) sits in
  `rules.ts`, next to the type: the route checks a request body with it
  and `api.ts` checks the answer.
* `WeeklyHoursView` takes `busy` and `section` besides `professional`. The
  page keeps the busy state and the open row in `useProfessionals.ts` and
  has the editor report `ProfessionalNotFound` and `NotSignedIn` up, so
  the editor needs a way to report: `section` holds `saving`, `saved`,
  `failed`, `refused` and `close`, built in `useProfessionals.ts`. As in
  `professionals`, busy disables every button of the section, the editor's
  included.
* The client checks `setWeeklyHours` with the server's `slotMinutes` before
  sending and sends nothing when it refuses. So `api.ts` names only `401`
  and `404` as refusals; a `400` would mean the rule changed between the
  two reads of the same code, and reads as "cannot be reached".
* Two overlaps in one week: the first reported is the first in weekday
  then start order, since overlap is checked on the sorted week. The page
  fixed the order only for the per-period checks.
* After the session ended, opening "Hours" shows the message above the
  list and the editor with "Cancel" only, as when the first `GET` fails.
  A save keeps the editor open with what was typed, as the rename does.
* The row in hours mode keeps its name and its three buttons; the editor
  takes a line of its own under them (`flexBasis: 100%`), so the row stays
  `li > span` for the existing tests.
* The refusal message sits under its period's From, To and Remove period
  line, not to its right: on a phone that line already fills the width.
* The form has `noValidate`: with `step="300"` the browser would block
  09:03 with its own bubble before the rule could answer with the page's
  message.
* The one case `GET` and `PUT` cannot reach, a session without a clinic,
  answers `500 ClinicNotSetUp`, only so the types close.

**Dropped.** Nothing from Behaviour or Contract.

**What the proof found.** The four screenshots, in `work/done/`, show
`system-ui`, 16px on each side, left-aligned, browser default colours,
each label above its field, one period per line at both widths, and the
overlap message beside the later Monday period. The first take showed two
periods of one day touching each other; a 6px gap between periods was
added and the shots were taken again. Nothing else to fix. They were taken
by a one-off Playwright file, removed after the run, on a fresh database.

The Playwright tests pass at both widths, and verify is green. While
repeating the whole suite, a sign-in failed about once in 300 tests with
"The server cannot be reached. Try again." (a `500`). It comes from the
existing `OwnerView.e2e.ts` test "shows the form for a session older than
30 days": it opens a second SQLite connection to the shared e2e database
and writes to it, and the server's connection has no `busy_timeout`, so a
write racing it gets `SQLITE_BUSY`. Without that test, 565 runs of the
suite passed. The fix is outside this page (a busy timeout in the server's
database opening, or that test going through the API); it is left to the
person, who queued it in docs/06 as `e2e-database-busy`, right after this
delivery.

Checked by the person, at review: the agent's session could not keep
`npm run dev` running, so the person ran it, signed in at
`http://localhost:5173/owner`, set a week with a lunch break for a
professional, reloaded and opened "Hours": the week was kept.

**Decisions.** No ADR: the table, the routes and the rules sit inside
docs/01, docs/02 and docs/03. docs/03 already carried the new terms and
invariant 11 from `/propose`; `ProfessionalNotFound` now also names the
hours.
