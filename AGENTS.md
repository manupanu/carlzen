# Repository Guidelines

## Project Structure & Module Organization
`src/` contains the React + TypeScript frontend. Core UI lives in files such as `App.tsx`, `Sidebar.tsx`, `BoardControls.tsx`, and `SessionTabs.tsx`; chess engine integration is in `src/engine.ts`, and AI request logic is in `src/ai.ts`. `server/` contains the Express backend proxy in `server/index.ts` (prompt building in `server/coachPrompt.ts`); pure session/PV helpers shared by the app live in `src/sessions.ts`. `server/` also holds (the `<think>`-tag stream filter is in `server/thinkFilter.ts`). `src/live/` is Live mode (watching a shared screen): framework-free modules (`boardFinder.ts`, `texturedBoardFinder.ts`, `recognizer.ts`, `tracker.ts`, `watcher.ts`, `position.ts`, `calibrations.ts`, `review.ts`, `applyPosition.ts`), the `LiveController` class that owns the capture/poll loop (`controller.ts`), a thin hook (`useLiveController.ts`) and the sidebar panel (`LivePanel.tsx`). Static runtime assets, including the Stockfish 19 WASM files and icons, live in `public/`. Build output goes to `dist/`. `scripts/` holds the Playwright smoke script for Live mode.

## Build, Test, and Development Commands
Use `npm install` to install dependencies.

- `npm run dev`: starts the Vite frontend.
- `npm run server`: starts the Express backend with `tsx watch`.
- `npm run dev:all`: runs frontend and backend together for normal local development.
- `npm run build`: type-checks and creates the production bundle in `dist/`.
- `npm run lint`: runs ESLint across the repository.
- `npm test`: runs the Vitest unit tests (`src/**/*.test.ts` and `server/**/*.test.ts`).
- `npm run preview`: serves the production build locally.

For Docker-based validation, use `docker-compose up --build`. The Docker image is only built and published for tagged commits (`git tag v0.2.0 && git push origin v0.2.0`); lint, tests and the build of every pull request run in `.github/workflows/ci.yml`.

## Coding Style & Naming Conventions
This repo uses TypeScript, React function components, and ES modules. Follow the existing code style: semicolons, single quotes, and 2-space indentation in new code. Use `PascalCase` for React components (`CoachPanel.tsx`), `camelCase` for functions and variables, and concise file names that match exported components. Keep shared logic out of JSX-heavy components when it improves readability. Run `npm run lint` before opening a PR.

## Testing Guidelines
Unit tests use Vitest and live next to the code (`src/live/recognizer.test.ts`, `src/engine.test.ts`, `server/syncStore.test.ts`, ...); `src/live/testHelpers.ts` renders synthetic boards and fake screenshots. After big changes to Live mode also run `scripts/smoke-live.cjs` (Playwright, needs `npm run dev`; the file header explains it). CI runs lint, tests and the build on every pull request, so verify `npm run lint`, `npm test` and `npm run build` pass before submitting changes.

Live mode keeps all imperative state in `LiveController` (a plain class), not in React: the React side only subscribes to its state, which keeps the `react-hooks` lint rules happy. Positions read from the screen reach the app through `applyLivePosition`, which updates a game tab like a move played on the board. TypeScript here uses `erasableSyntaxOnly`, so no constructor parameter properties or enums.

## Commit & Pull Request Guidelines
Recent commit history uses short, imperative subjects such as `Update GitHub Actions workflow for multi-platform builds and latest tag` and `Fix npm install failure: downgrade vite...`. Follow that style: one-line summary, present tense, focused scope. PRs should include a brief description, linked issue if applicable, local verification steps, and screenshots or short recordings for UI changes.

## Security & Configuration Tips
Store secrets in `.env`; do not commit API keys. `OPENAI_API_KEY` is required for backend coaching, while `AI_MODEL` and `AI_BASE_URL` are optional overrides.
