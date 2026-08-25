type ScrollEl = HTMLElement & { _ahsTimer?: ReturnType<typeof setTimeout> };

export function autohideScroll(node: HTMLElement, idleMs = 700) {
  function onScroll(e: Event) {
    const el = e.target as ScrollEl;
    if (!el || !el.classList) return;
    el.classList.add('is-scrolling');
    clearTimeout(el._ahsTimer);
    el._ahsTimer = setTimeout(() => el.classList.remove('is-scrolling'), idleMs);
  }
  node.addEventListener('scroll', onScroll, true);
  return {
    destroy() {
      node.removeEventListener('scroll', onScroll, true);
    }
  };
}
