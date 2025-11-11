import type { LobbySettings } from '@shared/types';

export {};

declare global {
  interface Window {
    __MEME_GAME_API_BASE__?: string;
  }
}

function normalizeBaseUrl(url: string | undefined): string | undefined {
  return url?.replace(/\/$/, '');
}

function buildHostedApiCandidates(hostname: string): string[] {
  const candidates = new Set<string>();

  const register = (value: string) => {
    if (value && value !== hostname) {
      candidates.add(value);
    }
  };

  register(hostname.replace('-client-', '-server-'));
  register(hostname.replace('-client.', '-server.'));
  register(hostname.replace('.client.', '.server.'));
  register(hostname.replace('-client', '-server'));
  register(hostname.replace('client-', 'server-'));
  register(hostname.replace('client.', 'server.'));
  register(hostname.replace('.client', '.server'));

  const segments = hostname.split('.');
  if (segments.length > 0) {
    const [first, ...rest] = segments;
    if (first.includes('client')) {
      register([first.replace('client', 'server'), ...rest].join('.'));

      const hyphenParts = first.split('-');
      const clientIndex = hyphenParts.indexOf('client');
      if (clientIndex !== -1) {
        hyphenParts[clientIndex] = 'server';
        register([hyphenParts.join('-'), ...rest].join('.'));
      }
    }
  }

  return Array.from(candidates);
}

function deriveHostedApiBase(): string | undefined {
  if (typeof window === 'undefined') {
    return undefined;
  }

  const explicit = normalizeBaseUrl(window.__MEME_GAME_API_BASE__);
  if (explicit) {
    return explicit;
  }

  const { protocol, hostname } = window.location;

  for (const candidateHost of buildHostedApiCandidates(hostname)) {
    return `${protocol}//${candidateHost}/api`;
  }

  return undefined;
}

const API_BASE =
  normalizeBaseUrl(import.meta.env.VITE_API_BASE as string | undefined) ??
  deriveHostedApiBase() ??
  '/api';

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
