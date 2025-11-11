import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import type {
  ClientToServerEvents,
  JoinLobbyRequest,
  JoinLobbyResponse,
  LobbyStatePayload,
  ServerToClientEvents,
  SubmitMemePayload,
  SubmitVotePayload,
  UpdateSettingsPayload
} from '@shared/types';

const SOCKET_URL = (import.meta.env.VITE_SOCKET_URL as string | undefined) ?? window.location.origin;

export interface LobbyConnection {
  state: LobbyStatePayload | null;
  error: string | null;
  connectionStatus: 'idle' | 'connecting' | 'connected';
  joinLobby: (data: { lobbyId: string; name: string; avatar: string; spectator?: boolean }) => Promise<JoinLobbyResponse>;
  submitMeme: (payload: SubmitMemePayload) => void;
  submitVote: (payload: SubmitVotePayload) => void;
  startGame: () => void;
  updateSettings: (payload: UpdateSettingsPayload) => void;
  updateName: (name: string) => void;
  updateAvatar: (avatar: string) => void;
  disconnect: () => void;
}

export function useSocketLobby(lobbyId: string): LobbyConnection {
  const [state, setState] = useState<LobbyStatePayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'connecting' | 'connected'>('idle');
  const socketRef = useRef<Socket<ServerToClientEvents, ClientToServerEvents> | null>(null);
  const storageKey = useMemo(() => `meme-game:lobby:${lobbyId}`, [lobbyId]);

  if (!socketRef.current) {
    socketRef.current = io(SOCKET_URL, {
      autoConnect: false,
      transports: ['websocket']
    }) as Socket<ServerToClientEvents, ClientToServerEvents>;
  }

  const socket = socketRef.current;
  if (!socket) {
    throw new Error('Socket connection failed to initialize');
  }

  useEffect(() => {
    const handleState = (payload: LobbyStatePayload) => {
      setState(payload);
      setError(null);
      setConnectionStatus('connected');
    };
    const handleError = (message: string) => {
      setError(message);
    };

    socket.on('lobby:state', handleState);
    socket.on('lobby:error', handleError);
    socket.on('connect', () => setConnectionStatus('connected'));
    socket.on('disconnect', () => setConnectionStatus('idle'));

    return () => {
      socket.emit('player:leave');
      socket.off('lobby:state', handleState);
      socket.off('lobby:error', handleError);
      socket.removeListener('connect');
      socket.removeListener('disconnect');
      socket.disconnect();
      socketRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket, lobbyId]);

  const joinLobby = useCallback(
    ({ lobbyId: id, name, avatar, spectator }: { lobbyId: string; name: string; avatar: string; spectator?: boolean }) => {
      const stored = window.localStorage.getItem(storageKey) || undefined;
      const payload: JoinLobbyRequest = {
        lobbyId: id,
        playerId: stored,
        name,
        avatar,
        spectator
      };
      setConnectionStatus('connecting');
      return new Promise<JoinLobbyResponse>((resolve, reject) => {
        socket.connect();
        socket.emit('player:join', payload, (response: JoinLobbyResponse) => {
          if (!response.ok) {
            setConnectionStatus('idle');
            setError(response.message ?? 'Unable to join lobby');
            reject(new Error(response.message ?? 'Unable to join lobby'));
            return;
          }
          window.localStorage.setItem(storageKey, response.playerId);
          setConnectionStatus('connected');
          resolve(response);
        });
      });
    },
    [socket, storageKey]
  );

  const submitMeme = useCallback(
    (payload: SubmitMemePayload) => {
      socket.emit('submission:submit', payload);
    },
    [socket]
  );

  const submitVote = useCallback(
    (payload: SubmitVotePayload) => {
      socket.emit('vote:submit', payload);
    },
    [socket]
  );

  const startGame = useCallback(() => {
    socket.emit('game:start');
  }, [socket]);

  const updateSettings = useCallback(
    (payload: UpdateSettingsPayload) => {
      socket.emit('game:updateSettings', payload);
    },
    [socket]
  );

  const updateName = useCallback(
    (name: string) => {
      socket.emit('player:updateName', name);
    },
    [socket]
  );

  const updateAvatar = useCallback(
    (avatar: string) => {
      socket.emit('player:updateAvatar', avatar);
    },
    [socket]
  );

  const disconnect = useCallback(() => {
    socket.emit('player:leave');
    socket.disconnect();
    setConnectionStatus('idle');
  }, [socket]);

  return {
    state,
    error,
    connectionStatus,
    joinLobby,
    submitMeme,
    submitVote,
    startGame,
    updateSettings,
    updateName,
    updateAvatar,
    disconnect
  };
}
