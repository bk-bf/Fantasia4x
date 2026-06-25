#!/usr/bin/env bash
# build.sh — produce Fantasia4x desktop builds LOCALLY (no GitHub Actions needed).
#
# Mirrors the CI pipeline: Rust→WASM  →  SvelteKit static bundle  →  electron-builder.
# Artifacts land in dist-electron/.
#
#   ./build.sh --linux              Linux installers: AppImage + .deb
#   ./build.sh --windows            Windows installer: NSIS .exe (cross-built via Wine on Linux)
#   ./build.sh --linux --windows    both of the above
#   ./build.sh --local              quick UNPACKED build for THIS machine — run it straight away,
#                                     no installer packaging (dist-electron/linux-unpacked/)
#   ./build.sh --dry                pre-flight: production static build + scan for dev-only /src asset
#                                     paths that 404 once packaged. No packaging — fast; run during dev.
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
while [[ $# -gt 0 ]]; do
  case "$1" in
    --linux) LINUX=true ;;
    --windows | --win) WINDOWS=true ;;
    --local) LOCAL=true ;;
    --dry) DRY=true ;;
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

if ! $LINUX && ! $WINDOWS && ! $LOCAL; then
  echo "build.sh: pick at least one of --linux, --windows, --local, --dry." >&2
  usage
  exit 1
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

# 3. Package with electron-builder. --publish never: only ever produce local artifacts, never push a release.
EB_ARGS=(--publish never)
if $LOCAL; then
  echo "▸ Packaging unpacked build for this machine (--dir)…"
  pnpm exec electron-builder --dir "${EB_ARGS[@]}"
else
  if $LINUX; then EB_ARGS+=(--linux); fi
  if $WINDOWS; then EB_ARGS+=(--win); fi
  echo "▸ Packaging installers (electron-builder ${EB_ARGS[*]})…"
  pnpm exec electron-builder "${EB_ARGS[@]}"
fi

echo
echo "✓ Done. Artifacts in dist-electron/:"
ls -1 dist-electron/*.AppImage dist-electron/*.deb dist-electron/*.exe 2>/dev/null || true
if $LOCAL; then
  echo "  unpacked app → dist-electron/linux-unpacked/  (run: ./dist-electron/linux-unpacked/fantasia4x)"
fi
