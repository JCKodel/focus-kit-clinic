# book-appointment

**Objective.** A client picks a professional, a day and a free time from the
next 30 days, gives a name and a phone number, books, and gets a booking
code, which the phone remembers.

**Behaviour.**

Home page, at `/` (client side, phone first):

* Under the clinic's name, the heading "Book an appointment" and one button
  per active professional, in the order of `GET /api/professionals`. With
  none: "No professionals yet."
* Tapping a professional shows "Book with <name>", a "Back" button, and one
  button per clinic day that has at least one free slot, earliest first,
  written like "Tue 29 Sep". With no free slot in the window: "No free
  times in the next 30 days."
* Tapping a day shows that day's free times as buttons, earliest first,
  written like "09:30" (24 hour clock, clinic time), and "Back" to the days.
* A free time is a slot of the professional's weekly hours: cut from the
  start of each working period into steps of `slotMinutes`, ending no later
  than the period's end, starting after now and at most 30×24 hours from
  now, and not overlapping a booked appointment of that professional.
* Tapping a time shows the booking form: the line "Tue 29 Sep at 09:30 with
  <name>", a "Your name" field, a "Phone number" field (`type="tel"`), "Book"
  and "Back".
* When the time starts less than 24 hours from now (its
  `cancellationDeadline` is already past), the form also says
  "This appointment starts in less than 24 hours and cannot be cancelled in
  the app."
* A blank name, or one over 80 characters, is refused with "Type a name of
  1 to 80 characters." beside the field; a phone with other characters than
  digits, spaces, `+`, `-`, `.` and brackets, or with fewer than 6 or more
  than 15 digits, is refused with "Type a phone number with 6 to 15 digits."
  beside the field. Nothing is sent.
* "Book" with valid fields books and shows "Booked", the same summary line,
  "Your booking code" and the code in large letters, then "Keep this code.
  With the phone number <digits>, it identifies your appointment." and a
  "Done" button that returns to the professionals.
* After booking, the home page shows "Your appointments" above "Book an
  appointment": each remembered appointment still to come, earliest first,
  as "Tue 29 Sep at 09:30 with <name> · Code K7MXQ2". It survives a reload.
  With none to come, the section is not shown.
* The booked time is gone from the free times, for this and every other
  client.
* When the time was taken meanwhile, or is no longer free for any reason,
  "Book" shows "This time is no longer free. Pick another." above the
  day's times, reloaded. When the day has no time left, the days are shown
  instead, with the same message.
* When the professional was removed meanwhile, the professionals list
  reloads with "This professional is no longer available."

Server (both sides):

* The server checks everything again: a hand-made request for a time that
  is not a free slot is refused and stores nothing.
* Two bookings racing for one slot: exactly one is stored, the other is
  `409 SlotTaken`.
* A booking code is 6 characters from `ABCDEFGHJKMNPQRSTUVWXYZ23456789`
  (no 0, O, 1, I, L), drawn by the server, unique across all appointments.
* An appointment stays when its time later leaves the weekly hours
  (docs/00 open decision, default holds); its time is simply not offered.

**Contract.**

Migration `src/server/migrations/0004-appointment.sql`:

```sql
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
```

* `starts_at` is always written with `toISOString()`, so equal instants
  are equal text, text order is time order, and the unique index holds.
* The partial unique index is the last guard against a double booking
  (docs/02). Slots never partly overlap (ADR-0005), so one index on the
  start suffices.
* A code clash (1 in about 887 million per existing appointment) fails the
  `UNIQUE` on `booking_code` and answers `500 DatabaseFailed`; the
  client's "Try again" draws a new code. No retry loop.

Routes (public, no session; errors are `{ "error": { "code": "<Code>" } }`):

| Route | Body | Answers |
|---|---|---|
| `GET /api/professionals/:id/slots` | | `200 { "timeZone": "Europe/Lisbon", "slots": [ "2026-09-29T08:00:00.000Z" ] }`, free slot starts, ascending; `[]` when none · `404 ProfessionalNotFound` |
| `POST /api/appointments` | `{ "professionalId": number, "startsAt": string, "clientName": string, "clientPhone": string }` | `201 { "bookingCode": "K7MXQ2", "startsAt": "2026-09-29T08:00:00.000Z", "clientPhone": "912345678", "professional": { "id": 3, "name": "Ana Lima" } }` · `400 BadRequest` · `404 ProfessionalNotFound` · `400 InvalidClientName` · `400 InvalidPhoneNumber` · `409 OutsideBookingWindow` · `409 OutsideWorkingHours` · `409 SlotTaken` |

* Checks run in this order: body shape (`400 BadRequest`), professional
  exists and is active (`404`), then the use case `book` in its order,
  then the insert (a unique index conflict on the slot is `409 SlotTaken`).
* Body shape: an object with `professionalId` a positive whole number,
  `startsAt` a string `Date.parse` reads, `clientName` and `clientPhone`
  strings. Anything else is `BadRequest`.
* The three "time" refusals share `409` because the client shows them
  alike; the body keeps the exact code. The client checks name and phone
  with the same use cases before sending, so it treats a `400` like an
  unreachable server, as `weeklyHours/api.ts` does.
* An `:id` that is not a positive whole number answers `404`, through
  `idOf` in `lib/id.ts`. Before setup there is no professional, so both
  routes answer `404`; a missing clinic after that is `500`, as in
  `weeklyHours`.
* The route reads periods, booked starts, runs `book` and inserts with no
  `await` between them, so no other request of the process interleaves;
  the unique index covers any other process.

Use cases, pure, in `src/features/appointments/rules.ts` (the clock is a
parameter; nothing reads it):

```ts
const bookingWindowDays = 30;

type SlotInput = {
  periods: WorkingPeriod[];  // from weeklyHours/rules.ts
  booked: string[];          // start instants of the professional's booked appointments
  timeZone: string;
  slotMinutes: number;
  now: Date;
};

freeSlots(input: SlotInput): string[]
  // toISOString() starts, ascending

type BookingRequest = { startsAt: string; clientName: string; clientPhone: string };
type BookingRefusal =
  | "InvalidClientName" | "InvalidPhoneNumber"
  | "OutsideBookingWindow" | "OutsideWorkingHours" | "SlotTaken";

book(request: BookingRequest, input: SlotInput):
  Result<{ startsAt: string; clientName: string; clientPhone: string }, BookingRefusal>
  // startsAt as toISOString(), clientName trimmed, clientPhone digits only

checkClientName(raw: string): Result<string, "InvalidClientName">   // lib/name.ts checkName
checkClientPhone(raw: string): Result<string, "InvalidPhoneNumber"> // the digits
cancellationDeadline(startsAt: string): Date                        // 24 hours before
```

* `book` checks in order: name, phone, window (start after `now` and at
  most `now` plus `bookingWindowDays` × 24 hours, else
  `OutsideBookingWindow`), hours (a start of `freeSlots` with `booked`
  empty, else `OutsideWorkingHours`), then taken (a start of `freeSlots`,
  else `SlotTaken`).
* Slots are cut in clinic wall time, for every clinic date from today's to
  the date of `now` plus 30 days. A wall time that does not exist (spring
  forward) gives no slot; one that happens twice (fall back) is its first
  instant. A slot is taken when `[start, start + slotMinutes)` overlaps a
  booked one, compared as instants, so an appointment off today's grid
  still blocks what it touches.
* Clinic time conversions (wall time of a date to instant, instant to
  clinic date and weekday) are pure functions in
  `src/features/appointments/clinicTime.ts`, built on `Intl.DateTimeFormat`.
  No date library. Their first use is here; `owner-schedule` would be the
  second.
* `checkClientName` is the third use of `checkName`.

Remembered appointments, client only, `src/features/appointments/remembered.ts`:

```ts
type RememberedAppointment = {
  bookingCode: string;
  clientPhone: string;       // digits
  professionalName: string;
  startsAt: string;          // UTC instant
  timeZone: string;
};
// localStorage key "appointments": a JSON array of RememberedAppointment
```

* Reading ignores a missing or unreadable value (empty list). Writing adds
  the new one and drops those whose `startsAt` is past. A storage failure
  (private mode) is a `Result` the hook ignores: the booked screen still
  shows the code.

Server repository, `src/features/appointments/repository.server.ts`:
`findBookedStarts(db, professionalId, from)` (booked `starts_at >= from`,
where the route passes `now` minus `slotMinutes`) and
`insertAppointment(db, appointment)`, which turns the `UNIQUE` failure on
`appointment.professional_id, appointment.starts_at` into `SlotTaken` and
any other failure into `DatabaseFailed`. The booking code is drawn in the
route with `crypto.randomInt(31)` per character.

Where the code lives:

* `src/features/appointments/`: `rules.ts`, `clinicTime.ts`,
  `repository.server.ts`, `route.server.ts` (`appointmentsRoute(db)`,
  mounted in `main.server.ts`), `api.ts`, `remembered.ts`, `useBooking.ts`,
  `BookingView.tsx`, `RememberedView.tsx`, `strings.ts`.
* The route reads the active professional, the clinic and the working
  periods through the existing repositories of `professionals`, `clinic`
  and `weeklyHours`; it does not copy their SQL.
* `src/app/main.tsx` home: `ClinicView`, `RememberedView`, `BookingView`,
  `HealthView`, in that order.
* docs/02 gets the table row, the two routes and the check order of public
  routes; docs/03 gets the wall time rules above as part of invariant 2.

No new dependency.

**States.**

* Loading: "Loading" in place of the professionals, the days or the times
  until the answer comes.
* Empty: "No professionals yet." · "No free times in the next 30 days."
* Busy: while "Book" is in flight, "Book" and "Back" are disabled.
* Error or offline: "The server cannot be reached. Try again." above the
  current step, with a "Try again" button that repeats the failed request;
  the form keeps what was typed.

**Visual reference.** No design file. The style of the owner screen:
`system-ui`, 16px padding on each side, left-aligned, browser default
colours. Buttons for professionals, days and times are full width on a
phone, at least 44px tall. The booking code in a monospace font, 2em,
letter-spaced. Screenshots at 390×844: the professionals list; the days;
the times; the form with the under 24 hours line (slots mocked); the
booked screen; the home page with "Your appointments".

**Out of scope.**

* Cancelling, and a cancel button on remembered appointments:
  `cancel-appointment`.
* The owner seeing appointments: `owner-schedule`.
* Stopping fake bookings: an open decision in docs/00; the app is local
  until `deploy`, and the queue gets `fake-bookings` before it.
* Absences and holidays removing slots: `absences`.
* Hiding professionals with no free times: they stay, and say so.
* The browser's back button, links to a step: no router (docs/01).
* Checking that a phone number exists, or its country: no notifications,
  so nothing would use it.
* Removing `HealthView` from the home page: not this delivery's concern.
* Future appointments when hours, the professional or the length change:
  open decisions in docs/00, defaults hold.

**Done when.**

* [x] Vitest tests of `freeSlots`: grid from each period's start; a period
      that is not a multiple of `slotMinutes` loses its tail; nothing at or
      before now; the window's last instant included and one step later
      excluded; a booked slot removed; a booked appointment off the grid
      removes each slot it overlaps; two periods on one day; Europe/Lisbon
      spring forward (no slot in the missing hour) and fall back (01:30
      once, its first instant); a period in `America/Sao_Paulo` gives the
      right UTC starts; no periods gives `[]`.
* [x] Vitest tests of `book`: each refusal in the order above; a blank and
      an 81 character name; phones `912 345 678`, `+351 (91) 234-5678`
      accepted as digits, `12345`, 16 digits and `91a2345678` refused; a
      start off the grid is `OutsideWorkingHours`; a past and a 31 day
      start are `OutsideBookingWindow`; `startsAt` normalized.
* [x] Vitest tests of `cancellationDeadline` and `clinicTime.ts`.
* [x] Vitest tests of the repository against an in-memory SQLite with the
      real migrations: insert, read booked starts from an instant, a second
      booked row on one slot is `SlotTaken`, a cancelled row does not
      block the slot, a repeated code fails.
* [x] Vitest tests of the routes through Hono's `app.request`: each answer
      in the Contract's table, the check order, a removed professional,
      a non-numeric `:id`, and that every refusal stores no row.
* [x] `migrate.server.test.ts` expects `0004-appointment.sql`.
* [x] Playwright (`BookingView.e2e.ts`, phone project only), with a
      professional of its own random tag, open all week 08:00 to 20:00
      through the owner routes: book end to end and see the code and
      "Your appointments" after a reload; the booked time gone; a name
      and a phone refusal; a slot taken by an API booking first shows the
      message; a professional with no hours shows "No free times in the
      next 30 days."; the under 24 hours line with mocked slots; the
      screenshots of Visual reference.
* [x] docs/02 and docs/03 updated as Contract says.
* [x] `npm run verify` green.
* [x] The person runs `npm run dev`, gives a professional weekly hours at
      `http://localhost:5173/owner`, then opens `http://localhost:5173/`
      in a 390×844 window, books a time, sees the booking code, reloads
      and sees the appointment under "Your appointments".

## What happened

**Built.** `src/features/appointments/`: `rules.ts` (`freeSlots`, `book`,
`checkClientName`, `checkClientPhone`, `cancellationDeadline`,
`bookingWindowDays`, the booking code alphabet), `clinicTime.ts`,
`repository.server.ts`, `route.server.ts` (mounted in `main.server.ts`),
`api.ts`, `remembered.ts`, `useBooking.ts`, `useRemembered.ts`,
`BookingView.tsx`, `RememberedView.tsx`, `strings.ts`; migration
`0004-appointment.sql`; the home page renders `ClinicView`,
`RememberedView`, `BookingView`, `HealthView`. Tests: 214 Vitest (58 new,
in `rules`, `clinicTime`, `remembered`, the repository and the routes;
`migrate.server.test.ts` updated), 131 Playwright (16 new, phone only).

**Diverged from the plan, and why.**

* `useRemembered.ts` is a file the page did not list. `RememberedView`
  needs an orchestrator: a view may not read storage (docs/01). The hook
  reads `remembered.ts` at start and again on each change.
* `remembered.ts` also has `onRememberedChange`, so "Your appointments"
  shows the new booking at once, above the booked screen, not only after a
  reload. The reload keeps it, as the page asks.
* "Back" sits above the list of days and above the list of times, under
  "Book with <name>", not below them: the first screenshots put it under
  30 day buttons, out of reach on a phone. The page lists "Back" before the
  days, so this reads it literally. In the form it stays beside "Book".
* "Book with <name>" stays as the heading on the days, the times and the
  form, so each step says whom the client is booking with.
* Day and time labels ("Tue 29 Sep", "09:30") are written by
  `strings.ts` from the clinic date and minute, not by
  `Intl.DateTimeFormat("en-GB")`, whose output changes with the ICU
  version (recent ones write "Sept").
* `api.ts` reads every `409` as `SlotTaken`: the three time refusals are
  shown alike, and `SlotTaken` means "a time that is not free" (docs/03).
* The client list of professionals reuses `fetchProfessionals` from
  `professionals/api.ts`, the same route.
* `instantAt` in `clinicTime.ts` tries the zone's offset a day before and a
  day after the wall time, keeps the candidates that read back as that wall
  time, and takes the earliest: none in a spring forward gap, the first in
  a fall back.
* `book` answers `OutsideBookingWindow` for a `startsAt` that is not a
  date; the route never lets one through (`BadRequest`).
* The racing test of the route sends two bookings together: within one
  process the second is refused by `book`, since nothing interleaves
  between the read and the insert. The index path (`SlotTaken` from the
  insert) is proven by the repository test.
* The code clash (`500 DatabaseFailed`) is not driven through the route,
  as the code is random; the repository test proves a repeated code fails
  as `DatabaseFailed`.
* After a refused booking the times are reloaded; if that reload fails,
  the days show "The server cannot be reached. Try again." and the
  "no longer free" message is not kept.
* `remembered.test.ts` (Vitest, a stubbed `localStorage`) was added:
  dropping past appointments on write is a rule, and every rule has a test.

**Dropped.** Nothing from Behaviour or Contract.

**What the proof found.** Six screenshots in `work/done/`
(`book-appointment-*-390x844.png`): the professionals, the days, the times,
the form with the under 24 hours line (slots mocked), the booked screen,
the home page with "Your appointments". They show `system-ui`, 16px on
each side, left-aligned, browser default colours, full-width buttons 44px
tall, the code in a monospace font at 2em, letter-spaced. The first take
found two things, fixed and taken again: "Back" under all 30 days (moved
above the list), and "Code" split from the code at the end of a line in
"Your appointments" (a no-break space now joins them). What remains: one
time button looks a shade darker because the pointer was still over it
after the click. The shots came from a one-off Playwright file on a fresh
database, removed after the run, as in earlier deliveries.

`npm run verify` is green. The 16 booking tests also passed with
`--repeat-each=3`.

Checked by the person, at review: the agent's session could not keep
`npm run dev` running, so the person ran it, gave a professional weekly
hours at `http://localhost:5173/owner`, opened `http://localhost:5173/` in
a 390×844 window, booked a time, saw the booking code, reloaded and saw
the appointment under "Your appointments". It all worked.

**Decisions.** No ADR: the table, the routes and the rules sit in docs/02
and docs/03. docs/02 has the `appointment` row, the partial unique index,
the booking code, the two routes and the check order of public routes.
docs/03 has the wall time rules and the kept appointment in invariant 2,
the check order of `book` in invariant 3, and `ProfessionalNotFound` now
names slots and booking. docs/01 says `remembered.ts` alone touches local
storage and that `lib/name.ts` also checks client names (its third use).
