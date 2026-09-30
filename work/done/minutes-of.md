# minutes-of

**Objective.** The parser that turns a clinic wall time `HH:MM` into
minutes since midnight is written once, as `minutesOf` in
`src/lib/time.ts`, and both features that use it import it. Nobody using
the app sees a change.

**Behaviour.**

The client side and the owner side see no change. This delivery moves one
function.

* The first copy of `minutesOf` is in `weeklyHours/rules.ts`, written by
  `weekly-hours`. The second is in `appointments/rules.ts`, written by
  `book-appointment`. The two bodies are identical. No other file in
  `src/` parses `HH:MM`: `appointments/strings.ts` formats a time and
  `appointments/clinicTime.ts` builds minutes from `Intl` parts, and
  neither is touched.
* After the delivery, neither `rules.ts` declares `minutesOf`. Both import
  it from `src/lib/time.ts`, and every call site stays as written.
* `minutesOf("00:00")` is 0, `minutesOf("09:30")` is 570 and
  `minutesOf("23:55")` is 1435. Each is a new test in
  `src/lib/time.test.ts`.
* Every existing Vitest test and every Playwright test passes, and no
  existing test file is in the diff.
* `npm run dev` behaves exactly as before: the owner saves weekly hours,
  and a client sees the same free slots and books one.

**Contract.** No data, schema, route, request, response or local storage
change. One new file, `src/lib/time.ts`:

```ts
// Minutes since midnight of a clinic wall time "HH:MM" (docs/03,
// WorkingPeriod). It trusts its input: setWeeklyHours checks the time
// before calling it, and freeSlots reads stored periods. First use:
// setWeeklyHours; second use: freeSlots.
export function minutesOf(time: string): number {
	return Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
}
```

| File | Today | After |
|---|---|---|
| `weeklyHours/rules.ts` | local `function minutesOf` | removed; `import { minutesOf } from "../../lib/time.ts";` |
| `appointments/rules.ts` | local `function minutesOf` | removed; `import { minutesOf } from "../../lib/time.ts";` |
| `lib/time.test.ts` | does not exist | the three cases of Behaviour |
| docs/01, `lib/` listing | no `time.ts` | gains `time.ts (minutesOf: a clinic wall time "HH:MM" as minutes since midnight)` |

**Choices made without the stakeholder,** who left them to the agent:

* **`src/lib/time.ts`, not `lib/minutes.ts` and not an export from
  `weeklyHours/rules.ts`.** docs/01 puts code in `lib/` on its second
  concrete use, and this is the second. The file is named after what it
  reads, a time, as `name.ts` and `email.ts` are named after theirs.
  `appointments/rules.ts` already imports the `WorkingPeriod` type from
  `weeklyHours/rules.ts`, but a shared function belongs in `lib/`, not
  in one feature that the other feature reaches into.
* **`minutesOf` stays a plain number, not a `Result`.** Neither caller can
  pass a bad time: `setWeeklyHours` tests `validTime` first, and
  `freeSlots` reads periods that were checked before they were stored. A
  `Result` would add a branch neither caller can take. The comment says
  it trusts its input.
* **`validTime` stays in `weeklyHours/rules.ts`.** It has one use. It
  moves when a second feature needs it, and not before.
* **Not in docs/03.** `minutesOf` is a code helper, not clinic vocabulary.
  docs/03 already defines the `HH:MM` wall time that it reads.
* **The milestone 1.1 paragraph is not edited.** It already has the clause
  "the code repeated across features has one shared copy", and this line
  settles part of it.

**Out of scope.**

* A `Result`-returning or validating parser: no caller needs one (see
  above).
* Moving `validTime`, or a shared formatter for `HH:MM`: each has one use.
* `clinicTime.ts` and `appointments/strings.ts`: they do not parse
  `HH:MM`.
* The shared route errors: that is the `route-errors` line.
* Any hook, view, `*.server.ts` file or dependency.

**Done when.**

* [x] `src/lib/time.ts` exists and exports exactly the `minutesOf` of the
      Contract, with its comment.
* [x] `grep -rn "function minutesOf" src` finds only `src/lib/time.ts`.
* [x] `src/lib/time.test.ts` has the three cases of Behaviour, and they
      pass.
* [x] The only files in the diff under `src/` are `lib/time.ts`,
      `lib/time.test.ts`, `weeklyHours/rules.ts` and
      `appointments/rules.ts`. In the two `rules.ts` files, the only
      changes are the removed function and the added import. `package.json`
      and `package-lock.json` are unchanged.
* [x] docs/01's `lib/` listing names `time.ts`.
* [x] `npm run verify` is green, with three more Vitest tests than before
      and the same number of Playwright tests.
* [ ] Manual check by the person, with `npm run dev` (after
      `npm run setup` in this worktree): on `/owner` save weekly hours
      for a professional at 1280×800, then at 390×844 book one of their
      slots. Each behaves as before.

**What happened.**

* **Built as planned.** `src/lib/time.ts` holds the `minutesOf` of the
  Contract with its comment, and both `rules.ts` files import it. Each
  `rules.ts` diff is the removed function and the added import, nothing
  else; every call site stays as written. Biome accepted the new import
  after `result.ts` without a reformat.
* **Nothing dropped, nothing diverged.** No hook, view, `*.server.ts`
  file, existing test or dependency is in the diff. `package.json` and
  `package-lock.json` are unchanged.
* **Proof.** `npm run verify` green: typecheck, Biome, 331 Vitest tests
  (328 before, plus the three of `lib/time.test.ts`) and 144 Playwright
  tests at both widths (the same count), build. `grep -rn "function
  minutesOf" src` finds only `src/lib/time.ts`. The e2e tests already save
  weekly hours and book a slot. The manual check with `npm run dev` is the
  person's: the agent cannot keep the server running, so that box stays
  open until they do it.
* **Documents.** docs/01: the `lib/` listing names `time.ts`. No docs/03
  change and no ADR, as the page said.
