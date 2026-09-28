# focus-kit-clinic

A scheduling app for one neighbourhood clinic: clients book and cancel from
their phones, the owner manages professionals and their weekly hours. Prose in
English; identifiers in English.

## Read before acting
- the product: docs/00 · the vocabulary: docs/03
- how it is built: docs/01 · the server: docs/02
- style and tests: docs/04 · process: docs/05 · queue: docs/06

## Non-negotiables
- Every business rule is a pure use case with a test. The server enforces
  it; the client reuses it only for display (docs/01).
- No payments, no notifications, no health data, one clinic (docs/00).
- A client has no account: a name, a phone number, a booking code, nothing
  more (ADR-0004).
- Instants are stored in UTC and reasoned in the clinic time (docs/03).
- No paid service (ADR-0001).
- An open decision in docs/00 is asked, never assumed.
- One delivery = one page in work/<slug>.md: /propose to define, /apply
  to build.
- No em dash in any text a user reads.
- The agent stages and suggests the commit message. It never commits.

## Do not rebuild
- Nothing removed yet.

## How to work
- FOCUS whole, one folder per feature in `src/features/`; client code never
  imports `*.server.ts` (docs/01, ADR-0002).
- Errors are `Result` values from repository to view; `throw` is never flow.
- `npm run verify` before declaring anything done.
- Abstraction on the second concrete occurrence, and the delivery says
  which was the first.
- Ambiguity → ask. Documents are living: a delivery that changes behaviour
  updates the document that owns it, in the same delivery.
