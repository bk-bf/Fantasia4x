# AGENTS.md — Fantasia4x

Behavioural rules only. Nothing here describes the architecture, the design, or how the
code works — that is what the code is for, and a second copy of it here would be wrong
within a week. The same holds for the tooling: where a rule depends on a list, an option, a
count, a job name or what a script does, this file names the command or the file that holds
it. Run that command or read that file; do not carry a copy of what it says.

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

200 line limit. Extract sub-components when it is exceeded. The t0 audit,
`node tools/audit/audit.mjs t0`, warns on a component past the limit or past its entry in
`tools/audit/component-sizes.json`. Entries only go down: lower one when a component shrinks,
and drop it once the component is under the limit. A seam in `tools/audit/seams.json` marked
`"blocks": true` fails the check; when the new caller is intended, add it to that rule's `allow`
list in the same pull request.

Use Svelte 5 runes — `$state`, `$derived`, `$effect`. Not the legacy `$:` syntax.

**NEVER DUPLICATE CODE. REUSE AND EXTRACT COMPONENTS.** Before writing any tooltip, pill, panel,
bar, table or overlay, search for an existing one and import it. If the thing you need is baked
into one panel, EXTRACT it and import it in both places. Copying it is never the answer, and
"mine needs slightly different data" is not an exception — parameterise the component and pass
the data in.

A copy does not merely repeat the logic; it forks the STYLING with it, so the second one is wrong
the moment either is touched, because the styles live beside the component that owns them.

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

**Every tool is in [`tools/`](tools/), and [`tools/README.md`](tools/README.md) lists each one and
how to run it.** Only the launchers stay at the root. A new tool goes in `tools/` and gets a line
in that index.

**Nothing test- or CI-related runs on the laptop.** Every `package.json` script that runs a test,
type check, linter, benchmark or measurement goes through `tools/remote/run.mjs`, and
`grep -n run.mjs package.json` lists them; wrap anything else the same way, as
`node tools/remote/run.mjs <command>`. It runs the committed `HEAD` on ubuntuserver and refuses a
laptop tree with any uncommitted or untracked file, so commit first; a work-in-progress commit on
the branch is fine. It never falls back to the laptop. Its options are in the file.
`tools/remote/guard.mjs` refuses a test runner, linter, type check or harness started directly on
the laptop.

**One chain checks every change, and GitHub starts and records it.**
`.github/workflows/check.yml` runs on every pull request into `dev`, every push to `dev`, and every
`pnpm chain`; read it for its jobs, their order and where each runs. `scopeOf` in
`tools/audit/ci-scope.mjs` decides which legs a change runs. The jobs a pull request into `dev`
must pass:

```bash
gh api repos/bk-bf/Fantasia4x/branches/dev/protection --jq .required_status_checks.contexts
```

A required job the scope skips counts as passed. `.github/workflows/promote.yml` runs every leg
against `main` before a promotion, which catches a leg that a change to the CI files broke. The
CodSpeed and ticks-per-second legs run on GitHub's own runners. Before moving either to another
machine, run the same commit against itself there several times and compare the spread with
GitHub's, which the pull request that moved them records.

**`pnpm chain` is the one command** (`tools/chain.mjs`). It pushes the current branch and streams
its check run from GitHub until the run ends, exiting with its result; `pnpm chain --pre` runs the
pre-check alone. A push to a pull request branch or to `dev` starts the same chain. Do not run
`pnpm check` or the tests by hand before a push GitHub will check; the chain runs them on the
pushed commit. Run them by hand only while you work.

**`pnpm check` is the gate**, and every tool its `package.json` script runs must stay green. Warning
counts are frozen per tool in `tools/audit/warning-budget.json`; `tools/audit/warnings.mjs` fails
a count past its budget and says when one has dropped below it. Lower the budget then, and never
raise it.

**The data files are strict `.json`.** No comments, no trailing commas — the parser rejects
both, which is how the no-comments rule is enforced rather than remembered.

**Always `./dev.sh`** to start the dev server, never `pnpm dev` directly.

**The game is played through `./launch.sh --electron --play`**, run from the checkout or worktree
under test, with `--log` added when `.debug/*.log` must be written. Never tell Kirill to start it
with `pnpm start` in `desktop-spike/electron`, or with `./dev.sh` plus the shell. The shell on its
own loads `localhost:5173`. `launch.sh` serves on `127.0.0.1:$(cat .devport)` inside its own network
namespace, and the saves belong to that origin. A worktree reaches the same saves only with the
same `.devport`.

**Ctrl-Z stops a launch; it does not end it.** Every process stays in state `T` until it is
continued. `pgrep -af 'desktop-spike/electron/.*electron|vite dev'` lists what is left, and
`pkill -CONT -g <pgid>; pkill -TERM -g <pgid>` ends one launch.

**Scope tests after an edit.** `pnpm test:related <the files you edited>`. Run the full suite
only when asked, or when the change touches a hub everything imports.

## Committing

**Commit finished work and push it, on the laptop and on ubuntuserver alike.** Finished means the
work is done and you have said so; the chain then checks the pushed commit, and a red one is fixed
by the next push. Commit in logical groups. On ubuntuserver the checkout is reached over t3 code,
with no editor and no git UI, so an uncommitted tree there is invisible, and the tools that read
that tree stop on it.

**All work lands on `dev`.** `main` is the branch the owner plays and builds from, and only his
promotion changes it: `pnpm audit:promote` and `.github/workflows/promote.yml` hold what a
promotion runs. Nothing automated writes to `main`.

Branch from `dev`, merge to `dev`, and never push `main`.

This applies to subagents you dispatch.

**Every commit follows the repo's convention**, not an invented one — `git log` is the reference:

- `type: lowercase summary`, or `type(scope): lowercase summary`. `tools/hooks/commit-msg` holds
  the types it accepts. Do not invent a type; a noun such as `db` belongs in the scope, as
  `feat(db):`.
- A body only where the change needs explaining. Many commits here have none.
- **A body is bullets, never prose.** One `- ` per change, sentence case, ending in a full
  stop, naming the symbol or file inline. `eb79af85`, `ef1cb295` and `bd98c2c4` are the
  reference. A paragraph explaining the reasoning behind a change does not belong in a commit
  message; put it in the code, a test, or the issue.
- Keep the `Co-Authored-By` trailer.

**The hooks in `tools/hooks/` enforce it**, along with branch names, blocked branches and private
words; each refusal names its rule. `pnpm hooks:install` links them into `.git/hooks`; run it in
any clone whose hooks are missing. Never bypass them with `--no-verify`.

## Trackers

**GitHub issues hold all tracked work** — defects, features and decisions. `gh issue list` is the
board. Work done in a conversation is tracked only when its scope calls for it; see "Pull requests".
A feature's issue is its spec; no spec file sits beside it. There is no `docs/` directory: what
shipped before the board is the closed milestone `v0.1 - Before the board`, and a permalink pinned
to an older commit still reaches any file `docs/` held. The item rules live beside the `items`
skill, in `.claude/skills/items/ITEM-RULES.md`.

**Look the vocabulary up; do not recall it.**

```bash
pnpm issue labels                                                 # every label an issue may carry
gh api '/users/bk-bf/projectsV2/4/fields?per_page=100'           # the board's fields and their options
pnpm issue milestone list                                         # every milestone and how much of it is closed
```

The labels are `tools/audit/labels.json` plus one per audit rule `name`. Adding a label means
editing that file, not inventing one at a call site; `pnpm issue sync-labels` creates what is
missing and names the strays, and `--prune` deletes a stray no issue carries.

**A rule is labelled by its name, not its id.** Every rule in `tools/audit/rules/` carries a
`name`, and that is what reaches the board and the issue slug. The id stays the ledger's key and
does not appear in anything a person reads.

**Triage through the lanes, never around them.** The board is
[projects/4](https://github.com/users/bk-bf/projects/4) and its columns are an order:
`Backlog` → `Ready` → `In progress` → `In Check` → `PR ready` → `On dev` → `Done`, with
`Blocked on you`, `Manual`, `Failed` and `Rejected` off to the side. The board carries an issue as
far as `Ready`; from there the work is a pull request, and the card follows it. A change to the
lanes inserts or drops the one option it concerns and keeps every other option where the owner put
it; rewriting the whole option list moves his columns.

- **`Backlog`** — raised, not yet evaluated. The audit raises here and nowhere else. A card with an
  open pull request is never here.
- **`Ready`** — nothing blocks it, no decision is outstanding, the scope is clear enough to
  start. An agent promotes a `drift` or `test gap` card out of `Backlog` itself, and says why.
  Any other kind waits for the owner: the agent comments on the issue with the open decision or
  task it overlaps, or "none", and what in play reaches the code it cites, then moves it to
  `Blocked on you`. He moves it to `Ready`.
- **`Failed`** — tried and did not land. The reason is on the issue or the pull request. The
  fixer never picks from here; the owner reads the reason and moves the card on. An agent moves a
  card out of `Failed` only when he says so.
- **`In progress`** — a branch exists and an agent is on it. Pushing a `<type>/<title>-<n>` branch
  that has no ready pull request moves card `n` here.
- **`In Check`** — a ready pull request is open and its checks, and the reviewer, are running.
  Nothing moves a card here by hand; opening or pushing its ready pull request does.
- **`Manual`** — he is working it by hand, and the fixer and the reviewer leave it alone. When an
  agent takes a `Manual` card up, pushing its `-<n>` branch moves it to `In progress`, and opening
  its pull request moves it to `In Check`.
- **`PR ready`** — the pull request has passed review, or it is a `needs playtest` pull request,
  which waits for him to play and merge it.
- **`On dev`** — merged to `dev` by a pull request, and not yet in the build he plays.
- **`Done`** — promoted to `main`, so it is in the game he plays. The issue was closed when it
  reached `dev`; the lane is where the work lives, not whether it is finished.
- **`Blocked on you`** — cannot proceed until he chooses: a proposal awaiting a yes, a design
  call whose measurements are already in hand, or a card that is not `drift` or `test gap`
  waiting for his yes to be worked. Not a parking space for anything merely hard.
- **`Rejected`** — closed without being wanted, with the reason as a comment on the issue.
  The owner puts cards here.

**Every card past `Backlog` is a real issue.** A draft or a pull request card sits only in
`Backlog` or `Rejected`. Do not put a draft card on the board to represent work that has a spec
but no issue; planned work is an issue from the start, and waits in `Backlog` until the owner moves
it on.

**`Blocked on you`, `Manual` and `Rejected` are his lanes.** Put a card in when it belongs there.
**Never take one out**, except a `Manual` card an agent takes up — he is the only one who decides a
thing he asked to look at has been looked at. And do not put one back because he moved it out:
him moving a card is the answer, not a mistake to correct. The one other way out is the `unblock`
skill, which asks him about each `Blocked on you` card and records his answer before it moves the
card to `Ready`.

Move a card with `pnpm issue lane <n> <lane>`; it refuses a move these rules forbid and says
which. Direct `gh project item-edit` is denied. Do not skip a lane: nothing goes from `Backlog`
straight to `In progress` except when a pull request opens for it, nothing reaches `On dev` except
through a merged pull request, and nothing reaches `Done` except by a promotion he ran.

**After `Ready`, the work is a pull request.** The fixer (`pnpm audit:fix`,
`tools/audit/fix.mjs`), the reviewer (`pnpm audit:review`, `tools/audit/review.mjs`) and the
resolver (the `resolve` skill) turn cards into pull requests and judge them; read them for what
each picks and runs. A card that comes back to `Ready` is worked again onto the same pull request,
and the fixer reads every comment on it first — the owner's included — so a comment there is how
work is sent back with a reason. A branch for a card is named `<type>/<title>-<issue number>`, and
a branch with no issue `<type>/<title>`, never a number alone. The fixer and the reviewer stop
while the audit is paused, because they spend the same limits; `pnpm audit:fix` says when it is.

Branch protection holds pull requests into `dev` to the required jobs on an up-to-date branch.
The admin account every agent pushes with pushes to `dev` directly, and a red check on `dev` is
fixed by the next push.

**`board-sync.py` runs every five minutes on ubuntuserver**
(`~/server/mediaserver/scripts/board-sync.py`, with `tools/audit/after-merge.mjs`). It merges the
pull requests that are ready to merge, keeps the open ones up to date with `dev`, moves merged
cards to `On dev`, writes the labels that mirror a board field, and adds any open issue missing
from the board to `Backlog`. Read it for the exact conditions before you rely on one.

**Never write to GitHub with `gh` directly.** `gh issue create|edit|close|comment`,
`gh label create|edit|delete` and `gh pr create|edit` are denied in `.claude/settings.json`. Use
`pnpm issue`; `grep -o "cmd === '[a-z-]*'" tools/issue.mjs` lists every command it has:

```bash
pnpm issue lint --body-file draft.md                     # would this body be accepted?
pnpm issue create --title T --type fix --body-file - ... # a new issue; it names what is missing
pnpm issue edit <n> ...                                  # labels, fields, milestone, parent
pnpm issue close <n> --commit <sha>
pnpm -s issue pr --head <branch> --title T --body-file - # open a pull request into dev
pnpm issue pr-edit <n> --body-file -                     # rewrite its description
pnpm issue pr-sync [<n>...]                              # copy each issue's labels and milestone to its pull request
pnpm -s issue board                                      # the whole board as JSON
pnpm issue check-labels                                  # every open issue with a missing label or field
pnpm issue check-links                                   # every citation that points at nothing
pnpm issue tidy [--remove]                               # merged or idle worktrees, branches and test clones
```

Every command checks what it writes and refuses with the reason. It rewrites what is mechanical,
such as a `path:line` into a permalink pinned to one commit, and refuses what is not.
`pnpm issue check-links` exits non-zero, so run it after any pass that rewrites bodies — a spot
check on a handful of issues proves nothing about the rest. `pnpm issue fix-links` repairs what
can be repaired and leaves the rest reported.

**Every issue carries the required labels and board fields.** `pnpm issue create` refuses an
issue missing one and names it, and `pnpm issue check-labels` reports every open issue that has
drifted. `checkRequired` in `tools/audit/lib/schema.mjs` and the board's fields say what is
required. The judgement calls:

- **Subarea** names where in the code the issue is. It is derived, not judged:
  `tools/audit/lib/subarea.mjs` maps a path to its label, and an issue citing several files takes
  the one most of its evidence sits in. Set it by hand only on an issue that cites no code.
- **Area** is the board's game-domain field: what part of the game, not where in the code.
- **Work type** is a board field, not a label, and nothing mirrors it; its words are the commit
  types.
- **Size** is the effort: `S` is one change in a file or two, `M` is several files or a
  measurement, `L` is several steps, a new system or a design.
- **Agent** is the model the fixer works the card under. Pick the smallest model the scope
  allows: `haiku` for a mechanical change in a file or two, `sonnet` for several files, a feature
  step or a headless measurement, `opus` only for a cross-cutting refactor, a new system or a
  design.

**A feature is built one step per branch.** Work type `feat` goes with the kind `feature`. The body
follows `.github/ISSUE_TEMPLATE/feat.md`, and may add `## Decisions this needs before any edit` and
`## Considered and rejected`. Each checkbox under `## Steps` is one branch and one pull request:
the fixer works the first open step only, and its pull request says `Part of #n` with the step on
a `Step:` line, so merging it does not close the issue. Write each step as a change that can be
merged, verified and reviewed by itself.

**A pull request never links an issue with open sub-issues.** The board shows a pull request only
on the issue it closes, so one that says `Part of #n` about a parent shows on no card. Link the
sub-issue the work belongs to, making a new one with `pnpm issue create --parent <n>` when a step
has none. Its pull request says `Fixes #<sub-issue>`, with the parent's step on the `Step:` line.

**A milestone is a version, or one part of a version named after it**: `v0.2`, or
`v0.2 - Gameplay`, because GitHub milestones do not nest. Every issue sits in one, and a sub-issue
sits in a milestone of its parent's version. Each spec category is a parent issue, and each
feature of the category is a sub-issue with its own `## Steps`. `tools/audit/milestones.json`
names the `current` milestone, where every new issue lands unless `--milestone` or its parent
names another, and the `draft` ones, which take only an issue assigned to them by name. A new
issue lands inside the version being finished because it can reveal a blocker for it; sort each
one into a part of that version or into the next.

**A body has to say something.** `create` refuses a stub and says why. `.github/ISSUE_TEMPLATE`
holds the shape, though structure is not the bar — a checkbox list with citations is fine, and a
wall of unbroken prose is not.

**Reading is not free.** Every agent on both machines, `board-sync.py` and the dashboard share one
hourly GraphQL budget, and reading the board is the costliest call there is. Read it once, with
`pnpm -s issue board`, and keep the result; when GraphQL is spent it reads over REST, which has a
budget of its own. Card writes and `gh issue create` need GraphQL, and fail until the hour resets.

**Check the limit with GraphQL, not `gh api rate_limit`.** Its `graphql` figure does not track
the counter the limit is enforced against, and reads `used 0` while hundreds are spent. A
rate-limit hint telling you to run `gh api rate_limit --jq .resources` is wrong for this. Run:

```bash
gh api graphql -f query='{rateLimit{used remaining resetAt}}' --jq .data.rateLimit
```

At `remaining 0`, wait for `resetAt` rather than retrying.

**`Priority` is the severity label, projected onto a field** (`SEVERITY_PRIORITY` in
`tools/issue.mjs` and `board-sync.py`). It exists because the board can group and sort by a field
and not by a label, so it carries no information severity does not, and it is never set by hand.

**Move the card, never the label.** A label that mirrors a board field is rewritten from the
field by `board-sync.py` within minutes, so an edit to the label is lost; change the field. A pull
request carries the labels and the milestone of the issue it fixes, and `pnpm issue pr`,
`pr-edit` and `pr-sync` copy them. Label the issue, never the pull request. A pull request is
never a card of its own. Kind, severity, origin and the rule name are not touched — they describe
the finding, not its state.

**Every issue says how it will be verified**, as a `Verify` field on the board and a label on
the issue. Set it at triage, not at review, so the cost of an item is visible before anyone
starts:

- **`verify tests`** — `pnpm check` and the vitest suite settle it. A refactor, a dead branch,
  a restated roster, a data row with a test over it. An agent finishes these alone.
- **`verify headless`** — it only shows up in the running sim, so it needs the `headless` skill:
  real pawns, real ticks, a stated delta. Job and stock flow, recipe throughput, combat
  measurement. Still an agent's job.
- **`needs playtest`** — the numbers can be produced but not judged. Balance feel, pacing, an
  interaction that has to be used. **Only these reach the owner.** An audit that says creatures die
  faster cannot say whether that is the game he wants.

Do not mark something `needs playtest` because it is large or risky. The test is whether a
measurement could settle it; if one could, it belongs in one of the first two.

**Close out the issue for work you finished.** `pnpm issue close <n> --commit <sha>`. If the issue
carries remediation checkboxes, tick the ones you did. Leaving a finished item open is the failure
to avoid.

## Pull requests

**Check what is already open before building or investigating.** Two sessions building the same
thing leaves two implementations and a conflict in the same file. `tools/audit/hooks/inflight.mjs`
lists the open pull requests with every prompt, and refuses the first edit in a session of a file
that an open pull request changes or an open issue cites, naming them. Read what it names; if the
edit belongs to that work, do it on that branch.

**An issue blocked by an open issue stays local.** Pushing its branch and opening its pull request
are refused, naming the blocker. Work on it and test it locally; it is pushed once the blocker
closes. `pnpm issue blocked-by <n> <blocker>` adds the link.

**Work an agent does on a board card goes through a pull request into `dev`.** The fixer opens
it, the reviewer and CI report on it, and it merges once they pass. The pull request is where he
reads the diff and where he writes what is wrong with it, and the fixer reads those comments on
its next attempt. Several related fixes belong in one branch and one pull request, not one each.

**Read a pull request's Check notes before calling it ready or merging it.** The `perf-notes` job
in `check.yml` keeps that one comment on each pull request, written by
`tools/work-pins/perf-notes.mjs`. A change the notes show as real cost gets a follow-up issue, or
goes back to its branch.

**Work done in a conversation needs no issue and no pull request; it is pushed straight to
`dev`.** Branch from `dev` in a worktree that does not track it, `git worktree add --no-track -b
<type>/<title> <path> origin/dev`, because a branch that tracks `origin/dev` lets an editor's Sync
push it without the gate. Commit, bring it up to date with `git fetch origin && git rebase
origin/dev`, and push it with `git push origin HEAD:dev`. The chain then runs on GitHub for the
pushed commit; watch it, and fix a red one with the next push. If the work settles an issue that
already exists, close it with the commit.

Open a pull request for conversation work only when it has to sit unmerged while something else
is decided, or is large enough to be reviewed as one diff: `pnpm -s issue pr --head <branch> --title T
--body-file -`, then `gh pr merge <n> --merge` once its required jobs are green on an up-to-date branch.
Keep the `-s`: it leaves the pull request's address as the command's only output, which the
PostToolUse hook in `~/.claude/settings.json` on ubuntuserver reads to attach the pull request to the
T3 Code thread.

Open an issue only when one of these holds:

- the scope is large enough to be reviewed as one diff, spans several sessions, or has to sit
  unmerged while something else is decided;
- the work is handed to the fixer, which works cards from `Ready` unattended and needs an issue
  to work from.

A small fix, a rule in this file, a tooling tweak or a one-step change asked for in the
conversation is none of these. Filing an issue for it adds a card and nothing he reads.

Nothing opens a pull request into `main`; `pnpm audit:promote` is how `dev` reaches it.
