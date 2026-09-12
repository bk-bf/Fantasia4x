---
name: unblock
description: Clear the Blocked on you lane of the Fantasia4x board. Propose a resolution for each card's open decision through the question tool, record Kirill's answers on the issue, and move each answered card to Ready. Use when asked to resolve, unblock or go through the Blocked on you cards, or to "ask me about the blocked cards".
---

# Clearing the Blocked on you lane

Kirill clicks through questions; everything else is yours. The work is in the proposals: the
recommended option should be the one he would pick after reading the issue himself, so he can
accept most of them in a click. A question he has to research before answering has failed.

## 1. Read the lane

- `gh issue list --state open --label "needs decision" --json number,title` lists the lane.
  `board-sync.py` derives `needs decision` from the Blocked on you status every tick, so this
  costs about 1 GraphQL point, against 101 for `gh project item-list`.
- For each card, `gh issue view <n> --json title,body,comments`. The open decision sits under
  `## Decisions this needs before any edit`, under `## Options`, or in the comment that moved the
  card into the lane. Note every `#N` the card says it waits for.

## 2. Build each proposal before asking

- Every option has to be one the issue, its citations or a measurement supports. Read the cited
  lines. When the issue names a measurement that settles the choice and it is cheap, run it with
  the `headless` skill first; an option backed by a number is one he can accept without reading.
- 2 to 4 options, the recommended one first with `(Recommended)` at the end of its label. Each
  description says what changes in the game and what it costs, in plain words.
- A card that waits for another open issue, as #14 waits for #22, is not a question. Skip it
  and list it at the end with what it waits for.
- A card whose decision he already made in an earlier comment gets one question: move to Ready,
  or not.

## 3. Ask

- `AskUserQuestion` takes at most 4 questions per call, 2 to 4 options each, and a header of at
  most 12 characters. Put the issue number in the header: `#54 peak age`.
- A card with several decisions gets a call of its own. Cards with one decision each can share a
  call.
- Go in dependency order: a card that others wait for comes before them, so its answer can
  unblock them in the same session.
- The tool adds an "Other" choice itself. Offer "Not now" only where leaving the card blocked is
  a real choice.

## 4. Record the answers, in this order

1. **Body.** Add a `## Decided` section with one bullet per question, the question and his answer,
   plus his note if he typed one. Put it directly after `## Decisions this needs before any edit`,
   or at the end. Write it with `pnpm issue edit <n> --body-file -`. The fixer reads the issue
   body and the pull request's comments, not the issue's comments (`buildPrompt` in
   `tools/audit/fix.mjs`), so an answer left only in a comment never reaches it.
2. **Comment.** `pnpm issue comment <n> --body-file -`, starting with the exact line
   `**Answered by Kirill**`, followed by the same bullets and nothing else.
3. **Lane.** `pnpm issue lane <n> ready`. `moveLane` allows a move out of Blocked on you only to
   Ready, and only while the card's latest comment starts with `**Answered by Kirill**`, so the
   comment has to be the last thing written to the issue before the move.

Leave the card in its lane when the answer was "Not now", a rejection, a new question, or when
the answer leaves it waiting for another open issue. The answer is still recorded. Rejected is
his lane to drag a card into.

## 5. Report

One table: card, his answer in a few words, the lane it is in now. Then the cards skipped and
what each waits for. A card in Ready is worked only while the audit is not paused, and
`pnpm audit:fix --next` takes only the `tests` route.
