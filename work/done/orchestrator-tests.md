# orchestrator-tests

**Objective.** Every client orchestrator, each `use<Feature>.ts` hook, has
unit tests in Vitest in Node: what each event does lives in plain functions
that take their repositories as a parameter, and the app behaves exactly as
before.

**Behaviour.**

The client side (the client and the owner) sees no change. Every line below
becomes a Vitest test that passes fake repositories, with the clock passed
as `now`.

The hook keeps only three jobs: it holds the state, publishes the in-flight
state of an event, and publishes what the event function returns. It also
keeps what already holds state: the stale-answer guards (the `latest` counter
of `useBooking`, the `active` flag of the others) and the
`onRememberedChange` subscription.

`bookingEvents.ts` (`useBooking`):

* Loading the professionals publishes them, or `failed: "professionals"`
  when the server is unreachable. A `message` given to the in-flight state
  stays shown.
* Loading the slots of a professional shows their days. With `after`, it
  shows the times of `after.date` and `after.message` when that date still
  has a slot, and the days otherwise. `ProfessionalNotFound` returns the
  next event, loading the professionals with `ProfessionalNotFound`. An
  unreachable server gives `failed: "slots"`.
* `pickDay`, `pickTime`, `back` and `done` move between the steps as today.
  `back` from each step clears `loading`, `message` and `failed`.
* When the name or phone is refused, `submitStarted` sets `nameError` and
  `phoneError`, nothing is sent and `busy` stays false.
* A booking that succeeds calls `remember` with the booked appointment, the
  clinic time zone and `now`, and shows the booked step with the name and
  phone emptied.
* `SlotTaken` returns the next event: loading the slots with
  `{ message: "SlotTaken", date }`. `ProfessionalNotFound` returns the next
  event: loading the professionals with `ProfessionalNotFound`. An
  unreachable server gives `failed: "book"`.
* A name typed while the booking is in flight survives a `SlotTaken` answer.
  This is the proof that the update is applied to the current state.
* `retryOf` names what "Try again" repeats: the professionals, the booking,
  or the slots of the professional *without* `after`. That last case is
  today's behaviour, which `slot-taken-retry` will change and prove with
  this test.
* `daysOf` groups the slots by clinic date. `tooLateToCancel` is true only
  on the form, when the cancellation deadline is before `now`.

`cancelEvents.ts` (`useCancel`):

* `open` and `close` give the empty form, open and closed.
* A refused or unreachable cancellation keeps what was typed and shows its
  code.
* A success calls `forget` with the normalized code and `now`, and shows
  the cancelled appointment with the fields emptied. A code that does not
  normalize is not forgotten, but the success is still shown.

`rememberedEvents.ts` (`useRemembered`):

* The list holds the appointments `readRemembered(now)` gives, minus those
  cancelled here. `cancellable` follows the `cancel` use case at `now`.
* `ask` gives the line `confirm`, `keep` clears it, and the in-flight state
  is `busy`.
* `CancellationTooLate` gives `tooLate`, and an unreachable server gives
  `failed`. Neither calls `forget`.
* A success or `AppointmentNotFound` calls `forget`, removes the line even
  when storage failed, and sets the section message (`cancelled` or
  `notBooked`).

`professionalsEvents.ts` (`useProfessionals`):

* The first load gives the list, or `ServerUnreachable`, without touching a
  name typed meanwhile.
* An add that succeeds inserts the professional in name order and empties
  the field. A name refusal goes to `addError`, any other refusal to
  `error`.
* A rename that succeeds replaces the professional in name order and closes
  the row. A name refusal goes to the open rename row.
* A removal that succeeds drops the professional and closes the row.
* `ProfessionalNotFound` on a rename, a removal or a refusal reported by
  the hours editor reloads the list and shows `ProfessionalNotFound`. When
  that reload fails, the old list stays.
* The hours editor's reports (`saving`, `saved`, `failed`, `refused`) set
  `busy`, the row and `error` as today.

`weeklyHoursEvents.ts` (`useWeeklyHours`):

* The load gives the periods with fresh keys. A `SectionRefusal` is
  returned as the report and does not set `unreachable`. An unreachable
  server sets `unreachable`.
* Adding a period gives 09:00 to 17:00 on that weekday with a new key.
  Editing and removing work by key.
* A save refused by `setWeeklyHours` marks the first refused period and
  sends nothing.
* A save that is sent reports `saving`, then `saved`, the refusal, or
  `failed` with `unreachable` set.

`ownerEvents.ts` (`useOwner`), `clinicEvents.ts` (`useClinic`),
`healthEvents.ts` (`useHealth`):

* The session check gives `signedIn`, `signedOut`, or `signedOut` with
  `ServerUnreachable`. Sign-in and sign-out give the same states as today.
* The clinic gives `ready`, `notSetUp` or `unreachable`. The health check
  gives `ok` or `unreachable`.

The whole app:

* Every existing Playwright test passes, and no `*.e2e.ts` file is edited.

**Contract.** No data, schema, route, request, response or local storage
change. The code shape, which the tests depend on:

* One file per hook, next to it: `src/features/<feature>/<name>Events.ts`
  and `<name>Events.test.ts`. The eight files are `bookingEvents`,
  `cancelEvents` and `rememberedEvents` (in `appointments/`),
  `professionalsEvents`, `weeklyHoursEvents`, `ownerEvents`, `clinicEvents`
  and `healthEvents`.
* Each file exports `type <Name>Repositories`, an object whose members are
  the repository functions the events call (from `api.ts`, and `remember`,
  `forget` and `readRemembered` from `remembered.ts`), typed with
  `typeof`. It also exports `const <name>Repositories`, which holds the
  real ones.
* Each file also exports the hook's state type and its initial state.
  These move out of the hook.
* Event without a repository call: `(state, ...inputs) => State`.
* Event with a repository call:
  * `<event>Started(state, ...inputs): State` gives the in-flight state.
  * The event itself:
    `async <event>(...inputs, now?, repositories = <name>Repositories)`.
    `now: Date` is required whenever a use case or a repository in the
    event needs the clock. No function reads the clock.
  * It resolves to `(current: State) => State`. The hook publishes that
    with `setState`.
  * Exceptions: `useBooking`'s events resolve to `BookingOutcome`, and
    `useWeeklyHours`'s to `{ update, report }`.
  * `submitStarted` (booking) and `saveStarted` (weekly hours) check first
    and return `{ state, send: boolean }`. The call runs only when `send`
    is true.
* ```ts
  export type BookingNext =
    | { next: "loadProfessionals"; message?: StepMessage }
    | { next: "loadSlots"; professional: Professional;
        after?: { message: StepMessage; date: string } }
    | { next: "submit" };
  export type BookingOutcome =
    | { update: (current: BookingState) => BookingState }
    | BookingNext;
  export function retryOf(state: BookingState): BookingNext | undefined;
  ```
  The hook runs a `BookingNext` like any event: first the in-flight state,
  then the function, with a new `latest` number.
* `useWeeklyHours` reports to the section as data:
  `report?: "saved" | "failed" | SectionRefusal`, and the hook forwards
  it. It reports `saving` when `send` is true. The draft key counter moves
  into `WeeklyHoursState` as `nextKey: number`.
* `useRemembered`'s four `useState`s become one `RememberedState`:
  `{ appointments, states, gone, message }`. Its lines come from
  `linesOf(state, now)`.
* After this delivery no `use*.ts` imports `api.ts`, a `rules.ts`, or
  `remembered.ts`. The one exception is `useRemembered`, which imports
  `onRememberedChange`.
* The hooks' return values, used by the views, keep their names and types.
  No view changes.

**Out of scope.**

* The `slot-taken-retry` fix: its own line. This delivery pins today's
  behaviour in a test that the fix will flip.
* Server routes: they already have tests, and they do not change.
* Tests for `api.ts`: they are thin calls to `request`, which is already
  tested.
* A shared "run an event" hook or a shared `Update<S>` type: the stale
  guards differ from hook to hook, and a common helper would change
  behaviour while claiming to be a refactor.
* New dependencies, `vi.mock`, jsdom, Testing Library: none of them is
  needed.

**Choices made without the stakeholder**, who asked for them to be listed:

* The result is **an update `(current) => State`, not a whole state.**
  The inputs stay enabled while a request is in flight. Today every answer
  is merged into the latest state, so a keystroke typed meanwhile
  survives. A whole state computed at the start of the event would erase
  it.
* A booking event **may return the next event instead of a state.** That
  keeps the in-between "Loading" after `SlotTaken` or
  `ProfessionalNotFound`, which a single return value could not publish.
  It also makes each step, and `retryOf`, testable on its own.
* **`remember` runs inside `submit`, before the hook's stale check.**
  Today it runs after that check. The difference cannot be reached from
  the screen, because "Back" is disabled while the booking is busy.
* **Every event moves,** including those with no call, and so do the
  values worked out for display (`daysOf`, `tooLateToCancel`, `linesOf`).
  Otherwise part of the logic would stay in the hook with no test.
* **The `Events` suffix** is there because `remembered.ts` is already the
  storage repository.
* **`nextKey` moves into the state,** so that `addPeriod` and the load are
  plain functions.

**Done when.**

* [x] The eight `<name>Events.test.ts` files cover every Behaviour line
      above. None uses `vi.mock` or a DOM.
* [x] `package.json` and `package-lock.json` are unchanged. No
      `route.server.ts`, `*View.tsx` or `*.e2e.ts` file is in the diff.
* [x] No `use*.ts` imports `api.ts`, a `rules.ts` or `remembered.ts`,
      beyond `onRememberedChange`.
* [x] Every existing Vitest and Playwright test passes without changing
      what it asserts.
* [x] docs/01 lists `<name>Events.ts` in the slice and says what stays in
      the hook. It also states the rule: a client orchestrator's event
      functions receive their repositories as a parameter, the real ones by
      default.
* [x] docs/04 gains the level row "Orchestrator | Vitest | each event with
      fake repositories and `now`; no DOM, no module mock".
* [x] `npm run verify` is green.
* [x] Manual check by the person, with `npm run dev`:
  * book a time, then cancel it from "Your appointments";
  * book another, then cancel it with the booking code;
  * sign in at `/owner`, add a professional and set their weekly hours.

  Each step behaves as before.

## What happened

**Built.** Eight `<name>Events.ts` files with their state types, initial
states (`initial<Name>State`), `<Name>Repositories` and
`<name>Repositories`, and eight hooks reduced to holding the state,
publishing the in-flight state and the update, and the guards: `latest`
in `useBooking`, `active` in the loads, `onRememberedChange` in
`useRemembered`. `useBooking` runs every `BookingNext` through one `run`
function: in-flight state, call, new `latest` number, then the update or
the next event.

**Tests.** 85 new Vitest cases in the eight `*Events.test.ts` files, all
with fake repositories built from plain objects (`vi.fn` only to see the
calls) and `now` passed in; no `vi.mock`, no DOM.

**Diverged.**

* Types that a view or a `strings.ts` imports from a hook (`BookingError`,
  `OpenRow`, `ProfessionalsError`, `OwnerError`, `HealthState`,
  `RememberedLine`, `DraftPeriod`) moved to the events file and the hook
  re-exports them, so no view or `strings.ts` changes. Types the hook
  itself needs from `rules.ts` or `api.ts` (`Professional`, `Weekday`,
  `SectionRefusal`, `RememberedAppointment`) are re-exported by the events
  file, so the hook imports none of those files, not even for a type.
* `HoursSection` stays in `useWeeklyHours.ts`: it is the hook's callback
  interface, and the events speak `WeeklyHoursReport` instead.
  `professionalsEvents.ts` gets one event per report (`hoursSaving`,
  `hoursSaved`, `hoursFailed`, `hoursRefused`).
* `readRemembered` does not wait (local storage), so the remembered list
  has no `Started`/async pair: `initialRememberedState(now, repositories)`
  and `reread(state, now, repositories)` are plain functions.
* Events whose result does not depend on the state take no `state`
  parameter: `open` and `close` (cancel), `submitSignInStarted`,
  `submitSignOutStarted(email)`.
* In the owner file the events are `submitSignIn` and `submitSignOut`, as
  the hook named them, since `signIn` and `signOut` are the repository
  names.
* The rename event is `rename` in `professionalsEvents.ts`; the hook still
  returns it as `save`.
* `now` is read by the hook when the event starts, not when the answer
  arrives, for `remember` and `forget`. They use it only to drop past
  appointments, so a request's few seconds change nothing a person sees.
* `hoursRefused` is async even for `NotSignedIn`, which needs no call, so
  that message now lands a microtask later. Nothing on screen shows it.
* `useBooking.submit` keeps its type `() => Promise<void>`: `run` is async
  and awaits the chained events.

**Dropped.** Nothing.

**Proof.** `npm run verify` green: typecheck, Biome, 323 Vitest tests
(85 new), 144 Playwright tests unchanged, build.

Manual check by the person, with `npm run dev`: signed in at `/owner`,
added a professional, gave them weekly hours, reloaded and saw the hours
kept. On `/`, booked a time more than 24 hours away and cancelled it from
"Your appointments", then booked another and cancelled it with "Cancel
with a booking code". Everything behaved as before.

**Decisions.** No ADR: the split sits inside docs/01's FOCUS orchestrator
row, now written there. No new term for docs/03.
