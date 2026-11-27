#!/usr/bin/env bash
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
mock=$HOME/mockups
out=$HOME/.cache/fantasia4x-intro

if [ "${1:-}" = --render ]; then
  find "$out/scenes/hud" -name '*.png' -delete 2>/dev/null || true
fi
mkdir -p "$out"/{screenshots,scenes,teaser,tools}
rsync -a --delete "$here/" "$out/tools/"

stage() {
  local from=$1 to=$2 prefix=$3 depth=$4 keep
  keep=$(mktemp)
  mkdir -p "$to"
  if [ -d "$from" ]; then
    find -L "$from" -maxdepth "$depth" -type f \( -name '*.png' -o -name '*.webp' -o -name '*.jpg' -o -name '*.gif' \) \
      -not -path '*/probe/*' -not -path '*/node_modules/*' -print0 |
      while IFS= read -r -d '' f; do
        base=$(basename "$f")
        stem=${base%.*} ext=${base##*.}
        case $stem in "$prefix"*) name=$stem ;; *) name=$prefix$stem ;; esac
        case $ext in webp) ext=png ;; esac
        t=$to/$name.$ext
        echo "$t" >>"$keep"
        if [ -e "$t" ] && [ ! "$f" -nt "$t" ]; then continue; fi
        case $f in
          *.webp) dwebp -quiet "$f" -o "$t" ;;
          *) cp -p "$f" "$t" ;;
        esac
      done
  fi
  find "$to" -maxdepth 1 -type f | { grep -vxF -f "$keep" || true; } | xargs -r -d '\n' rm -f
  rm -f "$keep"
}

stage "$mock/fantasia4x-screenshots/img" "$out/screenshots" game- 1
stage "$mock/fantasia4x-devlog1-teaser" "$out/teaser" mockup-devlog1-teaser- 3

for m in big-trees tree-ground grass-layers light-hex map-scale mountain-tops outcrops bog-pools; do
  stage "$mock/fantasia4x-$m" "$out/scenes/$m" "mockup-$m-" 2
done

for f in "$out"/scenes/hud/hud-*.png; do
  [ -e "$f" ] || continue
  b=$(basename "$f" .png)
  h=${b#hud-}; h=${h%%h-*}; w=${b#*h-}
  case $h in *_5) h=${h%_5}h30 ;; *) h=${h}h ;; esac
  mv "$f" "$out/scenes/hud/mockup-hud-village-$h-$w.png"
done
if ! compgen -G "$out/scenes/hud/mockup-hud-*.png" >/dev/null; then
  node "$here/scenes.mjs" "$out"
fi
