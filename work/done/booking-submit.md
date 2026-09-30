# booking-submit

**Objective.** `useBooking`'s submit follows the rule docs/01 states for
every event. It publishes its in-flight state as an update of the current
state, and it books with the state the hook read when the event started,
not with a copy written during render. The client sees no change.

**Behaviour.**

The client side sees no change. The first four lines below are Vitest
tests in Node in `src/features/appointments/bookingEvents.test.ts`. They
use plain states and fake repositories: no hook, no DOM, no `vi.mock`.

* `submitStarted`, given a valid form, answers `send: true`. Its update,
  applied to that same form with a different name typed after the click,
  keeps the new name and sets `busy: true`. This is the new test the
  delivery exists for.
* `submitStarted`, given a blank name and a 2 digit phone, answers
  `send: false`. Its update, applied to the form, sets `nameError:
  "InvalidClientName"` and `phoneError: "InvalidPhoneNumber"` and leaves
  `busy: false`.
* `submitStarted` away from the form (on the days) answers `send: false`,
  and its update returns the current state unchanged.
* `retryOf` of a form with `failed: "book"` answers `{ next: "submit",
  state }`, where `state` is the state it was given.
* In the hook, `submit` and `retry` read `state` from the render the
  person acted on and pass it to `run`. `run` publishes
  `submitStarted(state).update` through `setState`. When `send` is true,
  it calls `submit(state, now)` with the same state. The `shown` ref and
  its assignment during render are gone.
* Booking, a name or phone refusal, a slot taken meanwhile, a removed
  professional and "Try again" after an unreachable server behave exactly
  as before. Every existing Playwright test passes and no `*.e2e.ts` file
  is edited.

**Contract.** No data, schema, route, request, response or local storage
change. The code shape in `src/features/appointments/bookingEvents.ts`:

```ts
export type BookingNext =
  | { next: "loadProfessionals"; message?: StepMessage }
  | {
      next: "loadSlots";
      professional: Professional;
      after?: { message: StepMessage; date: string };
    }
  | { next: "submit"; state: BookingState };  // the state the booking is made from

export function submitStarted(state: BookingState): {
  update: (current: BookingState) => BookingState;
  send: boolean;
};
```

* `submitStarted` checks the name and phone of `state`, the state the
  person acted on, and decides `send` from that. Its `update` puts the
  answer of that check (`nameError`, `phoneError`, and when sending
  `busy: true` and `failed: undefined`) on `current`. Every other field of
  `current` stays as it is. Away from the form, or without slots, the
  update is `(current) => current` and `send` is false.
* `submit(state, now, repositories)` keeps its signature. Its comment
  changes: `state` is the one given to `submitStarted`, the one the
  person acted on.
* `retryOf(state)` answers `{ next: "submit", state }` for
  `failed: "book"`. Its other answers do not change.
* `useBooking.ts`: `submit` becomes `() => run({ next: "submit", state })`
  with `state` in its dependencies, as `retry` already has. `run` reads
  `next.state` instead of `shown.current`. The hook's return value does
  not change, and no view changes.

**The shape, and why.** `{ update, send }`, returned by the starter:

* `send` has to be known at once, before any call. The hook decides from
  it whether to call at all, so it cannot hide inside an update that
  React applies later.
* `update` is the same member name and type as the answer's
  `{ update: (current) => State }` in `BookingOutcome`, so the hook
  publishes both the same way (`setState(x.update)`).
* The check reads the state the person acted on, and the update writes
  onto the current state. What the server receives is what was checked,
  and a keystroke typed meanwhile survives, as docs/01 asks of an answer.
* This is the first occurrence of an in-flight update from a starter
  that decides whether to send. `useWeeklyHours`' `saveStarted` is the
  second, in a later delivery, and a delivery after that declares the
  shape once. Neither happens here.

**Out of scope.**

* `saveStarted` in `useWeeklyHours`: it follows this shape in a later
  delivery.
* A shared type for `{ update, send }`: declared once, after its second
  use.
* The `slot-taken-retry` fix: its own line. `retryOf` still reloads the
  slots without `after`.
* Tests that drive the hook, jsdom, Testing Library, `vi.mock`, or any new
  dependency.
* Disabling the name and phone fields while booking: the fields stay
  enabled, as today.

**Choices made without the stakeholder:**

* **The state travels inside `BookingNext`** (`{ next: "submit"; state }`),
  not as a second argument of `run`. That way `retryOf` stays pure and
  hands over the state it was given, and `run` keeps one parameter.
* **`submit` depends on `state`**, so its callback changes on every render,
  as `retry`'s already does. No view keeps it across renders.
* **Three existing tests change their reading, not their claim.** The two
  `submitStarted` tests read `update(state)` instead of `.state`, and the
  `retryOf` test for `failed: "book"` expects the `state` member. Tests
  that took `started` from `submitStarted` to call `submit` pass the form
  state itself.
* **The milestone 1.1 paragraph gains a clause** for this line, so
  `m1.1-review` checks it.

**Done when.**

* [x] The four Vitest cases of Behaviour pass in `bookingEvents.test.ts`,
      with no hook, no DOM and no `vi.mock`.
* [x] `useBooking.ts` has no `shown` ref and assigns nothing to a ref
      during render.
* [x] `package.json` and `package-lock.json` are unchanged. No
      `*View.tsx`, `*.e2e.ts` or `*.server.ts` file is in the diff.
* [x] Every other existing Vitest test and every Playwright test passes
      without changing what it asserts.
* [x] docs/01 says that a starter's in-flight state is published as an
      update of the current state. For a starter that decides whether to
      send, it says the shape `{ update, send }`. It names
      `submitStarted` as the first occurrence and `saveStarted` as the
      one that still returns a whole state.
* [x] `npm run verify` is green.
* [ ] Manual check by the person, with `npm run dev`, at 390×844 on `/`
      (open: the person runs it):
  * book a time and see the code;
  * press "Book" with a blank name and see the refusal;
  * stop the server, press "Book" and see "The server cannot be
    reached", then start it again, press "Try again" and see the booking
    go through.

  Each behaves as before.

**What happened.**

* **Built as planned.** `submitStarted` answers `{ update, send }`;
  `BookingNext`'s `submit` carries `state`; `retryOf` hands over the state
  it was given; `useBooking`'s `submit` is `() => run({ next: "submit",
  state })` with `state` in its dependencies, and `run` reads
  `next.state`. The `shown` ref is gone, and `useBooking.ts` writes no ref
  during render.
* **Tests.** One new case, "sends the checked form and keeps a name typed
  after the click". The refusal and away-from-the-form cases read
  `update(state)`; away from the form, `update` returns the very state it
  is given (`toBe`). The `retryOf` case for `failed: "book"` expects the
  `state` member. The cases that called `submit` with the started state
  now pass the form state, and apply the answer to `update(onForm)`.
  Nothing else asserted changed.
* **Diverged.** Nothing. The check's errors are computed once and spread
  onto `current` in both answers, a detail the page left open.
* **Dropped.** Nothing.
* **Proof.** `npm run verify` green: typecheck, Biome, Vitest, the 144
  Playwright tests of both projects with no `*.e2e.ts` edited, and the
  build. The scenarios of the manual check are also covered at 390×844 by
  `BookingView.e2e.ts` ("books end to end", "refuses a bad name and a bad
  phone", "a failed booking keeps what was typed, and Try again books"),
  which pass unchanged. The manual check with `npm run dev` is left to the
  person, as the page says.
* **Documents.** docs/01 states that a starter's in-flight state is
  published as an update of the current state, the `{ update, send }`
  shape for a starter that decides whether to send, `submitStarted` as
  the first occurrence and `saveStarted` as the one that still returns a
  whole state. No new term for docs/03; no ADR.
