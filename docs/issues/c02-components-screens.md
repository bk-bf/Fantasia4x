---
id: c02-components-screens
title: Caught error is discarded — components/screens
status: open
kind: correctness
severity: high
ready: false
origin: audit
rules:
  - C02
files:
  - src/lib/components/screens/DebugLogScreen.svelte
symbols:
  - src/lib/components/screens/DebugLogScreen.svelte::clearLogs#0
created: 2026-09-04
updated: 2026-09-04
---

# Caught error is discarded — components/screens

> **Related:** [issues/README](README.md) · [tools/audit](../../tools/audit/README.md) · [rule source](../../.claude/skills/headless/SKILL.md)

## What breaks

Rule `C02` — caught error is discarded — holds in 1 place under `components/screens`. Each one is listed below with the evidence the audit required before it would record a fail.

The clearest case: `clearLogs` swallows every `fetch` rejection with an empty `.catch(() => {})`, so a failed server-side log deletion is indistinguishable from a successful one while the in-memory log is already cleared.

## Evidence

- [`src/lib/components/screens/DebugLogScreen.svelte:73`](../../src/lib/components/screens/DebugLogScreen.svelte#L73) — `clearLogs` swallows every `fetch` rejection with an empty `.catch(() => {})`, so a failed server-side log deletion is indistinguishable from a successful one while the in-memory log is already cleared.
  - src/lib/components/screens/DebugLogScreen.svelte:75 — `await fetch('/api/logs', { method: 'DELETE' }).catch(() => {});` — the handler body is empty: no log, no rethrow, no state written.
  - The awaited expression is `fetch('/api/logs', { method: 'DELETE' })`, which rejects on any network-level failure (dev server down, connection reset, request aborted). The route it targets is `src/routes/api/logs/+server.ts:7`, whose `DELETE` handler calls `readdirSync`/`unlinkSync` over the `.debug` directory; a server-side throw there or the production guard at src/routes/api/logs/+server.ts:8-10 returns a non-2xx response, and that path is never inspected either — `res.ok` is not checked at src/lib/components/screens/DebugLogScreen.svelte:75.
  - The caller is the `clear` button at src/lib/components/screens/DebugLogControls.svelte:43, wired through `onclear={clearLogs}` at src/lib/components/screens/DebugLogScreen.svelte:90. `clearDebugLog()` (src/lib/stores/Log.ts:142-144) has already run `debugLog.set([])`, so the panel renders the `no log entries yet` empty state at src/lib/components/screens/DebugLogScreen.svelte:95. The player-visible result is a fully cleared log, while the `.debug/*.log` files the request was meant to delete are still on disk and nothing reports the discrepancy.

## Why nothing caught it

Nothing below the judgment tier can decide this one: it is why `C02` exists at T2 rather than as a lint rule or a test. The invariant is stated in `.claude/skills/headless/SKILL.md#when-it-stalls`. If the fix makes the class mechanically checkable, add that check and demote the rule — `node tools/audit/audit.mjs demote` tracks which rules have earned it.

## Remediation

- [ ] Confirm each citation above still holds; drop any whose evidence does not.
- [ ] Fix every remaining site under `components/screens` — this is one class, one PR.
- [ ] Add the check that would have caught it, or record why it stays a judgment call.
- [ ] `pnpm check` and `pnpm test:related` on the changed files are green.

## Out of scope

Sites outside `components/screens`, and any other rule's findings — they are their own issues. Widening this PR past the citations above makes it unreviewable.
