# busy-fields

**Objective.** While a save of weekly hours or a booking is in flight, the
owner cannot change a From or To time and the client cannot change their
name or phone, so what the screen shows is what was sent.

**Behaviour.**

Today the weekly hours editor's From and To inputs and the booking form's
name and phone inputs stay enabled while a call is in flight, though the
buttons beside them are disabled. A time typed during a save is shown but
not sent, and "saved" closes the editor and drops it without a word. A
name or phone changed during a booking is shown but was not booked.

* Owner, weekly hours: while "Save hours" is in flight, every From and
  To input of the editor is disabled, as every button of the editor
  already is. When the save answers, they are enabled again if the editor
  is still open (a refusal, an unreachable server).
* Client, booking form: while "Book" is in flight (also after "Try
  again"), the name and phone inputs are disabled, as "Book" and "Back"
  already are. When the booking is refused or fails, they are enabled
  again with what was sent in them.
* Nothing else changes. The cancel form's phone and booking code, the
  professionals section's name and new name, and the owner's email and
  password keep their current behaviour.
* Playwright, `WeeklyHoursView.e2e.ts`: the test "disables every button
  of the editor while a save is in flight" becomes "disables every button
  and time input of the editor while a save is in flight". It keeps its
  button assertions and also asserts that the editor's From and To inputs
  (two, for the one Monday period it sets) are disabled.
* Playwright, `BookingView.e2e.ts`: the test "disables Book and Back while
  a booking is in flight" becomes "disables Book, Back, name and phone
  while a booking is in flight". It keeps its two button assertions and
  also asserts that "Your name" and "Phone number" are disabled.
* Vitest, `bookingEvents.test.ts`: "sends the checked form and keeps a
  name typed after the click" becomes "sends the checked form and marks
  it busy". It asserts `send` is true and that the update applied to
  `onForm`, the state that was checked, equals `{ ...onForm, nameError:
  undefined, phoneError: undefined, busy: true, failed: undefined }`. No
  edit after the click appears in it.
* Vitest, `weeklyHoursEvents.test.ts`: "sends the checked week and keeps
  a time typed after the click" becomes "sends the checked week and
  clears its refusal and unreachable". With `acted = { ...loaded,
  unreachable: true }`, it asserts `send` is true and that `update(acted)`
  equals `{ ...acted, unreachable: false, refusal: undefined }`. No edit
  after the click appears in it.
* Unchanged: "refuses the checked week and keeps a time typed after the
  click" (weeklyHoursEvents) and "keeps a name typed in flight through a
  taken slot" (bookingEvents). Every other Vitest and Playwright test
  passes without changing what it asserts.

**Contract.** None. No data, schema, route, request, response, local
storage, event, hook or starter change. The view changes are exactly:

* `src/features/weeklyHours/WeeklyHoursView.tsx`: the From and To
  `<input type="time">` take `disabled={busy}`, where `busy` is the
  `busy` prop the section passes, the same value its buttons use.
* `src/features/appointments/BookingView.tsx`: the `#client-name` and
  `#client-phone` inputs take `disabled={busy}`, where `busy` is
  `state.busy` of `useBooking`, the same value "Book" and "Back" use.

Every starter's update is still applied to the current state, as docs/01
says. Its sentence "so what was typed meanwhile survives" stays: the
cancel form and the professionals section still rely on it.

**States.**

* Busy: in the weekly hours editor, every button and every From and To
  input is disabled. In the booking form, "Book", "Back", the name and
  the phone are disabled.
* Empty, loading, error, offline: as today.

**Visual reference.** No design file. The browser's default look for a
disabled input; no style is added. Screenshots of the in-flight state:
the booking form at 390×844; the weekly hours editor at 390×844 and
1280×800.

**Out of scope.**

* The cancel form's phone and booking code, and the professionals
  section's name and new name: not this finding.
* The owner's email and password at sign-in: not this finding either.
* Any change to an event, a starter, a hook or a route: the update still
  lands on the current state, which the other forms need.
* `readOnly` instead of `disabled`: the buttons beside these inputs use
  `disabled`, and the inputs follow them.
* Restoring focus to a field after a refusal: nothing does so today.
* Editing the finished pages in `work/done/` that list the controls a
  view disables (`weekly-hours`, `book-appointment`): they record what was
  built then.
* Any new dependency.

**Documents.** No living document (docs/00 to 06, AGENTS.md) says which
controls a view disables while busy. docs/01's only sentence about it,
"so a button disables in the same render" (shape 7), stays true, and so
does shape 2's "so what was typed meanwhile survives". No document
changes except docs/06.

**Choices made without the stakeholder:**

* **The milestone 1.1 paragraph gains a clause** for this line, so
  `m1.1-review` checks it, as `hours-save` did.
* **Screenshots of the in-flight state**, because docs/05 asks for a
  screenshot of a screen that changes: booking form at 390×844 (client),
  weekly hours editor at 390×844 and 1280×800 (owner), taken while the
  call is held, as `work/done/busy-fields-*.png`.
* **The new test names**, which say what each test now checks.

**Done when.**

* [x] The two renamed Playwright tests pass in both projects and assert
      the four inputs disabled, besides their existing button assertions.
* [x] The two renamed Vitest tests pass, each applying the update to the
      state that was checked and asserting it with `toEqual`; no edit
      after the click appears in either.
* [x] "refuses the checked week and keeps a time typed after the click"
      and "keeps a name typed in flight through a taken slot" are not in
      the diff.
* [x] The diff touches only `WeeklyHoursView.tsx`, `BookingView.tsx`, the
      four test files named above, docs/06 and this page, plus the
      screenshots. No `*Events.ts`, `use*.ts`, `*.server.ts`,
      `package.json` or `package-lock.json`.
* [x] Every other Vitest and Playwright test passes without changing what
      it asserts.
* [x] `npm run verify` is green.
* [x] Screenshots `busy-fields-booking-in-flight-390x844.png`,
      `busy-fields-hours-in-flight-390x844.png` and
      `busy-fields-hours-in-flight-1280x800.png` in `work/done/`.
* [ ] Manual check by the person, with `npm run dev` and the browser's
      network throttled (devtools, "Slow 3G") at 390×844: tap "Book" and
      "Save hours" and see the inputs greyed out and not typable until
      the answer arrives.

## What happened

**Built.** `disabled={busy}` on the From and To inputs of
`WeeklyHoursView.tsx` and on `#client-name` and `#client-phone` of
`BookingView.tsx`, with the same `busy` their buttons already read. The
four tests renamed and changed as Behaviour says. Playwright: 144 tests,
none added; the two renamed ones pass at 390×844, and the hours one also
at 1280×800.

**Diverged from the plan, and why.** Nothing. No abstraction: one
attribute per input, the value the buttons beside it already use.

**Dropped.** Nothing.

**What the proof found.** The three screenshots, in `work/done/`, show the
browser's default disabled look: the four inputs greyed out with their
values kept, beside buttons that were already greyed. In the owner shots
the professionals section's "Name" field stays enabled, as Out of scope
says. A one-off Playwright file took them on a fresh database, with the
save and the booking held unanswered, and was removed after the run.
Nothing to fix. `npm run verify` is green.

The manual check with `npm run dev` and "Slow 3G" belongs to the person:
the agent's session cannot keep `npm run dev` running. Its box stays open
until the person ticks it at review.

**Decisions.** No ADR. No living document changes besides docs/06, as
Documents says.
