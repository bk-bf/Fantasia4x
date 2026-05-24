<!-- LOC cap: 80 (created: 2026-05-25) -->

# DESIGN [UI]

> **Related:** [ARCHITECTURE](ARCHITECTURE.md) · [game/DESIGN](../game/DESIGN.md)

## Visual Direction

Retro terminal aesthetic throughout — the interface looks like a monochrome CRT terminal running a management program.

## Rules

- **Monospace font only** (`font-family: monospace`) — no proportional fonts anywhere
- **Dark background, bright foreground** — near-black background, green or amber text
- **ASCII box-drawing** for all panels and borders: `┌─┐ │ └─┘ ├─┤ ─`
- **ALL-CAPS labels**, normal-case values
- No rounded corners, gradients, drop shadows, or icon fonts
- Colour is used for status only: green = healthy/positive, amber = warning, red = critical

## Colour Tokens

| Token                | Use                             |
| -------------------- | ------------------------------- |
| `var(--color-text)`  | Default foreground              |
| `var(--color-bg)`    | Background                      |
| `var(--color-green)` | Positive status, healthy values |
| `var(--color-amber)` | Warning, mid-range values       |
| `var(--color-red)`   | Critical, low health/needs      |
| `var(--color-dim)`   | Secondary text, disabled state  |

## Layout

- Fixed sidebar for resources (always visible)
- Main content area switches by active screen
- Activity log is an overlay, not inline
- Progress bars use ASCII fill characters (`█░`)

## Activity Log

Append messages via the `log` store — never `console.log` for player-facing events:

```typescript
import { log } from '$lib/stores/Log';
log.add(`${pawn.name} completed carpentry task.`);
```
