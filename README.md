# ♟️ CarlZen

**CarlZen** is a premium, AI-powered chess coaching application designed to help players understand the "why" behind every move. It combines the raw power of **Stockfish 18** with the strategic insights of **GPT-4** to provide a unique learning experience.

![CarlZen Screenshot](https://raw.githubusercontent.com/manuel-developer/CarlZen/main/screenshot.png) *(Note: Add actual screenshot URL here later)*

## ✨ Features

- **AI Strategic Coaching**: Streaming feedback from an elite AI coach (GPT-4o) explaining the strategic intent of engine moves, proxied through a secure backend.
- **Deep Analysis**: Powered by Stockfish 18 (WASM) running directly in your browser.
- **Visual Feedback**:
  - **Evaluation Bar**: Real-time visual representation of the position's balance.
  - **Best-Move Arrows**: Intelligent arrows pointing to the top engine recommendations.
  - **Move Highlights**: Visual cues for the last move and kings in check.
- **Customizable Engine**: Adjust analysis depth on the fly with a dedicated slider.
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
   git clone https://github.com/your-username/CarlZen.git
   cd CarlZen
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
   Enter the same sync token in the sidebar on each device. The backend stores your sessions in a local SQLite database and automatically syncs the newest saved state.

5. **Build for production:**
   ```bash
   npm run build
   ```

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
   The app will be available at `http://localhost:8080`.

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
- **Chess Engine**: [Stockfish 18 (WASM)](https://github.com/official-stockfish/Stockfish)
- **AI Feedback**: [OpenAI API (GPT-4o)](https://openai.com/api/)
- **Styling**: Vanilla CSS (Premium Glassmorphism Design)

## 📜 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
