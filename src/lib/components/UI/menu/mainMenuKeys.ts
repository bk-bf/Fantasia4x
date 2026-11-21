const STEP: Record<string, number> = { ArrowDown: 1, ArrowUp: -1 };

export function stepFocus(e: KeyboardEvent, selector: string): HTMLButtonElement | null {
  const dir = STEP[e.key];
  if (!dir) return null;
  const targets = [...document.querySelectorAll<HTMLButtonElement>(selector)];
  if (!targets.length) return null;
  const at = targets.indexOf(document.activeElement as HTMLButtonElement);
  const next = targets[at < 0 ? 0 : (at + dir + targets.length) % targets.length];
  next.focus();
  e.preventDefault();
  return next;
}

export function flagIndex(target: EventTarget | null): number {
  const flag =
    target instanceof Element ? target.closest<HTMLButtonElement>('button[data-index]') : null;
  return flag && !flag.disabled ? Number(flag.dataset.index) : -1;
}
