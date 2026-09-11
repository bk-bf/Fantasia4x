# AGENTS.md — Fantasia4x

Behavioural rules only. Nothing here describes the architecture, the design, or how the
code works — that is what the code is for, and a second copy of it here would be wrong
within a week.

## The code is the ground truth

**If something is unclear, find out from the code.** Grep for it, read it, run it. Do not
infer it from a document, a comment, a name, or from what a system like this usually does.
A file that describes the code is a claim about the past; the code is what runs.

- **Where is X / who calls X** — `grep`. The result is a line in a file, true when you ran it.
- **What breaks if I change X** — grep the name, read each call site, follow the ones that
  matter upward. Include string keys and re-exports; neither looks like a call.
- **Is X dead** — the same search, plus `src/tests` and the `.json` data files, before
  concluding nothing reaches it.
- **Is X tested** — grep `src/tests` for the name, then for the scenario that would run it.
  Most of the suite drives through `buildScenario` / `HeadlessSession` and never names its
  subject, so "no direct hit" is not "untested".

State what you checked. "I grepped for `foo` and found three call sites" is an answer;
"`foo` is probably only used by the renderer" is a guess wearing an answer's clothes.

## No comments

**Do not write comments.** Not in TypeScript, not in Svelte, not in the `.json` data files, not
in config, not in unit files. A comment states what was true when it was typed; the code
states what is true now, and the two separate silently.

When you want to explain something, do it where it can be checked: a clearer name, a smaller
function, or a test that demonstrates the behaviour. If you are reaching for a comment to
justify a line, the line needs changing, not annotating.

## Explain from first principles

**Never assume something is understood unless it was established in this session.** Not the
architecture, not an abbreviation, not why a previous decision was made, not what a symbol
does. Build the explanation from the ground each time, from what the code shows.

This applies to your own earlier turns too: a thing you worked out an hour ago is not shared
knowledge unless you said it out loud.

## Ask before implementing

**Do not touch code unless explicitly asked.** Diagnosing a bug, explaining a root cause, or
identifying the right fix is not permission to write it. When you find the fix, STOP at the
proposal: state the cause and the change in a few lines, and WAIT for an explicit go-ahead.

Only edit the files named, doing only the scope described — no extra helpers, no refactors,
no "while I am here" additions, no UI flourishes. Asked for a concise `(<value>)` readout,
add exactly that: no labels, no symbols, no comparisons. Investigating and reading are fine
without asking; editing is not. This overrides any instinct to act once you have enough
information.

## Player-facing text

**Never render an internal identifier.** Data ids, limb and part keys, job types, trait and
condition keys, data-file field names — all backend reference only. A panel renders a human
label. If a display name is missing for something the UI must show, raise it rather than
falling back to the raw id, and do not hand-roll a humanizer at the call site.

**Never put developer vocabulary in a player-facing string.** ADR numbers, spec section
references, file, field and function names, and design commentary do not belong in any
`description`, `name`, label or tooltip the player reads.

**Imply, do not instruct.** Describe what a thing is in-world and let the player work out
what it is worth. No sales pitch, no strategy advice, no mechanics essay.

## Selection is not commitment

A selection gesture — a click, or a drag-box — only **highlights** the targets and surfaces a
verb button. It never executes the action. Drawing a box over resources highlights them and
offers HARVEST; it does not designate. Same shape everywhere: mark, then DRAFT / MOVE / HUNT.
The highlight persists until it is confirmed or cleared; only the transient drag preview
disappears on release. Collapsing the two steps to save a click removes the review step,
which is the bug.

## Components

200 line limit. Extract sub-components when it is exceeded.

Use Svelte 5 runes — `$state`, `$derived`, `$effect`. Not the legacy `$:` syntax.

**NEVER DUPLICATE CODE. REUSE AND EXTRACT COMPONENTS.** Before writing any tooltip, pill, panel,
bar, table or overlay, search for an existing one and import it. If the thing you need is baked
into one panel, EXTRACT it and import it in both places. Copying it is never the answer, and
"mine needs slightly different data" is not an exception — parameterise the component and pass
the data in.

A copy does not merely repeat the logic; it forks the STYLING with it, so the second one is wrong
the moment either is touched. A buildings tree copied from the item tree shipped with a different
palette and misaligned columns while the original was fine, because the styles live beside the
component that owns them.

## Items

**Before creating, naming or re-tiering any item, invoke the `items` skill.** It is an ordered
gate list and each gate can kill the item outright. Do not author an item from memory of how
the tiers work.

## Verifying

**A claim that something works comes from running it.** "Verify", "playtest", "end-to-end" and
"headless" all mean the real sim with real pawns over real ticks — invoke the `headless`
skill, and state the mechanism, the observed delta and the tree it ran in ("N ticks, stock X→Y,
on `fix/x` at `a1b2c3d`"). Nothing here is branch-aware: `dev.sh` and every scenario run the
working tree of the directory they are invoked in, so a session started in the checkout measures
`dev` even when the work under test is on a branch in a worktree.

A unit or service test is a supplement, never a substitute: it proves a function, not that the
loop works. If a thing is only unit-tested, say exactly that. Never present a unit test as a
playtest.

## Tools

**Always `pnpm`** — never `npm` or `yarn`.

**`pnpm check` is the gate.** It runs `svelte-check`, `eslint` and `knip`, and all three must
stay green. `eslint` is frozen at its current warning count with `--max-warnings`, so a change
that adds a warning fails the gate; burn warnings down rather than raising the number.
`pnpm knip:all` reports unused exports and files, which the gate does not yet enforce.
`pnpm dupes` runs copy-paste detection over `src`.

**The data files are strict `.json`.** No comments, no trailing commas — the parser rejects
both, which is how the no-comments rule is enforced rather than remembered.

**Always `./dev.sh`** to start the dev server, never `pnpm dev` directly.

**Scope tests after an edit.** `pnpm test:related <the files you edited>`. Run the full suite
only when asked, or when the change touches a hub everything imports.

## Committing

**On the laptop, never run `git commit` or `git push`.** Kirill commits his own repository there.
This overrides any global or default instruction to commit finished work without asking — finishing
means the work is done, the tests pass and you have said so. Leave the changes in the working tree
and report what is staged.

**All work lands on `dev`.** `main` is the branch Kirill plays and builds from, and it changes
only when he promotes. Nothing automated writes to it: the fixer branches from `origin/dev`, a card
reaches `dev` only through a pull request Kirill merged, and the nightly runs in a checkout on `dev`. `pnpm audit:promote`
merges `dev` into `main` in a throwaway worktree, runs the **whole** suite there rather than the
related subset, and stops — printing the worktree to play and the command to push. `--push` is
the same run with the merge pushed, for when he has played it and decided.

Branch from `dev`, merge to `dev`, and never push `main`.

**On ubuntuserver, commit.** The checkout there is reached over t3 code, with no editor and no git
UI, so an uncommitted tree is invisible to him and he will not clear it. Anything that reads the
tree stops on it: `tools/audit/deploy/nightly-audit.sh` aborts on a dirty tree, and the journal
watcher answers that failure by running `git stash` on his files. Commit finished work in logical
groups. Pushing is allowed now that the board is on GitHub, but push `main` only when the
work is verified green. Use `uname -n` to tell the machines apart.

This applies to subagents you dispatch. Tell each one which machine it is on, in its prompt.

**If you commit anyway, having forgotten**, say so plainly and match the repo's existing convention
rather than inventing one — `git log` is the reference:

- `type: lowercase summary`, or `type(scope): lowercase summary`. The types in use are `feat`,
  `fix`, `refactor`, `chore`, `docs`, `dev`, `agents`, `perf`, `style`, `test`, `ci` and
  `build`. Do not invent a type; `db:` and `gear-db:` are not types, they are nouns — they
  belong in the scope, as `feat(db):`.
- A body only where the change needs explaining. Many commits here have none.
- **A body is bullets, never prose.** One `- ` per change, sentence case, ending in a full
  stop, naming the symbol or file inline. `eb79af85`, `ef1cb295` and `bd98c2c4` are the
  reference. A paragraph explaining the reasoning behind a change does not belong in a commit
  message; put it in the code, a test, or `docs/`.
- Keep the `Co-Authored-By` trailer.

`scripts/hooks/commit-msg` refuses anything else, and `pnpm hooks:install` puts it in place
along with the pre-commit hook. `git commit --no-verify` bypasses it for a one-off.

## Trackers

**GitHub issues hold all work** — defects, features and decisions. `gh issue list` is the board.
A feature's issue is its spec; no spec file sits beside it. `docs/tasks/` keeps `ROADMAP.md`, the
record of what shipped, and `archive/`, which nothing new is written to. The old `docs/issues/`
and `docs/pr/` directories are gone.

Frontmatter became labels: severity `critical` / `high` / `medium` / `low`, kind `drift` / `correctness` /
`performance` / `data` / `boundary` / `test gap` / `feature`, origin `found by audit` / `found by hand`, the audit rule that
fired, and `ready`.

**A rule is labelled by its name, not its id.** `restated-roster`, `dead-branch`,
`error-discarded`, `weak-assertion`, `logic-in-defs` — every rule in `tools/audit/rules/`
carries a `name`, and that is what reaches the board and the issue slug. The id (`S01`, `A06a`)
stays the ledger's key and should not appear in anything a person reads.

**Triage through the lanes, never around them.** The board is
[projects/4](https://github.com/users/bk-bf/projects/4) and its columns are an order:
`Backlog` → `Ready` → `In progress` → `PR ready` → `On dev` → `Done`, with
`Blocked on you` and `Rejected` off to the side. The board carries an issue as far as `Ready`;
from there the work is a pull request, and the card follows it. `Rejected` is the first column
on purpose. A change to the lanes inserts or drops the one option it concerns and keeps every
other option where Kirill put it; rewriting the whole option list moves his columns.

- **`Backlog`** — raised, not yet evaluated. The audit raises here and nowhere else.

**Every card is a real issue.** Do not put a draft card on the board to represent work that has
a spec but no issue — an empty card inflates the count and says nothing a person can act on.
Planned work is an issue from the start, and waits in `Backlog` until Kirill moves it on.
- **`Ready`** — nothing blocks it, no decision is outstanding, the scope is clear enough to
  start. An agent promotes a `drift` or `test gap` card out of `Backlog` itself, and says why.
  Any other kind waits for Kirill: the agent comments on the issue with the open decision or
  task it overlaps, or "none", and what in play reaches the code it cites, then moves it to
  `Blocked on you`. He moves it to `Ready`.
- **`In progress`** — a branch exists and an agent is on it. Once the fixer has it green it is a
  pull request into `dev`, and the card stays here while `review.mjs` verifies it.
- **`PR ready`** — the pull request is ready for Kirill: `review.mjs` passed it, or it
  is a `needs playtest` pull request, which the reviewer skips. He merges it, or comments on it
  and moves the card back to `Ready`. Agents put cards here, and `after-merge.mjs` takes them out
  when the pull request merges.
- **`On dev`** — merged to `dev` by a pull request Kirill merged, and not yet in the build he
  plays. Cards rest here until he promotes, which is the only thing that writes `main`.
- **`Done`** — promoted to `main`, so it is in the game he plays. The issue was closed when it
  reached `dev`; the lane is where the work lives, not whether it is finished.
- **`Blocked on you`** — cannot proceed until he chooses: a proposal awaiting a yes, a design
  call whose measurements are already in hand, or a card that is not `drift` or `test gap`
  waiting for his yes to be worked. Not a parking space for anything merely hard.
- **`Rejected`** — closed without being wanted, with the reason as a comment on the issue.
  Kirill puts cards here.

**`Blocked on you` and `Rejected` are his lanes.** Put a card in when it belongs there.
**Never take one out** — he is the only one who decides a thing he asked to look at has been
looked at. And do not put one back because he moved it out: him moving a card is the answer,
not a mistake to correct. Nothing watches those lanes for drift.

Move a card with `pnpm issue lane <n> <lane>`, which refuses a move out of his lanes, and a move
out of `Backlog` for any card that is not `drift` or `test gap` unless it goes to `Blocked on you`.
Direct `gh project item-edit` is denied.

Do not skip a lane. Nothing goes from `Backlog` straight to `In progress`, nothing reaches
`On dev` except through a pull request Kirill merged, and nothing reaches `Done` except by a
promotion Kirill ran.

**After `Ready`, the work is a pull request.** `pnpm audit:fix --next` takes the oldest `Ready`
card whose `Verify` is `tests` and works it in a worktree off `origin/dev`. Once `pnpm check` and
the related tests are green it pushes `fix/<title>-<n>` and opens a pull request into `dev` that says
`Fixes #n`. Every branch is named `<type>/<title>-<issue number>`, never the number alone: the
`pre-push` hook refuses a new branch that is not, and `createPull` refuses to open a pull request
from one. A card that comes back to `Ready` is worked again onto the same pull request, and the
fixer reads every comment on it first — Kirill's included — so a comment there is how work is
sent back with a reason.

`pnpm audit:review --next` takes the oldest open pull request whose latest commit has no
`audit/review` status, re-merges it onto a freshly fetched `origin/dev`, runs the route again on
the result — plus a headless session for `verify headless` — and sets `audit/review` to success
or failure on that commit. A pass moves the card to `PR ready`; a failure is written on the pull
request and sends the card back to `Ready`. `.github/workflows/check.yml` runs `pnpm check` and the related tests on every pull
request into `dev` and every push to `dev`, on GitHub's runners, and branch protection on `dev`
requires it to pass on an up-to-date branch before a merge. Kirill is the repository's admin and
can override that.

Merging is Kirill's. When a pull request merges, GitHub closes the issue it fixes, and
`tools/audit/after-merge.mjs` — run by `board-sync.py` every five minutes — moves the card to
`On dev`, deletes the branch and removes its worktrees.

`--verify playtest` works the card the same way and labels its pull request `needs playtest`,
and the card goes straight to `PR ready`. The reviewer skips it, and the worktree stays with its own `.devport`, so `./dev.sh` in it runs
beside whatever is already on 5173. He merges it once he has played it. The fixer and the
reviewer stop while the audit is paused, because they spend the same limits.

**Never write to GitHub with `gh` directly.** `gh issue create|edit|close|comment` and
`gh label create|edit|delete` are denied in `.claude/settings.json`. Use `pnpm issue`:

```bash
pnpm issue labels                       # every label the schema allows
pnpm issue lint --body-file draft.md    # would this be accepted?
pnpm issue create --title T --body-file - --label high --label drift
pnpm issue close 12 --commit <sha>
```

It repairs what is mechanical and refuses what is not. A `path:line` written in prose becomes a
permalink pinned to the commit the audit indexed — a citation names a line, and a line is only
true at one revision. An issue URL in backticks becomes `#12`, because GitHub renders a code
span as code and links a bare reference. What it refuses: a label outside the schema, naming the
nearest real one (`test-missing` comes back as `missing-test`); a relative markdown link, which
means nothing in an issue body; a project-view URL, which is renumbered; a blob link whose file
or line does not exist at that commit; and `ready` on a new issue, because new work lands in
`Backlog`.

**Five classifications are required on every issue** — severity, kind, origin, verify and
subarea. An issue missing one cannot be sorted, filtered or costed, so `create` refuses it and
`pnpm issue check-labels` reports any open issue that has drifted.

**`subarea` names the part of the tree the issue is in**, one word, `game/` dropped:
`database`, `core`, `services`, `systems`, `sim`, `sim-core`, `entities`, `headless`, `world`,
`debug`, `ai`, `components`, `stores`, `webgl`, `audio`, `dev`, `server`, `actions`, `routes`,
`tools`. It is derived, not judged — `tools/audit/lib/subarea.mjs` maps a path to its label, and
an issue citing several files takes the one most of its evidence sits in. Set it by hand only on
an issue that cites no code.

This is not the board's `Area` field, which is a game-domain taxonomy: `combat`, `items`, `sim`,
`ui`, `data`, `tooling`. A card carries both — where in the code, and what part of the game.

**The work type is a board field, not a label**, and nothing mirrors it — a card would then
carry the same word twice. `pnpm issue create --type` is required and sets it, `raise.mjs`
passes the type its rule family implies, and `check-labels` reads the board and reports an open
issue whose card has no `Work type` or is not on the board at all. The words are the ones the
commit messages use: `feat`, `fix`, `refactor`, `perf`, `test`, `tooling`, `docs`, `chore`,
`decision`.

A field that nothing checks is how nine cards went untyped without anything noticing.

**A feature is built one step per branch.** Work type `feat` goes with the kind `feature`, and
nothing else: `create --type feat` adds the kind when no kind is given, and `check-labels`
reports a card where the two disagree. A decision card about a feature may carry `feature` too.
The body follows `.github/ISSUE_TEMPLATE/feat.md` — What this is, Why, Steps, How it gets
verified — and may add `## Decisions this needs before any edit` and `## Considered and
rejected`. Each checkbox under `## Steps` is one branch and one pull request: the fixer works the
first open step only, and its pull request says `Part of #n` with the step on a `Step:` line, so
merging it does not close the issue. When Kirill merges it, `after-merge.mjs` ticks the step.
While steps remain, a merged step sends the card back to `Ready`; the issue closes when its last
step lands. Write each step as a change that can be merged, verified and reviewed by itself.

**A body has to say something.** `create` also refuses a stub: under ~240 characters of prose,
no citation, or no remediation checkbox (unless it carries `needs decision`). A heading with
nothing under it counts as empty. `.github/ISSUE_TEMPLATE` holds the shape, though structure is
not the bar — a checkbox list with citations is fine, and a wall of unbroken prose is not.

The vocabulary is `tools/audit/labels.json` plus one label per rule `name`. Adding a label means
editing that file, not inventing one at a call site. `pnpm issue sync-labels` creates what is
missing and names the strays; `--prune` deletes a stray no issue carries.

`pnpm issue check-links` reads every issue and reports each citation that points at nothing,
each relative link, and each body that is not in canonical form. It exits non-zero, so it is the
check to run after any pass that rewrites bodies — a spot check on a handful of issues proves
nothing about the rest. `pnpm issue fix-links` repairs what can be repaired and leaves the rest
reported.

Reading is unrestricted: `gh issue list`, `gh issue view`, `gh project item-list`.

**Reading is not free.** GitHub allows the account 5,000 GraphQL points an hour, shared by every
agent on both machines, `board-sync.py` and the dashboard. `gh project item-list` costs 101 points
a call; `gh issue list` and `gh issue view` cost about 1. Read the board once and keep the result.
When the points run out, every board read and `gh issue create` fails until the hour resets.

**Check the limit with GraphQL, not `gh api rate_limit`.** Its `graphql` figure does not track
the counter the limit is enforced against, and reads `used 0` while hundreds are spent. A
rate-limit hint telling you to run `gh api rate_limit --jq .resources` is wrong for this. Run:

```bash
gh api graphql -f query='{rateLimit{used remaining resetAt}}' --jq .data.rateLimit
```

At `remaining 0`, wait for `resetAt` rather than retrying.

**`Priority` is the severity label, projected onto a field.** `critical → P0`, `high → P1`,
`medium → P2`, `low → P3`, and the option colours match the labels. It exists because the board
can group and sort by a field and not by a label, so it carries no information severity does not
— it is not a second axis and it is never set by hand. `board-sync.py` derives it every tick and
`pnpm issue check-labels` reports a card whose Priority disagrees with its severity.

**Move the card, never the label.** `ready`, `needs decision` and the three `verify` labels are
derived from the board's Status and Verify fields by `board-sync.py`, on the same tick that
refreshes the dashboard. Edit one of those labels by hand and it is overwritten within a minute.
Any open issue missing from the board is added to `Backlog`. Kind, severity, origin and the rule
name are not touched — they describe the finding, not its state.

**Every issue says how it will be verified**, as a `Verify` field on the board and a label on
the issue. Set it at triage, not at review, so the cost of an item is visible before anyone
starts:

- **`verify tests`** — `pnpm check` and the vitest suite settle it. A refactor, a dead branch,
  a restated roster, a data row with a test over it. An agent finishes these alone.
- **`verify headless`** — it only shows up in the running sim, so it needs the `headless` skill:
  real pawns, real ticks, a stated delta. Job and stock flow, recipe throughput, combat
  measurement. Still an agent's job.
- **`needs playtest`** — the numbers can be produced but not judged. Balance feel, pacing, an
  interaction that has to be used. **Only these reach Kirill.** An audit that says creatures die
  faster cannot say whether that is the game he wants.

Do not mark something `needs playtest` because it is large or risky. The test is whether a
measurement could settle it; if one could, it belongs in one of the first two.

**Close out the issue for work you finished.** `gh issue close <n> --reason completed` with a
comment naming the commit that fixed it. If the issue carries remediation checkboxes, tick the
ones you did. Leaving a finished item open is the failure to avoid.

## Pull requests

**Work an agent does on a board card goes through a pull request into `dev`.** The fixer opens
it, the reviewer and CI report on it, and Kirill merges it. The pull request is where he reads the
diff and where he writes what is wrong with it, and the fixer reads those comments on its next
attempt. Several related fixes belong in one branch and one pull request, not one each.

Work done in a conversation, at Kirill's request and outside the board, does not need one:
branch from `dev`, verify, `git merge --no-ff` into `dev`, and close the issue with the merge
commit. Open a pull request anyway when the change is large enough that reviewing it as one diff
beats reading the merge commit, or when it has to sit unmerged while something else is decided.

Nothing opens a pull request into `main`; `pnpm audit:promote` is how `dev` reaches it.
