# cancel-appointment

**Objective.** A client cancels their own appointment up to 24 hours before
it starts, from the appointment the phone remembers or by typing the phone
number and the booking code, and is told why when it is too late.

**Behaviour.**

Home page, at `/` (client side, phone first):

* Each appointment under "Your appointments" whose `cancellationDeadline`
  is not yet past has a "Cancel" button after its line.
* An appointment whose deadline is past has no button; under its line:
  "Can no longer be cancelled in the app."
* Tapping "Cancel" replaces the button with "Cancel this appointment?" and
  two buttons, "Yes, cancel" and "Keep it". "Keep it" puts the "Cancel"
  button back and sends nothing.
* "Yes, cancel" cancels. The appointment leaves "Your appointments", and
  the section shows "Cancelled: Tue 29 Sep at 09:30 with Ana Lima. The time
  is free again." until the page is reloaded, even when no appointment is
  left in the list.
* When the server no longer knows it as booked (cancelled meanwhile, for
  example from another phone with the code), the phone forgets it, it
  leaves the list, and the section shows "This appointment is no longer
  booked."
* When the deadline passed while the page was open, the server refuses and
  the line of that appointment shows "Appointments can be cancelled up to
  24 hours before they start. This one can no longer be cancelled in the
  app." and no "Cancel" button. The phone keeps it.
* Between "Your appointments" and "Book an appointment", a button "Cancel
  with a booking code". Tapping it replaces the button with the heading
  "Cancel an appointment", a "Phone number" field (`type="tel"`), a
  "Booking code" field (`autocapitalize="characters"`,
  `autocomplete="off"`), "Cancel appointment" and "Back". "Back" puts the
  button back and empties the fields. The booking steps stay below.
* "Cancel appointment" sends what was typed, with no check on the client.
  The code is read ignoring case and spaces around it: `k7mxq2 ` finds
  `K7MXQ2`. The phone is read by its digits: `912 345 678` finds
  `912345678`.
* On success the form is replaced by "Cancelled", the line "Tue 29 Sep at
  09:30 with Ana Lima", "The time is free again." and a "Done" button that
  puts the "Cancel with a booking code" button back. When the phone
  remembered that appointment, it forgets it and it leaves "Your
  appointments".
* A phone and code that match no booked appointment, including one
  already cancelled, a wrongly typed one, or blank fields: "No booked
  appointment matches this phone number and code." above the form, which
  keeps what was typed.
* Too late: "Appointments can be cancelled up to 24 hours before they
  start. This one can no longer be cancelled in the app." above the form.
* The cancelled time is free again in the booking steps, for every client.

Server (both sides):

* A cancellation succeeds while the current time is at or before
  `cancellationDeadline` (docs/03 invariant 4); one millisecond later it is
  `409 CancellationTooLate`. An appointment already started or past is
  too late as well.
* A cancelled appointment keeps its row with status `cancelled`; nothing is
  deleted.
* An appointment of a removed professional can still be cancelled.
* Two cancellations racing for one appointment: exactly one is `200`, the
  other `404 AppointmentNotFound`.
* A second cancellation of the same appointment is `404
  AppointmentNotFound`.

**Contract.**

No migration: `appointment.status` and the partial index
`appointment_booked_slot` (0004) already free a cancelled slot.

Route (public, no session; errors are `{ "error": { "code": "<Code>" } }`):

| Route | Body | Answers |
|---|---|---|
| `POST /api/appointments/cancel` | `{ "clientPhone": string, "bookingCode": string }` | `200 { "startsAt": "2026-09-29T08:00:00.000Z", "timeZone": "Europe/Lisbon", "professional": { "id": 3, "name": "Ana Lima" } }` · `400 BadRequest` · `404 AppointmentNotFound` · `409 CancellationTooLate` |

* The code and the phone travel in the body, never in the path, so they
  stay out of access logs.
* Body shape: an object with `clientPhone` and `bookingCode` strings.
  Anything else is `BadRequest`.
* Checks run in this order: body shape (`400`); the phone through
  `checkClientPhone` and the code through `normalizeBookingCode`, where a
  refusal of either is `404 AppointmentNotFound` (no separate code, so a
  guess learns nothing); the booked appointment with that code and those
  digits (`404`); the use case `cancel` (`409`); the update, where no row
  changed is `404`. `200` otherwise.
* The route reads, runs `cancel` and updates with no `await` between them;
  the update's `status = 'booked'` condition covers any other process.
* `timeZone` is the clinic's, so the typed path can write the line without
  another request. A missing clinic with an appointment present is `500
  ClinicNotSetUp`, as in the booking route.
* The professional is read whether active or removed.

Use cases, pure, in `src/features/appointments/rules.ts`:

```ts
cancel(startsAt: string, now: Date): Result<void, "CancellationTooLate">
  // ok while now <= cancellationDeadline(startsAt)

normalizeBookingCode(raw: string): Result<string, "AppointmentNotFound">
  // trimmed, upper-cased; ok only when it is bookingCodeLength characters
  // of bookingCodeAlphabet
```

* The client decides whether to show "Cancel" with `cancel(startsAt,
  now).ok`: the same rule the server enforces (docs/01). The under 24 hours
  line of the booking form keeps using `cancellationDeadline`.

Server repository, `src/features/appointments/repository.server.ts`:

```ts
findBookedAppointment(db, bookingCode: string, clientPhone: string):
  Result<{ id: number; startsAt: string; professional: Professional } | undefined, DatabaseFailed>
  // status = 'booked', booking_code and client_phone equal; joins
  // professional, removed or not

cancelAppointment(db, id: number): Result<boolean, DatabaseFailed>
  // UPDATE appointment SET status = 'cancelled' WHERE id = ? AND status = 'booked';
  // true when one row changed
```

Client repository, `src/features/appointments/api.ts`:

```ts
type Cancelled = { startsAt: string; timeZone: string; professional: Professional };
postCancellation(body: { clientPhone: string; bookingCode: string }):
  Promise<Result<Cancelled,
    { code: "AppointmentNotFound" } | { code: "CancellationTooLate" } | ServerUnreachable>>
  // 404 is AppointmentNotFound, 409 is CancellationTooLate; a 400 reads as
  // ServerUnreachable, as postAppointment does
```

Remembered appointments, `src/features/appointments/remembered.ts`:

```ts
forget(bookingCode: string, now: Date): Result<void, StorageFailed>
  // drops the one with that code and those whose start is past; notifies
  // the listeners, as remember does
```

* A code the phone does not remember changes nothing and is `ok`.

Where the code lives:

* `src/features/appointments/`: `rules.ts` (`cancel`,
  `normalizeBookingCode`), `repository.server.ts`, `route.server.ts` (the
  new `POST /appointments/cancel` in `appointmentsRoute`), `api.ts`,
  `remembered.ts`, `useRemembered.ts` (becomes the orchestrator of the
  list: confirm, cancel, forget, the section's message), `RememberedView.tsx`,
  new `useCancel.ts` and `CancelView.tsx` (the typed path), `strings.ts`.
* `src/app/main.tsx` home: `ClinicView`, `RememberedView`, `CancelView`,
  `BookingView`, `HealthView`, in that order.
* docs/02 gets the route row and its check order; docs/03 invariant 6 gets
  "the booking code is compared trimmed and upper-cased, and a phone or code
  that cannot be one is `AppointmentNotFound`"; docs/01 says
  `remembered.ts` also forgets.

No new dependency.

**States.**

* Loading: none; nothing is fetched until a button is tapped.
* Busy: while a cancellation is in flight, "Yes, cancel" and "Keep it", or
  "Cancel appointment" and "Back", are disabled.
* Error or offline: "The server cannot be reached. Try again." beside the
  appointment's line, or above the form, with a "Try again" button that
  repeats the request; the form keeps what was typed and the appointment
  stays remembered.
* Storage failure while forgetting (private mode): ignored, as in
  `remember`. The cancellation still shows as done; if the appointment is
  still listed after a reload, cancelling it again gives "This appointment
  is no longer booked.", which forgets it.

**Visual reference.** No design file. The style of `book-appointment`:
`system-ui`, 16px padding on each side, left-aligned, browser default
colours, buttons at least 44px tall; "Cancel", "Yes, cancel" and "Keep it"
sit inline after the line, not full width. Screenshots at 390×844: "Your
appointments" with one cancellable and one under 24 hours; the confirmation;
the section after a cancel; the typed form; the typed "Cancelled"; the typed
"No booked appointment matches" message.

**Out of scope.**

* A limit on guesses of phone and code: `sign-in-limit` and
  `fake-bookings`, before the app is public.
* The owner cancelling a client's appointment: open decision in docs/00.
* Undoing a cancellation: book again, if the time is still free.
* A cancellation instant or reason column: nothing reads it yet;
  `owner-schedule` adds one if it needs it.
* Showing cancelled or past appointments to the client: the phone keeps
  only the ones to come.
* Telling the owner or anyone of the cancellation: no notifications.
* Checking phone and code on the client before sending: one message covers
  every mismatch.
* The browser's back button: no router (docs/01).

**Done when.**

* [x] Vitest tests of `cancel`: ok one millisecond before and exactly at
      the deadline, `CancellationTooLate` one millisecond after, and for a
      start in the past.
* [x] Vitest tests of `normalizeBookingCode`: ` k7mxq2 ` gives `K7MXQ2`;
      5 and 7 characters, a `0`, an `O`, an `I`, an `L`, a `1` and blank
      are refused.
* [x] Vitest tests of the repository against an in-memory SQLite with the
      real migrations: finds a booked one by code and digits; a wrong
      phone, a wrong code and a cancelled one are `undefined`; a removed
      professional's appointment is found; `cancelAppointment` is `true`
      once and `false` the second time; after it, `findBookedStarts` no
      longer has the start and a new booking of that slot inserts.
* [x] Vitest tests of the route through Hono's `app.request`: each answer
      of the table, the check order, a lower-case code with spaces and a
      phone with spaces cancel, a malformed phone or code is `404`, a
      second cancel is `404`, an appointment starting in under 24 hours is
      `409` and stays booked, a removed professional's appointment cancels.
* [x] Vitest tests of `forget` in `remembered.test.ts`: drops the one with
      the code, keeps the others, drops the past, an unknown code is `ok`.
* [x] Playwright (`CancelView.e2e.ts`, phone project only), with a
      professional of its own random tag, open all week 08:00 to 20:00
      through the owner routes: book in the app, cancel from "Your
      appointments" with the confirmation, see the message and the time
      free again; "Keep it" sends nothing; cancel by typing the phone with
      spaces and the code in lower case for an API booking; a wrong code
      shows the no match message; the earliest slot booked through the API
      (always under 24 hours away with those hours) is refused as too late
      by the typed form, and shows no "Cancel" button when planted in local
      storage; the screenshots of Visual reference.
* [x] docs/01, docs/02 and docs/03 updated as Contract says.
* [x] `npm run verify` green.
* [x] The person runs `npm run dev`, opens `http://localhost:5173/` in a
      390×844 window, books a time more than 24 hours away, cancels it from
      "Your appointments", sees the time free again, then books another and
      cancels it with "Cancel with a booking code".

## What happened

**Built.** `src/features/appointments/`: `rules.ts` (`cancel`,
`normalizeBookingCode`), `repository.server.ts` (`findBookedAppointment`,
`cancelAppointment`), `route.server.ts` (`POST /appointments/cancel` in
`appointmentsRoute`), `api.ts` (`postCancellation`), `remembered.ts`
(`forget`), `useRemembered.ts` (now the orchestrator of the list),
`RememberedView.tsx`, new `useCancel.ts` and `CancelView.tsx`,
`strings.ts`; the home page renders `ClinicView`, `RememberedView`,
`CancelView`, `BookingView`, `HealthView`. Tests: 238 Vitest (24 new, in
`rules`, the repository, the route and `remembered`), 144 Playwright (13
new, phone only, in `CancelView.e2e.ts`).

**Diverged from the plan, and why.**

* Four abstractions on their second use, none named on the page:
  `styles.ts` (new file: `field`, `buttons`, `action`; first
  `BookingView.tsx`, second `CancelView.tsx`); `e2e.server.ts` (new file:
  the Playwright helpers `professionalWith`, `slotsByDay`, `openForm` and
  others; first `BookingView.e2e.ts`, second `CancelView.e2e.ts`; `.server`
  since it imports `e2eClinic.server.ts`); `professionalOf` in `api.ts`
  (first `bookedOf`, second `cancelledOf`); the private `keep` in
  `remembered.ts`, which stores and tells the listeners (first `remember`,
  second `forget`).
* A line whose cancellation could not reach the server shows "Try again"
  and also "Keep it", so the client can leave the line as it was; the page
  named only "Try again".
* "Cancelled: ... The time is free again." and the typed "Cancelled" line
  are written from the server's answer (start, clinic time zone, the
  professional's current name), not from the remembered copy.
* `useRemembered` keeps the codes cancelled on this page and hides them,
  so a line leaves at once even when storage fails to forget; as States
  says, it only comes back after a reload.
* The typed path forgets the code as `normalizeBookingCode` reads what was
  typed: the answer carries no code, and codes are unique.
* The route reads the clinic after finding the appointment and before
  `cancel`, so the check order of the page holds and a missing clinic is
  `500` only when an appointment exists.
* "Cancel an appointment" stays as the heading above "Cancelled", as
  "Book an appointment" stays above "Booked".
* Playwright tests beyond "Done when", one per Behaviour or States line
  that had none: "no longer booked" forgets with its message; a server
  refusal as too late on a line keeps it; a failed cancellation from the
  list and from the form, each with "Try again"; the busy buttons; "Back"
  empties the fields; blank fields and a code that cannot be one; the
  inline 44px "Cancel" and the order of the three sections.
* The screenshots came from a one-off Playwright file on a fresh database,
  removed after the run, as in earlier deliveries, not from
  `CancelView.e2e.ts`: they would be rewritten on each verify.

**Dropped.** Nothing from Behaviour or Contract.

**What the proof found.** Six screenshots in `work/done/`
(`cancel-appointment-*-390x844.png`): "Your appointments" with one
appointment under 24 hours ("Can no longer be cancelled in the app.") and
one with "Cancel"; the confirmation; the section after a cancel; the typed
form; the typed "No booked appointment matches" message; the typed
"Cancelled". They show `system-ui`, 16px on each side, left-aligned,
browser default colours, buttons 44px tall, "Cancel", "Yes, cancel" and
"Keep it" not full width. The first take found one thing, fixed and taken
again twice: at 390px "Keep it" wrapped alone to a new line, indented.
"Yes, cancel" and "Keep it" now sit together and wrap as a pair under the
question. What remains: "Cancel" after the line makes that line taller
than its neighbours, since the button is 44px; it is where the page puts
it.

`npm run verify` is green. The 13 cancel tests also passed with
`--repeat-each=3`.

Checked by the person, at review: the agent's session could not keep
`npm run dev` running, so the person ran it and opened
`http://localhost:5173/` in a 390×844 window. They booked a time more than
24 hours away, cancelled it from "Your appointments" and saw the time free
again, then booked another and cancelled it with "Cancel with a booking
code". They also booked the earliest time, under 24 hours away: it showed
no "Cancel" button and "Can no longer be cancelled in the app.", and the
typed form refused it with the 24 hours message. It all worked.

**Decisions.** No ADR: the route and its check order sit in docs/02, the
comparison of phone and code in docs/03 invariant 6, and docs/01 says
`remembered.ts` also forgets.
