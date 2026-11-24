---
name: play
description: The one command the owner types to play a Fantasia4x branch on his laptop, f4x. Use whenever you hand him a build to try, test, look at or validate, or tell him which branch or commit to switch to.
---

# Handing the owner a build

Give him one line to type on his laptop:

```
f4x <branch>
```

- `f4x` is `~/.config/bin/f4x` on the laptop, in his dotfiles repo. It does not exist on
  ubuntuserver, and an agent never runs it. Read it there for what it does today.
- It lives outside the Fantasia4x checkout, so it works whatever branch that checkout is on. It
  fetches, switches the checkout detached to `origin/<branch>`, and plays it painted in Electron.
- A part of the name is enough, and the most recently pushed match wins: `f4x water`. When the
  part matches several branches it names the others, so give the full branch name unless the
  short one is unambiguous. `f4x` alone plays `dev`.
- Say which commit it lands on, and whether he needs a new save.

Never hand him `./launch.sh`, `git fetch` or `git switch`: the checkout's launcher changes with the
branch it is on, and an old one ignores a branch argument and starts nothing.

An agent that starts the game itself runs `./dev.sh` in its own tree, on whichever machine it is on.
