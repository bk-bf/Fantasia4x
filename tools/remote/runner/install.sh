#!/usr/bin/env bash
set -euo pipefail

RUNNER_VERSION=2.337.0
RUNNER_SHA256=70920811a4f8ad4328818682bca5c6469c1c942fab52448868071d0063816613
VALGRIND_VERSION=3.26.0-0codspeed7
RUNNER_USER=gh-runner
RUNNER_DIR=/home/$RUNNER_USER/actions-runner
REPO_URL=https://github.com/bk-bf/Fantasia4x
LABEL=ubuntuserver

if [[ $EUID -ne 0 ]]; then
  echo "run it with sudo" >&2
  exit 1
fi

token=${1:-}
if [[ -z $token ]]; then
  read -rsp 'runner registration token: ' token
  echo
fi

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

id -u "$RUNNER_USER" >/dev/null 2>&1 || useradd --create-home --shell /bin/bash "$RUNNER_USER"

deb="valgrind_${VALGRIND_VERSION}_ubuntu-24.04_amd64.deb"
curl -fsSL -o "$tmp/$deb" "https://github.com/CodSpeedHQ/valgrind-codspeed/releases/download/$VALGRIND_VERSION/$deb"
chmod 755 "$tmp"
apt-get install -y --allow-downgrades "$tmp/$deb" libc6-dbg
apt-mark hold valgrind
valgrind --version | grep -q codspeed

curl -fsSL -o "$tmp/runner.tar.gz" \
  "https://github.com/actions/runner/releases/download/v$RUNNER_VERSION/actions-runner-linux-x64-$RUNNER_VERSION.tar.gz"
echo "$RUNNER_SHA256  $tmp/runner.tar.gz" | sha256sum -c -
install -d -o "$RUNNER_USER" -g "$RUNNER_USER" "$RUNNER_DIR"
tar -xzf "$tmp/runner.tar.gz" -C "$RUNNER_DIR"
chown -R "$RUNNER_USER:$RUNNER_USER" "$RUNNER_DIR"
"$RUNNER_DIR/bin/installdependencies.sh"

cd "$RUNNER_DIR"
sudo -u "$RUNNER_USER" ./config.sh --unattended --replace --url "$REPO_URL" --token "$token" \
  --name "$LABEL" --labels "$LABEL" --work _work
./svc.sh install "$RUNNER_USER"
unit=$(cat .service)
install -d "/etc/systemd/system/$unit.d"
printf '[Service]\nNice=10\nCPUWeight=20\nIOWeight=20\n' >"/etc/systemd/system/$unit.d/priority.conf"
systemctl daemon-reload
./svc.sh start
systemctl is-active "$unit"
