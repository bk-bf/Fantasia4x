#!/usr/bin/env bash
set -euo pipefail
OWNER=bk-bf
REPO=bk-bf/Fantasia4x
refuse() { echo "gha-fantasia4x-gate: refused: $1" >&2; exit 1; }
[[ "${GITHUB_REPOSITORY:-}" == "$REPO" ]] || refuse "repository ${GITHUB_REPOSITORY:-unset} is not $REPO"
trusted() { [[ "$1" == "$OWNER" || "$1" == "github-actions[bot]" ]]; }
trusted "${GITHUB_ACTOR:-}" || refuse "actor ${GITHUB_ACTOR:-unset} is not $OWNER"
trusted "${GITHUB_TRIGGERING_ACTOR:-$GITHUB_ACTOR}" || refuse "triggering actor $GITHUB_TRIGGERING_ACTOR is not $OWNER"
case "${GITHUB_EVENT_NAME:-}" in
  push|workflow_dispatch|schedule) ;;
  pull_request)
    head=$(jq -r '.pull_request.head.repo.full_name // empty' "$GITHUB_EVENT_PATH")
    author=$(jq -r '.pull_request.user.login // empty' "$GITHUB_EVENT_PATH")
    [[ "$head" == "$REPO" ]] || refuse "pull request from $head, not $REPO"
    [[ "$author" == "$OWNER" ]] || refuse "pull request by $author, not $OWNER"
    ;;
  *) refuse "event ${GITHUB_EVENT_NAME:-unset} is not allowed here" ;;
esac
echo "gha-fantasia4x-gate: $GITHUB_EVENT_NAME by $GITHUB_ACTOR on $GITHUB_REF allowed"
