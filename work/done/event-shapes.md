# event-shapes

**Objective.** A person writing or reading a client orchestrator finds in
docs/01 every shape an event function takes in the code, when each is
used and which file holds its first occurrence, so the booking and the
weekly hours no longer contradict the one shape docs/01 gives today.
Nobody using the app sees a change.

**Behaviour.**

The client side and the owner side see no change. This delivery changes
docs/01 and docs/06 only.

* Today docs/01 gives one shape for an event with a call (a Started
  function and an update `(current) => State`) and the starter that
  decides whether to send. The other shapes the events files use are
  written only in `work/done/` (`orchestrator-tests`, `hours-report`,
  `update-type`).
* After the delivery, every function that
  `grep -nE "^export (async )?function" src/features/*/*Events.ts` finds
  (57 today) is either an event of exactly one numbered shape of the
  Contract, or one of the three values worked out for the view:
  `daysOf`, `tooLateToCancel`, `linesOf`. `retryOf` belongs to shape 5.
* Each shape names its signature, when it is used, how the hook publishes
  it, and the file of its first occurrence, as a function name in a file.
* The assignment of the 57 functions, which /apply checks against the
  code and the new text:

  | Shape | Functions |
  |---|---|
  | 1 with state | booking `pickDay`, `pickTime`, `back`, `typeName`, `typePhone`, `done`; cancel `typePhone`, `typeCode`; remembered `ask`, `keep`; professionals `typeAddName`, `openRename`, `typeRename`, `openRemove`, `close`, `openHours`; weekly hours `addPeriod`, `typeTime`, `removePeriod` |
  | 1 without state | cancel `open`, `close` |
  | 2 | cancel `submitStarted`, `submit`; remembered `confirmStarted`, `confirm`; professionals `addStarted`, `add`, `renameStarted`, `rename`, `removeStarted`, `remove`; owner `submitSignInStarted`, `submitSignIn`, `submitSignOutStarted`, `submitSignOut` |
  | 3 | professionals `load`; owner `checkSession`; clinic `load`; health `check` |
  | 4 | booking `submitStarted`; weekly hours `saveStarted` |
  | 5 | booking `loadProfessionalsStarted`, `loadProfessionals`, `loadSlotsStarted`, `loadSlots`, `submit`, `retryOf` (and `submitStarted`, shape 4) |
  | 6 | weekly hours `load`, `save` |
  | 7 | professionals `hoursReported` |
  | 8 | remembered `initialRememberedState`, `reread` |
  | not an event | booking `daysOf`, `tooLateToCancel`; remembered `linesOf` |

* Every existing Vitest and Playwright test passes, and no file in `src/`
  is in the diff.

**Contract.** No data, schema, route, request, response, local storage or
code change. Two documents change.

*docs/01, the orchestrator bullet* of "How the code is organized: FOCUS".
Its lines from "`<name>Events.ts` holds every event" to "`src/lib/update.ts`."
(today lines 72 to 84) become exactly:

```
* A client orchestrator is split in two. `<name>Events.ts` holds every
  event as a plain function, in one of the shapes of "Event shapes"
  below.
```

The rest of the bullet ("The event functions receive their
repositories..." to "...except `onRememberedChange`.") stays word for word.

*docs/01, a new subsection* `### Event shapes`, placed at the end of
"How the code is organized: FOCUS", after the bullet "Code moves to
`lib/` on its second concrete use, not before." and before
`## How data is accessed`. Its text, exactly (wrapped at 76 columns as
the rest of the file):

```
### Event shapes

Every exported function of a `<name>Events.ts` file is an event of one
shape below, or a value worked out for the view, which is not an event:
`daysOf`, `tooLateToCancel` and `linesOf`. `S` is the hook's state. The
repositories come last, the real ones by default; `now` is there only
when a use case or a repository needs the clock. The eight events files
were written together by `orchestrator-tests`, in the order `booking`,
`cancel`, `remembered`, `professionals`, `weeklyHours`, `owner`,
`clinic`, `health`; that order decides which is the first occurrence. A
new event takes one of these shapes; a delivery that needs another adds
it here, with its first occurrence.

1. **Event with no call.** `(state: S, ...inputs) => S`. Used when the
   event only changes what is on screen: typing, picking, opening,
   closing. The hook publishes it as an update,
   `setState((s) => event(s, ...inputs))`. First occurrence: `pickDay` in
   `bookingEvents.ts`. When the answer does not depend on the state, the
   event takes none, `(...inputs) => S`, and the hook publishes the
   value: first occurrence `open` and `close` in `cancelEvents.ts`.
2. **Call with a Started and an update.**
   `<event>Started(state: S, ...inputs): S` gives the in-flight state, and
   `async <event>(...inputs, now?, repositories): Promise<Update<S>>`
   makes the call and resolves to an update, so what was typed meanwhile
   survives. Used when an action calls a repository and nothing is
   checked before sending. The hook publishes the in-flight state as an
   update, then the answer. First occurrence: `submitStarted` and
   `submit` in `cancelEvents.ts`. When the in-flight state does not
   depend on the state, the starter takes none and the hook publishes the
   value: `submitSignInStarted` and `submitSignOutStarted` in
   `ownerEvents.ts`.
3. **Load at mount.** `async <event>(repositories): Promise<Update<S>>`,
   with no Started. Used for the first read of a screen: the in-flight
   state is the initial state, `initial<Name>State`, so nothing is
   published before the call. The hook runs it in a `useEffect` and drops
   the answer when its `active` flag says the screen is gone. First
   occurrence: `load` in `professionalsEvents.ts`. The booking's first
   load is shape 5, and the weekly hours' is shape 6.
4. **Starter that decides whether to send.**
   `<event>Started(state: S): Started<S>`, followed by the call. Used when
   a rule is checked on the client before sending, to show its message
   beside the field. It checks the state the person acted on, `send` says
   at once whether to call, `update` writes the answer of the check onto
   the current state, and the call sends the state that was checked.
   First occurrence: `submitStarted` in `bookingEvents.ts`; the second is
   `saveStarted` in `weeklyHoursEvents.ts`, so the shape is declared
   once, as `Started` in `src/lib/update.ts`.
5. **Answer that may be the next event.**
   `async <event>(...inputs, now?, repositories): Promise<BookingOutcome>`,
   where `BookingOutcome` is `{ update: Update<BookingState> }` or a
   `BookingNext`, which names a call and its inputs: `loadProfessionals`,
   `loadSlots` or `submit`. Used when a refusal must show a step loading
   again (after `SlotTaken` or `ProfessionalNotFound`), which one update
   cannot publish. The hook runs a `BookingNext` as any event: its
   Started, then the call under a new `latest` number, then the update or
   the next event. `retryOf(state): BookingNext | undefined` names the
   call "Try again" repeats. Only occurrence: `bookingEvents.ts`.
6. **Answer that carries a report.**
   `async <event>(...inputs, repositories): Promise<WeeklyHoursAnswer>`,
   where `WeeklyHoursAnswer` is
   `{ update: Update<WeeklyHoursState>; report?: WeeklyHoursReport }`.
   Used when an editor inside another section tells that section what
   happened, because the section holds the busy state, the open row and
   the messages. The hook publishes the update, then passes the report to
   the section; before a save it sends, it reports `saving` itself. Only
   occurrence: `load` and `save` in `weeklyHoursEvents.ts`.
7. **Report received.**
   `<event>(report, repositories): Update<S> | Promise<Update<S>>`. Used
   by the section that receives shape 6's report: the answer is an update
   at once, so a button disables in the same render, or a promise when
   the report needs a call. The hook publishes a function at once and a
   promise when it resolves. Only occurrence: `hoursReported` in
   `professionalsEvents.ts`.
8. **Call that does not wait.** `(state, now, repositories) => S`, or
   `(now, repositories) => S` for the first state. Used when the
   repository is local storage, which answers at once, so there is no
   in-flight state. The hook gives `initialRememberedState` to `useState`
   and publishes `reread` as an update on each `onRememberedChange`. Only
   occurrence: `rememberedEvents.ts`.
```

*docs/06*, milestone 1.1, a new line right after `update-type` and
before `m1.1-review` (written by this /propose, marked `[>]`):

```
[>] event-shapes         docs/01 names every event shape the code uses, when each is used and its first occurrence
```

**Where in docs/01, and why.**

* **A subsection after the bullets, not inside the orchestrator
  bullet.** The bullet is where docs/01 already describes the shapes, but
  eight numbered shapes do not fit in one bullet. The bullet points to
  the subsection, so the shapes are written in one place only.
* **At the end of "How the code is organized: FOCUS", not in a new
  `##` section.** The shapes belong to the Orchestrator row of that
  section's table. A reader building an orchestrator is already there.
* **The starter sentence moves into shape 4 unchanged in meaning.** It
  still names `submitStarted` first and `saveStarted` second, as
  `update-type` left it.

**Out of scope.**

* Any change in `src/`, any test, any dependency: the user asked for
  documentation only.
* Making a shape uniform, for example turning the owner's starters that
  take no state into updates: that changes code, and each is equivalent
  today because it does not read the state.
* A shared type for `BookingOutcome`, `WeeklyHoursAnswer` or the report
  shape: each has one occurrence.
* The stale-answer guards: they are named only where a shape needs them
  (`latest` in shape 5, `active` in shape 3). Documenting which hooks have
  none is another question.
* docs/03: shapes are code, not clinic vocabulary, as `update-type`
  decided for `Update` and `Started`.
* The milestone 1.1 paragraph: not edited (see the choices below).

**Choices made without the stakeholder:**

* **The first occurrence is decided by the file order of
  `orchestrator-tests`**, since the eight events files were born in one
  commit. It is the order `update-type` used when it called
  `bookingEvents.ts` "the first events file". Before that commit,
  `professionals` was older than `booking` in the hooks, so this order
  differs from the order of the features.
* **Shape 7, `hoursReported`, is its own shape.** The stakeholder's list
  did not name it, but it answers `Update | Promise<Update>`, which no
  other shape does.
* **Owner's stateless starters are a variant of shape 2**, and cancel's
  `open` and `close` a variant of shape 1, not shapes of their own: the
  hook publishes their value, which equals an update that ignores the
  current state.
* **The subsection says a new shape is added there with its first
  occurrence.** This follows AGENTS.md ("documents are living", "the
  delivery says which was the first") and is not a new rule of process.
* **The milestone 1.1 paragraph is not edited.** The stakeholder asked
  for the queue line only. Without a clause in the paragraph,
  `m1.1-review` does not check this line clause by clause.

**Done when.**

* [x] docs/01's orchestrator bullet reads as the Contract says, and the
      rest of that bullet is unchanged.
* [x] docs/01 has `### Event shapes` with the Contract's text, between
      "Code moves to `lib/`..." and `## How data is accessed`.
* [x] Each of the 57 functions the grep finds today matches the shape
      the Behaviour table gives it, checked by reading its signature and
      its hook. A mismatch is fixed in the text, not in the code, and
      recorded under What happened. (The grep finds 55, see What
      happened.)
* [x] docs/01 still mentions `Started`, `src/lib/update.ts`,
      `submitStarted` first and `saveStarted` second.
* [x] The docs/06 line is `[x]` and sits between `update-type` and
      `m1.1-review`.
* [x] `git diff --stat` lists only `docs/01-Architecture.md`,
      `docs/06-Queue.md` and the page's move to `work/done/`. No file in
      `src/`.
* [x] `npm run verify` is green, with the same numbers of Vitest and
      Playwright tests as `update-type` (328 and 144).
* [x] No em dash in the new text.

**What happened.**

* **Built as planned.** docs/01's orchestrator bullet now points to "Event
  shapes", and the subsection holds the Contract's text word for word, at
  the end of "How the code is organized: FOCUS". The rest of the bullet
  is unchanged. docs/06's line is `[x]`.
* **The count was wrong, the table was right.** The grep finds 55
  functions, not 57: shape 2 holds 14 functions (cancel 2, remembered 2,
  professionals 6, owner 4), not 16, and the page's total was summed from
  the rows. Per file: booking 15, cancel 6, remembered 7, professionals
  14, weeklyHours 6, owner 5, clinic 1, health 1. Every one of the 55 is
  in the table once, and no function is missing from it. docs/01 states
  no count, so no document changes for it.
* **Every function matches its shape**, read in its signature and its
  hook. Shape 1: `back`, `done` and professionals' `close` are passed to
  `setState` as they are, which is the same update with no inputs. Shape
  5: `loadSlots` answers a `BookingNext` after `ProfessionalNotFound`,
  `submit` after `ProfessionalNotFound` and `SlotTaken`; the Started of
  `loadProfessionals` and `loadSlots` take the state and one input, as in
  shape 2. Shape 8: `useRemembered` gives `initialRememberedState` to
  `useState` through a lazy initializer. The first occurrences follow the
  order of `orchestrator-tests`, whose eight files were added in one
  commit. No mismatch, so the Contract's text went in unchanged.
* **Nothing dropped.** No file in `src/`, no test, no dependency.
* **Proof.** `npm run verify` green: typecheck, Biome, 328 Vitest tests
  and 144 Playwright tests at both widths (the same counts as
  `update-type`), build. The staged stat lists `docs/01-Architecture.md`,
  `docs/06-Queue.md` and `work/done/event-shapes.md`, no file in `src/`.
  At first the session could not approve commands, so verify and the
  staging ran in a second turn, at the person's request.
* **The move is a plain `mv`, not `git mv`.** The page was never
  committed (`/propose` left it untracked), so `git mv` refused it. Git
  records it as a new file in `work/done/`, not as a rename.
* **Documents.** docs/01 (the bullet and the new subsection) and docs/06.
  No docs/03 change and no ADR, as the page said.
