# route-errors

**Objective.** Every error answer that more than one server file writes,
`DatabaseFailed`, `BadRequest`, `NotSignedIn`, `ProfessionalNotFound` and
`ClinicNotSetUp` as a 500, is written once, in
`src/server/answers.server.ts`, and every route uses it. Nobody using the
app sees a change.

**Behaviour.**

The client side and the owner side see no change. Every route answers the
same status and the same body as before, in the same order of checks.

* `databaseFailed`'s first copy is in `session.server.ts`. It is copied into
  the weeklyHours, appointments and professionals routes, and written
  inline 4 times in `signIn/route.server.ts` and once in
  `clinic/route.server.ts`.
* `notFound` (`ProfessionalNotFound`, 404) is first in
  `weeklyHours/route.server.ts`, with its second copy in
  `appointments/route.server.ts`.
* `BadRequest`: a helper in `professionals/route.server.ts`, plus inline
  copies in weeklyHours (1), appointments (2) and signIn (1).
* `NotSignedIn`: a helper in `session.server.ts`, plus one inline copy in
  `signIn/route.server.ts`.
* `ClinicNotSetUp` as a 500: inline in weeklyHours (1) and appointments (2).
* After the delivery, every one of these places calls the shared function.
  No route changes the status, the body or the order of its checks.
* A new Vitest file checks the status and body of each shared answer.
  Every existing Vitest and Playwright test passes, and no existing test
  file is in the diff.
* `npm run dev` behaves exactly as before, on the home page and on
  `/owner`.

**Contract.** No data, schema, route, request, response or local storage
change. One new file, `src/server/answers.server.ts`:

```ts
import type { Context } from "hono";

// The error answers more than one route writes. A refusal only one route
// writes stays in that route.
export function badRequest(c: Context) {
	return c.json({ error: { code: "BadRequest" } }, 400);
}

export function notSignedIn(c: Context) {
	return c.json({ error: { code: "NotSignedIn" } }, 401);
}

export function professionalNotFound(c: Context) {
	return c.json({ error: { code: "ProfessionalNotFound" } }, 404);
}

// A route that found a professional, a session or an appointment, which
// exist only once the clinic is set up. GET /api/clinic answers 404 instead.
export function clinicNotSetUp(c: Context) {
	return c.json({ error: { code: "ClinicNotSetUp" } }, 500);
}

export function databaseFailed(c: Context) {
	return c.json({ error: { code: "DatabaseFailed" } }, 500);
}
```

Each file imports only the answers it uses, from `./answers.server.ts` in
`src/server/` and from `../../server/answers.server.ts` in a feature:

| File | Today | After |
|---|---|---|
| `server/session.server.ts` | local `notSignedIn` and `databaseFailed` | both removed; imported |
| `features/signIn/route.server.ts` | inline `BadRequest` (1), `DatabaseFailed` (4), `NotSignedIn` (1) | `badRequest`, `databaseFailed`, `notSignedIn` |
| `features/clinic/route.server.ts` | inline `DatabaseFailed` (1) | `databaseFailed`; the `404 ClinicNotSetUp` stays inline |
| `features/professionals/route.server.ts` | local `databaseFailed` and `badRequest` | both removed; imported. `refusalStatus` and `refused` stay |
| `features/weeklyHours/route.server.ts` | local `databaseFailed` and `notFound`; inline `ClinicNotSetUp` 500 (1), `BadRequest` (1) | `databaseFailed`, `professionalNotFound`, `clinicNotSetUp`, `badRequest` |
| `features/appointments/route.server.ts` | local `databaseFailed` and `notFound`; inline `ClinicNotSetUp` 500 (2), `BadRequest` (2) | `databaseFailed`, `professionalNotFound`, `clinicNotSetUp`, `badRequest`. `appointmentNotFound` and `refusalStatus` stay |

* What stays inline or local, because only one route writes it or it comes
  from a use case: `SignInRefused` in signIn; `404 ClinicNotSetUp` in
  clinic; `appointmentNotFound`, the booking refusals, `SlotTaken` from the
  insert and `CancellationTooLate` in appointments; the weekly hours rule's
  `week.error.code`; the professionals `refused` table, which also answers
  `ProfessionalNotFound` for a bad `:id`.
* `err(c.json({ error: { code: "ClinicNotSetUp" } }, 500))` becomes
  `err(clinicNotSetUp(c))`, and so on for every answer wrapped in `err`.
* New test `src/server/answers.server.test.ts`: for each of the five
  functions, a Hono app with one route that returns it, driven with
  `app.request`, answers the status and the body of the Contract.
* docs/01's `server/` listing becomes "server shell: entry, setup command,
  database, migrations, password, session, the error answers routes
  share". docs/02's last paragraph gains one sentence: the answers more
  than one route writes are in `src/server/answers.server.ts`.

**Names and files, and why.**

* **`src/server/`, not `src/lib/`:** the answers take a Hono `Context` and
  only the server runs them. `session.server.ts`, whose `requireSession`
  the features already import, is in `src/server/` too, while `lib/`
  holds only what the client can import as well.
* **`answers.server.ts`:** docs/02's Routes table calls what a route
  returns its "Answer". `errors` would suggest the `Result` error values,
  which are the repositories' and use cases' business.
* **`professionalNotFound`, not `notFound`:** `appointmentNotFound` sits
  beside it in the appointments route, and `notFound` would not say which.
* **Each answer a named function, no `answer(c, code, status)`:** each
  code has one status, and five small functions keep the call sites as
  they read today.

**Out of scope.**

* Answers only one route writes (listed in the Contract): one copy is
  already one copy.
* The professionals `refused` table: it maps use case errors, and a bad
  `:id` belongs with the use case's `ProfessionalNotFound` there.
* Any change of status, body, order of checks or route.
* A shared body-shape check or a shared "professional exists and is
  active" read: the queue's later lines or `m1.1-review` can raise them.
* Any client file, hook, view, `api.ts`, `strings.ts` or dependency.

**Choices made without the stakeholder:**

* **Scope wider than the queue line.** The line named `databaseFailed`
  and `notFound`. `BadRequest`, `NotSignedIn` and the 500
  `ClinicNotSetUp` are repeated the same way, and the milestone clause
  "the code repeated across features has one shared copy" covers them, so
  leaving them would hand `m1.1-review` three findings. The queue line
  says so.
* **Inline copies count as copies.** signIn and clinic write the bodies
  without a helper, and replacing only the helpers would leave several
  copies of each answer.
* **One new test file.** No route test reaches a 500 today, only the
  repository tests reach `DatabaseFailed`. The shared answers get a test
  of their own, which does not touch any existing test.
* **The milestone 1.1 paragraph is not edited:** its clause "the code
  repeated across features has one shared copy" already covers this line.

**Done when.**

* [x] `src/server/answers.server.ts` exists with exactly the five
      functions of the Contract.
* [x] `grep -rnE 'error: \{ code: "(DatabaseFailed|BadRequest|NotSignedIn|ProfessionalNotFound|ClinicNotSetUp)"' src --exclude='*.test.ts' --exclude='*.e2e.ts'`
      finds only `src/server/answers.server.ts` and the `404
      ClinicNotSetUp` in `src/features/clinic/route.server.ts`.
* [x] `grep -rnE 'function (databaseFailed|notFound|badRequest|notSignedIn|clinicNotSetUp|professionalNotFound)\(' src`
      finds only `src/server/answers.server.ts`.
* [x] The diff touches only the six files of the Contract's table, the
      new file, its test, docs/01, docs/02, docs/06 and this page. No
      existing `*.test.ts` or `*.e2e.ts` file, no client file, and
      neither `package.json` nor `package-lock.json` is in it.
* [x] `src/server/answers.server.test.ts` passes, with one test per
      answer.
* [x] `npm run verify` is green, with the same Playwright count as before
      and the Vitest count higher by the new tests only.
* [ ] Manual check by the person, with `npm run dev`: book and cancel an
      appointment at 390×844, and on `/owner` sign in, add a professional,
      save weekly hours and sign out. Each behaves as before. (Left for
      the person, who ticks it before committing.)

**What happened.**

* **Built as planned.** The five answers are in
  `src/server/answers.server.ts`, as in the Contract. The six files of the
  table import only the answers they use. Every call site keeps its
  status, its body and its place in the order of checks. The copies that
  went: two local helpers in `session.server.ts`, two in professionals,
  two in weeklyHours and two in appointments; seven inline bodies in
  signIn (4 `DatabaseFailed`, 1 `BadRequest`, 1 `NotSignedIn`) and clinic
  (1 `DatabaseFailed`); and the inline `BadRequest` (3) and 500
  `ClinicNotSetUp` (3) in weeklyHours and appointments. The first copies
  were `databaseFailed` and `notSignedIn` in `session.server.ts` and
  `notFound` in `weeklyHours/route.server.ts`, as the page says.
* **One small change of form, none of behaviour.** Where an inline body
  took a three-line `if (...) { return ... }`, the call now fits on one
  line (`if (!isHoursBody(body)) return badRequest(c);`). Biome accepted
  it as written.
* **Nothing dropped, nothing added.** No dependency, no client file, no
  existing test file.
* **Proof.** `npm run verify` is green: typecheck, lint, 34 Vitest files
  with 333 tests (33 files with 328 tests before, plus the 5 new ones),
  144 Playwright tests (no `*.e2e.ts` file in the diff, so the same set as
  before), and the build. The first run stopped before Playwright because
  something else was using port 3100, most likely another worktree's e2e
  run. The second run passed without any change. Both Done-when greps
  return exactly the expected lines. The manual check is the person's.
* **Documents.** docs/01's `server/` line and docs/02's last paragraph are
  updated as the Contract says. No new term, rule or ADR.
