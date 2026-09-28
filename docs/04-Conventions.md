# Conventions

## Languages

* Documentation: English.
* Identifiers: English, with the terms of docs/03.
* Text users read: English, kept in the `strings.ts` of each feature, so a
  translation is a later delivery and not a rewrite.
* No em dash in any document or in any text a user reads.

## Naming

* React components and types: `PascalCase`. Component files carry the
  component's name: `BookingView.tsx`.
* Functions, variables, other files: `camelCase`.
* Server only files end in `.server.ts`.
* Hooks start with `use`.
* Database tables and columns: `snake_case`, singular table names.
* Domain errors: `PascalCase` codes from docs/03, such as `SlotTaken`.

## Style

* TypeScript `strict`, no `any` without a comment that says why.
* Biome formats and lints, with its configuration in the repository.
  Formatting is never discussed in a review: Biome decides.

## Tests

Each test file sits next to the file it tests: `rules.ts` and
`rules.test.ts`. Vitest files end in `.test.ts`; Playwright files end in
`.e2e.ts` and sit next to the view they drive (`HealthView.e2e.ts`).
Playwright starts its own server and Vite on ports 3100 and 5174 with a
throwaway database, so it never touches a running `npm run dev`. Before the
server starts, it deletes that database and runs the real `npm run setup`
with the answers of `src/server/e2eClinic.server.ts` piped in. Tests run at
390×844 (project `phone`); the owner screen's tests run again at 1280×800
(project `desktop`, which lists their files: `OwnerView.e2e.ts`,
`ProfessionalsView.e2e.ts`, `WeeklyHoursView.e2e.ts`).

Test fixtures that more than one feature uses live in the server shell with
the `.server.ts` suffix, since they read Node modules and client code must
never import them: `testDatabase.server.ts` (Vitest, an in-memory SQLite with
the real migrations) and `e2eClinic.server.ts` (Playwright, the clinic set up
before the run, the path of its database, and `signIn` for the owner form).

Every Playwright test of a run shares that one database, both projects in
parallel. A test that writes rows names them with its own random tag and
looks only at those; a state that needs an empty table is proven with a
mocked answer.

| Level | Tool | What |
|---|---|---|
| Use case | Vitest | Every rule, with the clock passed as a parameter. No database, no network. |
| Repository | Vitest | Queries against an in memory SQLite with the real migrations. |
| Screen | Playwright | Each scenario of a page's Behaviour that has a screen, plus the screenshots of docs/05. |

Every rule has a test. A rule without a test is not done.

## Commits

As docs/05 §6 says: imperative subject up to 72 characters, scope in
parentheses when it helps, up to five one line bullets, last line pointing to
`work/done/<slug>.md`.
