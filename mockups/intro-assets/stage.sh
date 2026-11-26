#!/usr/bin/env bash
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
mock=$HOME/mockups
out=$HOME/.cache/fantasia4x-intro
images=(--include='*/' --include='*.png' --include='*.jpg' --include='*.webp' --include='*.gif' --include='*.svg' --exclude='*')

if [ "${1:-}" = --render ]; then
  find "$out/scenes/hud" -name '*.png' -delete 2>/dev/null || true
fi
mkdir -p "$out"/{screenshots,scenes,teaser,tools}
rsync -a --delete "$here/" "$out/tools/"

if [ -d "$mock/fantasia4x-screenshots" ]; then
  rsync -a --delete --prune-empty-dirs "${images[@]}" "$mock/fantasia4x-screenshots/" "$out/screenshots/"
fi
if [ -d "$mock/fantasia4x-devlog1-teaser" ]; then
  rsync -a --delete --prune-empty-dirs --exclude=node_modules "${images[@]}" "$mock/fantasia4x-devlog1-teaser/" "$out/teaser/"
fi

for m in big-trees tree-ground grass-layers light-hex map-scale mountain-tops outcrops bog-pools; do
  from=$mock/fantasia4x-$m
  [ -d "$from" ] || continue
  to=$out/scenes/$m
  mkdir -p "$to"
  find -L "$from" -maxdepth 2 \( -name '*.png' -o -name '*.webp' \) -not -path '*/probe/*' -print0 |
    while IFS= read -r -d '' f; do
      t=$to/$(basename "${f%.*}").png
      if [ -e "$t" ] && [ ! "$f" -nt "$t" ]; then continue; fi
      case $f in
        *.webp) dwebp -quiet "$f" -o "$t" ;;
        *) cp -p "$f" "$t" ;;
      esac
    done
done

if ! compgen -G "$out/scenes/hud/*.png" >/dev/null; then
  node "$here/scenes.mjs" "$out"
fi
