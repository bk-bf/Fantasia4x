const STEP: Record<string, number> = { ArrowDown: 1, ArrowUp: -1 };

export function stepFocus(e: KeyboardEvent, selector: string): void {
  const dir = STEP[e.key];
  if (!dir) return;
  const targets = [...document.querySelectorAll<HTMLButtonElement>(selector)];
  if (!targets.length) return;
  const at = targets.indexOf(document.activeElement as HTMLButtonElement);
  targets[at < 0 ? 0 : (at + dir + targets.length) % targets.length].focus();
  e.preventDefault();
}
