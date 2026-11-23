#!/usr/bin/env bash
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
dest="$HOME/.config/systemd/user"
mkdir -p "$dest"
install -m644 "$here/test-health.service" "$here/test-health.timer" "$dest/"
systemctl --user daemon-reload
systemctl --user enable --now test-health.timer
systemctl --user list-timers test-health.timer --no-pager
