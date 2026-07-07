// pinnable.svelte.ts — shared "pin on click" controller for the cursor-following HoverTip panels used
// by the pill / chip rows (StatPills, ItemPills, ConditionChips, TraitCards). A pill's HOVER opens a
// panel that follows the cursor; CLICKING the pill PINS it — the panel freezes at the click point,
// becomes pointer-interactive (so nested tooltip expansion can live inside it later), and stays open
// until dismissed. Dismiss = click-outside the panel, Esc, or re-clicking the pinned pill. Only ONE
// panel is pinned app-wide: pinning a new pill dismisses the previous.
//
// Usage: `const pin = createPinnable<View>()` in the component; wire a pill's onmouseenter→pin.open,
// onmousemove→pin.move, onmouseleave→pin.close, onclick→pin.toggle (which MUST stopPropagation so a
// pill click doesn't reach the outside-click dismiss). Render the panel from `pin.active` / `pin.x` /
// `pin.y` and pass `pinned={pin.pinned}` to the panel; the panel's root must carry `data-pin-panel` so
// a click inside it doesn't dismiss it.

interface PinController {
  dismiss(): void;
}

// Viewport point to anchor the panel at: the cursor for a mouse event, or the activated element's
// centre for a keyboard event (Enter/Space has no clientX/Y). HoverTip offsets + clamps from here.
function pointFromEvent(e: MouseEvent | KeyboardEvent): { x: number; y: number } {
  if ('clientX' in e && (e.clientX || e.clientY)) return { x: e.clientX, y: e.clientY };
  const el = e.currentTarget as HTMLElement | null;
  if (el) {
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }
  return { x: 0, y: 0 };
}

// The single pinned controller app-wide, plus the lazily-installed global dismiss listeners.
let current: PinController | null = null;
let listening = false;

function onDocClick(e: MouseEvent) {
  if (!current) return;
  const t = e.target as Element | null;
  // A click inside the pinned panel keeps it open (nested interaction); anything else dismisses.
  if (t && t.closest('[data-pin-panel]')) return;
  current.dismiss();
}
function onKey(e: KeyboardEvent) {
  if (current && e.key === 'Escape') current.dismiss();
}
function startListening() {
  if (listening || typeof document === 'undefined') return;
  // Bubble phase: a pill's onclick calls stopPropagation, so a pill click never reaches here — that's
  // what lets re-clicking the pinned pill toggle it off instead of dismiss-then-repin.
  document.addEventListener('click', onDocClick);
  document.addEventListener('keydown', onKey);
  listening = true;
}
function stopListening() {
  if (!listening || typeof document === 'undefined') return;
  document.removeEventListener('click', onDocClick);
  document.removeEventListener('keydown', onKey);
  listening = false;
}

export function createPinnable<T>() {
  let active = $state<T | null>(null);
  let key = $state<string | null>(null);
  let pinned = $state(false);
  let x = $state(0);
  let y = $state(0);

  const ctrl = {
    get active() {
      return active;
    },
    get pinned() {
      return pinned;
    },
    get x() {
      return x;
    },
    get y() {
      return y;
    },
    /** Hover open — follows the cursor. Frozen (no-op) while pinned. */
    open(target: T, k: string, e: MouseEvent) {
      if (pinned) return;
      active = target;
      key = k;
      x = e.clientX;
      y = e.clientY;
    },
    /** Track the cursor while hovering. Frozen while pinned. */
    move(e: MouseEvent) {
      if (pinned) return;
      x = e.clientX;
      y = e.clientY;
    },
    /** Hover close (mouseleave). Frozen while pinned. */
    close() {
      if (pinned) return;
      active = null;
      key = null;
    },
    /** Click / Enter / Space: pin this pill (freezing the panel), or unpin if it's already pinned. */
    toggle(target: T, k: string, e: MouseEvent | KeyboardEvent) {
      e.stopPropagation();
      if (pinned && key === k) {
        ctrl.dismiss();
        return;
      }
      if (current && current !== ctrl) current.dismiss();
      const p = pointFromEvent(e);
      active = target;
      key = k;
      x = p.x;
      y = p.y;
      pinned = true;
      current = ctrl;
      startListening();
    },
    dismiss() {
      pinned = false;
      active = null;
      key = null;
      if (current === ctrl) {
        current = null;
        stopListening();
      }
    }
  };
  return ctrl;
}
