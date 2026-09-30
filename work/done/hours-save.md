# hours-save

**Objective.** `useWeeklyHours`' save follows the rule docs/01 states for
every event, in the shape `booking-submit` gave `submitStarted`, the first
occurrence. It publishes its in-flight state as an update of the current
state, so a time typed or a period added or removed just before "Save
hours" is not lost. The owner sees no change.

**Behaviour.**

The owner side sees no change. The first four lines below are Vitest tests
in Node in `src/features/weeklyHours/weeklyHoursEvents.test.ts`. They use
plain states and fake repositories: no hook, no DOM, no `vi.mock`.

* `saveStarted`, given a valid week (`loaded`), answers `send: true`. Its
  update, applied to that week with Tuesday's end typed to 19:00 after the
  click, keeps 19:00, clears `refusal` and sets `unreachable: false`. This
  is one of the two new tests the delivery exists for.
* `saveStarted`, given a week whose Monday ends at 09:15 (too short),
  answers `send: false`. Its update, applied to that week with Tuesday's
  end typed to 19:00 after the click, keeps 19:00 and sets `refusal: {
  code: "WorkingPeriodTooShort", key: 0 }` and `unreachable: false`. This
  is the second new test.
* `saveStarted` before the load (`slotMinutes` undefined) answers `send:
  false`, and its update returns the current state unchanged (`toBe`).
* The existing case "clears the old refusal when it sends" reads
  `update(state)` instead of `.state` and asserts the same thing.
* In the hook, `save` reads `state` from the render the person acted on.
  It publishes `saveStarted(state).update` through `setState`. When `send`
  is true, it calls `saving()` on the section and then `save` with that
  same state's periods, as today.
* Saving a valid week, a refused period, a removed professional, an ended
  session and an unreachable server behave exactly as before. Every
  existing Playwright test passes and no `*.e2e.ts` file is edited.

**Contract.** No data, schema, route, request, response or local storage
change. The code shape in `src/features/weeklyHours/weeklyHoursEvents.ts`
follows `submitStarted` in `appointments/bookingEvents.ts`:

```ts
export function saveStarted(state: WeeklyHoursState): {
  update: (current: WeeklyHoursState) => WeeklyHoursState;
  send: boolean;
};
```

* `saveStarted` checks the periods of `state`, the state the person acted
  on, with `setWeeklyHours` and that state's `slotMinutes`. It decides
  `send` and the refused period's `key` from that check.
* Its `update` writes the answer of the check onto `current`:
  `unreachable: false`, plus `refusal: { code, key }` when refused or
  `refusal: undefined` when sending. Every other field of `current`,
  `periods` and `nextKey` included, stays as it is.
* Before the load (`state.slotMinutes` undefined), `update` is `(current)
  => current` and `send` is false.
* The return type is written inline, as `submitStarted`'s is. No shared
  type is declared.
* `save(professionalId, drafts, repositories)` keeps its signature and
  its answer (`WeeklyHoursAnswer`). The hook passes it `state.periods`
  from the state given to `saveStarted`.
* `useWeeklyHours.ts`: `save` does `const started = saveStarted(state);
  setState(started.update);` and returns when `started.send` is false.
  Everything else stays as it is: `state` stays in its dependencies,
  `forward`, `HoursSection`, `sectionRef` and the load effect are not
  touched, and the hook's return value is the same.

**Out of scope.**

* A shared type for `{ update, send }`: a later delivery declares the
  starter shape once, from both occurrences.
* `forward`, the section's reports (`HoursSection`, `WeeklyHoursReport`)
  and `WeeklyHoursAnswer`'s update type: later deliveries change them.
* `sectionRef.current = section`, a ref written during render: it belongs
  to the section's reports, which stay as they are. `m1.1-review` can
  raise it.
* Tests that drive the hook, jsdom, Testing Library, `vi.mock`, or any new
  dependency.
* Disabling the From and To fields while saving: they stay enabled, as
  today.

**Choices made without the stakeholder:**

* **The refusal's `key` comes from the checked state** and is written onto
  `current`. Keys outlive edits, so it names the same period in both. If
  that period was removed meanwhile, the message has no period to sit
  beside and shows nowhere. That is the same as a refusal of a period
  removed after the render today.
* **The milestone 1.1 paragraph gains a clause** for this line, so
  `m1.1-review` checks it.

**Done when.**

* [x] The two new cases and the two changed cases of Behaviour pass in
      `weeklyHoursEvents.test.ts`, with no hook, no DOM and no `vi.mock`.
* [x] `useWeeklyHours.ts` publishes `saveStarted(state).update` and never
      passes a whole state to `setState` in `save`.
* [x] `package.json` and `package-lock.json` are unchanged. No
      `*View.tsx`, `*.e2e.ts` or `*.server.ts` file is in the diff, and
      `useProfessionals.ts` is not in the diff.
* [x] Every other existing Vitest test and every Playwright test passes
      without changing what it asserts.
* [x] docs/01 names `submitStarted` (appointments) as the first occurrence
      of `{ update, send }` and `saveStarted` (weeklyHours) as the second.
      The sentence saying `saveStarted` still returns a whole state is
      gone. It still says a later delivery declares the shape once.
* [x] `npm run verify` is green.
* [ ] Manual check by the person, with `npm run dev`, at 390×844 on
      `/owner`, signed in (open: the person runs it):
  * open "Hours", set Monday 09:00 to 13:00, save, reopen and see it kept;
  * set a Monday period of 09:00 to 09:15, save and see "A period must
    last at least 30 minutes." beside it;
  * stop the server, save and see "The server cannot be reached. Try
    again." with what was typed kept.

  Each behaves as before.

**What happened.**

* **Built as planned.** `saveStarted` answers `{ update, send }`, its
  return type inline as `submitStarted`'s. The check reads the state the
  person acted on; the refusal's `key` comes from that state and is
  written onto `current`. Before the load, `update` is `(current) =>
  current`. `useWeeklyHours`' `save` publishes `started.update` and sends
  `state.periods` from the same render. `save` in `weeklyHoursEvents.ts`
  keeps its signature and gains a comment naming whose periods it sends.
  `forward`, `HoursSection`, `sectionRef` and the load effect are
  untouched.
* **Tests.** Two new cases: "sends the checked week and keeps a time typed
  after the click" and "refuses the checked week and keeps a time typed
  after the click", each asserting the whole updated state with `toEqual`.
  "sends nothing before the load" now also asserts `update(loaded)` is
  `loaded` (`toBe`). "clears the old refusal when it sends" reads
  `update(state)`.
* **Diverged.** The existing case "marks the first refused period and
  sends nothing" also read `.state`, which the page's count of two changed
  cases missed. It now reads `update(state)` and asserts the same thing:
  with two refused periods, the first one is marked. So three cases
  changed their reading, none its claim. It was kept rather than folded
  into the new refusal case, because its claim (the first of two refused
  periods) is not the new case's.
* **Dropped.** Nothing.
* **Proof.** `npm run verify` green: typecheck, Biome, 326 Vitest tests,
  the 144 Playwright tests of both projects with no `*.e2e.ts` edited, and
  the build. The scenarios of the manual check are also covered by
  `WeeklyHoursView.e2e.ts` at 390×844 and 1280×800 (saving a week,
  "refuses a period shorter than the appointment length", "says the server
  cannot be reached at the top when a save fails, keeping what was
  typed"), which pass unchanged. The manual check with `npm run dev` is
  left to the person, as the page says.
* **Documents.** docs/01 names `submitStarted` as the first occurrence of
  `{ update, send }` and `saveStarted` as the second, and says a later
  delivery declares the shape once. docs/06 already carried the milestone
  1.1 clause for this line. No new term for docs/03; no ADR.
