# hours-answer

**Objective.** The type of what `load` and `save` in
`weeklyHoursEvents.ts` answer no longer admits `"saving"`, so the compiler
refuses an answer that would leave the professionals section busy for
good. Nobody using the app sees a change.

**Behaviour.**

The owner side and the client side see no change. This delivery changes
types and docs/01 only.

* Today `WeeklyHoursAnswer`'s `report` is a `WeeklyHoursReport`, which
  `hours-report` widened with `"saving"`. So the types let `load` or `save`
  answer `"saving"`. The hook would pass it to the section,
  `hoursReported("saving")` would set `busy: true`, and no later report
  would clear it: the section would stay busy until the page is reloaded.
* The code never does it. `load` answers a `SectionRefusal` or no report;
  `save` answers `"saved"`, `"failed"` or a `SectionRefusal`. `"saving"` is
  a report only `useWeeklyHours` makes, in `save`, before a save it sends.
* After the delivery, `WeeklyHoursAnswer`'s `report` is a
  `WeeklyHoursAnswerReport`, which has no `"saving"`, and `npm run
  verify`'s typecheck passes with it.
* `HoursSection.report` and `hoursReported` still take a
  `WeeklyHoursReport`, which is a `WeeklyHoursAnswerReport` or `"saving"`:
  the same four values plus `"saving"` as today.
* `load` and `save` answer exactly what they answer today, and the hook
  reports exactly as today. No function body changes.
* Every existing Vitest and Playwright test passes, and no test file is in
  the diff. No new test: typecheck is the check.

**Contract.** No data, schema, route, request, response, local storage,
event or hook change. The type shapes:

`src/features/weeklyHours/weeklyHoursEvents.ts`, in place of today's
`WeeklyHoursReport` and `WeeklyHoursAnswer` (lines 38 to 45):

```ts
// What a load or a save answers. "saving" is not one: only the hook
// reports it, before a save it sends.
export type WeeklyHoursAnswerReport = "saved" | "failed" | SectionRefusal;

// What the editor reports to the professionals section, which holds the busy
// state, the open row and the messages above the list.
export type WeeklyHoursReport = "saving" | WeeklyHoursAnswerReport;

export type WeeklyHoursAnswer = {
	update: Update<WeeklyHoursState>;
	report?: WeeklyHoursAnswerReport;
};
```

* The comment "What the editor reports..." keeps its only copy, on
  `WeeklyHoursReport`, word for word.
* `SectionRefusal` is still imported from `./api.ts`, as a type.
* `load` and `save` keep their signatures,
  `Promise<WeeklyHoursAnswer>`, and their bodies.

Unchanged, and not in the diff:

* `src/features/weeklyHours/useWeeklyHours.ts`: `HoursSection.report` takes
  `WeeklyHoursReport`; `if (report) sectionRef.current.report(report)`
  passes a `WeeklyHoursAnswerReport`, which is a `WeeklyHoursReport`.
* `src/features/professionals/professionalsEvents.ts`: `hoursReported`
  takes `WeeklyHoursReport`.
* `src/features/weeklyHours/api.ts`: `SectionRefusal` stays where it is.

*docs/01, shape 6* of "Event shapes". Its lines from "6. **Answer that
carries a report.**" to "occurrence: `load` and `save` in
`weeklyHoursEvents.ts`." (today lines 148 to 156) become exactly:

```
6. **Answer that carries a report.**
   `async <event>(...inputs, repositories): Promise<WeeklyHoursAnswer>`,
   where `WeeklyHoursAnswer` is
   `{ update: Update<WeeklyHoursState>; report?: WeeklyHoursAnswerReport }`.
   Used when an editor inside another section tells that section what
   happened, because the section holds the busy state, the open row and
   the messages. The hook publishes the update, then passes the report to
   the section; before a save it sends, it reports `saving` itself. The
   section takes a `WeeklyHoursReport`, which is a
   `WeeklyHoursAnswerReport` or `saving`; an answer cannot carry `saving`,
   which would leave the section busy. Only occurrence: `load` and `save`
   in `weeklyHoursEvents.ts`.
```

Shape 7 stays word for word: "the section that receives shape 6's report"
is still true, as a `WeeklyHoursAnswerReport` is a `WeeklyHoursReport`.

*docs/06*, milestone 1.1: the line below, right after `busy-fields` and
before `m1.1-review` (written by this /propose, marked `[>]`), and the
clause of the paragraph below.

```
[>] hours-answer         WeeklyHoursAnswer's report type leaves out "saving", which only useWeeklyHours reports before a save it sends
```

**The name, and why.** `WeeklyHoursAnswerReport` is the report a
`WeeklyHoursAnswer` carries: the reader who meets `report?:` on the answer
reads the answer's name in its type. It keeps the `WeeklyHours` prefix of
its neighbours (`WeeklyHoursState`, `WeeklyHoursAnswer`,
`WeeklyHoursReport`). `WeeklyHoursReport` keeps its name, since
`HoursSection`, `hoursReported` and docs/06's `hours-report` line already
use it for what the section receives. Rejected: `WeeklyHoursOutcome`, which
suggests the whole result, update included; `SaveReport`, since `load`
answers it too. Not in docs/03: it is a code shape, not clinic vocabulary,
as `WeeklyHoursReport` and `Update` are not there.

**Out of scope.**

* Any change to a function body, the hook, the view or the section: the
  app behaves exactly as before.
* A new test, `@ts-expect-error`, a module mock or a dependency: the
  person asked that typecheck be the check.
* Checking that a `"saving"` answer fails to compile, even by a
  temporary edit: the typecheck in `npm run verify` is the check, and
  /apply edits no function body, not even for a moment.
* Narrowing `load`'s answer further (it never answers `"saved"` or
  `"failed"`): one type per shape 6, as asked.
* Moving `SectionRefusal` out of `api.ts`: it is still an API refusal.
* The stale-answer guards of the save and of the section's reload on
  `ProfessionalNotFound`: another question.
* Shape 7's text and every page in `work/done/`: still true, or a record
  of what was built then.

**Choices made without the stakeholder:**

* **The name `WeeklyHoursAnswerReport`,** for the reasons above.
* **Declared above `WeeklyHoursReport`,** so each type is read after the
  one it is built on, and with its own comment saying why `"saving"` is not
  in it.
* **Docs/01's shape 6 also says why** an answer cannot carry `saving`,
  besides naming the type, so the rule is not only in the code.
* **The milestone 1.1 paragraph gains a clause** for this line, so
  `m1.1-review` checks it, as `hours-save` and `busy-fields` did.

**Done when.**

* [x] `weeklyHoursEvents.ts` declares `WeeklyHoursAnswerReport` and
      `WeeklyHoursReport` exactly as the Contract says, and
      `WeeklyHoursAnswer`'s `report` is `WeeklyHoursAnswerReport`.
* [x] `grep -rn "What the editor reports" src` finds one line.
* [x] The diff of `src/` is `weeklyHoursEvents.ts` only, and changes types
      and comments only. No `*.test.ts`, `*.e2e.ts`, `use*.ts`,
      `*View.tsx`, `*.server.ts`, `api.ts`, `package.json` or
      `package-lock.json`.
* [x] docs/01's shape 6 reads as the Contract says; shape 7 is unchanged.
* [x] `npm run verify` is green, with the same numbers of Vitest and
      Playwright tests as `busy-fields` (328 and 144 unless `busy-fields`
      recorded others).
* [x] docs/06: the line is `[x]`, between `busy-fields` and
      `m1.1-review`, and the page is in `work/done/`.
* [x] Staged with plain `git add -A`, then `git status --short`, both run
      without `-C`.
* [x] No em dash in the new text.

## What happened

**Built.** In `weeklyHoursEvents.ts`, `WeeklyHoursAnswerReport` declared
above `WeeklyHoursReport` with its own comment, `WeeklyHoursReport` now
`"saving" | WeeklyHoursAnswerReport` with its comment kept word for word,
and `WeeklyHoursAnswer`'s `report` typed `WeeklyHoursAnswerReport`. No
function body, hook, view or test changed. docs/01's shape 6 reads as the
Contract says; shape 7 is untouched.

**Diverged from the plan, and why.** Nothing. No abstraction: one type
split in two, whose only occurrence is still `load` and `save`.

**Dropped.** Nothing.

**What the proof found.** No screen changes, so no screenshot. `npm run
verify` is green: typecheck accepts `load` and `save` against the narrower
type, and 328 Vitest and 144 Playwright tests pass, the same numbers as
`busy-fields`. `grep -rn "What the editor reports" src` finds one line.

**Decisions.** No ADR. Nothing enters docs/03, as the page says. Living
documents changed: docs/01 (shape 6) and docs/06.
