import { GamePhase, HighlightMoment, LobbySettings, MemeCard, SituationPrompt } from '../../../shared/types.js';

export interface PlayerState {
  id: string;
  name: string;
  avatar: string;
  isHost: boolean;
  connected: boolean;
  spectator: boolean;
  socketId?: string;
  score: number;
  hand: MemeCard[];
  submittedMemeId?: string;
  voteRanking?: string[];
  bestMoment?: HighlightMoment;
}

export interface RoundInternalState {
  roundNumber: number;
  situation: SituationPrompt;
  submissions: Map<string, MemeCard>;
  submissionSlots: Map<string, string>;
  votes: Map<string, string[]>;
  phase: GamePhase;
  endsAt?: number;
  seed: number;
  leaderboard?: RoundResultEntryInternal[];
}

export interface RoundResultEntryInternal {
  playerId: string;
  points: number;
  firstPlaceVotes: number;
  secondPlaceVotes: number;
  placements: number[];
}

export interface LobbyState {
  id: string;
  settings: LobbySettings;
  hostId: string;
  players: Map<string, PlayerState>;
  deck: MemeCard[];
  usedSituations: Set<string>;
  situationsPool: SituationPrompt[];
  phase: GamePhase;
  round?: RoundInternalState;
}
