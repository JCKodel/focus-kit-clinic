# ADR-0002: FOCUS whole

**Date:** 2026-09-28

## Context

The kit offers FOCUS (View, Orchestrator, Use Case, Repository; errors as
values; vertical slices), its two principles alone, or neither. The product
values "every rule has a test" and "keep it simple".

## Decision

FOCUS whole. Code is organized by feature in `src/features/<feature>/`. Use
cases are pure functions in `rules.ts`, imported by both client and server;
the server enforces them, the client uses them only for display. Errors
travel as `Result` values; `throw` is never flow. docs/01 names the files of
a slice.

## Consequences

* Every rule lives in one pure function with the clock as a parameter, which
  is where a test is cheapest.
* A slice has more files than a component that fetches on its own; a file
  appears only when it pays its way.
* Client code must never import a `*.server.ts` file.
