/**
 * autohideScroll — Svelte action that reveals a scrollbar only while its element is actively
 * scrolling, then hides it again after a short idle. Attach to a CONTAINER (e.g. the tab
 * overlay panel): it listens in the capture phase, so every scrollable descendant is covered by
 * a single listener. The CSS (app.css) keeps the thumb transparent by default and shows it for
 * any element carrying `.is-scrolling`.
 *
 *   <div class="overlay-panel" use:autohideScroll> … </div>
 */
type ScrollEl = HTMLElement & { _ahsTimer?: ReturnType<typeof setTimeout> };

export function autohideScroll(node: HTMLElement, idleMs = 700) {
  function onScroll(e: Event) {
    const el = e.target as ScrollEl;
    if (!el || !el.classList) return; // ignore document/non-element scroll targets
    el.classList.add('is-scrolling');
    clearTimeout(el._ahsTimer);
    el._ahsTimer = setTimeout(() => el.classList.remove('is-scrolling'), idleMs);
  }
  // scroll does not bubble — capture catches it from any descendant scroll container.
  node.addEventListener('scroll', onScroll, true);
  return {
    destroy() {
      node.removeEventListener('scroll', onScroll, true);
    }
  };
}
