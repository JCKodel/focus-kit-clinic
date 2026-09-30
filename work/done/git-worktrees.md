# git-worktrees

**Objective.** Every later delivery is built in its own git worktree, on a
branch named after its slug, and reaches `main` in one `--no-ff` merge made
by the person, so several deliveries can be built at once and each one
reverts in one step.

**Behaviour.**

This delivery changes the process, not the app. It is the last one built on
trunk: its page is written on `main`, and the person commits it there.

* ADR-0003 is amended, not replaced. The file is renamed from
  `docs/adr/ADR-0003-trunk.md` to `docs/adr/ADR-0003-git-strategy.md`, and
  its title becomes `ADR-0003: Git strategy`. The trunk decision stays in
  the file as history. An `## Amendment (2026-09-30)` section records the
  new decision: a worktree per delivery, the reason (ADR-0003's own
  consequence, "if that becomes needed"), and the consequences listed
  below.
* The Git slot of docs/05 §5 reads, in substance:
  * **Git:** a worktree per delivery (ADR-0003). `/propose <slug>` creates
    the worktree with
    `git worktree add ../focus-kit-clinic-<slug> -b <slug> main` from the
    main folder, and writes the page and the docs/06 mark there. `/apply
    <slug>` runs in a fresh session opened in that folder. If
    `node_modules` is missing, it runs `npm ci` first.
  * The person commits the delivery on its branch, in one or more commits,
    then from the main folder runs `git merge --no-ff <slug>` into `main`:
    one merge per delivery. The person resolves any conflict, then runs
    `git worktree remove ../focus-kit-clinic-<slug>` and
    `git branch -d <slug>`.
  * The agent stages. It never commits, merges, resolves a merge conflict
    or removes a worktree.
* docs/05 §2 The flow ends with: "... → work/done/<slug>.md and git add, in
  the delivery's worktree → a person reviews, commits on the branch and
  merges it into main with `--no-ff`."
* docs/05 §6 Commit says the suggested message is for the delivery's commit
  on its branch. The merge commit keeps git's default message,
  `Merge branch '<slug>'`.
* docs/05 §5 Environments, local: a new worktree has an empty `data/`, so
  seeing the app in it with `npm run dev` first needs `npm run setup`.
  Verify does not need it, because the e2e run sets up its own database.
* ADR-0003's consequences, in the amendment:
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
* Nothing else changes. AGENTS.md's "The agent stages and suggests the
  commit message. It never commits." still holds word for word.

**Contract.** None. No code, table, route, message shape or configuration
changes. The only exact strings are the commands quoted in Behaviour, the
worktree path `../focus-kit-clinic-<slug>` and the branch name `<slug>`.

**Out of scope.**

* Pull requests on origin: the person merges locally. A PR can be added
  later without changing the merge shape.
* Changing the `/propose` and `/apply` skills: they already read the git
  strategy from docs/05.
* Moving earlier deliveries onto branches: history stays as committed on
  trunk.
* A script that creates or removes worktrees: the two git commands are
  enough.

**Done when.**

- [x] `docs/adr/ADR-0003-git-strategy.md` exists with the amendment, and
      `ADR-0003-trunk.md` no longer does. No file links the old name.
- [x] The docs/05 §2, §5 (Git and Environments, local) and §6 say what
      Behaviour lists.
- [x] `grep -rn -i trunk docs AGENTS.md` finds only the history in
      ADR-0003 and this page.
- [x] docs/06 marks `git-worktrees` `[x]`.
- [x] `npm run verify` is green (nothing in the code changed).
- [x] Staged on `main`, with the commit message suggested. This is the last
      trunk commit.

## What happened

**Built.** ADR-0003 renamed to `ADR-0003-git-strategy.md`, titled
`ADR-0003: Git strategy`, with the trunk decision kept word for word and an
`## Amendment (2026-09-30)` section holding its own Context, Decision and
Consequences. docs/05 §2 ends the flow in the delivery's worktree with the
`--no-ff` merge, §5 Git names the worktree commands and who runs them, §5
Environments, local says a new worktree needs `npm run setup` before
`npm run dev`, and §6 says the suggested message is for the branch commit
while the merge keeps `Merge branch '<slug>'`. No code changed.

**Diverged from the plan, and why.** Nothing in substance. The amendment
also says the trunk decision held up to and including this delivery, so a
reader of the file knows where history stops. The rename was done as a new
file plus removing the old one rather than `git mv`, since the session
could not run `git mv`. Either way git stages it as a delete and an add,
not a rename: the amendment makes the new file more than twice the old
one, so the similarity is below git's 50% threshold. `git log --follow`
therefore stops at this commit; the old file stays in history.

**Dropped.** Nothing.

**What the proof found.** No screen, so no screenshot. `npm run verify` is
green: 328 Vitest and 144 Playwright tests, the same numbers as
`hours-answer`. `grep -rn -i trunk docs AGENTS.md` finds only
ADR-0003's history (its Context, Decision and the amendment's first line).
`grep -rn ADR-0003-trunk` finds only this page. Outside `docs`, the kit's
skill references under `.claude/`, `.agents/` and `.windsurf/` still name
trunk as one of the kit's options: they describe the choices, not this
project, and changing skills is out of scope.

**Decisions.** ADR-0003 amended, as the page says. Nothing enters docs/03.
Living documents changed: docs/05, docs/06 and ADR-0003.
