/**
 * Stand-in for `$app/state` in the standalone gear-db bundle.
 *
 * The page reads `page.url.searchParams` twice, both times during component init, to restore a
 * deep-linked view. Outside SvelteKit there is no router to track, so this reads the real address
 * bar through a getter — deep links keep working, and nothing here needs to be reactive because
 * nothing in the page rewrites the URL.
 */
export const page = {
  get url(): URL {
    return new URL(window.location.href);
  }
};
