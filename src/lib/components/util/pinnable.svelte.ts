interface PinController {
  dismiss(): void;
}

function pointFromEvent(e: MouseEvent | KeyboardEvent): { x: number; y: number } {
  if ('clientX' in e && (e.clientX || e.clientY)) return { x: e.clientX, y: e.clientY };
  const el = e.currentTarget as HTMLElement | null;
  if (el) {
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }
  return { x: 0, y: 0 };
}

let current: PinController | null = null;
let listening = false;

function onDocClick(e: MouseEvent) {
  if (!current) return;
  const t = e.target as Element | null;
  if (t && t.closest('[data-pin-panel]')) return;
  current.dismiss();
}
function onKey(e: KeyboardEvent) {
  if (current && e.key === 'Escape') current.dismiss();
}
function startListening() {
  if (listening || typeof document === 'undefined') return;
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
    open(target: T, k: string, e: MouseEvent) {
      if (pinned) return;
      active = target;
      key = k;
      x = e.clientX;
      y = e.clientY;
    },
    move(e: MouseEvent) {
      if (pinned) return;
      x = e.clientX;
      y = e.clientY;
    },
    close() {
      if (pinned) return;
      active = null;
      key = null;
    },
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
