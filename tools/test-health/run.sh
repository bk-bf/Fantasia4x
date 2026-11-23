#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
git fetch -q origin
source tools/remote/prepare.sh
exec "$HOME/.local/bin/claude" -p "Run the test-health skill." --permission-mode bypassPermissions
