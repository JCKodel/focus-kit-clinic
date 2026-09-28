# professionals

**Objective.** The signed-in owner registers, renames and removes the
clinic's professionals from the owner screen, on a phone or a desktop.

**Behaviour.**

Owner screen, at `/owner`, signed in (owner side):

* Under the "Sign out" button, a heading "Professionals", the list of
  active professionals, then a "Name" field and an "Add" button.
* With no active professional, the list reads "No professionals yet."
* The list is in alphabetical order, ignoring case; each row shows the
  name, a "Rename" button and a "Remove" button.
* Typing a name and pressing "Add" puts it in the list, in its place, and
  empties the field. The name is stored trimmed.
* A blank name, or one over 80 characters, is refused with "Type a name of
  1 to 80 characters." and the field keeps what was typed.
* A name that another active professional already has, in any case and
  with surrounding spaces, is refused with "Another professional already
  has this name." and the field keeps what was typed.
* "Rename" turns the row into a field holding the name, a "Save" button
  and a "Cancel" button. Only one row is in rename or remove mode at a
  time: opening another closes the first.
* "Save" with a valid name shows the new name in its place in the list.
  The same two refusals as "Add" appear in the row, which stays open.
  Saving the professional's own name, or the same name in another case,
  is accepted.
* "Cancel" returns the row to its name, unchanged.
* "Remove" turns the row into "Remove <name>? Clients will no longer see
  them." with a "Remove" button and a "Keep" button.
* "Remove" takes the professional out of the list. "Keep" returns the row
  unchanged.
* A removed professional's name can be added again, as a new professional.
* Reloading `/owner` shows the same list.
* Renaming or removing a professional that was removed meanwhile (another
  tab) shows "This professional no longer exists." and reloads the list.
* An add, rename or remove after the session has ended shows "Your session
  has ended. Reload the page to sign in again." and changes nothing.

Server (both sides):

* `GET /api/professionals` answers without a session, with the active
  professionals only, in the order of the list above.
* Adding, renaming and removing without a live session answer
  `401 NotSignedIn` and change nothing.
* Removing keeps the row, with its removal instant; the professional never
  comes back to any list, and renaming or removing it again answers
  `404 ProfessionalNotFound`.

**Contract.**

Migration `src/server/migrations/0002-professional.sql`:

```sql
CREATE TABLE professional (
  id         INTEGER PRIMARY KEY,
  name       TEXT NOT NULL,  -- trimmed, 1 to 80 characters
  removed_at TEXT            -- UTC instant, ISO 8601; NULL while active
);
```

No unique index on the name: SQLite's `lower()` folds ASCII only, so it
would disagree with the rule for "Álvaro" and "álvaro". The use case
enforces invariant 10; one owner makes a race between two adds
negligible, and a duplicate name breaks no schedule rule.

Routes (errors are `{ "error": { "code": "<Code>" } }`, docs/01):

| Route | Session | Body | Answers |
|---|---|---|---|
| `GET /api/professionals` | none | | `200 { "professionals": [ { "id": 1, "name": "Ana Costa" } ] }`, active only, ordered as below; `[]` when none |
| `POST /api/owner/professionals` | yes | `{ "name": string }` | `201 { "id": 2, "name": "Rui Lopes" }` · `400 InvalidProfessionalName` · `409 ProfessionalNameTaken` · `400 BadRequest` · `401 NotSignedIn` |
| `PATCH /api/owner/professionals/:id` | yes | `{ "name": string }` | `200 { "id": 2, "name": "Rui M. Lopes" }` · `400 InvalidProfessionalName` · `409 ProfessionalNameTaken` · `404 ProfessionalNotFound` · `400 BadRequest` · `401 NotSignedIn` |
| `DELETE /api/owner/professionals/:id` | yes | | `204` · `404 ProfessionalNotFound` · `401 NotSignedIn` |

* Checks run in this order: session (`401`), body shape (`400
  BadRequest`), professional exists and is active (`404`), name (`400`,
  then `409`).
* An `:id` that is not a positive whole number answers `404
  ProfessionalNotFound`, like an unknown one.
* `DELETE` sets `removed_at` to the current UTC instant; it never deletes
  the row.
* `GET /api/professionals` is public because docs/02 lets the client side
  read professionals; `book-appointment` will reuse it.

Use cases, pure, existing state and clock passed in:

```ts
// src/lib/name.ts
checkName(raw: string): Result<string, "InvalidName">
  // trimmed; refused when blank or over 80 characters (code points)

// src/features/professionals/rules.ts
type Professional = { id: number; name: string };

addProfessional(raw: string, active: Professional[]):
  Result<string, "InvalidProfessionalName" | "ProfessionalNameTaken">
  // the trimmed name to store

renameProfessional(id: number, raw: string, active: Professional[]):
  Result<string,
    "ProfessionalNotFound" | "InvalidProfessionalName" | "ProfessionalNameTaken">
  // not found first; taken ignores the professional's own row

removeProfessional(id: number, active: Professional[], now: Date):
  Result<string, "ProfessionalNotFound">
  // the removal instant, now in ISO 8601

sortByName(active: Professional[]): Professional[]
  // a.name.localeCompare(b.name, "en", { sensitivity: "base" }), then id
```

"Taken" compares both names trimmed and with `toLowerCase()`.

Where the code lives:

* `src/features/professionals/`: `rules.ts`, `repository.server.ts`,
  `route.server.ts` (`professionalsRoute(db)`, both the public and the
  owner routes), `api.ts`, `useProfessionals.ts`, `ProfessionalsView.tsx`,
  `strings.ts`.
* `OwnerView.tsx` renders `<ProfessionalsView />` under "Sign out" in the
  signed-in state; nothing else in `signIn` changes.
* `src/lib/name.ts`: the trim and 1 to 80 character check. First use:
  `checkClinicName` in `clinic/rules.ts`; second use:
  `addProfessional` and `renameProfessional`. `checkClinicName` calls it
  and maps `InvalidName` to `InvalidClinicName`; its tests pass unchanged.
* `requireSession` in `session.server.ts`: first use `GET
  /api/owner/session`, second use the three owner routes here. It already
  lives in the server shell; it does not move.

No new dependency.

**States.**

* Loading: "Loading professionals" in place of the list until `GET
  /api/professionals` answers.
* Empty: "No professionals yet."
* Busy: while an add, rename or remove is in flight, its buttons are
  disabled.
* Error or offline: "The server cannot be reached. Try again." above the
  list; the list and whatever was typed stay.

**Visual reference.** No design file. The style of `clinic-setup`:
`system-ui`, 16px padding on each side, left-aligned, browser default
colours; the "Name" field with its label above, full width up to 320px,
`border-box`. Each row: the name, then its buttons on the same line when
they fit, wrapping below on a phone. Screenshots: empty list, a list of
three, a row in rename mode and a row asking to remove, at 390×844; the
list of three also at 1280×800.

**Out of scope.**

* Weekly hours: the next delivery, `weekly-hours`.
* Restoring a removed professional or listing removed ones: add the name
  again; one owner does not need an archive.
* Future appointments of a removed professional: an open decision in
  docs/00. No appointment exists yet, and the kept row keeps them valid
  when they do.
* A client screen listing professionals: `book-appointment`.
* Photo, speciality, description or contact of a professional: a name
  is what a client picks by (docs/00, Simple).
* Manual ordering of the list: alphabetical is enough.
* A database guard against duplicate names: see the Contract.

**Done when.**

* [x] Vitest tests of `src/lib/name.ts` and every function in
      `professionals/rules.ts`: blank and spaces only, 80 and 81
      characters (also in "é"), taken in another case and with spaces,
      a removed professional's name free, renaming to one's own name in
      another case accepted, not found before a bad name, removal instant
      equal to `now`, sort ignoring case with ties by id.
* [x] `clinic/rules.test.ts` passes unchanged.
* [x] Vitest tests of the repository against an in-memory SQLite with the
      real migrations: insert, rename, set `removed_at`, list active only.
* [x] Vitest tests of the routes through Hono's `app.request`: each answer
      in the Contract's table, the check order, a non-numeric `:id`, and
      that a `401` or a refusal changes no row.
* [x] Playwright tests of every Behaviour line with a screen, at 390×844
      and 1280×800.
* [x] Screenshots saved once, as proof, to `work/done/`:
      `professionals-empty-390x844.png`, `professionals-list-390x844.png`,
      `professionals-list-1280x800.png`,
      `professionals-rename-390x844.png`,
      `professionals-remove-390x844.png`.
* [x] `npm run verify` is green.
* [x] docs/02 lists the four routes and the `professional` table as built;
      docs/01 names `src/lib/name.ts`.
* [x] The person runs `npm run dev`, signs in at
      `http://localhost:5173/owner`, adds, renames and removes a
      professional, and reloads to see the list kept.

## What happened

**Built.** Migration `0002-professional.sql`; `src/lib/name.ts`
(`checkName`), now called by `checkClinicName`; the `professionals` slice
(`rules.ts`, `repository.server.ts`, `route.server.ts`, `api.ts`,
`useProfessionals.ts`, `ProfessionalsView.tsx`, `strings.ts`), mounted in
`main.server.ts` and rendered by `OwnerView.tsx` under "Sign out". Tests:
119 Vitest (50 new), 79 Playwright (44 new: 22 scenarios at both widths).

**Diverged from the plan, and why.**

* The e2e sign-in helper moved from `OwnerView.e2e.ts` to
  `src/server/e2eClinic.server.ts` as `signIn`. First use:
  `OwnerView.e2e.ts`; second use: `ProfessionalsView.e2e.ts`. The page did
  not name it; the rule on the second occurrence did. docs/04 says so.
* The `desktop` Playwright project listed only `OwnerView.e2e.ts`; it now
  lists `ProfessionalsView.e2e.ts` too, since the owner screen runs at both
  widths (docs/05). docs/04 names both files.
* Every Playwright test of a run shares one database, both projects in
  parallel. Each professionals test tags its names with a random suffix and
  reads only those; "No professionals yet." is proven with a mocked empty
  answer from `GET /api/professionals`, as `clinic-setup` proved "before
  setup". Written into docs/04.
* `migrate.server.test.ts` "applies the real migrations folder" now expects
  `0002-professional.sql` and the `professional` table.
* `clinic/rules.ts` keeps its private `length` for the password check; only
  the name check moved to `lib/name.ts`.
* Busy disables every button of the section, not only those of the action
  in flight: one owner, one action at a time, and no second request can
  race the first.
* The rename field has no visible label; its accessible name is "New name
  for <name>". The page named no label and the row shows no room for one.
* `api.ts` maps a `400` to `InvalidProfessionalName`: the client always
  sends `{ "name": string }`, so it never meets `BadRequest`.
* After an add or a rename the client places the answer with `sortByName`
  instead of reading the list again: the client reusing the use case for
  display, as docs/01 allows. "No longer exists" reads the list again, as
  the page asks.
* Messages: a refusal of "Add" sits above the Name field; a refusal of
  "Save" sits in the row, above its field; "no longer exists", "session
  has ended" and "cannot be reached" sit above the list. Opening a row,
  Cancel or Keep clears the one above the list.

**Dropped.** Nothing from Behaviour or Contract.

**What the proof found.** The five screenshots, in `work/done/`, show
`system-ui`, 16px on each side, left-aligned, browser default colours; the
Name field measures 320px at both widths. Each row shows the name then its
buttons on one line at both widths with these names; in rename mode the
320px field fills the phone line and Save and Cancel wrap below it; the
removal question wraps on the phone and its buttons go below. Nothing to
fix. They were taken by a one-off Playwright file, removed after the run,
on an emptied `professional` table. The screenshot run passed on its first
take; no divergence against the page was found.

Checked by the person, at review: the agent's session could not keep
`npm run dev` running, so the person ran it, signed in at
`http://localhost:5173/owner`, added, renamed and removed a professional,
and reloaded: the list was kept. It all worked.

**Decisions.** No ADR: the table, the routes and the rule sit inside
docs/01, docs/02 and docs/03.
