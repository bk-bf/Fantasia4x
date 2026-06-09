# Fantasia4x

A hobby 4X strategy game project with procedurally generated civilizations. Built with SvelteKit.

## What is this?

This is a personal project I work on occasionally when I have time and inspiration. The basic idea is to make a 4X fantasy game where your civilization is procedurally generated each playthrough, giving you different traits and bonuses that shape how you play.

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
- Google Generative AI (for some procedural content generation)

## Running it locally

```bash
git clone https://github.com/bk-bf/Fantasia4x.git
cd Fantasia4x
pnpm install
./dev.sh
```

Then open http://localhost:5173

## Development

```bash
./dev.sh             # Start dev server (use this instead of pnpm dev)
pnpm build           # Build for production
pnpm lint            # Run linter
pnpm format          # Format code
```

## License

See LICENSE file.
