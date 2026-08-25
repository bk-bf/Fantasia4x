#!/usr/bin/env bash
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
INSTALL_METHOD=""
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

if $INSTALL; then
  LINUX=true
  UNPACKED=false
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

next_patch_tag() {
  local last ver ma mi pa
  last="$(git describe --tags --abbrev=0 --match 'v*' 2>/dev/null || echo '')"
  if [[ -z "$last" ]]; then echo "v0.1.0"; return; fi
  ver="${last#v}"
  IFS=. read -r ma mi pa <<<"$ver"
  echo "v${ma:-0}.${mi:-0}.$(( ${pa:-0} + 1 ))"
}

update_release_pill() {
  local tag="$1" file="README.md" repo badge
  [[ -f "$file" ]] && grep -q '<!-- release-pill -->' "$file" || return 0
  repo="$(gh repo view --json nameWithOwner -q .nameWithOwner 2>/dev/null || echo 'bk-bf/Fantasia4x')"
  badge="[![Release](https://img.shields.io/badge/release-${tag}-brightgreen)](https://github.com/${repo}/releases/latest)"
  sed -i "s#.*<!-- release-pill -->#${badge} <!-- release-pill -->#" "$file"
  git diff --quiet -- "$file" && return 0
  git add "$file"
  git commit -q -m "docs(readme): bump release pill to $tag"
  git push -q origin "$BRANCH"
  echo "▸ Release pill in $file bumped → $tag (committed & pushed)."
}

sync_pkg_version() {
  local tag="$1" ver file="package.json" cur
  ver="${tag#v}"
  cur="$(node -p "require('./$file').version" 2>/dev/null || echo '')"
  [[ "$cur" == "$ver" ]] && return 1
  sed -i -E "0,/\"version\": \"[^\"]*\"/s//\"version\": \"$ver\"/" "$file"
  git add "$file"
  git commit -q -m "chore(release): set package.json version to $ver"
  echo "▸ package.json version → $ver (committed) so artifacts are named for the release."
  return 0
}

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
    LINUX=true; WINDOWS=true

    VERSION_CHANGED=false
    if sync_pkg_version "$TAG"; then VERSION_CHANGED=true; fi

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
    poke_build_badge
    REPO_URL="$(gh repo view --json url -q .url 2>/dev/null || echo '')"
    echo "✓ Pushed $TAG. CI is building & will publish the release: ${REPO_URL}/actions"
    exit 0
  fi
fi

if ! $LINUX && ! $WINDOWS && ! $UNPACKED; then
  LINUX=true
  WINDOWS=true
  echo "▸ No OS flag given — building both installers (Linux + Windows)."
fi

if ! $REUSE_BUILD; then

if $WINDOWS && [[ "$(uname -s)" == "Linux" ]] && ! command -v wine >/dev/null 2>&1; then
  echo "build.sh: --windows cross-builds the NSIS installer via Wine, which isn't installed." >&2
  echo "  Install it (Arch/CachyOS):  sudo pacman -S wine    — then re-run." >&2
  exit 1
fi

if [[ ! -f src/lib/spatial-core-pkg/spatial_core.js || ! -f src/lib/sim-core-pkg/sim_core.js ]]; then
  echo "▸ Building WASM packages (spatial-core, sim-core)…"
  pnpm add:wasm
  pnpm add:wasm:sim
fi

echo "▸ Building SvelteKit static bundle…"
pnpm build

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

eb() {
  if $NS_DNS; then
    unshare --user --map-root-user --mount --fork \
      bash -c 'mount --bind "$1" /etc/resolv.conf; shift; exec "$@"' \
      f4x "$RESOLV4" pnpm exec electron-builder "$@"
  else
    pnpm exec electron-builder "$@"
  fi
}

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

fi

echo
echo "✓ Done. Artifacts in dist-electron/:"
ls -1 dist-electron/*.AppImage dist-electron/*.deb dist-electron/*.exe 2>/dev/null || true
if $UNPACKED && ! $PUSH; then
  echo "  unpacked app → dist-electron/linux-unpacked/  (run: ./dist-electron/linux-unpacked/fantasia4x)"
fi

if $INSTALL; then
  if [[ "$INSTALL_METHOD" == deb ]]; then
    PKG="$(ls -t dist-electron/*.deb 2>/dev/null | head -1)"
    if [[ -z "$PKG" ]]; then
      echo "build.sh: --install found no .deb in dist-electron/ to install." >&2; exit 1
    fi
    APT="$(command -v apt || command -v apt-get)"
    echo "▸ Installing $PKG via $APT (sudo)…"
    sudo "$APT" install -y "./$PKG"
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

if $PUSH && ! $REMOTE; then
  echo
  VER="${TAG#v}"
  mapfile -t ASSETS < <(ls dist-electron/*"$VER"*.AppImage dist-electron/*"$VER"*.deb dist-electron/*"$VER"*.exe 2>/dev/null)
  if [[ ${#ASSETS[@]} -eq 0 ]]; then
    echo "build.sh: no v$VER installers in dist-electron/ to upload — aborting release." >&2; exit 1
  fi

  NOTES="$(mktemp)"; CHANGELOG="$(mktemp)"; trap 'rm -f "$RESOLV4" "$NOTES" "$CHANGELOG"' EXIT
  echo "▸ Generating changelog for $TAG (git-cliff, changes since ${LAST_TAG:-the beginning})…"
  git-cliff ${LAST_TAG:+"$LAST_TAG..HEAD"} --tag "$TAG" --strip header -o "$CHANGELOG"
  {
    cat <<EOF
Fantasia4x $TAG

A realtime 4X colony chronicle: generate a race, manage pawns, assign work, construct buildings, craft items, research technologies, and explore. Early alpha — expect rough edges and missing polish.

Downloads below: Windows installer (.exe), Linux .AppImage (portable — chmod +x and run) or .deb. The game is open-source (AGPL-3.0).

<details>
<summary><strong>Full feature log</strong></summary>

EOF
    cat "$CHANGELOG"
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
  poke_build_badge
  echo "✓ Published: $(gh release view "$TAG" --json url -q .url 2>/dev/null)"

  update_release_pill "$TAG"

  shopt -s nullglob
  for f in dist-electron/*.AppImage dist-electron/*.deb dist-electron/*.exe; do
    [[ "$f" == *"$VER"* ]] || { rm -f "$f" && echo "▸ Pruned stale artifact: $(basename "$f")"; }
  done
  shopt -u nullglob
fi
