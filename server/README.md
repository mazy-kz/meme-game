# Meme Game Server

## Setup

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Tenor API (Optional)

The game uses the Tenor API to fetch real GIF memes. If you don't configure it, the game will use placeholder images instead.

**To get a Tenor API key:**

1. Visit [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Enable the "Tenor API" 
4. Go to "Credentials" and create an API key
5. Copy the `.env.example` file to `.env`:
   ```bash
   cp .env.example .env
   ```
6. Add your API key to the `.env` file:
   ```
   TENOR_API_KEY=your_actual_api_key_here
   ```

Alternatively, you can get a key from [Tenor's Developer Portal](https://developers.google.com/tenor/guides/quickstart).

### 3. Run the Server

```bash
npm run dev
```

The server will start on http://localhost:4000

## API Endpoints

### Create Lobby
`POST /api/lobbies`

### Get Lobby
`GET /api/lobbies/:lobbyId`

## WebSocket Events

The server uses Socket.IO for real-time multiplayer communication.

### Client → Server Events
- `player:join` - Join a lobby
- `player:leave` - Leave a lobby  
- `player:updateName` - Update player name
- `player:updateAvatar` - Update player avatar
- `game:updateSettings` - Update lobby settings (host only)
- `game:start` - Start the game (host only)
- `submission:submit` - Submit a meme card
- `vote:submit` - Submit vote ranking

### Server → Client Events
- `lobby:state` - Lobby state updates
- `lobby:error` - Error messages

## Environment Variables

- `TENOR_API_KEY` - (Optional) Tenor API key for fetching GIF memes. If not set, uses placeholder images.
