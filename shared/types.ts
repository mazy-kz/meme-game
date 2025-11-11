export type GameTheme = 'fun' | 'university' | '18+';

export interface LobbySettings {
  rounds: number;
  theme: GameTheme;
  maxPlayers: number;
}

export interface MemeCard {
  id: string;
  url: string;
  alt?: string;
}

export interface SituationPrompt {
  id: string;
  text: string;
  theme: GameTheme;
}

export interface HighlightMoment {
  card: MemeCard;
  situation: SituationPrompt;
  points: number;
  roundNumber: number;
}

export interface PlayerPublicState {
  id: string;
  name: string;
  avatar: string;
  isHost: boolean;
  connected: boolean;
  spectator: boolean;
  score: number;
  submitted?: boolean;
  voted?: boolean;
}

export type GamePhase = 'lobby' | 'selection' | 'voting' | 'roundResults' | 'finalResults';

export interface RoundSubmissionView {
  slot: string;
  meme: MemeCard;
  playerId: string;
}

export interface RoundResultEntry {
  playerId: string;
  points: number;
  rank: number;
  breakdown: number[];
  firstPlaceVotes: number;
  secondPlaceVotes: number;
}

export interface RoundStatePublic {
  roundNumber: number;
  totalRounds: number;
  situation?: SituationPrompt;
  phase: GamePhase;
  submissions: RoundSubmissionView[];
  leaderboard: RoundResultEntry[];
  endsAt?: number;
}

export interface FinalResultEntry {
  playerId: string;
  score: number;
  bestMoment?: HighlightMoment;
}

export interface LobbyStatePayload {
  lobbyId: string;
  settings: LobbySettings;
  players: PlayerPublicState[];
  hostId: string;
  phase: GamePhase;
  round?: RoundStatePublic;
  finalResults?: FinalResultEntry[];
  you?: {
    id: string;
    spectator: boolean;
    hand: MemeCard[];
    submittedMemeId?: string;
  };
}

export interface JoinLobbyRequest {
  lobbyId: string;
  playerId?: string;
  name: string;
  avatar: string;
  spectator?: boolean;
}

export interface JoinLobbyResponse {
  ok: boolean;
  lobbyId: string;
  playerId: string;
  spectator: boolean;
  message?: string;
}

export interface UpdateSettingsPayload {
  settings: LobbySettings;
}

export interface SubmitMemePayload {
  memeId: string;
}

export interface SubmitVotePayload {
  ranking: string[];
}

export interface ServerToClientEvents {
  'lobby:state': (state: LobbyStatePayload) => void;
  'lobby:error': (message: string) => void;
}

export interface ClientToServerEvents {
  'player:join': (data: JoinLobbyRequest, callback: (response: JoinLobbyResponse) => void) => void;
  'player:updateName': (name: string) => void;
  'player:updateAvatar': (avatar: string) => void;
  'game:updateSettings': (payload: UpdateSettingsPayload) => void;
  'game:start': () => void;
  'submission:submit': (payload: SubmitMemePayload) => void;
  'vote:submit': (payload: SubmitVotePayload) => void;
  'player:leave': () => void;
}
