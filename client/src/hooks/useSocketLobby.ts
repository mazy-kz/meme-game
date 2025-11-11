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
  const socketRef = useRef<Socket<ServerToClientEvents, ClientToServerEvents>>();
  const storageKey = useMemo(() => `meme-game:lobby:${lobbyId}`, [lobbyId]);

  if (!socketRef.current) {
    console.log('🔌 [Socket] Creating new socket instance');
    const newSocket = io(SOCKET_URL, {
      autoConnect: false,
      transports: ['websocket']
    }) as Socket<ServerToClientEvents, ClientToServerEvents>;

    // Register event listeners IMMEDIATELY when socket is created
    newSocket.on('lobby:state', (payload: LobbyStatePayload) => {
      console.log('📊 [Socket] Received lobby:state update:', payload);
      setState(payload);
      setError(null);
      setConnectionStatus('connected');
    });
    
    newSocket.on('lobby:error', (message: string) => {
      console.error('❌ [Socket] Received lobby:error:', message);
      setError(message);
    });
    
    newSocket.on('connect', () => {
      console.log('✅ [Socket] Connected! Socket ID:', newSocket.id);
      setConnectionStatus('connected');
    });
    
    newSocket.on('disconnect', (reason: string) => {
      console.error('❌ [Socket] Disconnected! Reason:', reason);
      setConnectionStatus('idle');
    });
    
    newSocket.on('connect_error', (error: Error) => {
      console.error('❌ [Socket] Connection error:', error);
    });

    socketRef.current = newSocket;
  }

  const socket = socketRef.current;

  useEffect(() => {
    return () => {
      console.log('🔌 [Socket] Cleanup - disconnecting socket for lobbyId:', lobbyId);
      const currentSocket = socketRef.current;
      if (currentSocket) {
        currentSocket.emit('player:leave');
        currentSocket.disconnect();
        socketRef.current = undefined;
      }
    };
  }, [lobbyId]); // Only disconnect when lobbyId changes or component unmounts

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
      console.log('🔌 [Socket] Joining lobby with payload:', payload);
      setConnectionStatus('connecting');
      return new Promise<JoinLobbyResponse>((resolve, reject) => {
        console.log('🔌 [Socket] Connecting to socket...');
        socket.connect();
        socket.emit('player:join', payload, (response: JoinLobbyResponse) => {
          console.log('🔌 [Socket] Received join response:', response);
          if (!response.ok) {
            console.error('❌ [Socket] Join failed:', response.message);
            setConnectionStatus('idle');
            setError(response.message ?? 'Unable to join lobby');
            reject(new Error(response.message ?? 'Unable to join lobby'));
            return;
          }
          console.log('✅ [Socket] Join successful, saving playerId:', response.playerId);
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
    console.log('🎮 [Socket] Emitting game:start event');
    console.log('🎮 [Socket] Socket connected?', socket.connected);
    console.log('🎮 [Socket] Socket ID:', socket.id);
    if (!socket.connected) {
      console.error('❌ [Socket] Socket is disconnected! Cannot emit game:start');
      return;
    }
    socket.emit('game:start');
    console.log('✅ [Socket] game:start event emitted successfully');
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
