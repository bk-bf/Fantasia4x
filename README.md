# Fantasia4x

[![Release](https://img.shields.io/badge/release-v0.1.119-brightgreen)](https://github.com/bk-bf/Fantasia4x/releases/latest) <!-- release-pill -->
[![License: AGPL v3](https://img.shields.io/badge/License-AGPL%20v3-blue.svg)](LICENSE)

A hobby 4X, colony sim strategy game project with procedurally generated civilizations. Built with SvelteKit.

## What is this?

This is a personal project I work on occasionally when I have time and inspiration. The basic idea is to make a 4X, colony sim fantasy game where your civilization is procedurally generated each playthrough, giving you different traits and bonuses that shape how you play.

Right now it has:

- Procedural race generation with different traits
- Basic resource management
- Pawn/character system with needs and abilities
- Some screens for research, exploration, crafting, and building
- Real-time elements mixed with strategy gameplay

It's still pretty early and development is sporadic.

## Tech Stack

- SvelteKit
- TypeScript
- Vite
- Rust → WebAssembly (spatial & sim cores)
- Electron (desktop builds — Windows & Linux)
- Howler.js (audio)

## Download

Pre-built installers are on the [Releases](https://github.com/bk-bf/Fantasia4x/releases) page — Windows (`.exe`) and Linux (`.AppImage` / `.deb`).

## Running it locally

```bash
git clone https://github.com/bk-bf/Fantasia4x.git
cd Fantasia4x
pnpm install
./launch.sh --electron --play
```

`launch.sh` starts the dev server and opens the game in a desktop (Electron) window — it's a desktop app, not a web page. Drop `--play` for dev overlays; the script's header documents the other modes (`--debug`, `--profiler`, `--tauri`, `--log`, …).

## Development

```bash
./launch.sh --electron   # run the game in the desktop shell (add --play, --debug, --profiler, …)
pnpm build               # Build the web bundle
pnpm check               # Type-check (svelte-check)
pnpm test                # Run tests
pnpm lint                # Run linter
pnpm format              # Format code
./build.sh --linux       # Build a desktop installer (also: --windows, --local, --dry)
```

## License

Code is licensed under **AGPL-3.0** (see [LICENSE](LICENSE)). Bundled third-party assets keep their own licenses: tileset ([Bitlands](https://github.com/DragonDePlatino/bitlands), CC-BY 4.0), audio (CC0 / CC-BY — see [AUDIO-CREDITS.md](AUDIO-CREDITS.md)), fonts (SIL OFL).
