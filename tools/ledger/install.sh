#!/usr/bin/env bash
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
checkout="$(cd "$here/../.." && pwd)"
dest="$HOME/.config/systemd/user"
mkdir -p "$dest"
sed "s|@CHECKOUT@|$checkout|g" "$here/f4x-ledger-sync.service" > "$dest/f4x-ledger-sync.service"
install -m644 "$here/f4x-ledger-sync.timer" "$dest/"
systemctl --user daemon-reload
systemctl --user enable --now f4x-ledger-sync.timer
systemctl --user list-timers f4x-ledger-sync.timer --no-pager
