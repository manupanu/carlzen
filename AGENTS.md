# Repository Guidelines

## Project Structure & Module Organization
`src/` contains the React + TypeScript frontend. Core UI lives in files such as `App.tsx`, `Sidebar.tsx`, `BoardControls.tsx`, and `SessionTabs.tsx`; chess engine integration is in `src/engine.ts`, and AI request logic is in `src/ai.ts`. `server/` contains the Express backend proxy in `server/index.ts` plus a manual API smoke script in `server/test_api.ts`. Static runtime assets, including Stockfish WASM files and icons, live in `public/`. Build output goes to `dist/`.

## Build, Test, and Development Commands
Use `npm install` to install dependencies.

- `npm run dev`: starts the Vite frontend.
- `npm run server`: starts the Express backend with `tsx watch`.
- `npm run dev:all`: runs frontend and backend together for normal local development.
- `npm run build`: type-checks and creates the production bundle in `dist/`.
- `npm run lint`: runs ESLint across the repository.
- `npm run preview`: serves the production build locally.

For Docker-based validation, use `docker-compose up --build`.

## Coding Style & Naming Conventions
This repo uses TypeScript, React function components, and ES modules. Follow the existing code style: semicolons, single quotes, and 2-space indentation in new code. Use `PascalCase` for React components (`CoachPanel.tsx`), `camelCase` for functions and variables, and concise file names that match exported components. Keep shared logic out of JSX-heavy components when it improves readability. Run `npm run lint` before opening a PR.

## Testing Guidelines
There is no formal test runner configured yet. Current checks are lightweight scripts such as `server/test_api.ts`, `test_styles.mjs`, `test_cboard_flat.mjs`, and `test_cboard2.mjs`. When adding tests, keep them close to the feature they exercise or use clearly named root-level scripts prefixed with `test_`. At minimum, verify `npm run build` and `npm run lint` pass before submitting changes.

## Commit & Pull Request Guidelines
Recent commit history uses short, imperative subjects such as `Update GitHub Actions workflow for multi-platform builds and latest tag` and `Fix npm install failure: downgrade vite...`. Follow that style: one-line summary, present tense, focused scope. PRs should include a brief description, linked issue if applicable, local verification steps, and screenshots or short recordings for UI changes.

## Security & Configuration Tips
Store secrets in `.env`; do not commit API keys. `OPENAI_API_KEY` is required for backend coaching, while `AI_MODEL` and `AI_BASE_URL` are optional overrides.
