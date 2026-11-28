#!/bin/bash
set -u
MODE=${MODE:-wayland}
SCALE=${SCALE:-1}
PHASE=${PHASE:-interact}
SECS=${SECS:-40}
EXTRA=${EXTRA:-}
HERE=$(cd "$(dirname "$0")" && pwd)
OUT=${OUT:-$HERE/runs/$MODE-$PHASE-s$SCALE$( [ -n "$EXTRA" ] && echo "-${EXTRA//[^a-z]/}")}
rm -rf "$OUT"
mkdir -p "$OUT"
APP=$HERE/target/release/native-overlay
VP=$HERE/target/release/vpointer
XW=false
[ "$MODE" = x11 ] && XW=true

CONF=$OUT/hypr.conf
cat > "$CONF" <<EOF
monitor = , 1920x1080@60, auto, 1
animations {
 enabled = false
}
decoration {
 blur {
  enabled = false
 }
 shadow {
  enabled = false
 }
 rounding = 0
}
general {
 gaps_in = 0
 gaps_out = 0
 border_size = 0
}
misc {
 disable_hyprland_logo = true
 disable_splash_rendering = true
 background_color = 0x202020
}
xwayland {
 enabled = $XW
 force_zero_scaling = ${ZERO:-false}
}
debug {
 damage_tracking = ${DAMAGE:-2}
 pass = ${PASSDBG:-false}
}
ecosystem {
 no_update_news = true
 no_donation_nag = true
}
EOF

unset HYPRLAND_INSTANCE_SIGNATURE DISPLAY
Hyprland -c "$CONF" > "$OUT/hyprland.stdout" 2>&1 &
HPID=$!
SIG=
for _ in $(seq 60); do
  SIG=$(hyprctl instances -j | jq -r ".[] | select(.pid == $HPID) | .instance")
  [ -n "$SIG" ] && break
  sleep 0.5
done
[ -z "$SIG" ] && { echo "no nested compositor" > "$OUT/FAILED"; kill $HPID; exit 1; }
export HYPRLAND_INSTANCE_SIGNATURE=$SIG
SOCK=$(hyprctl instances -j | jq -r ".[] | select(.pid == $HPID) | .wl_socket")
for m in $(hyprctl -j monitors | jq -r '.[].name'); do NESTED="${NESTED:-} $m"; done
hyprctl output create headless > /dev/null
for m in $NESTED; do hyprctl output remove "$m" > /dev/null; done
MON=$(hyprctl -j monitors | jq -r '.[0].name')
hyprctl keyword monitor "$MON,1920x1080@60,0x0,$SCALE" > /dev/null
sleep 1
hyprctl -j monitors > "$OUT/monitors.json"
LW=$(jq -r '.[0] | (.width / .scale | round)' "$OUT/monitors.json")
LH=$(jq -r '.[0] | (.height / .scale | round)' "$OUT/monitors.json")
echo "nested $SIG socket $SOCK output $MON scale $SCALE logical ${LW}x${LH}" > "$OUT/info"

shot() { echo "$1 $(date +%s.%N)" >> "$OUT/shots.txt"; WAYLAND_DISPLAY=$SOCK grim -o "$MON" "$OUT/$1.png"; }
vp() { WAYLAND_DISPLAY=$SOCK "$VP" "$1" "$2" "$3" "$LW" "$LH"; }

hyprctl dispatch exec "${PRE:-}$APP $MODE --seconds $SECS $EXTRA > $OUT/app.log 2>&1" > /dev/null
sleep 6
hyprctl -j clients > "$OUT/clients.json"
shot 01-initial

if [ "$PHASE" = interact ]; then
  vp move $((LW / 2)) $((LH / 2)); sleep 0.3
  vp click $((LW / 2)) $((LH / 2)); sleep 0.5
  vp click 210 40; sleep 0.5
  vp click $((LW / 3)) $((LH * 2 / 3)); sleep 0.5
  shot 02-after-clicks
  hyprctl dispatch focuswindow "title:f4x-overlay" > /dev/null
  hyprctl dispatch setfloating > /dev/null
  i=0
  for w in 900 1000 1100 1200 1300 1400 1500 1600 1400 1200 1000; do
    h=$((w * 9 / 16))
    hyprctl --batch "dispatch resizeactive exact $w $h ; dispatch moveactive exact 0 0" > /dev/null
    for k in a b c; do shot "06-sweep-$(printf %02d $i)-${w}x${h}-$k"; done
    i=$((i + 1))
    sleep 0.3
  done
  sleep 1; shot 07-sweep-settled
  hyprctl -j clients > "$OUT/clients-after.json"
fi

for _ in $(seq $((SECS + 20))); do
  grep -q EXIT "$OUT/app.log" 2>/dev/null && break
  sleep 1
done
hyprctl dispatch exit > /dev/null 2>&1
sleep 1
kill $HPID 2>/dev/null
cp "$XDG_RUNTIME_DIR/hypr/$SIG/hyprland.log" "$OUT/hyprland.log" 2>/dev/null
echo DONE > "$OUT/DONE"
