# ADR-0003: Git strategy

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

## Amendment (2026-09-30)

The decision above is kept as history. It held up to and including the
`git-worktrees` delivery, the last one built on trunk.

### Context

Building one delivery at a time is now the limit: the person wants several
deliveries built at once, each one reverting in one step. The first
consequence above foresaw it: "if that becomes needed, amend this ADR".

### Decision

A worktree per delivery. `/propose <slug>` creates it from the main folder
with `git worktree add ../focus-kit-clinic-<slug> -b <slug> main`, and
writes the page and the docs/06 mark there. `/apply <slug>` runs in a fresh
session opened in that folder. The person commits the delivery on branch
`<slug>`, then from the main folder runs `git merge --no-ff <slug>` into
`main`: one merge per delivery. The person resolves any conflict, then runs
`git worktree remove ../focus-kit-clinic-<slug>` and `git branch -d <slug>`.

The agent stages and suggests the commit message. It never commits, merges,
resolves a merge conflict or removes a worktree. docs/05 §5 holds the
commands.

### Consequences

* Reverting a delivery is `git revert -m 1 <merge>`.
* `docs/06` is edited by every delivery, so two deliveries in flight can
  conflict on neighbouring queue lines. The person resolves it by keeping
  both marks.
* Before building two deliveries at once, the person checks that they do
  not touch the same files.
* Each worktree costs a folder and its own `node_modules`.
* The e2e ports (3100 and 5174, in `playwright.config.ts`) and the e2e
  database (`e2eDatabasePath`, in the system temp folder) are shared by
  every worktree today. Whether that needs a fix is decided after
  worktrees have been used in parallel.
