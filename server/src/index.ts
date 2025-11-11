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

function normalizeOrigin(value: string | undefined | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.origin;
  } catch (error) {
    return null;
  }
}

const configuredOrigins = (process.env.CORS_ALLOWED_ORIGINS || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

const allowAllOrigins = configuredOrigins.length === 0;

const allowedOrigins = new Set<string>();

function addAllowedOrigin(candidate: string | undefined | null) {
  const normalized = normalizeOrigin(candidate);
  if (normalized) {
    allowedOrigins.add(normalized);
  }
}

for (const origin of configuredOrigins) {
  addAllowedOrigin(origin);
}

addAllowedOrigin(process.env.CLIENT_ORIGIN);
addAllowedOrigin('http://localhost:5173');
addAllowedOrigin('http://127.0.0.1:5173');
addAllowedOrigin('http://localhost:4173');
addAllowedOrigin('http://127.0.0.1:4173');
addAllowedOrigin('https://meme-game-client.vercel.app');
addAllowedOrigin('https://meme-game.vercel.app');

const vercelProjectUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL;
if (vercelProjectUrl) {
  const vercelOrigin = normalizeOrigin(`https://${vercelProjectUrl}`);
  if (vercelOrigin) {
    const { host } = new URL(vercelOrigin);

    const derivedHosts = new Set<string>();
    if (host.includes('-server.')) {
      derivedHosts.add(host.replace('-server.', '-client.'));
      derivedHosts.add(host.replace('-server.', ''));
    }
    if (host.includes('-server-')) {
      derivedHosts.add(host.replace('-server-', '-client-'));
      derivedHosts.add(host.replace('-server-', '-'));
    }

    for (const derivedHost of derivedHosts) {
      addAllowedOrigin(`https://${derivedHost}`);
    }
  }
}

function resolveAllowedOrigin(originHeader: string | undefined | null): string | null {
  if (!originHeader) {
    return allowAllOrigins ? '*' : null;
  }

  const normalized = normalizeOrigin(originHeader);
  if (!normalized) {
    return null;
  }

  if (allowAllOrigins || allowedOrigins.has(normalized)) {
    return normalized;
  }

  return null;
}

const corsOptions: cors.CorsOptions = {
  origin(origin, callback) {
    if (!origin) {
      callback(null, true);
      return;
    }

    const normalized = resolveAllowedOrigin(origin);
    if (normalized) {
      callback(null, true);
      return;
    }

    callback(new Error('CORS origin not allowed'));
  },
  methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'Origin'],
  credentials: false,
  optionsSuccessStatus: 204
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

app.use((req, res, next) => {
  const allowedOrigin = resolveAllowedOrigin(req.headers.origin || req.headers.referer);
  if (allowedOrigin) {
    res.header('Access-Control-Allow-Origin', allowedOrigin === '*' && req.headers.origin ? req.headers.origin : allowedOrigin);
  }

  res.header('Vary', 'Origin');
  res.header('Access-Control-Allow-Methods', 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS');

  const requestedHeaders = req.header('Access-Control-Request-Headers');
  if (requestedHeaders) {
    res.header('Access-Control-Allow-Headers', requestedHeaders);
  } else {
    res.header('Access-Control-Allow-Headers', 'Content-Type,Authorization,Accept,Origin');
  }

  if (req.method === 'OPTIONS') {
    res.sendStatus(204);
    return;
  }

  next();
});

app.use(express.json());

app.use((err: unknown, req: Request, res: Response, next: NextFunction) => {
  if (err instanceof Error && err.message === 'CORS origin not allowed') {
    const allowedOrigin = resolveAllowedOrigin(req.headers.origin || req.headers.referer);
    if (allowedOrigin) {
      res.header('Access-Control-Allow-Origin', allowedOrigin === '*' && req.headers.origin ? req.headers.origin : allowedOrigin);
    }
    res.header('Vary', 'Origin');
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
