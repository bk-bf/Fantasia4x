---
name: play
description: The one command the owner types to play a Fantasia4x branch on his laptop, ghi. Use whenever you hand him a build to try, test, look at or validate, or tell him which branch or commit to switch to.
---

# Handing the owner a build

Give him one line to type in his Fantasia4x checkout on the laptop:

```
ghi <branch>
```

- `ghi` comes from gh-issue (`bin/ghi.mjs`, linked by its `install.sh`). An agent never runs it.
- It takes the exact branch name only; `ghi list` shows the branches on origin, the most recently
  committed first. Give the full name.
- Its start command comes from gh-issue, not from the checkout, so it works whatever branch that
  checkout is on. It fetches, switches the checkout detached to `origin/<branch>`, and plays it
  painted in Electron.
- Say which commit it lands on, and whether he needs a new save.

Hand it over the moment the branch is pushed and its build runs. A reviewer, a second
headless pass or an audit route never sits between finished work and this line: start any
review async, give him `ghi <branch>` at once, and if the review finds a real problem, land the
fix on the same branch (a commit on top, a `git revert`, or a cherry-picked fix) and give him the
line again with the new commit.

Never hand him `./launch.sh`, `git fetch` or `git switch`: the checkout's launcher changes with the
branch it is on, and an old one ignores a branch argument and starts nothing.

An agent that starts the game itself runs `./dev.sh` in its own tree, on whichever machine it is on.
