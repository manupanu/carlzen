# Changelog

## Unreleased

### Changed
- The Docker image workflow now only runs for tagged commits (`v*`); it no longer builds on pushes to `main`
  or on pull requests (lint, tests and the build still run for those in the CI workflow). `latest` is set by
  stable tags, not by `main`.

## 0.1.0

### Added
- **Live mode (Watch Screen).** Share a window with a game and CarlZen follows it: the board is found
  automatically (flat-coloured and textured wood/marble boards), the pieces are learned from the first
  starting position and remembered per board style, White or Black at the bottom is detected continuously,
  and a mouse cursor, highlights and coordinates on the board are handled. Moves are recorded in the active
  game tab; stepping back or forward on screen maps to undo and redo.
- **Move grades.** Moves are graded best, good, inaccuracy, mistake or blunder by the win chance they gave
  away. Shown in the Live panel and as `?!`, `?`, `??` in the move history, saved with the game and kept by
  the sync server.
- **Elo strength setting** next to the depth slider (`UCI_Elo`, 1320 to 3190, far right is full strength).
- **Engine watchdog.** Stockfish is restarted if it stops answering or crashes, and the lost search resumes.
- Vitest test runner with unit tests for the live core, the engine and the sync server; CI workflow that
  runs lint, tests and the build; Playwright smoke script for Live mode (`scripts/smoke-live.cjs`).

### Changed
- **Stockfish 18 is replaced by Stockfish 19** (single-threaded lite WASM). Its network is 1 MiB instead of
  11 MiB, so the WASM shrinks from 7.3 MB to 1.8 MB (asm fallback 10.5 MB to 3.1 MB) and the offline cache
  from 17.7 MB to 5.2 MB. The chosen moves matched on the positions compared, but the smaller network can
  evaluate very sharp positions differently from the full-size engine.
- While a screen is followed, AI coaching requests wait until a position has stayed for two seconds.

### Fixed
- Duplicate arrows on the board (and the resulting React key warning) when lines left over from the previous
  position repeated a move.
- Session updates that changed nothing no longer bump the session timestamp (and no longer trigger syncing).
- README: clone URL and a dead screenshot placeholder.
