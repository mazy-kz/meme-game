import { randomUUID } from 'node:crypto';
import {
  LobbyStatePayload,
  LobbySettings,
  PlayerPublicState,
  RoundResultEntry,
  SubmitMemePayload,
  SubmitVotePayload
} from '../../../shared/types.js';
import {
  CELEBRITY_NAMES,
  EMOJI_AVATARS,
  RESULTS_DURATION_MS,
  SELECTION_DURATION_MS,
  SITUATIONS,
  VOTING_DURATION_MS
} from '../constants.js';
import { MockMemeProvider, MemeProvider, TenorMemeProvider } from './memeProvider.js';
import { LobbyState, PlayerState, RoundInternalState, RoundResultEntryInternal } from './types.js';

function randomItem<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

function shuffle<T>(items: T[]): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function mulberry32(a: number): () => number {
  return function random() {
    let t = a += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

type TimerId = NodeJS.Timeout;

export class GameManager {
  private lobbies = new Map<string, LobbyState>();
  private timers = new Map<string, TimerId>();
  private memeProvider: MemeProvider;
  private listeners = new Set<(lobbyId: string) => void>();

  constructor(provider?: MemeProvider) {
    this.memeProvider = provider ?? new MockMemeProvider();
  }

  onStateChange(listener: (lobbyId: string) => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(lobbyId: string) {
    for (const listener of this.listeners) {
      listener(lobbyId);
    }
  }

  createLobby(settings: LobbySettings): { lobby: LobbyState; host: PlayerState } {
    const sanitizedSettings = this.sanitizeSettings(settings);
    const lobbyId = randomUUID();
    const host: PlayerState = {
      id: randomUUID(),
      name: randomItem(CELEBRITY_NAMES),
      avatar: randomItem(EMOJI_AVATARS),
      isHost: true,
      connected: false,
      spectator: false,
      score: 0,
      hand: []
    };

    const lobby: LobbyState = {
      id: lobbyId,
      settings: sanitizedSettings,
      hostId: host.id,
      players: new Map([[host.id, host]]),
      deck: [],
      usedSituations: new Set<string>(),
      situationsPool: [...SITUATIONS[sanitizedSettings.theme]],
      phase: 'lobby'
    };

    this.lobbies.set(lobbyId, lobby);
    return { lobby, host };
  }

  getLobby(lobbyId: string): LobbyState | undefined {
    return this.lobbies.get(lobbyId);
  }

  joinLobby(lobbyId: string, opts: { playerId?: string; name?: string; avatar?: string; spectator?: boolean }): {
    lobby?: LobbyState;
    player?: PlayerState;
    spectator: boolean;
    error?: string;
  } {
    const lobby = this.lobbies.get(lobbyId);
    if (!lobby) {
      return { spectator: false, error: 'Lobby not found' };
    }

    const requestedSpectator = Boolean(opts.spectator);
    let player = opts.playerId ? lobby.players.get(opts.playerId) : undefined;

    if (!player) {
      const activePlayers = [...lobby.players.values()].filter((p) => !p.spectator);
      const shouldSpectate = requestedSpectator || (lobby.phase !== 'lobby' && activePlayers.length >= lobby.settings.maxPlayers);

      player = {
        id: opts.playerId ?? randomUUID(),
        name: opts.name || randomItem(CELEBRITY_NAMES),
        avatar: opts.avatar || randomItem(EMOJI_AVATARS),
        isHost: false,
        connected: false,
        spectator: shouldSpectate,
        score: 0,
        hand: []
      };

      lobby.players.set(player.id, player);

      if (!shouldSpectate) {
        this.ensureHost(lobby);
      }

      return {
        lobby,
        player,
        spectator: player.spectator,
        error: shouldSpectate && !requestedSpectator ? 'Lobby is full, joined as spectator.' : undefined
      };
    }

    return { lobby, player, spectator: player.spectator };
  }

  markPlayerConnected(lobbyId: string, playerId: string, socketId: string) {
    const lobby = this.lobbies.get(lobbyId);
    if (!lobby) return;
    const player = lobby.players.get(playerId);
    if (!player) return;
    player.connected = true;
    player.socketId = socketId;
    this.notify(lobbyId);
  }

  markPlayerDisconnected(socketId: string): LobbyState | undefined {
    for (const lobby of this.lobbies.values()) {
      const player = [...lobby.players.values()].find((p) => p.socketId === socketId);
      if (player) {
        player.connected = false;
        player.socketId = undefined;
        if (player.isHost) {
          this.ensureHost(lobby);
        }
        this.notify(lobby.id);
        return lobby;
      }
    }
    return undefined;
  }

  updatePlayerName(lobbyId: string, playerId: string, name: string) {
    const lobby = this.lobbies.get(lobbyId);
    if (!lobby) return;
    const player = lobby.players.get(playerId);
    if (!player) return;
    const trimmed = name.trim();
    if (!trimmed) return;
    player.name = trimmed.slice(0, 40);
    this.notify(lobbyId);
  }

  updatePlayerAvatar(lobbyId: string, playerId: string, avatar: string) {
    const lobby = this.lobbies.get(lobbyId);
    if (!lobby) return;
    const player = lobby.players.get(playerId);
    if (!player) return;
    player.avatar = avatar.slice(0, 8);
    this.notify(lobbyId);
  }

  updateSettings(lobbyId: string, playerId: string, settings: LobbySettings) {
    const lobby = this.lobbies.get(lobbyId);
    if (!lobby) return;
    if (lobby.hostId !== playerId) return;
    lobby.settings = this.sanitizeSettings(settings);
    lobby.situationsPool = [...SITUATIONS[lobby.settings.theme]];
    this.notify(lobbyId);
  }

  async startGame(lobbyId: string): Promise<boolean> {
    const lobby = this.lobbies.get(lobbyId);
    if (!lobby) return false;
    const players = [...lobby.players.values()].filter((p) => !p.spectator);
    if (players.length < 2) {
      return false;
    }

    lobby.phase = 'selection';
    lobby.usedSituations.clear();
    lobby.situationsPool = [...SITUATIONS[lobby.settings.theme]];
    lobby.deck = [];
    lobby.round = undefined;

    const cardsPerPlayer = lobby.settings.rounds + 2;
    const desiredCards = Math.ceil(players.length * cardsPerPlayer * 1.2);
    const memes = await this.memeProvider.fetchMemes(desiredCards, lobby.settings.theme);
    lobby.deck = shuffle(memes);

    for (const player of players) {
      player.score = 0;
      player.hand = [];
      player.submittedMemeId = undefined;
      player.voteRanking = undefined;
      player.bestMoment = undefined;
      for (let i = 0; i < cardsPerPlayer; i += 1) {
        const card = lobby.deck.pop();
        if (card) {
          player.hand.push(card);
        }
      }
    }

    await this.beginRound(lobby);
    return true;
  }

  submitMeme(lobbyId: string, playerId: string, payload: SubmitMemePayload) {
    const lobby = this.lobbies.get(lobbyId);
    if (!lobby || lobby.phase !== 'selection' || !lobby.round) return;
    const player = lobby.players.get(playerId);
    if (!player || player.spectator) return;
    const card = player.hand.find((c) => c.id === payload.memeId);
    if (!card) return;
    lobby.round.submissions.set(playerId, card);
    player.submittedMemeId = card.id;
    player.hand = player.hand.filter((c) => c.id !== card.id);
    if (this.allSubmitted(lobby)) {
      this.endSelection(lobbyId);
    } else {
      this.notify(lobbyId);
    }
  }

  submitVote(lobbyId: string, playerId: string, payload: SubmitVotePayload) {
    const lobby = this.lobbies.get(lobbyId);
    if (!lobby || lobby.phase !== 'voting' || !lobby.round) return;
    const player = lobby.players.get(playerId);
    if (!player || player.spectator) return;
    const validTargets = [...lobby.round.submissions.keys()].filter((id) => id !== playerId);
    if (validTargets.length === 0) return;
    if (payload.ranking.length !== validTargets.length) return;
    const unique = new Set(payload.ranking);
    if (unique.size !== validTargets.length) return;
    if (!payload.ranking.every((id) => validTargets.includes(id))) return;
    lobby.round.votes.set(playerId, payload.ranking);
    player.voteRanking = payload.ranking;
    if (this.allVotesIn(lobby)) {
      this.endVoting(lobbyId);
    } else {
      this.notify(lobbyId);
    }
  }

  getLobbyStateForPlayer(lobbyId: string, playerId: string): LobbyStatePayload | undefined {
    const lobby = this.lobbies.get(lobbyId);
    if (!lobby) return undefined;
    const player = lobby.players.get(playerId);
    if (!player) return undefined;

    const players: PlayerPublicState[] = [...lobby.players.values()].map((p) => ({
      id: p.id,
      name: p.name,
      avatar: p.avatar,
      isHost: p.id === lobby.hostId,
      connected: p.connected,
      spectator: p.spectator,
      score: p.score,
      submitted: Boolean(p.submittedMemeId),
      voted: Boolean(p.voteRanking)
    }));

    const payload: LobbyStatePayload = {
      lobbyId: lobby.id,
      settings: lobby.settings,
      players,
      hostId: lobby.hostId,
      phase: lobby.phase,
      you: {
        id: player.id,
        spectator: player.spectator,
        hand: player.hand,
        submittedMemeId: player.submittedMemeId
      }
    };

    if (lobby.round) {
      payload.round = {
        roundNumber: lobby.round.roundNumber,
        totalRounds: lobby.settings.rounds,
        situation: lobby.round.situation,
        phase: lobby.round.phase,
        submissions: this.buildSubmissionView(lobby, playerId),
        leaderboard: lobby.round.leaderboard ? this.buildRoundResults(lobby.round.leaderboard) : [],
        endsAt: lobby.round.endsAt
      };
    }

    if (lobby.phase === 'finalResults') {
      payload.finalResults = this.buildFinalResults(lobby);
    }

    return payload;
  }

  private sanitizeSettings(settings: LobbySettings): LobbySettings {
    return {
      rounds: Math.min(20, Math.max(5, Math.floor(settings.rounds))),
      theme: settings.theme,
      maxPlayers: Math.min(7, Math.max(2, Math.floor(settings.maxPlayers)))
    };
  }

  private ensureHost(lobby: LobbyState) {
    const currentHost = lobby.players.get(lobby.hostId);
    if (currentHost && !currentHost.spectator) {
      currentHost.isHost = true;
      return;
    }
    const next = [...lobby.players.values()].find((p) => !p.spectator && p.connected) || [...lobby.players.values()].find((p) => !p.spectator);
    if (next) {
      lobby.hostId = next.id;
      for (const player of lobby.players.values()) {
        player.isHost = player.id === next.id;
      }
      this.notify(lobby.id);
    }
  }

  private async beginRound(lobby: LobbyState) {
    const roundNumber = (lobby.round?.roundNumber ?? 0) + 1;
    const situation = this.pickSituation(lobby);
    const round: RoundInternalState = {
      roundNumber,
      situation,
      submissions: new Map(),
      submissionSlots: new Map(),
      votes: new Map(),
      phase: 'selection',
      seed: Math.floor(Math.random() * 100000)
    };

    lobby.round = round;
    lobby.phase = 'selection';
    for (const player of lobby.players.values()) {
      player.submittedMemeId = undefined;
      player.voteRanking = undefined;
    }

    round.endsAt = Date.now() + SELECTION_DURATION_MS;
    this.setTimer(lobby.id, () => this.endSelection(lobby.id), SELECTION_DURATION_MS);
    this.notify(lobby.id);
  }

  private pickSituation(lobby: LobbyState) {
    if (lobby.situationsPool.length === 0) {
      lobby.situationsPool = [...SITUATIONS[lobby.settings.theme]].map((prompt, index) => ({
        ...prompt,
        id: `${prompt.id}-repeat-${index}`,
        text: `${prompt.text} (new spin)`
      }));
      lobby.usedSituations.clear();
    }
    const available = lobby.situationsPool.filter((s) => !lobby.usedSituations.has(s.id));
    const choice = available.length > 0 ? randomItem(available) : randomItem(lobby.situationsPool);
    lobby.usedSituations.add(choice.id);
    return choice;
  }

  private allSubmitted(lobby: LobbyState) {
    if (!lobby.round) return false;
    const participants = [...lobby.players.values()].filter((p) => !p.spectator);
    return participants.every((p) => lobby.round?.submissions.has(p.id));
  }

  private allVotesIn(lobby: LobbyState) {
    if (!lobby.round) return false;
    const participants = [...lobby.players.values()].filter((p) => !p.spectator);
    if (participants.length <= 1) return true;
    return participants.every((p) => lobby.round?.votes.has(p.id));
  }

  private ensureAutoSubmissions(lobby: LobbyState) {
    if (!lobby.round) return;
    const participants = [...lobby.players.values()].filter((p) => !p.spectator);
    for (const player of participants) {
      if (lobby.round.submissions.has(player.id)) continue;
      const card = player.hand.length > 0 ? randomItem(player.hand) : undefined;
      if (card) {
        lobby.round.submissions.set(player.id, card);
        player.submittedMemeId = card.id;
        player.hand = player.hand.filter((c) => c.id !== card.id);
      }
    }
  }

  private ensureAutoVotes(lobby: LobbyState) {
    if (!lobby.round) return;
    const participants = [...lobby.players.values()].filter((p) => !p.spectator);
    for (const voter of participants) {
      if (lobby.round.votes.has(voter.id)) continue;
      const options = [...lobby.round.submissions.keys()].filter((id) => id !== voter.id);
      const ranking = shuffle(options);
      lobby.round.votes.set(voter.id, ranking);
      voter.voteRanking = ranking;
    }
  }

  private endSelection(lobbyId: string) {
    const lobby = this.lobbies.get(lobbyId);
    if (!lobby || !lobby.round) return;
    this.clearTimer(lobbyId);
    this.ensureAutoSubmissions(lobby);

    lobby.round.phase = 'voting';
    lobby.phase = 'voting';

    const submissions = shuffle([...lobby.round.submissions.entries()]);
    const slots = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    submissions.forEach(([playerId], index) => {
      lobby.round?.submissionSlots.set(playerId, slots[index]);
    });

    lobby.round.endsAt = Date.now() + VOTING_DURATION_MS;
    this.setTimer(lobby.id, () => this.endVoting(lobby.id), VOTING_DURATION_MS);
    this.notify(lobby.id);
  }

  private endVoting(lobbyId: string) {
    const lobby = this.lobbies.get(lobbyId);
    if (!lobby || !lobby.round) return;
    this.clearTimer(lobbyId);
    this.ensureAutoVotes(lobby);

    const leaderboard = this.calculateScores(lobby);
    lobby.round.leaderboard = leaderboard;
    lobby.round.phase = 'roundResults';
    lobby.phase = 'roundResults';

    lobby.round.endsAt = Date.now() + RESULTS_DURATION_MS;
    this.setTimer(lobby.id, () => this.finishRound(lobby.id), RESULTS_DURATION_MS);
    this.notify(lobby.id);
  }

  private calculateScores(lobby: LobbyState): RoundResultEntryInternal[] {
    if (!lobby.round) return [];
    const participants = [...lobby.players.values()].filter((p) => !p.spectator);
    const optionsPerVote = Math.max(1, participants.length - 1);
    const scoreboard = new Map<string, { points: number; first: number; second: number; placements: number[] }>();

    for (const participant of participants) {
      scoreboard.set(participant.id, { points: 0, first: 0, second: 0, placements: Array(optionsPerVote).fill(0) });
    }

    for (const [voterId, ranking] of lobby.round.votes.entries()) {
      ranking.forEach((playerId, index) => {
        const info = scoreboard.get(playerId);
        if (!info) return;
        const points = optionsPerVote - index;
        info.points += points;
        if (index === 0) info.first += 1;
        if (index === 1) info.second += 1;
        if (index < info.placements.length) {
          info.placements[index] += 1;
        }
      });
      const voter = lobby.players.get(voterId);
      if (voter) {
        voter.voteRanking = ranking;
      }
    }

    const random = mulberry32(lobby.round.seed);

    const ordered = participants
      .map((player) => {
        const entry = scoreboard.get(player.id)!;
        player.score += entry.points;
        const card = lobby.round?.submissions.get(player.id);
        if (card) {
          const moment = {
            card,
            points: entry.points,
            situation: lobby.round!.situation,
            roundNumber: lobby.round!.roundNumber
          };
          if (!player.bestMoment || moment.points > player.bestMoment.points) {
            player.bestMoment = moment;
          }
        }
        return {
          playerId: player.id,
          points: entry.points,
          firstPlaceVotes: entry.first,
          secondPlaceVotes: entry.second,
          placements: entry.placements
        } satisfies RoundResultEntryInternal;
      })
      .sort((a, b) => {
        if (b.points !== a.points) return b.points - a.points;
        if (b.firstPlaceVotes !== a.firstPlaceVotes) return b.firstPlaceVotes - a.firstPlaceVotes;
        if (b.secondPlaceVotes !== a.secondPlaceVotes) return b.secondPlaceVotes - a.secondPlaceVotes;
        return random() - 0.5;
      });

    return ordered;
  }

  private buildSubmissionView(lobby: LobbyState, viewerId: string) {
    if (!lobby.round) return [];
    return [...lobby.round.submissions.entries()]
      .filter(([playerId]) => lobby.phase !== 'voting' || playerId !== viewerId)
      .map(([playerId, meme]) => ({
        playerId,
        slot: lobby.round?.submissionSlots.get(playerId) ?? '?',
        meme
      }));
  }

  private buildRoundResults(leaderboard: RoundResultEntryInternal[]): RoundResultEntry[] {
    return leaderboard.map((entry, index) => ({
      playerId: entry.playerId,
      points: entry.points,
      rank: index + 1,
      breakdown: [...entry.placements],
      firstPlaceVotes: entry.firstPlaceVotes,
      secondPlaceVotes: entry.secondPlaceVotes
    }));
  }

  private buildFinalResults(lobby: LobbyState) {
    const participants = [...lobby.players.values()].filter((p) => !p.spectator);
    return participants
      .map((p) => ({ playerId: p.id, score: p.score, bestMoment: p.bestMoment }))
      .sort((a, b) => b.score - a.score);
  }

  private finishRound(lobbyId: string) {
    const lobby = this.lobbies.get(lobbyId);
    if (!lobby || !lobby.round) return;
    this.clearTimer(lobbyId);

    if (lobby.round.roundNumber >= lobby.settings.rounds) {
      lobby.phase = 'finalResults';
      lobby.round = undefined;
    } else {
      lobby.phase = 'selection';
      this.beginRound(lobby);
    }
    this.notify(lobby.id);
  }

  private setTimer(lobbyId: string, handler: () => void, duration: number) {
    this.clearTimer(lobbyId);
    const timer = setTimeout(() => {
      this.timers.delete(lobbyId);
      handler();
    }, duration);
    this.timers.set(lobbyId, timer);
  }

  private clearTimer(lobbyId: string) {
    const timer = this.timers.get(lobbyId);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(lobbyId);
    }
  }
}

// Initialize with Tenor provider if API key is available, otherwise use mock
const tenorApiKey = process.env.TENOR_API_KEY || '';
const memeProvider = tenorApiKey 
  ? new TenorMemeProvider(tenorApiKey) 
  : new MockMemeProvider();

console.log(`🎨 [MemeProvider] Using ${tenorApiKey ? 'Tenor' : 'Mock'} meme provider`);

export const gameManager = new GameManager(memeProvider);
