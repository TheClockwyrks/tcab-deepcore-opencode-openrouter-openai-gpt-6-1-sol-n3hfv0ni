# Deepcore

**Depth is cheap. The way back costs everything.**

A complete browser mining expedition on a dead industrial world. Drill through four geological bands, haul thirteen kinds of mineral back to camp, and turn the proceeds into better equipment and a five-system escape rocket. Your cargo has weight: a full bay is worth nothing if your jetpack cannot lift it.

Find the buried Resonite and Cryenite, survive gas pockets and molten seams, and bring an unstable Core Sample home before its 90-second timer expires. Choose Standard or Hardcore, and a Quick, Standard, or Marathon mine. The single local save slot is written only at the surface Save Pad.

## Run

Requires Node.js 22.12+ (or a compatible current release) and npm.

```sh
npm ci
npm run dev
```

Open the local address Vite prints. Audio unlocks on your first interaction.

## Production

```sh
npm run build
npm run preview
```

`dist/` is the complete static site. Serve that directory with any static file server, including under a subdirectory. Every runtime resource is bundled with a page-relative URL; there are no external services or credentials.

**Asset generation is not a build step.** All original PNGs, particle definitions, WAVs, and the music MIDI are already in `assets/`. The one-time authoring scripts and operation logs in `assets/source/` document their production with `draw`, `draw-sheet`, `particle-2d`, `sfx-synth`, `sfx-sample`, and `music`. Those tools are not needed to install, build, or play.

## Controls

| Input | Action |
| --- | --- |
| A / D or left / right | Walk, drift, and drill adjoining walls |
| S or down | Drill downward while grounded |
| Space / W / up | Hold to thrust |
| E / Enter | Activate a nearby building or confirm a menu choice |
| I | Cargo, materials, and field-supply inventory |
| 1–6 | Use Dynamite, Plastic Explosives, Quantum Teleporter, Matter Transmitter, Nanobots, Emergency Fuel |
| J | Jettison a carried Core Sample |
| P / Escape | Pause; close a panel; go back |
| M | Mute all audio |
| Backtick | Engine diagnostics overlay |

Menus and panels accept mouse, pen, and touch. Use up/down and Enter to navigate them by keyboard. The miner is keyboard-controlled.

### Your first shift

Drill a shallow shaft, collect a few veins, and fly back up the same passage. Sell at the Ore Market, then buy fuel at the Fuel Depot. Spend surplus Credits on equipment. Fuel and hull never regenerate. Keep a reserve for the return journey, and discard heavy ore from the inventory if your cargo exceeds your lift limit.

## Checks

```sh
npm run typecheck
npm run lint
npm run format
npm test
```

The Vitest suite runs the real Simple 2D engine over a native canvas and a controlled clock, in addition to render-free simulation scenarios. It covers asset loading, actual keyboard and pointer actions, drilling, frame-division independence, weight/lift, hazards, supplies, economy, saves, generation, and rocket progression.

## Source guide

- `src/game.ts`: engine integration, asset loading, input, and screen transitions; exports the state and debug API types.
- `src/model.ts`: authoritative state, terrain generation, and derived readings.
- `src/simulation.ts`: fixed-timestep physics, drilling, hazards, timers, and camera.
- `src/transactions.ts`: purchases, supplies, rocket, saves, and expedition lifecycle.
- `src/debug.ts`: validated immutable automation poses and observable snapshots, returned through `engine.debug`.
- `src/interface.ts` and `src/render.ts`: shared hit regions, terminal layouts, world drawing, and produced particle playback.
- `showcase/`: player-facing description, captured screenshots, and an engine-recorded replay.

All game graphics and audio were authored for Deepcore. The only library samples used as sound layers are the supplied `combat-core` pack; the score uses the supplied instrument bank. No downloaded artwork or music is used.
