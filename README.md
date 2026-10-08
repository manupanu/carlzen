# ♟️ CarlZen

**CarlZen** is a premium, AI-powered chess coaching application designed to help players understand the "why" behind every move. It combines the raw power of **Stockfish 19** with the strategic insights of **GPT-4** to provide a unique learning experience.

## ✨ Features

- **AI Strategic Coaching**: Streaming feedback from an elite AI coach (GPT-4o) explaining the strategic intent of engine moves, proxied through a secure backend.
- **Deep Analysis**: Powered by Stockfish 19 (WASM) running directly in your browser.
- **Visual Feedback**:
  - **Evaluation Bar**: Real-time visual representation of the position's balance.
  - **Best-Move Arrows**: Intelligent arrows pointing to the top engine recommendations.
  - **Move Highlights**: Visual cues for the last move and kings in check.
- **Watch Your Screen**: Share the window with a game on chess.com, lichess or any other site and CarlZen follows every move, including stepping back and forth through a game you are reviewing (see [Live mode](#-live-mode-watch-your-screen)).
- **Move Grades**: Every move is graded (best, good, inaccuracy `?!`, mistake `?`, blunder `??`) by how much win chance it gave away, with the better move named. Grades are saved with the game and synced.
- **Customizable Engine**: Adjust analysis depth on the fly with a dedicated slider, and limit the suggested move to a playing strength with the Elo slider (1320 to 3190).
- **Self-Healing Engine**: If Stockfish stops answering or crashes it is restarted and the analysis resumes.
- **Full Notation Support**: Accurate Standard Algebraic Notation (SAN) for all moves.
- **Session Persistence**: Your board state is automatically saved to LocalStorage.
- **Power User Controls**: Full undo/redo stack and keyboard shortcuts (Cmd/Ctrl + Z/Y).

## 🚀 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v24 or higher recommended)
- An [OpenAI API Key](https://platform.openai.com/api-keys)

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/manupanu/carlzen.git
   cd carlzen
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Configure environment variables:**
   Create a `.env` file in the root directory (or copy from `.env.example`):
   ```bash
   cp .env.example .env
   ```
   Open `.env` and add your API key and optionally configure the model and endpoint:
   ```env
   OPENAI_API_KEY=your_api_key_here

   # Optional: override the model (default: gpt-4o)
   # AI_MODEL=gpt-4o

   # Optional: use an OpenAI-compatible provider such as Groq
   # AI_BASE_URL=https://api.groq.com/openai/v1
   ```
   `NODE_ENV` is managed by Docker/your run mode and should not be added to `.env`.

4. **Run the application:**
   To run both the frontend development server and the backend proxy:
   ```bash
   npm run dev:all
   ```

5. **Optional: enable cross-device sync**
   Enter the same sync token (at least 16 characters, e.g. a long random phrase) in the sidebar on each device. The backend stores your sessions in a local SQLite database and automatically syncs the newest saved state.

5. **Build for production:**
   ```bash
   npm run build
   ```

## 📺 Live Mode (Watch Your Screen)

Live mode reads the position from a shared screen and feeds it into the active game tab, so the engine, evaluation bar, arrows, move history, move grades and AI coach all work on the game you are looking at.

1. Open the **Watch Screen** section in the sidebar and press **Share screen**, then pick the window (or browser tab) that shows your game.
2. The board is found automatically, whatever the site, colours or size, and found again if it moves or is resized. The first time a board in the starting position is on screen, CarlZen learns what its pieces look like; each board style is remembered, so switching sites or themes needs nothing. Whether White or Black is at the bottom is detected continuously.
3. Play or step through the game. A move on screen is recorded as a move in the game tab; stepping back or forward through a game maps to undo and redo; jumping to another position or game starts the tab's history over.

**Requirements.** A desktop browser (Chrome, Edge or Firefox) and a secure context: `https://` or `http://localhost`. When CarlZen is deployed on another machine it must be served over HTTPS (for example behind a reverse proxy), otherwise the browser does not allow screen capture. On Linux with Wayland you need an xdg-desktop-portal backend for your desktop and PipeWire; the browser then shows its normal share picker. Keep the CarlZen window visible next to your game, because browsers slow hidden pages down (CarlZen warns when it is hidden).

**Boards.** Boards with flat-coloured squares are found by their two alternating colours; boards with textured squares (wood, marble) are found by the brightness edges between squares, and moderate grain is read correctly. A mouse cursor over the board, highlighted squares, coordinates inside the squares and compressed video are handled.

**If something looks wrong.** Tick **Debug** to see what was read in every square (squares that look like nothing known are tinted red), use **Find board** to search again, **Select board** to draw the board by hand when it cannot be found, **Calibrate now** to learn the pieces from a starting position, and **Save snapshot** to download the board image and the reading for a bug report. Premoves, arrows drawn over the board and pieces being dragged can cause a skipped frame; reading continues on the next stable one.

While a screen is followed, the AI coach waits until a position has stayed on the board for two seconds before it is explained, so stepping through a game does not send a request per move.

## 🐳 Docker Deployment

For easy deployment, you can use Docker and Docker Compose. This setup bundles the React frontend and the Express backend proxy into a single container.

### Using Docker Compose

1. **Set your API key** in a `.env` file:
   ```env
   OPENAI_API_KEY=your_api_key_here

   # Optional: override the model (default: gpt-4o)
   # AI_MODEL=gpt-4o

   # Optional: use an OpenAI-compatible provider such as Groq
   # AI_BASE_URL=https://api.groq.com/openai/v1
   ```
   `NODE_ENV` is handled by Docker/your runtime and should not be set in this file.

2. **Run with Docker Compose:**
   ```bash
   docker-compose up -d --build
   ```
   The app will be available at `http://localhost:8080`. Live mode needs a secure context: `localhost` works, a remote host needs HTTPS.

### Manual Docker Build

1. **Build the image:**
   ```bash
   docker build -t carlzen .
   ```

2. **Run the container:**
   ```bash
   docker run -d -p 8080:80 -e OPENAI_API_KEY=your_api_key_here carlzen
   ```

## 🛠️ Tech Stack

- **Frontend**: React 19 + TypeScript + Vite
- **Backend Proxy**: Node.js + Express (Handles secure OpenAI API requests)
- **Chess Logic**: [chess.js](https://github.com/jhlywa/chess.js)
- **Board UI**: [react-chessboard](https://github.com/Clariity/react-chessboard)
- **Chess Engine**: [Stockfish 19 (WASM)](https://github.com/official-stockfish/Stockfish)
- **AI Feedback**: [OpenAI API (GPT-4o)](https://openai.com/api/)
- **Styling**: Vanilla CSS (Premium Glassmorphism Design)
- **Tests**: [Vitest](https://vitest.dev/)

## 🧪 Development

```bash
npm run lint     # ESLint
npm test         # unit tests (Vitest): live-mode core, engine watchdog, sync server
npm run build    # type-check and production bundle
```

`scripts/smoke-live.cjs` is a short Playwright smoke test of Live mode for after big changes (see the header of the file; `TEXTURED=1` runs it with a wooden board). CI (`.github/workflows/ci.yml`) runs lint, tests and the build on every pull request.

Stockfish is bundled as the single-threaded "lite" WebAssembly build (version 19, GPL-3.0, see `public/stockfish-COPYING.txt`). It uses a small 1 MiB network, which keeps the download light; deep analysis of very sharp positions can differ from the full-size engine.

## 📜 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
