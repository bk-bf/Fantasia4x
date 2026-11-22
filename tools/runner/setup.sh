#!/usr/bin/env bash
set -euo pipefail
count=${1:-1}
repo=bk-bf/Fantasia4x
here=$(cd "$(dirname "$0")" && pwd)
version=$(gh api repos/actions/runner/releases/latest --jq '.tag_name' | sed 's/^v//')
tarball=$HOME/.cache/actions-runner-$version.tar.gz
[ -f "$tarball" ] || curl -fsSL -o "$tarball" "https://github.com/actions/runner/releases/download/v$version/actions-runner-linux-x64-$version.tar.gz"
unit_dir=$HOME/.config/systemd/user
mkdir -p "$unit_dir"
repo_dir=$(cd "$here/../.." && pwd)
sed -e "s#@REPO@#$repo_dir#" "$here/gha-fantasia4x@.service" > "$unit_dir/gha-fantasia4x@.service"
systemctl --user daemon-reload
for i in $(seq 1 "$count"); do
  dir=$repo_dir/.ci/runners/$i
  mkdir -p "$dir/home" "$dir/tmp"
  install -m 755 "$here/gate.sh" "$dir/gate.sh"
  if [ ! -f "$dir/.runner" ]; then
    tar xzf "$tarball" -C "$dir"
    token=$(gh api -X POST "repos/$repo/actions/runners/registration-token" --jq .token)
    (cd "$dir" && ./config.sh --unattended --url "https://github.com/$repo" --token "$token" --name "$(hostname)-fantasia4x-$i" --labels fantasia4x --work _work --replace >/dev/null)
  fi
  systemctl --user enable --now "gha-fantasia4x@$i.service"
done
systemctl --user --no-pager list-units 'gha-fantasia4x@*' | grep -E 'gha-fantasia4x@'
gh api "repos/$repo/actions/runners" --jq '.runners[] | "\(.name) \(.status) \(.labels | map(.name) | join(","))"'
