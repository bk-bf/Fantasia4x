#!/usr/bin/env bash
set -euo pipefail
OUT=${F4X_OUT:-/tmp/f4x-devlog1}
mkdir -p "$OUT/frames"
for id in "$@"; do
  for o in clips clips-vertical; do
    f="$OUT/$o/$id.mp4"
    [ -f "$f" ] || continue
    s=h
    [ "$o" = clips-vertical ] && s=v
    info=$(ffprobe -v error -select_streams v -count_frames -show_entries stream=width,height,r_frame_rate,nb_read_frames,profile,pix_fmt -of csv=p=0 "$f")
    echo "$id $s $info"
    n=$(echo "$info" | awk -F, '{print $NF}')
    for k in a b c; do
      case $k in a) i=0 ;; b) i=$((n / 2)) ;; c) i=$((n - 1)) ;; esac
      name="$id-$k"
      [ "$s" = v ] && name="$id-v-$k"
      ffmpeg -loglevel error -y -i "$f" -vf "select=eq(n\,$i)" -frames:v 1 "$OUT/frames/$name.png"
    done
  done
done
