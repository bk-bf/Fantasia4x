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
#   ./build.sh --unpacked           quick UNPACKED build for THIS machine — run it straight away,
#                                     no installer packaging (dist-electron/linux-unpacked/). (--local
#                                     still works as an alias.)
#   ./build.sh --install            build the Linux installers, then install/update on THIS machine,
#                                     picking the native method: the .deb via apt on Debian/Ubuntu-family
#                                     hosts (dpkg present), else the AppImage via apkg. Combine with
#                                     anything that builds installers; run alone it builds Linux + installs.
#   ./build.sh --dry                pre-flight: production static build + scan for dev-only /src asset
#                                     paths that 404 once packaged. No packaging — fast; run during dev.
#   ./build.sh --push               cut a release ENTIRELY on this machine (the default): build Linux +
#                                     Windows, git-cliff changelog, autotag, and gh-publish the installers.
#                                     If dist-electron/ already holds installers newer than the HEAD
#                                     commit, the build is SKIPPED and those artifacts are published
#                                     as-is (you still confirm the asset list before anything uploads).
#                                     On success it also bumps the README release badge to the new
#                                     version (a follow-up doc commit, pushed automatically).
#                                     Only the NEW version's artifacts are published; older installers
#                                     left in dist-electron/ are pruned afterwards.
#   ./build.sh --push --remote      cut the release via CI instead: autotag (patch bump) + push → GitHub
#                                     Actions builds both OSes and publishes the GitHub Release. Nothing
#                                     is built or published from this machine.
#   ./build.sh --push --tag v0.2.0  set the version/tag manually (either --push mode) instead of the
#                                     automatic patch bump. RELEASE_TAG=vX.Y.Z env var works too.
#
# Autotag bumps the PATCH of the last v* tag — one release per ~100 commits (v0.1.0 → v0.1.1 → …).
# Use --tag to jump a minor/major (e.g. --tag v0.2.0).
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
UNPACKED=false
REMOTE=false
DRY=false
PUSH=false
INSTALL=false
REUSE_BUILD=false
RESOLV4=""
TAG_ARG=""
INSTALL_METHOD=""   # set by the --install pre-flight: "deb" (apt) or "apkg" (AppImage)
while [[ $# -gt 0 ]]; do
  case "$1" in
    --linux) LINUX=true ;;
    --windows | --win) WINDOWS=true ;;
    --unpacked | --local) UNPACKED=true ;;
    --remote | --ci) REMOTE=true ;;
    --dry) DRY=true ;;
    --push) PUSH=true ;;
    --install) INSTALL=true ;;
    --tag | --version)
      TAG_ARG="${2:-}"
      [[ -n "$TAG_ARG" ]] || { echo "build.sh: --tag needs a version, e.g. --tag v0.2.0" >&2; exit 1; }
      shift
      ;;
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

# --install: install/update the freshly built app on this machine, using the host's native package
# format. On a Debian/Ubuntu-family host (dpkg present) install the .deb via apt — it lands in the
# system package db and apt resolves dependencies; everywhere else fall back to apkg installing the
# AppImage. Either way force the Linux installer build (the unpacked --dir path produces neither) and
# fail early if the chosen method's tooling is missing.
if $INSTALL; then
  LINUX=true
  UNPACKED=false   # --install wants a packaged installer, not the unpacked --dir build
  if command -v dpkg >/dev/null 2>&1; then
    INSTALL_METHOD=deb
    command -v apt >/dev/null 2>&1 || command -v apt-get >/dev/null 2>&1 || {
      echo "build.sh: --install on a .deb host needs apt/apt-get to install the package." >&2; exit 1; }
  else
    INSTALL_METHOD=apkg
    command -v apkg >/dev/null 2>&1 || {
      echo "build.sh: --install needs 'apkg' (AppImage installer) on PATH — no dpkg found for a .deb install." >&2; exit 1; }
  fi
fi

# ---- Release (--push) -------------------------------------------------------------------------------
# --push cuts a tagged release. By DEFAULT everything happens here on this machine (build both OSes →
# git-cliff changelog → tag → gh release + upload). WITH --remote it instead hands off to CI (tag + push;
# .github/workflows/build.yml builds + publishes). A guard job in that workflow skips the redundant
# cloud build when a published release already exists for the tag, so the local path never double-fires.
# Next version = the last v* tag with its PATCH bumped by one (v0.1.0 → v0.1.1). --tag / RELEASE_TAG
# override this for a manual minor/major jump. First release (no tag yet) starts at v0.1.0.
next_patch_tag() {
  local last ver ma mi pa
  last="$(git describe --tags --abbrev=0 --match 'v*' 2>/dev/null || echo '')"
  if [[ -z "$last" ]]; then echo "v0.1.0"; return; fi
  ver="${last#v}"
  IFS=. read -r ma mi pa <<<"$ver"
  echo "v${ma:-0}.${mi:-0}.$(( ${pa:-0} + 1 ))"
}

# Rewrite the "release pill" shields badge in README.md to the just-cut version and commit+push that
# one-line doc bump. The badge line ends with a `<!-- release-pill -->` marker (a trailing inline
# comment — kept OFF the line start so GitHub still parses the badge as markdown, not as a raw HTML
# block). No-ops if the file or marker are absent, or if the badge is already current.
update_release_pill() {
  local tag="$1" file="README.md" repo badge
  [[ -f "$file" ]] && grep -q '<!-- release-pill -->' "$file" || return 0
  repo="$(gh repo view --json nameWithOwner -q .nameWithOwner 2>/dev/null || echo 'bk-bf/Fantasia4x')"
  badge="[![Release](https://img.shields.io/badge/release-${tag}-brightgreen)](https://github.com/${repo}/releases/latest)"
  sed -i "s#.*<!-- release-pill -->#${badge} <!-- release-pill -->#" "$file"
  git diff --quiet -- "$file" && return 0   # already current
  git add "$file"
  git commit -q -m "docs(readme): bump release pill to $tag"
  git push -q origin "$BRANCH"
  echo "▸ Release pill in $file bumped → $tag (committed & pushed)."
}

# package.json's "version" is the single source of truth for the build's version: electron-builder names
# every artifact after it (Fantasia4x-<version>.AppImage, …Setup.<version>.exe, fantasia4x_<version>_amd64
# .deb), AND vite.config.ts injects it as __APP_VERSION__ for the title-screen credit line. The release
# TAG is independent (autotagged / --tag), so without this they drift — v0.1.119 once shipped files named
# 0.1.0 with an "alpha 0.1.0" menu. Pin package.json to the tag (minus the leading v) before packaging and
# commit it, so the filenames AND the in-app version match the release. No-ops if already current; returns
# 0 if it changed the version.
sync_pkg_version() {
  local tag="$1" ver file="package.json" cur
  ver="${tag#v}"
  cur="$(node -p "require('./$file').version" 2>/dev/null || echo '')"
  [[ "$cur" == "$ver" ]] && return 1   # already current — nothing to do
  # Edit just the top-level "version" line (npm/pnpm version would also create a tag, which we manage here).
  sed -i -E "0,/\"version\": \"[^\"]*\"/s//\"version\": \"$ver\"/" "$file"
  git add "$file"
  git commit -q -m "chore(release): set package.json version to $ver"
  echo "▸ package.json version → $ver (committed) so artifacts are named for the release."
  return 0
}

# Nudge the VS Code "build distance" status-bar badge (tools/vscode-build-distance) to re-read NOW
# rather than waiting on its 30s poll. The badge shows commits since the last v* tag; cutting a release
# resets that count to ~0, but creating a tag doesn't append to .git/logs/HEAD (the badge's main trigger),
# so the badge would otherwise lag. The extension also watches this sentinel file inside .git/ — touching
# it fires an immediate refresh. Best-effort: a status-bar nicety must never fail a release, and we skip
# it when .git isn't a plain dir (e.g. a git worktree), matching the extension's own .git/ assumption.
poke_build_badge() {
  local gitdir="$SCRIPT_DIR/.git"
  [[ -d "$gitdir" ]] || return 0
  : > "$gitdir/build-distance-refresh" 2>/dev/null || true
}

if $PUSH; then
  BRANCH="$(git rev-parse --abbrev-ref HEAD)"
  if [[ "$BRANCH" != "main" ]]; then
    read -rp "build.sh: on '$BRANCH', not main. Tag a release from here anyway? [y/N] " a
    [[ "$a" == [yY]* ]] || { echo "Aborted."; exit 1; }
  fi
  if ! git diff --quiet || ! git diff --cached --quiet; then
    echo "build.sh: working tree has uncommitted changes — commit or stash before releasing." >&2; exit 1
  fi

  # Version: explicit --tag, else RELEASE_TAG env, else the automatic patch bump.
  TAG="${TAG_ARG:-${RELEASE_TAG:-$(next_patch_tag)}}"
  [[ "$TAG" == v* ]] || TAG="v$TAG"
  if git rev-parse -q --verify "refs/tags/$TAG" >/dev/null; then
    echo "build.sh: tag $TAG already exists locally. Pass --tag vX.Y.Z to pick another." >&2; exit 1
  fi

  LAST_TAG="$(git describe --tags --abbrev=0 --match 'v*' 2>/dev/null || echo '')"
  COMMITS="$(git rev-list --count "${LAST_TAG:+$LAST_TAG..}HEAD")"
  echo "▸ Release ${LAST_TAG:-（first）} → $TAG  ($COMMITS commits)"

  if ! $REMOTE; then
    command -v git-cliff >/dev/null 2>&1 || {
      echo "build.sh: --push needs git-cliff (changelog). Install: sudo pacman -S git-cliff" >&2; exit 1; }
    command -v gh >/dev/null 2>&1 || { echo "build.sh: --push needs the GitHub CLI 'gh' (or use --remote for CI)." >&2; exit 1; }
    gh auth status >/dev/null 2>&1 || { echo "build.sh: gh isn't authenticated — run 'gh auth login'." >&2; exit 1; }
    echo "  Mode: LOCAL — build Linux + Windows here, then publish to GitHub from this machine."
    LINUX=true; WINDOWS=true   # a release always ships both installers

    # Pin package.json to $TAG so electron-builder names artifacts for the release (else they ship as
    # the stale package.json version). If it actually changed, the existing dist-electron/ artifacts carry
    # the OLD name — force a rebuild rather than reuse them.
    VERSION_CHANGED=false
    if sync_pkg_version "$TAG"; then VERSION_CHANGED=true; fi

    # Reuse existing artifacts instead of rebuilding when dist-electron/ already holds a Linux + Windows
    # installer set, all built AFTER the current HEAD commit (nothing in the tree has changed since).
    # You still confirm the asset list at the publish prompt below, so a stale reuse is recoverable.
    HEAD_TS="$(git log -1 --format=%ct 2>/dev/null || echo 0)"
    have_app="$(ls dist-electron/*.AppImage 2>/dev/null | head -1)"
    have_exe="$(ls dist-electron/*.exe 2>/dev/null | head -1)"
    if [[ -n "$have_app" && -n "$have_exe" ]]; then
      stale=false
      for f in dist-electron/*.AppImage dist-electron/*.deb dist-electron/*.exe; do
        [[ -e "$f" ]] || continue
        [[ "$(stat -c %Y "$f")" -ge "$HEAD_TS" ]] || stale=true
      done
      { $stale || $VERSION_CHANGED; } || REUSE_BUILD=true
    fi
    if $REUSE_BUILD; then
      echo "  Artifacts in dist-electron/ are newer than HEAD — reusing them, skipping the build."
    else
      echo "  No current installer set in dist-electron/ — building fresh."
    fi
  else
    echo "  Mode: CI — tag & push; GitHub Actions builds and publishes."
    read -rp "  Tag $TAG, push origin/$BRANCH + $TAG, and let CI build+publish? [y/N] " a
    [[ "$a" == [yY]* ]] || { echo "Aborted (nothing pushed)."; exit 1; }
    git tag -a "$TAG" -m "$TAG"
    git push origin "$BRANCH"
    git push origin "$TAG"
    poke_build_badge   # tag now exists locally → reset the VS Code build-distance badge immediately
    REPO_URL="$(gh repo view --json url -q .url 2>/dev/null || echo '')"
    echo "✓ Pushed $TAG. CI is building & will publish the release: ${REPO_URL}/actions"
    exit 0
  fi
fi

# Default (no --linux/--windows, and not the unpacked build): produce BOTH installers.
if ! $LINUX && ! $WINDOWS && ! $UNPACKED; then
  LINUX=true
  WINDOWS=true
  echo "▸ No OS flag given — building both installers (Linux + Windows)."
fi

# Build + package, unless --push found current artifacts to reuse (REUSE_BUILD). Everything from
# the Wine check through electron-builder is skipped in that case; we fall straight through to publish.
if ! $REUSE_BUILD; then

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
if $UNPACKED && ! $PUSH; then
  echo "▸ Packaging unpacked build for this machine (--dir)…"
  eb --dir "${EB_ARGS[@]}"
else
  if $LINUX; then EB_ARGS+=(--linux); fi
  if $WINDOWS; then EB_ARGS+=(--win); fi
  echo "▸ Packaging installers (electron-builder ${EB_ARGS[*]})…"
  eb "${EB_ARGS[@]}"
fi

fi  # end: build + package (skipped when REUSE_BUILD)

echo
echo "✓ Done. Artifacts in dist-electron/:"
ls -1 dist-electron/*.AppImage dist-electron/*.deb dist-electron/*.exe 2>/dev/null || true
if $UNPACKED && ! $PUSH; then
  echo "  unpacked app → dist-electron/linux-unpacked/  (run: ./dist-electron/linux-unpacked/fantasia4x)"
fi

# --install: install/update the freshly built app on this machine via the method picked in the
# pre-flight — the native .deb (apt) on Debian/Ubuntu-family hosts, else the AppImage (apkg).
if $INSTALL; then
  if [[ "$INSTALL_METHOD" == deb ]]; then
    PKG="$(ls -t dist-electron/*.deb 2>/dev/null | head -1)"
    if [[ -z "$PKG" ]]; then
      echo "build.sh: --install found no .deb in dist-electron/ to install." >&2; exit 1
    fi
    APT="$(command -v apt || command -v apt-get)"
    echo "▸ Installing $PKG via $APT (sudo)…"
    sudo "$APT" install -y "./$PKG"   # leading ./ makes apt treat it as a local file, not a repo name
    echo "✓ Installed/updated fantasia4x from the .deb (launch from your app menu, or: sudo apt remove fantasia4x)."
  else
    APP="$(ls -t dist-electron/*.AppImage 2>/dev/null | head -1)"
    if [[ -z "$APP" ]]; then
      echo "build.sh: --install found no AppImage in dist-electron/ to install." >&2; exit 1
    fi
    echo "▸ Installing $APP via apkg…"
    apkg -S "$APP" fantasia4x
    echo "✓ Installed/updated fantasia4x (launch it from your app menu, or: apkg -R fantasia4x to remove)."
  fi
fi

# ---- Publish the LOCAL release (build.sh --push, without --remote) ----------------------------------
# The installers are built; now changelog → push branch → draft release (uploads assets, no tag yet) →
# publish (this creates the tag, which is what fires CI; build.yml's guard then skips since the release
# already exists with assets).
if $PUSH && ! $REMOTE; then
  echo
  # Publish ONLY this release's artifacts. electron-builder names them after the version (…-$VER.AppImage,
  # …Setup $VER.exe, …_$VER_amd64.deb), so scope the glob to $VER — otherwise stale installers from a
  # previous version still sitting in dist-electron/ get globbed and uploaded onto this release too.
  VER="${TAG#v}"
  mapfile -t ASSETS < <(ls dist-electron/*"$VER"*.AppImage dist-electron/*"$VER"*.deb dist-electron/*"$VER"*.exe 2>/dev/null)
  if [[ ${#ASSETS[@]} -eq 0 ]]; then
    echo "build.sh: no v$VER installers in dist-electron/ to upload — aborting release." >&2; exit 1
  fi

  NOTES="$(mktemp)"; CHANGELOG="$(mktemp)"; trap 'rm -f "$RESOLV4" "$NOTES" "$CHANGELOG"' EXIT
  # Changelog = ONLY what's new since the last release. Bound git-cliff to the LAST_TAG..HEAD commit
  # range (computed above) so the feature log lists just this version's changes, not the whole project
  # history re-listed every release. First release (no prior tag) → no range, so it lists everything.
  echo "▸ Generating changelog for $TAG (git-cliff, changes since ${LAST_TAG:-the beginning})…"
  git-cliff ${LAST_TAG:+"$LAST_TAG..HEAD"} --tag "$TAG" --strip header -o "$CHANGELOG"
  # Release notes = fixed description/blurb header + the git-cliff feature log collapsed in a
  # "Full feature log" dropdown (keeps the release page short; the log expands on click).
  {
    cat <<EOF
Fantasia4x $TAG

A realtime 4X colony chronicle: generate a race, manage pawns, assign work, construct buildings, craft items, research technologies, and explore. Early alpha — expect rough edges and missing polish.

Downloads below: Windows installer (.exe), Linux .AppImage (portable — chmod +x and run) or .deb. The game is open-source (AGPL-3.0).

<details>
<summary><strong>Full feature log</strong></summary>

EOF
    cat "$CHANGELOG"
    # When there IS a previous release, the log above is only the new changes — close it with a cursive
    # (italic) nod to everything that shipped before, so it reads as "this version + all prior work".
    [[ -n "$LAST_TAG" ]] && printf '\n_…and everything from the previous versions._\n'
    printf '\n\n</details>\n'
  } > "$NOTES"

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
  poke_build_badge   # tag now exists locally → reset the VS Code build-distance badge immediately
  echo "✓ Published: $(gh release view "$TAG" --json url -q .url 2>/dev/null)"

  # Keep the README release badge pointing at the version we just shipped.
  update_release_pill "$TAG"

  # Prune stale builds: drop installers from OTHER versions so dist-electron/ holds only this release's
  # set — keeps the dir from growing unbounded AND stops a later --push globbing an old version into its
  # upload. Only the three installer types are touched; the unpacked dirs are left alone.
  shopt -s nullglob
  for f in dist-electron/*.AppImage dist-electron/*.deb dist-electron/*.exe; do
    [[ "$f" == *"$VER"* ]] || { rm -f "$f" && echo "▸ Pruned stale artifact: $(basename "$f")"; }
  done
  shopt -u nullglob
fi
