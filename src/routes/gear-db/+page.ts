// Dev tool route: render server-side too (the game app is CSR-only, but this static data table SSRs
// fine and it makes the page deep-linkable without a hydration flash).
export const ssr = true;
export const csr = true;
export const prerender = false;
