import type { LobbySettings } from '@shared/types';

const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? '/api';

export interface CreateLobbyRequest extends LobbySettings {
  name?: string;
  avatar?: string;
}

export interface CreateLobbyResponse {
  lobbyId: string;
  playerId: string;
  settings: LobbySettings;
  host: {
    id: string;
    name: string;
    avatar: string;
  };
}

export interface LobbySummary {
  lobbyId: string;
  settings: LobbySettings;
  phase: string;
  players: Array<{
    id: string;
    name: string;
    avatar: string;
    spectator: boolean;
    connected: boolean;
  }>;
  hostId: string;
}

export async function createLobby(payload: CreateLobbyRequest): Promise<CreateLobbyResponse> {
  const res = await fetch(`${API_BASE}/lobbies`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });
  if (!res.ok) {
    throw new Error('Failed to create lobby');
  }
  return res.json();
}

export async function getLobby(lobbyId: string): Promise<LobbySummary> {
  const res = await fetch(`${API_BASE}/lobbies/${lobbyId}`);
  if (!res.ok) {
    throw new Error('Lobby not found');
  }
  return res.json();
}
