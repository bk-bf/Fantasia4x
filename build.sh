#!/usr/bin/env bash
# build.sh — produce Fantasia4x desktop builds LOCALLY (no GitHub Actions needed).
#
# Mirrors the CI pipeline: Rust→WASM  →  SvelteKit static bundle  →  electron-builder.
# Artifacts land in dist-electron/.
#
#   ./build.sh                      no OS flag → builds BOTH installers (Linux + Windows)
#   ./build.sh --linux              Linux installers: AppImage + .deb
#   ./build.sh --windows            Windows installer: NSIS .exe (cross-built via Wine on Linux)
#   ./build.sh --linux --windows    both of the above (same as no flag)
#   ./build.sh --local              quick UNPACKED build for THIS machine — run it straight away,
#                                     no installer packaging (dist-electron/linux-unpacked/)
#   ./build.sh --dry                pre-flight: production static build + scan for dev-only /src asset
#                                     paths that 404 once packaged. No packaging — fast; run during dev.
#   ./build.sh --push               cut a release via CI: autotag (git-cliff) + push → GitHub Actions
#                                     builds both OSes and publishes the GitHub Release.
#   ./build.sh --local --push       cut a release ENTIRELY on this machine: build Linux + Windows,
#                                     git-cliff changelog, autotag, and gh-publish the installers.
#                                     (CI's guard job skips the redundant cloud build for this tag.)
#                                     Override the computed version with RELEASE_TAG=vX.Y.Z.
#
# WASM is rebuilt only if missing; delete src/lib/{spatial,sim}-core-pkg to force a fresh compile.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

usage() {
  awk 'NR==1 {next} /^#/ {sub(/^# ?/, ""); print; next} {exit}' "$0"
}

LINUX=false
WINDOWS=false
LOCAL=false
DRY=false
PUSH=false
while [[ $# -gt 0 ]]; do
  case "$1" in
    --linux) LINUX=true ;;
    --windows | --win) WINDOWS=true ;;
    --local) LOCAL=true ;;
    --dry) DRY=true ;;
    --push) PUSH=true ;;
    -h | --help) usage; exit 0 ;;
    *) echo "build.sh: unknown option '$1' (try --help)" >&2; exit 1 ;;
  esac
  shift
done

# --dry: pre-flight a production build and scan it for dev-only /src asset paths — the class of bug that
# only 404s once packaged (fetch('/src/…') works against the dev server, not the static bundle). No
# electron packaging, so it's fast enough to run during spike testing. The ESLint rule catches the
# common case live in the editor; this catches whatever reaches the actual bundle.
if $DRY; then
  if [[ ! -f src/lib/spatial-core-pkg/spatial_core.js || ! -f src/lib/sim-core-pkg/sim_core.js ]]; then
    echo "▸ Building WASM packages…"; pnpm add:wasm; pnpm add:wasm:sim
  fi
  echo "▸ Building SvelteKit static bundle (production)…"
  pnpm build
  echo "▸ Scanning bundle for /src runtime fetch paths (would 404 in the packaged app)…"
  if HITS=$(grep -rIlE "[\"']/src/" build/_app --include='*.js') && [[ -n "$HITS" ]]; then
    echo "✗ DRY CHECK FAILED — bundle file(s) reference a quoted /src runtime path (404 when packaged):" >&2
    echo "$HITS" | sed 's/^/    /' >&2
    echo "  Fix: import the asset with ?raw / ?url, or move it to static/ and fetch from the site root." >&2
    exit 1
  fi
  echo "✓ Dry check passed — production bundle has no /src runtime fetches. Safe to package."
  exit 0
fi

# ---- Release (--push) -------------------------------------------------------------------------------
# --push cuts a tagged release. WITH --local everything happens here (build both OSes → git-cliff
# changelog → tag → gh release + upload). WITHOUT --local it hands off to CI (tag + push;
# .github/workflows/build.yml builds + publishes). A guard job in that workflow skips the redundant
# cloud build when a published release already exists for the tag, so the local path never double-fires.
RELEASE_TAG_OVERRIDE="${RELEASE_TAG:-}"
if $PUSH; then
  command -v git-cliff >/dev/null 2>&1 || {
    echo "build.sh: --push needs git-cliff (autotag + changelog). Install: sudo pacman -S git-cliff" >&2; exit 1; }
  command -v gh >/dev/null 2>&1 || { echo "build.sh: --push needs the GitHub CLI 'gh'." >&2; exit 1; }
  gh auth status >/dev/null 2>&1 || { echo "build.sh: gh isn't authenticated — run 'gh auth login'." >&2; exit 1; }

  BRANCH="$(git rev-parse --abbrev-ref HEAD)"
  if [[ "$BRANCH" != "main" ]]; then
    read -rp "build.sh: on '$BRANCH', not main. Tag a release from here anyway? [y/N] " a
    [[ "$a" == [yY]* ]] || { echo "Aborted."; exit 1; }
  fi
  if ! git diff --quiet || ! git diff --cached --quiet; then
    echo "build.sh: working tree has uncommitted changes — commit or stash before releasing." >&2; exit 1
  fi

  # Autotag: git-cliff computes the next semver from the conventional commits since the last tag.
  TAG="${RELEASE_TAG_OVERRIDE:-$(git-cliff --bumped-version 2>/dev/null || true)}"
  [[ -n "$TAG" ]] || { echo "build.sh: couldn't compute the next version (git-cliff --bumped-version). Set RELEASE_TAG=vX.Y.Z." >&2; exit 1; }
  [[ "$TAG" == v* ]] || TAG="v$TAG"
  if git rev-parse -q --verify "refs/tags/$TAG" >/dev/null; then
    echo "build.sh: tag $TAG already exists locally. Set RELEASE_TAG=vX.Y.Z to override." >&2; exit 1
  fi

  LAST_TAG="$(git describe --tags --abbrev=0 --match 'v*' 2>/dev/null || echo '')"
  COMMITS="$(git rev-list --count "${LAST_TAG:+$LAST_TAG..}HEAD")"
  echo "▸ Release ${LAST_TAG:-（first）} → $TAG  ($COMMITS commits)"

  if $LOCAL; then
    echo "  Mode: LOCAL — build Linux + Windows here, then publish to GitHub from this machine."
    LINUX=true; WINDOWS=true   # a release always ships both installers, regardless of --local's usual meaning
  else
    echo "  Mode: CI — tag & push; GitHub Actions builds and publishes."
    read -rp "  Tag $TAG, push origin/$BRANCH + $TAG, and let CI build+publish? [y/N] " a
    [[ "$a" == [yY]* ]] || { echo "Aborted (nothing pushed)."; exit 1; }
    git tag -a "$TAG" -m "$TAG"
    git push origin "$BRANCH"
    git push origin "$TAG"
    REPO_URL="$(gh repo view --json url -q .url 2>/dev/null || echo '')"
    echo "✓ Pushed $TAG. CI is building & will publish the release: ${REPO_URL}/actions"
    exit 0
  fi
fi

# Default (no --linux/--windows, and not the unpacked --local build): produce BOTH installers.
if ! $LINUX && ! $WINDOWS && ! $LOCAL; then
  LINUX=true
  WINDOWS=true
  echo "▸ No OS flag given — building both installers (Linux + Windows)."
fi

# Windows installers cross-build on Linux through Wine — fail early with a clear hint if it's missing.
if $WINDOWS && [[ "$(uname -s)" == "Linux" ]] && ! command -v wine >/dev/null 2>&1; then
  echo "build.sh: --windows cross-builds the NSIS installer via Wine, which isn't installed." >&2
  echo "  Install it (Arch/CachyOS):  sudo pacman -S wine    — then re-run." >&2
  exit 1
fi

# 1. Rust → WASM (only if missing; the -pkg dirs are gitignored build outputs).
if [[ ! -f src/lib/spatial-core-pkg/spatial_core.js || ! -f src/lib/sim-core-pkg/sim_core.js ]]; then
  echo "▸ Building WASM packages (spatial-core, sim-core)…"
  pnpm add:wasm
  pnpm add:wasm:sim
fi

# 2. SvelteKit static bundle (adapter-static → build/).
echo "▸ Building SvelteKit static bundle…"
pnpm build

# Force IPv4 DNS for electron-builder's downloader. This machine's system resolver falls through to a
# broken Tailscale IPv6 nameserver (fd7a:115c:a1e0::53), so the Go downloader can't resolve github
# (ping/curl work only because they use the IPv4 path). Run packaging inside an unprivileged user+mount
# namespace with resolv.conf pinned to public IPv4 resolvers — no sudo, no permanent system change. If
# unprivileged namespaces are unavailable, fall back to a plain run (then a working system DNS is needed).
RESOLV4="$(mktemp)"
printf 'nameserver 1.1.1.1\nnameserver 8.8.8.8\n' > "$RESOLV4"
trap 'rm -f "$RESOLV4"' EXIT
NS_DNS=false
if unshare --user --map-root-user --mount --fork bash -c 'mount --bind "$1" /etc/resolv.conf' f4x "$RESOLV4" 2>/dev/null; then
  NS_DNS=true
  echo "▸ Forcing IPv4 DNS for electron-builder (user namespace, resolv.conf → 1.1.1.1)."
else
  echo "build.sh: unprivileged user namespaces unavailable — using the system DNS (may fail if IPv6 DNS is broken)." >&2
fi

# electron-builder, run with IPv4 DNS forced when the namespace is available.
eb() {
  if $NS_DNS; then
    unshare --user --map-root-user --mount --fork \
      bash -c 'mount --bind "$1" /etc/resolv.conf; shift; exec "$@"' \
      f4x "$RESOLV4" pnpm exec electron-builder "$@"
  else
    pnpm exec electron-builder "$@"
  fi
}

# Package with electron-builder. --publish never: electron-builder only ever produces local artifacts;
# any GitHub publish is done explicitly below via gh (the --push path), never by electron-builder.
EB_ARGS=(--publish never)
if $LOCAL && ! $PUSH; then
  echo "▸ Packaging unpacked build for this machine (--dir)…"
  eb --dir "${EB_ARGS[@]}"
else
  if $LINUX; then EB_ARGS+=(--linux); fi
  if $WINDOWS; then EB_ARGS+=(--win); fi
  echo "▸ Packaging installers (electron-builder ${EB_ARGS[*]})…"
  eb "${EB_ARGS[@]}"
fi

echo
echo "✓ Done. Artifacts in dist-electron/:"
ls -1 dist-electron/*.AppImage dist-electron/*.deb dist-electron/*.exe 2>/dev/null || true
if $LOCAL && ! $PUSH; then
  echo "  unpacked app → dist-electron/linux-unpacked/  (run: ./dist-electron/linux-unpacked/fantasia4x)"
fi

# ---- Publish the LOCAL release (build.sh --local --push) --------------------------------------------
# The installers are built; now changelog → push branch → draft release (uploads assets, no tag yet) →
# publish (this creates the tag, which is what fires CI; build.yml's guard then skips since the release
# already exists with assets).
if $PUSH && $LOCAL; then
  echo
  mapfile -t ASSETS < <(ls dist-electron/*.AppImage dist-electron/*.deb dist-electron/*.exe 2>/dev/null)
  if [[ ${#ASSETS[@]} -eq 0 ]]; then
    echo "build.sh: no installers in dist-electron/ to upload — aborting release." >&2; exit 1
  fi

  NOTES="$(mktemp)"; trap 'rm -f "$RESOLV4" "$NOTES"' EXIT
  echo "▸ Generating changelog for $TAG (git-cliff)…"
  git-cliff --tag "$TAG" --latest --strip header -o "$NOTES"

  echo "▸ Assets to publish:"; printf '    %s\n' "${ASSETS[@]}"
  read -rp "  Publish release $TAG to GitHub with these assets? [y/N] " a
  [[ "$a" == [yY]* ]] || { echo "Aborted (nothing published)."; exit 1; }

  echo "▸ Pushing $BRANCH so the release target commit exists on origin…"
  git push origin "$BRANCH"

  echo "▸ Creating draft release + uploading installers…"
  gh release create "$TAG" --draft --target "$(git rev-parse HEAD)" --title "$TAG" --notes-file "$NOTES" "${ASSETS[@]}"
  echo "▸ Publishing $TAG (creates the tag)…"
  gh release edit "$TAG" --draft=false
  git fetch origin --tags --quiet 2>/dev/null || true
  echo "✓ Published: $(gh release view "$TAG" --json url -q .url 2>/dev/null)"
fi
