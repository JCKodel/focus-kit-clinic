# ADR-0003: Trunk

**Date:** 2026-09-28

## Context

One person reviews every delivery, one delivery at a time. The kit offers
trunk, a branch per delivery, or a worktree per delivery.

## Decision

Trunk: every delivery is built on `main`. The agent stages and suggests the
commit message; the person reviews and commits. The agent never commits and
never merges.

## Consequences

* No merges and no conflicts between deliveries.
* Deliveries cannot be built in parallel. If that becomes needed, amend this
  ADR to a branch or a worktree per delivery.
