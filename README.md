# ♟️ CarlZen

**CarlZen** is a premium, AI-powered chess coaching application designed to help players understand the "why" behind every move. It combines the raw power of **Stockfish 18** with the strategic insights of **GPT-4** to provide a unique learning experience.

![CarlZen Screenshot](https://raw.githubusercontent.com/manuel-developer/CarlZen/main/screenshot.png) *(Note: Add actual screenshot URL here later)*

## ✨ Features

- **AI Strategic Coaching**: Streaming feedback from an elite AI coach (GPT-4) explaining the strategic intent of engine moves.
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

- [Node.js](https://nodejs.org/) (v18 or higher recommended)
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
   Open `.env` and add your OpenAI API key:
   ```env
   VITE_OPENAI_API_KEY=your_api_key_here
   ```

4. **Run the development server:**
   ```bash
   npm run dev
   ```

5. **Build for production:**
   ```bash
   npm run build
   ```

## 🛠️ Tech Stack

- **Frontend**: React 19 + TypeScript + Vite
- **Chess Logic**: [chess.js](https://github.com/jhlywa/chess.js)
- **Board UI**: [react-chessboard](https://github.com/Clariity/react-chessboard)
- **Chess Engine**: [Stockfish 18 (WASM)](https://github.com/official-stockfish/Stockfish)
- **AI Feedback**: [OpenAI API](https://openai.com/api/)
- **Styling**: Vanilla CSS (Premium Glassmorphism Design)

## 📜 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
