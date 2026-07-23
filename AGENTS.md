# webtris — vanilla JS Tetris

No build step, no framework, no package manager. Open `index.html` in a browser and it works.

## Conventions

- **Vanilla JS** (`'use strict'`), single-file game in `game.js`, bot in `bot.js`. No imports, no modules.
- **Canvas 2D** rendering via `<canvas>` — no DOM UI, no React/Vue/etc.
- **localStorage** for persistence (settings, keybinds, high scores).
- **No npm/node.** Don't add a `package.json`, bundler, or any JS dependency. CSS is in `style.css`.
- **Audio:** Web Audio API oscillators — no audio files or SoundCloud/etc. embeds.
- **Wallpapers:** Local WebP files in `public/`, cycled by day index. Don't add external image hosts.
- **ponytail** comments mark deliberate shortcuts (e.g., no wall kicks, no T-spin detection refinements). Respect them — upgrade only if the user asks.

## Prohibited

- **gradiants** package — never add it. Use native CSS gradients if needed.
- Any npm dependency, bundler, or build step.
