# hours-report

**Objective.** The weekly hours editor reports to the professionals section
through one path: one report type, one member of `HoursSection`, one event
in `professionalsEvents.ts`, tested in Node. This finishes what
`orchestrator-tests` left in `useWeeklyHours`: `forward` and the `saving()`
call, which had no test. The owner sees no change.

**Behaviour.**

The owner side sees no change. The first five lines below are Vitest tests
in Node in `src/features/professionals/professionalsEvents.test.ts`, using
plain states and fake repositories: no hook, no DOM, no `vi.mock`. They
replace the tests of `hoursSaving`, `hoursSaved`, `hoursFailed` and
`hoursRefused` and assert the same states.

* `hoursReported("saving", fake({}))`, applied to the section with Rui's
  hours row open, gives `busy: true`. No repository is called.
* `hoursReported("saved", fake({}))`, applied to that saving state, gives
  `busy: false, row: undefined`. No repository is called.
* `hoursReported("failed", fake({}))`, applied to that saving state, gives
  `busy: false, row: { id: 3, mode: "hours" }`. No repository is called.
* `hoursReported("NotSignedIn", fake({}))`, applied to that saving state,
  gives `busy: false, error: "NotSignedIn", row: { id: 3, mode: "hours" }`.
  No repository is called.
* `hoursReported("ProfessionalNotFound", …)` with `fetchProfessionals`
  answering `[ana]`, applied to that saving state, gives the reloaded list
  with `error: "ProfessionalNotFound"`. This is the case "reported by the
  hours editor, reloads the list and says so" in the `ProfessionalNotFound`
  block, rewritten with `hoursReported`. The saving state it is applied to
  comes from `hoursReported("saving", fake({}))`.
* The cases "opens the hours row and clears the message" and "close closes
  the row and clears the message" stay as they are.
* Opening the hours, saving a valid week, a refused period, a removed
  professional (on load and on save), an ended session and an unreachable
  server behave exactly as before. Every existing Playwright test passes and
  no `*.e2e.ts` file is edited.

**Contract.** No data, schema, route, request, response or local storage
change. The code shapes:

`src/features/weeklyHours/weeklyHoursEvents.ts`

```ts
// What the editor reports to the professionals section, which holds the busy
// state, the open row and the messages above the list.
export type WeeklyHoursReport = "saving" | "saved" | "failed" | SectionRefusal;
```

* This comment is its only copy. The copy above `HoursSection` in
  `useWeeklyHours.ts` goes.
* `WeeklyHoursAnswer`, `load`, `save`, `saveStarted` and their tests are
  unchanged. `load` and `save` never answer `"saving"`; the type allows it,
  and no `Exclude` is written for it.

`src/features/weeklyHours/useWeeklyHours.ts`

```ts
export type HoursSection = {
  report: (report: WeeklyHoursReport) => void;
  close: () => void;
};
```

* `forward` is deleted. The load and `save` call
  `sectionRef.current.report(report)` when the answer has a report, passing
  it as it came.
* `save` keeps its order: `saveStarted(state)`, publish `started.update`,
  return when `send` is false, then `sectionRef.current.report("saving")`,
  then `save(professionalId, state.periods)`, publish its update, and pass
  its report.
* `close` stays the Cancel button's callback; `WeeklyHoursView.tsx` is not
  in the diff.

`src/features/professionals/professionalsEvents.ts`

```ts
export function hoursReported(
  report: WeeklyHoursReport,
  repositories = professionalsRepositories,
): Update | Promise<Update>;
```

* Every report answers an `Update` at once, except `"ProfessionalNotFound"`,
  the only one that needs the repositories, which answers a
  `Promise<Update>` resolved after the reload.

* `"saving"` gives `started(s)`: busy, message cleared, as `hoursSaving`
  does today.
* `"saved"` gives `busy: false, row: undefined`.
* `"failed"` gives `busy: false`.
* `"ProfessionalNotFound"` gives `reloadGone(repositories)`.
* `"NotSignedIn"` gives `busy: false, error: "NotSignedIn"`.
* `hoursSaving`, `hoursSaved`, `hoursFailed` and `hoursRefused` are
  deleted. `WeeklyHoursReport` is imported as a type from
  `../weeklyHours/weeklyHoursEvents.ts`, in place of `SectionRefusal` from
  `../weeklyHours/api.ts`.
* The comment above the event says that the hours editor fetches and
  saves on its own and reports here, and which answer waits. It does not
  repeat what the section holds, which is on `WeeklyHoursReport`.

`src/features/professionals/useProfessionals.ts`

```ts
const hours: HoursSection = useMemo(
  () => ({
    report: (report) => {
      const answer = hoursReported(report);
      if (typeof answer === "function") setState(answer);
      else answer.then(setState);
    },
    close,
  }),
  [close],
);
```

* The hook's return value keeps the same keys.

**Where `HoursSection` lives.** It stays in `useWeeklyHours.ts`. It is a
React callback interface: the hook's parameter and the view's `section`
prop. The events file speaks data (`WeeklyHoursReport`), not callbacks, as
`orchestrator-tests` decided. `useProfessionals.ts` keeps importing it from
there, as today.

**What the hook still decides.** Covered by no test, since no test drives
the hook:

* **The order in `save`:** reporting `"saving"` only when `send` is true,
  and before the call.
* **Whether an answer has a report:** it calls `report` only when there is
  one.
* **The `active` guard of the load:** an answer that arrives after the
  professional changed, or after the editor closed, is dropped, its report
  included.
* **`sectionRef`:** it holds the latest section. It is still written during
  render.

**Out of scope.**

* A shared type for `{ update, send }` (`submitStarted`, `saveStarted`): a
  later delivery declares the starter shape once.
* `WeeklyHoursAnswer`'s update type, and docs/01 naming every event shape:
  another delivery does that.
* `sectionRef.current = section`, a ref written during render: this
  delivery keeps it. `m1.1-review` can raise it.
* Making `saveStarted` answer the `"saving"` report: that would change its
  shape, which stays.
* A stale-answer guard for the section's reload on `ProfessionalNotFound`:
  there is none today, and this delivery adds none.
* Tests that drive the hook, jsdom, Testing Library, `vi.mock`, or any new
  dependency.

**Choices made without the stakeholder:**

* **The event is named `hoursReported`,** after the report it receives.
  It is not a docs/03 term, as `WeeklyHoursReport` is not one.
* **The event was planned async for every report.** The person chose the
  synchronous option during /apply: see What happened.
* **The saving state in the tests comes from `hoursReported("saving")`**
  applied to the open row, so every case of the block goes through the
  one event.
* **`SectionRefusal`'s re-export in `weeklyHoursEvents.ts`** stays only if
  something still imports it from there after the change. Otherwise it
  goes.
* **The milestone 1.1 paragraph gains a clause** for this line, so
  `m1.1-review` checks it.

**Done when.**

* [x] The cases of Behaviour pass in `professionalsEvents.test.ts`, with
      no hook, no DOM and no `vi.mock`. No test names `hoursSaving`,
      `hoursSaved`, `hoursFailed` or `hoursRefused`, and no other test
      changes what it asserts.
* [x] `forward` is gone. `HoursSection` has exactly `report` and `close`.
      `grep -rn "What the editor reports" src` finds one line.
* [x] `package.json` and `package-lock.json` are unchanged. No `*View.tsx`,
      `*.e2e.ts`, `*.server.ts`, `api.ts` or `rules.ts` file is in the
      diff.
* [x] `npm run verify` is green.
* [ ] Manual check by the person, with `npm run dev`, at 390×844 on
      `/owner`, signed in:
  * open "Hours", set Monday 09:00 to 13:00, save, and see the row close;
    reopen and see it kept;
  * open "Hours" for a professional, remove that professional in another
    tab, save, and see the list reloaded with the "not found" message;
  * stop the server, save, and see "The server cannot be reached. Try
    again." with the row still open.

  Each behaves as before.
* [x] docs/06: the line is `[x]` and the page is in `work/done/`. No
      docs/01 or docs/03 change is expected; if one proves needed, it is
      recorded under What happened.

**What happened.**

* **Built as planned.** `WeeklyHoursReport` gains `"saving"` and keeps the
  comment's only copy; `HoursSection` is `{ report, close }`; `forward` is
  gone and the hook calls `sectionRef.current.report(report)` when an
  answer has one; `hoursReported` replaces the four events, and
  `useProfessionals` passes every report to it.
* **Synchronous reports, at the person's request.** After the first build,
  the person asked for the page's synchronous option, so the Save button
  disables in the same render as before and a double click cannot send
  the week twice. `hoursReported` stays the one event but is no longer
  `async`: it answers `Update | Promise<Update>`. `"saving"`, `"saved"`,
  `"failed"` and `"NotSignedIn"` answer an `Update` at once. Only
  `"ProfessionalNotFound"`, which needs the repositories, answers a
  promise. This differs from the option as the page first wrote it in two
  ways. It answers an `Update`, not a `ProfessionalsState`, because the
  hook has no current state to pass in, only `setState`. And
  `"NotSignedIn"` is synchronous too, since only the reports that need the
  repositories may wait. `useProfessionals` applies an `Update` with
  `setState` at once and waits only for a promise. The Contract above
  shows the shape as built.
* **`SectionRefusal`'s re-export** in `weeklyHoursEvents.ts` went: after the
  change nothing imported it from there. The file still imports it from
  `api.ts` for `WeeklyHoursReport`.
* **Tests.** The block "the hours editor's reports" now has one case per
  report ("saving is busy, at once", "saved closes the row, at once",
  "failed keeps the row open, at once", "NotSignedIn shows the code above
  the list, at once"), each applied to a saving state made by
  `hoursReported("saving", fake({}))`. A helper, `atOnce`, fails the test
  if a report answers a promise instead of an update. `fake({})` throws on
  any repository call, which is how "no repository is called" is checked.
  The `ProfessionalNotFound` case was rewritten in place and also checks
  that its answer is a promise. The two cases on opening and closing are
  unchanged.
* **Proof.** `npm run verify` green: typecheck, Biome, 328 Vitest tests,
  the 144 Playwright tests at both widths, build. The e2e tests already
  drive the three manual scenarios ("saving the hours of one removed
  meanwhile says so and reloads the list", "says the server cannot be
  reached at the top when a save fails, keeping what was typed", the valid
  week saved and kept) and "disables every button of the editor while a
  save is in flight". The
  manual check with `npm run dev` is the person's: the agent cannot keep
  the server running, so that box stays open until they do it.
* **Documents.** No docs/01, docs/03 or ADR change: no document named the
  old section callbacks. docs/01 describes an event as either sync
  (`=> State`) or async (`=> Promise<Update>`). `hoursReported`, which
  answers `Update | Promise<Update>`, fits neither. Naming every event
  shape in docs/01 is out of scope here and belongs to that later
  delivery, which should include this one.
