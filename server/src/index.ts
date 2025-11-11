import http from 'node:http';
import express, { type NextFunction, type Request, type Response } from 'express';
import cors from 'cors';
import { Server } from 'socket.io';
import {
  ClientToServerEvents,
  JoinLobbyRequest,
  LobbySettings,
  ServerToClientEvents,
  SubmitMemePayload,
  SubmitVotePayload,
  UpdateSettingsPayload
} from '../../shared/types.js';
import { gameManager } from './game/gameManager.js';

const app = express();

const configuredOrigins = (process.env.CORS_ALLOWED_ORIGINS || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

const allowAllOrigins = configuredOrigins.length === 0;

const allowedOrigins = new Set([
  ...configuredOrigins,
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:4173',
  'http://127.0.0.1:4173',
  process.env.CLIENT_ORIGIN?.trim()
].filter((value): value is string => Boolean(value)));

const corsMiddleware = cors({
  origin(origin, callback) {
    if (!origin || allowAllOrigins || allowedOrigins.has(origin)) {
      callback(null, true);
      return;
    }

    try {
      const normalized = new URL(origin).origin;
      if (allowedOrigins.has(normalized)) {
        callback(null, true);
        return;
      }
    } catch (error) {
      // fall through and reject below
    }

    callback(new Error('CORS origin not allowed'));
  },
  credentials: false
});

app.use(corsMiddleware);
app.options('*', corsMiddleware);
app.use((req, res, next) => {
  if (allowAllOrigins) {
    res.header('Access-Control-Allow-Origin', '*');
  }
  res.header('Access-Control-Allow-Methods', 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS');
  res.header('Access-Control-Allow-Headers', req.header('Access-Control-Request-Headers') || 'Content-Type');
  if (req.method === 'OPTIONS') {
    res.sendStatus(204);
    return;
  }
  next();
});

app.use(express.json());

app.use((err: unknown, req: Request, res: Response, next: NextFunction) => {
  if (err instanceof Error && err.message === 'CORS origin not allowed') {
    if (allowAllOrigins) {
      res.header('Access-Control-Allow-Origin', '*');
    }
    res.status(403).json({ message: err.message });
    return;
  }
  next(err);
});

const server = http.createServer(app);
const io = new Server<ClientToServerEvents, ServerToClientEvents>(server, {
  cors: allowAllOrigins
    ? {
        origin: '*'
      }
    : {
        origin: Array.from(allowedOrigins)
      }
});

const socketToPlayer = new Map<string, { lobbyId: string; playerId: string }>();

function sanitizeSettings(input: Partial<LobbySettings>): LobbySettings {
  const rounds = typeof input.rounds === 'number' ? input.rounds : Number(input.rounds);
  const maxPlayers = typeof input.maxPlayers === 'number' ? input.maxPlayers : Number(input.maxPlayers);
  const theme = input.theme === '18+' || input.theme === 'fun' || input.theme === 'university' ? input.theme : 'fun';
  return {
    rounds: Number.isFinite(rounds) ? Math.floor(rounds) : 5,
    theme,
    maxPlayers: Number.isFinite(maxPlayers) ? Math.floor(maxPlayers) : 5
  };
}

function broadcastLobby(lobbyId: string) {
  const lobby = gameManager.getLobby(lobbyId);
  if (!lobby) return;
  for (const player of lobby.players.values()) {
    if (!player.socketId) continue;
    const state = gameManager.getLobbyStateForPlayer(lobbyId, player.id);
    if (state) {
      io.to(player.socketId).emit('lobby:state', state);
    }
  }
}

gameManager.onStateChange((lobbyId) => {
  broadcastLobby(lobbyId);
});

app.post('/api/lobbies', (req, res) => {
  const { rounds, maxPlayers, theme, name, avatar } = req.body as Partial<LobbySettings> & {
    name?: string;
    avatar?: string;
  };

  const settings = sanitizeSettings({ rounds, maxPlayers, theme });
  const { lobby, host } = gameManager.createLobby(settings);

  if (typeof name === 'string' && name.trim()) {
    host.name = name.trim().slice(0, 40);
  }
  if (typeof avatar === 'string' && avatar.trim()) {
    host.avatar = avatar.trim().slice(0, 8);
  }

  res.json({
    lobbyId: lobby.id,
    playerId: host.id,
    settings: lobby.settings,
    host: {
      id: host.id,
      name: host.name,
      avatar: host.avatar
    }
  });
});

app.get('/api/lobbies/:lobbyId', (req, res) => {
  const lobby = gameManager.getLobby(req.params.lobbyId);
  if (!lobby) {
    res.status(404).json({ message: 'Lobby not found' });
    return;
  }
  const players = [...lobby.players.values()].map((p) => ({
    id: p.id,
    name: p.name,
    avatar: p.avatar,
    spectator: p.spectator,
    connected: p.connected
  }));
  res.json({
    lobbyId: lobby.id,
    settings: lobby.settings,
    phase: lobby.phase,
    players,
    hostId: lobby.hostId
  });
});

io.on('connection', (socket) => {
  socket.on('player:join', (payload: JoinLobbyRequest, callback) => {
    const { lobbyId, playerId: existingId, name, avatar, spectator } = payload;
    const joinResult = gameManager.joinLobby(lobbyId, {
      playerId: existingId,
      name,
      avatar,
      spectator
    });

    if (!joinResult.lobby || !joinResult.player) {
      callback({ ok: false, lobbyId, playerId: existingId ?? '', spectator: true, message: joinResult.error || 'Unable to join' });
      return;
    }

    gameManager.markPlayerConnected(lobbyId, joinResult.player.id, socket.id);
    socketToPlayer.set(socket.id, { lobbyId, playerId: joinResult.player.id });
    callback({
      ok: true,
      lobbyId,
      playerId: joinResult.player.id,
      spectator: joinResult.player.spectator,
      message: joinResult.error
    });
  });

  socket.on('player:updateName', (name: string) => {
    const ref = socketToPlayer.get(socket.id);
    if (!ref) return;
    gameManager.updatePlayerName(ref.lobbyId, ref.playerId, name);
  });

  socket.on('player:updateAvatar', (avatar: string) => {
    const ref = socketToPlayer.get(socket.id);
    if (!ref) return;
    gameManager.updatePlayerAvatar(ref.lobbyId, ref.playerId, avatar);
  });

  socket.on('game:updateSettings', (payload: UpdateSettingsPayload) => {
    const ref = socketToPlayer.get(socket.id);
    if (!ref) return;
    gameManager.updateSettings(ref.lobbyId, ref.playerId, payload.settings);
  });

  socket.on('game:start', async () => {
    const ref = socketToPlayer.get(socket.id);
    if (!ref) return;
    const success = await gameManager.startGame(ref.lobbyId);
    if (!success) {
      socket.emit('lobby:error', 'Need at least two active players to start.');
    }
  });

  socket.on('submission:submit', (payload: SubmitMemePayload) => {
    const ref = socketToPlayer.get(socket.id);
    if (!ref) return;
    gameManager.submitMeme(ref.lobbyId, ref.playerId, payload);
  });

  socket.on('vote:submit', (payload: SubmitVotePayload) => {
    const ref = socketToPlayer.get(socket.id);
    if (!ref) return;
    gameManager.submitVote(ref.lobbyId, ref.playerId, payload);
  });

  socket.on('player:leave', () => {
    const ref = socketToPlayer.get(socket.id);
    if (!ref) return;
    socketToPlayer.delete(socket.id);
    gameManager.markPlayerDisconnected(socket.id);
  });

  socket.on('disconnect', () => {
    const ref = socketToPlayer.get(socket.id);
    if (!ref) return;
    socketToPlayer.delete(socket.id);
    gameManager.markPlayerDisconnected(socket.id);
  });
});

const PORT = Number(process.env.PORT || 4000);
server.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Server listening on port ${PORT}`);
});
