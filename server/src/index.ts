// Meme Game Server
import http from 'node:http';
import express from 'express';
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
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server<ClientToServerEvents, ServerToClientEvents>(server, {
  cors: {
    origin: '*'
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
  console.log('📡 [Server] Broadcasting lobby state for:', lobbyId);
  const lobby = gameManager.getLobby(lobbyId);
  if (!lobby) {
    console.error('❌ [Server] Lobby not found for broadcast:', lobbyId);
    return;
  }
  console.log('📡 [Server] Broadcasting to', lobby.players.size, 'players');
  for (const player of lobby.players.values()) {
    console.log('📡 [Server] Checking player:', { id: player.id, socketId: player.socketId, connected: player.connected });
    if (!player.socketId) continue;
    const state = gameManager.getLobbyStateForPlayer(lobbyId, player.id);
    if (state) {
      console.log('📡 [Server] Emitting lobby:state to socket:', player.socketId, 'for player:', player.id);
      io.to(player.socketId).emit('lobby:state', state);
      console.log('✅ [Server] State emitted successfully');
    } else {
      console.error('❌ [Server] No state generated for player:', player.id);
    }
  }
}

gameManager.onStateChange((lobbyId) => {
  broadcastLobby(lobbyId);
});

app.post('/api/lobbies', (req, res) => {
  console.log('📥 [Server] POST /api/lobbies - Request body:', req.body);
  const { rounds, maxPlayers, theme, name, avatar } = req.body as Partial<LobbySettings> & {
    name?: string;
    avatar?: string;
  };

  const settings = sanitizeSettings({ rounds, maxPlayers, theme });
  console.log('⚙️  [Server] Sanitized settings:', settings);
  const { lobby, host } = gameManager.createLobby(settings);
  console.log('🎮 [Server] Lobby created:', { lobbyId: lobby.id, hostId: host.id });

  if (typeof name === 'string' && name.trim()) {
    host.name = name.trim().slice(0, 40);
  }
  if (typeof avatar === 'string' && avatar.trim()) {
    host.avatar = avatar.trim().slice(0, 8);
  }

  const response = {
    lobbyId: lobby.id,
    playerId: host.id,
    settings: lobby.settings,
    host: {
      id: host.id,
      name: host.name,
      avatar: host.avatar
    }
  };
  console.log('✅ [Server] Sending response:', response);
  res.json(response);
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
  console.log('🔌 [Server] New socket connection:', socket.id);
  
  socket.on('player:join', (payload: JoinLobbyRequest, callback) => {
    console.log('🚪 [Server] Player join request:', { socketId: socket.id, payload });
    const { lobbyId, playerId: existingId, name, avatar, spectator } = payload;
    const joinResult = gameManager.joinLobby(lobbyId, {
      playerId: existingId,
      name,
      avatar,
      spectator
    });
    console.log('🎮 [Server] Join result:', joinResult);

    if (!joinResult.lobby || !joinResult.player) {
      console.error('❌ [Server] Join failed:', joinResult.error);
      callback({ ok: false, lobbyId, playerId: existingId ?? '', spectator: true, message: joinResult.error || 'Unable to join' });
      return;
    }

    gameManager.markPlayerConnected(lobbyId, joinResult.player.id, socket.id);
    socketToPlayer.set(socket.id, { lobbyId, playerId: joinResult.player.id });
    const response = {
      ok: true,
      lobbyId,
      playerId: joinResult.player.id,
      spectator: joinResult.player.spectator,
      message: joinResult.error
    };
    console.log('✅ [Server] Player joined successfully:', response);
    callback(response);
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
    console.log('🎮🎮🎮 [Server] ===== GAME START EVENT RECEIVED ===== from socket:', socket.id);
    console.log('🎮 [Server] game:start event received from socket:', socket.id);
    const ref = socketToPlayer.get(socket.id);
    console.log('🎮 [Server] Socket to player map lookup result:', ref);
    console.log('🎮 [Server] All active socket-to-player mappings:', Array.from(socketToPlayer.entries()));
    if (!ref) {
      console.error('❌ [Server] No player reference found for socket:', socket.id);
      return;
    }
    console.log('🎮 [Server] Starting game for lobby:', ref.lobbyId, 'requested by player:', ref.playerId);
    const success = await gameManager.startGame(ref.lobbyId);
    console.log('🎮 [Server] Start game result:', success);
    if (!success) {
      console.error('❌ [Server] Failed to start game - need at least 2 players');
      socket.emit('lobby:error', 'Need at least two active players to start.');
    } else {
      console.log('✅ [Server] Game started successfully!');
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
