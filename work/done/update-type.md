# update-type

**Objective.** The update type `(current) => State` and the starter shape
`{ update, send }` are each declared once in `src/lib/update.ts`, generic in
the state, and every events file uses them, so no file in `src/features/`
writes either out. Nobody using the app sees a change.

**Behaviour.**

The client side and the owner side see no change. This delivery changes
types only.

* The update type's first occurrence is `bookingEvents.ts`, the first
  events file `orchestrator-tests` wrote. Today it is written out in 8
  events files: the local `type Update` aliases in `professionalsEvents.ts`
  and `ownerEvents.ts`, and inline in `bookingEvents.ts`,
  `weeklyHoursEvents.ts`, `rememberedEvents.ts`, `cancelEvents.ts`,
  `healthEvents.ts` and `clinicEvents.ts`.
* The starter shape's first occurrence is `submitStarted` in
  `bookingEvents.ts`, and its second is `saveStarted` in
  `weeklyHoursEvents.ts`.
* After the delivery, every one of these places uses `Update<S>` or
  `Started<S>` from `src/lib/update.ts`. No function changes its body,
  its parameters or what it returns at run time.
* Every existing Vitest test and every Playwright test passes, and no test
  file is in the diff: none writes either type today.
* `npm run dev` behaves exactly as before, on the home page and on
  `/owner`.

**Contract.** No data, schema, route, request, response or local storage
change. One new file, `src/lib/update.ts`:

```ts
export type Update<S> = (current: S) => S;
export type Started<S> = { update: Update<S>; send: boolean };
```

Each place below imports what it needs with
`import type { ... } from "../../lib/update.ts";`, the path style of
`appointments/rules.ts`:

| File | Today | After |
|---|---|---|
| `appointments/bookingEvents.ts` | `BookingOutcome`'s `{ update: (current: BookingState) => BookingState }` | `{ update: Update<BookingState> }` |
| `appointments/bookingEvents.ts` | `submitStarted`'s inline `{ update: ...; send: boolean }` | `Started<BookingState>` |
| `weeklyHours/weeklyHoursEvents.ts` | `WeeklyHoursAnswer`'s `update: (current: WeeklyHoursState) => WeeklyHoursState` | `update: Update<WeeklyHoursState>` |
| `weeklyHours/weeklyHoursEvents.ts` | `saveStarted`'s inline `{ update: ...; send: boolean }` | `Started<WeeklyHoursState>` |
| `professionals/professionalsEvents.ts` | local `type Update = (current: ProfessionalsState) => ProfessionalsState` | alias removed; `Update<ProfessionalsState>` wherever `Update` was |
| `signIn/ownerEvents.ts` | local `type Update = (current: OwnerState) => OwnerState` | alias removed; `Update<OwnerState>` wherever `Update` was |
| `appointments/rememberedEvents.ts` | `confirm`: `Promise<(current: RememberedState) => RememberedState>` | `Promise<Update<RememberedState>>` |
| `appointments/cancelEvents.ts` | `submit`: `Promise<(current: CancelState) => CancelState>` | `Promise<Update<CancelState>>` |
| `health/healthEvents.ts` | `Promise<(current: HealthState) => HealthState>` | `Promise<Update<HealthState>>` |
| `clinic/clinicEvents.ts` | `Promise<(current: ClinicState) => ClinicState>` | `Promise<Update<ClinicState>>` |

* The event shapes stay as they are, only spelled with the shared types:
  `BookingOutcome` stays a union with `BookingNext`, `WeeklyHoursAnswer`
  stays `{ update, report? }`, and `hoursReported` stays
  `Update | Promise<Update>`.
* The values stay as written: `update: (s) => s` and
  `(current) => current` are functions, not types, and are not touched.
* Starters that return a whole state stay as they are: `submitStarted` in
  `cancelEvents.ts`, `addStarted`, `renameStarted` and `removeStarted` in
  `professionalsEvents.ts`, `confirmStarted` in `rememberedEvents.ts`, and
  `submitSignInStarted` and `submitSignOutStarted` in `ownerEvents.ts`.
* docs/01's `lib/` listing gains `update.ts (Update and Started: the
  answer of an event and of a starter that decides whether to send)`. The
  sentence saying a later delivery declares the starter shape once instead
  says it is declared once, as `Started` in `src/lib/update.ts`.

**Names and files, and why.**

* **`Update<S>`:** docs/01 already calls it "an update", and the two local
  aliases are already named `Update`. So the professionals and signIn
  files keep reading the same word, and only gain the state in brackets.
* **`Started<S>`:** it is what an `<event>Started` function answers, so
  `submitStarted(state): Started<BookingState>` reads as it runs. `Starter`
  would name the function, not what it answers.
* **One file, `src/lib/update.ts`:** `Started` is built on `Update`, and
  they are only ever used together in the events files, as `Result`, `ok`
  and `err` share `result.ts`. `lib/` because docs/01 puts there what two
  features already share, and both types are in more than two.
* **Not in docs/03:** they are code shapes, not clinic vocabulary, just as
  `WeeklyHoursReport` and `BookingOutcome` are not there.

**Out of scope.**

* docs/01 naming every event shape (sync, async, `Update | Promise<Update>`,
  `{ update, report }`, `BookingOutcome`): another delivery.
* Starters that publish a whole state instead of an update (listed in the
  Contract): changing them changes what an event does. `m1.1-review` can
  raise them against docs/01's rule.
* A shared type for `{ update, report }` or for the repositories
  parameter: each has one shape per feature, not a repeated one.
* Any new test, test change, hook, view, `*.server.ts` file or dependency.

**Choices made without the stakeholder:**

* **docs/01's starter sentence is updated** besides the `lib/` listing,
  because after this delivery "a later delivery declares the shape once"
  would be false. It still names `submitStarted` and `saveStarted` as the
  first and second occurrences.
* **The milestone 1.1 paragraph is not edited:** it already holds the
  clause "the code repeated across features has one shared copy", which
  this line settles. The queue line says so.

**Done when.**

* [x] `src/lib/update.ts` exists with exactly the two types of the
      Contract.
* [x] `grep -rnE "\(current: \w+\) => \w+|type Update|send: boolean" src/features`
      finds nothing.
* [x] Every file in the Contract's table imports from `../../lib/update.ts`
      and no other file in `src/features/` is in the diff. No `*.test.ts`,
      `*.e2e.ts`, `use*.ts`, `*View.tsx` or `*.server.ts` file is in the
      diff. `package.json` and `package-lock.json` are unchanged.
* [x] The diff of each events file changes type annotations and imports
      only: no function body changes.
* [x] docs/01's `lib/` listing names `update.ts`, and its starter sentence
      says the shape is declared once as `Started`.
* [x] `npm run verify` is green, with the same number of Vitest and
      Playwright tests as before.
* [ ] Manual check by the person, with `npm run dev`: book and cancel an
      appointment at 390×844, and on `/owner` sign in, add a professional
      and save weekly hours. Each behaves as before.

**What happened.**

* **Built as planned.** `src/lib/update.ts` holds the two types of the
  Contract, and the ten places of the table use them. The local `Update`
  aliases in `professionalsEvents.ts` and `ownerEvents.ts` are gone.
  `hoursReported` answers `Update<ProfessionalsState> |
  Promise<Update<ProfessionalsState>>`. No function body changed.
* **One reformat by Biome.** `BookingOutcome` now fits on one line, so
  Biome folds `{ update: Update<BookingState> } | BookingNext` onto it. It
  is still the same union. `saveStarted`'s signature goes the other way
  and breaks its parameter onto its own line, also Biome's choice.
* **Nothing dropped.** No test, hook, view, `*.server.ts` file or
  dependency is in the diff.
* **Proof.** `npm run verify` green: typecheck, Biome, 328 Vitest tests
  and 144 Playwright tests at both widths (the same counts as
  `hours-report`), build. The Done when grep over `src/features` finds
  nothing. The e2e tests already book, cancel, sign in, add a professional
  and save weekly hours. The manual check with `npm run dev` is the
  person's: the agent cannot keep the server running, so that box stays
  open until they do it.
* **Documents.** docs/01: the `lib/` listing names `update.ts`, and the
  starter sentence says the shape is declared once, as `Started` in
  `src/lib/update.ts`. No docs/03 change and no ADR, as the page said.
