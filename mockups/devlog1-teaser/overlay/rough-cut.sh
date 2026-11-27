#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../media"
size=$1 list=$2
dur=$(node -e "console.log(require('../shots.json').totalSec)")
ffmpeg -v error -y -f concat -safe 0 -i "work/$list.txt" -framerate 60 -i "work/frames/overlay-$size/%06d.png" -i blips.wav -f lavfi -t "$dur" -i anullsrc=r=48000:cl=stereo \
  -filter_complex "[0:v]setpts=PTS-STARTPTS[bg];[bg][1:v]overlay=0:0:format=auto:eof_action=pass,format=yuv420p[v];[2:a]aresample=48000,pan=stereo|c0=c0|c1=c0,apad[a]" \
  -map '[v]' -map '[a]' -map 3:a -t "$dur" -r 60 -c:v libx264 -preset slow -crf 16 -c:a aac -b:a 192k \
  -metadata:s:a:0 title=blips -metadata:s:a:0 handler_name=blips -metadata:s:a:1 "title=voice (silent placeholder)" -metadata:s:a:1 "handler_name=voice (silent placeholder)" -disposition:a:0 default -disposition:a:1 0 \
  -movflags +faststart "masters/rough-cut-$size.mp4"
ffmpeg -v error -y -i "masters/rough-cut-$size.mp4" -map 0:v -map 0:a:0 -c:v libx264 -preset medium -crf 23 -c:a aac -b:a 160k -movflags +faststart "rough-cut-$size.mp4"
