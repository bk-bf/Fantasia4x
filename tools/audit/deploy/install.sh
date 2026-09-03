#!/usr/bin/env bash
# Install the nightly audit on ubuntuserver.
#
# The units' ExecStart points into this checkout, so the repo owns them: they are symlinked
# out of here rather than copied, and a `git pull` updates the installed unit.
#
#   tools/audit/deploy/install.sh              install + enable the timer
#   tools/audit/deploy/install.sh --no-enable  install only
#   tools/audit/deploy/install.sh --uninstall  stop, disable, remove the symlinks

set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
UNITS="$HOME/.config/systemd/user"
NAMES=(fantasia-audit.service fantasia-audit.timer)

if [ "${1:-}" = "--uninstall" ]; then
  systemctl --user disable --now fantasia-audit.timer 2>/dev/null || true
  for n in "${NAMES[@]}"; do rm -f "$UNITS/$n"; done
  systemctl --user daemon-reload
  echo "removed."
  exit 0
fi

# The unit hardcodes ~/Projects/Fantasia4x; installing from anywhere else would produce a
# unit that points at the wrong checkout.
EXPECT="$HOME/Documents/Projects/Fantasia4x/tools/audit/deploy"
if [ "$HERE" != "$EXPECT" ]; then
  echo "this checkout is at $HERE" >&2
  echo "the unit's ExecStart expects $EXPECT" >&2
  echo "either move the checkout or edit ExecStart in fantasia-audit.service" >&2
  exit 1
fi

command -v flock >/dev/null || { echo "flock is missing" >&2; exit 1; }
NODE="${AUDIT_NODE:-$HOME/.nvm/versions/node/v24.19.0/bin/node}"
[ -x "$NODE" ] || { echo "no node at $NODE (needs >= 22.5 for node:sqlite)" >&2; exit 1; }

chmod +x "$HERE/nightly-audit.sh"
mkdir -p "$UNITS"
for n in "${NAMES[@]}"; do ln -sfn "$HERE/$n" "$UNITS/$n"; done
systemctl --user daemon-reload

if [ "${1:-}" != "--no-enable" ]; then
  systemctl --user enable --now fantasia-audit.timer
  # A user timer only fires while the user has a session unless lingering is on.
  loginctl show-user "$USER" --property=Linger | grep -q 'Linger=yes' \
    || echo "note: linger is off — run 'sudo loginctl enable-linger $USER' or the timer only fires while you are logged in"
fi

echo
systemctl --user list-timers fantasia-audit.timer --no-pager
