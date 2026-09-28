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
`rules.test.ts`.

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
