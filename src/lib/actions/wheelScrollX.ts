const LINE_PX = 16;

function scrollsAlongY(from: Element | null, stop: HTMLElement, dy: number): boolean {
  for (let el = from; el && el !== stop; el = el.parentElement) {
    if (el.scrollHeight <= el.clientHeight) continue;
    const oy = getComputedStyle(el).overflowY;
    if (oy !== 'auto' && oy !== 'scroll') continue;
    const atEnd =
      dy > 0 ? el.scrollTop + el.clientHeight >= el.scrollHeight - 1 : el.scrollTop <= 0;
    if (!atEnd) return true;
  }
  return false;
}

export function wheelScrollX(node: HTMLElement) {
  function onWheel(e: WheelEvent) {
    if (e.ctrlKey || Math.abs(e.deltaX) >= Math.abs(e.deltaY)) return;
    if (scrollsAlongY(e.target as Element, node, e.deltaY)) return;
    const room = node.scrollWidth - node.clientWidth;
    if (room <= 0) return;
    const unit = e.deltaMode === 1 ? LINE_PX : e.deltaMode === 2 ? node.clientWidth : 1;
    const next = Math.max(0, Math.min(room, node.scrollLeft + e.deltaY * unit));
    if (next === node.scrollLeft) return;
    e.preventDefault();
    node.scrollLeft = next;
  }
  node.addEventListener('wheel', onWheel, { passive: false });
  return () => node.removeEventListener('wheel', onWheel);
}
