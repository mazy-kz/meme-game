# Meme Showdown

Full-stack meme party game prototype built with React, Vite, Tailwind, Express, and Socket.IO. Players join lobbies instantly, draft meme cards, and battle through situation prompts with Borda-count scoring.

## Features

- Instant lobby creation with shareable links and random celebrity-style nicknames.
- Host-configurable rounds, themes (Fun, University, 18+), and player caps.
- Real-time state sync via Socket.IO including server-side timers for selection, voting, and results phases.
- Meme deck abstraction with a mock provider (swap with Giphy/Tenor later).
- Auto-submit and auto-vote fallbacks for idle or disconnected players.
- Borda count scoring with tie-breakers and deterministic randomness.
- Lobby spectator support, host reassignment, and final highlight reels.

## Getting Started

The repository is an npm workspace with `client` and `server` packages. Install dependencies from the repo root:

```bash
npm install
```

### Development

Run the backend and frontend together:

```bash
npm run dev
```

This spawns the Express/Socket.IO server on port **4000** and the Vite dev server on **5173** (with API proxying to the backend).

### Individual packages

Run commands within a package using the `-w` flag:

```bash
# Backend only
npm run dev -w server

# Frontend only
npm run dev -w client
```

### Production builds

```bash
npm run build
```

Artifacts are emitted to `client/dist` and `server/dist`.

## Architecture Overview

- **server/** – Express API with Socket.IO managing lobby state, timers, scoring, and resilience rules.
- **client/** – Vite + React SPA providing lobby creation, gameplay UI, and leaderboard flows.
- **shared/** – TypeScript types shared across server and client for consistent contracts.

Swap out the mock meme provider in `server/src/game/memeProvider.ts` with a real API integration when ready.
