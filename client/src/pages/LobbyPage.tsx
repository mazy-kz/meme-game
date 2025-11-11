import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type {
  HighlightMoment,
  LobbySettings,
  MemeCard,
  PlayerPublicState,
  RoundSubmissionView
} from '@shared/types';
import { getLobby } from '../api';
import { pickRandomAvatar, pickRandomName } from '../data';
import { useSocketLobby } from '../hooks/useSocketLobby';

const PROFILE_KEY = 'meme-game:profile';

interface Profile {
  name: string;
  avatar: string;
}

function useProfile(): [Profile, (profile: Profile) => void, () => void] {
  const [profile, setProfile] = useState<Profile>(() => {
    const stored = window.localStorage.getItem(PROFILE_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as Profile;
        if (parsed.name && parsed.avatar) {
          return parsed;
        }
      } catch (err) {
        console.warn('Invalid stored profile', err);
      }
    }
    return { name: pickRandomName(), avatar: pickRandomAvatar() };
  });

  const update = (value: Profile) => {
    setProfile(value);
    window.localStorage.setItem(PROFILE_KEY, JSON.stringify(value));
  };

  const randomize = () => {
    const randomized = { name: pickRandomName(), avatar: pickRandomAvatar() };
    update(randomized);
  };

  return [profile, update, randomize];
}

function useCountdown(targetTime?: number) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!targetTime) return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [targetTime]);
  return targetTime ? Math.max(0, Math.floor((targetTime - now) / 1000)) : 0;
}

function sortPlayers(players: PlayerPublicState[]): PlayerPublicState[] {
  return [...players].sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
}

export default function LobbyPage() {
  const { lobbyId } = useParams();
  console.log('🏠 [LobbyPage] Rendering with lobbyId:', lobbyId);
  const navigate = useNavigate();
  const [profile, setProfile, randomizeProfile] = useProfile();
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const { state, error, joinLobby, connectionStatus, submitMeme, submitVote, startGame, updateSettings, updateName, updateAvatar } = useSocketLobby(lobbyId ?? '');
  const [joining, setJoining] = useState(false);
  const [voteOrder, setVoteOrder] = useState<string[]>([]);

  useEffect(() => {
    if (!lobbyId) return;
    console.log('🔍 [LobbyPage] Fetching lobby summary for:', lobbyId);
    setSummaryLoading(true);
    getLobby(lobbyId)
      .then((data) => {
        console.log('✅ [LobbyPage] Lobby summary received:', data);
        setSummaryError(null);
      })
      .catch((err) => {
        console.error('❌ [LobbyPage] Failed to fetch lobby:', err);
        setSummaryError(err instanceof Error ? err.message : 'Lobby not found');
      })
      .finally(() => setSummaryLoading(false));
  }, [lobbyId]);

  const playerId = state?.you?.id;
  const isHost = state ? state.hostId === state.you?.id : false;
  const isSpectator = state?.you?.spectator ?? false;
  const round = state?.round;
  const timeLeft = useCountdown(round?.endsAt);

  console.log('🎮 [LobbyPage] Current state values:', { 
    playerId, 
    isHost, 
    isSpectator, 
    phase: state?.phase,
    hostId: state?.hostId,
    yourId: state?.you?.id,
    showStartButton: !isSpectator && state?.phase === 'lobby'
  });

  useEffect(() => {
    if (round?.phase === 'voting') {
      const ids = round.submissions.map((submission) => submission.playerId);
      setVoteOrder(ids);
    } else {
      setVoteOrder([]);
    }
  }, [round?.phase, round?.submissions]);

  useEffect(() => {
    if (!playerId) return;
    updateName(profile.name);
    updateAvatar(profile.avatar);
  }, [playerId, profile.name, profile.avatar, updateName, updateAvatar]);

  if (!lobbyId) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-white">
        <p>Lobby not found.</p>
      </div>
    );
  }

  const handleJoin = async (spectator?: boolean) => {
    console.log('🚪 [LobbyPage] Attempting to join lobby:', { lobbyId, spectator, profile });
    setJoining(true);
    try {
      const response = await joinLobby({ lobbyId, name: profile.name, avatar: profile.avatar, spectator });
      console.log('✅ [LobbyPage] Successfully joined lobby:', response);
    } catch (err) {
      console.error('❌ [LobbyPage] Failed to join lobby:', err);
    } finally {
      setJoining(false);
    }
  };

  const handleSubmitVote = () => {
    if (!voteOrder.length) return;
    submitVote({ ranking: voteOrder });
  };

  const handleSubmitMeme = (card: MemeCard) => {
    if (state?.you?.submittedMemeId) return;
    submitMeme({ memeId: card.id });
  };

  const copyInviteLink = async () => {
    const invite = `${window.location.origin}/lobby/${lobbyId}`;
    await navigator.clipboard.writeText(invite);
  };

  const handleSettingChange = (changes: Partial<LobbySettings>) => {
    if (!state) return;
    updateSettings({ settings: { ...state.settings, ...changes } });
  };

  const renderJoinCard = () => (
    <div className="mx-auto mt-10 max-w-lg rounded-3xl border border-slate-800 bg-slate-900/70 p-8 text-white shadow-xl">
      <h2 className="text-2xl font-semibold">Join lobby</h2>
      {summaryError && <p className="mt-2 text-sm text-rose-400">{summaryError}</p>}
      <div className="mt-6 space-y-5">
        <div>
          <label className="block text-sm font-semibold text-slate-200">Display name</label>
          <div className="mt-2 flex items-center gap-3">
            <span className="text-3xl" aria-hidden>
              {profile.avatar}
            </span>
            <input
              className="flex-1 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2"
              value={profile.name}
              onChange={(event) => setProfile({ ...profile, name: event.target.value })}
              maxLength={40}
              required
            />
            <button
              type="button"
              className="rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-300 transition hover:border-brand hover:text-white"
              onClick={randomizeProfile}
            >
              Randomize
            </button>
          </div>
        </div>
        <div>
          <label className="block text-sm font-semibold text-slate-200">Emoji avatar</label>
          <input
            className="mt-2 w-20 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-center text-2xl"
            value={profile.avatar}
            onChange={(event) => setProfile({ ...profile, avatar: event.target.value.slice(0, 4) })}
            required
          />
        </div>
        <div className="flex flex-col gap-3 sm:flex-row">
          <button
            onClick={() => handleJoin(false)}
            disabled={joining || connectionStatus === 'connecting'}
            className="flex-1 rounded-xl bg-brand px-4 py-3 text-lg font-semibold text-white shadow-lg transition hover:bg-brand-light disabled:cursor-not-allowed disabled:opacity-70"
          >
            {joining ? 'Joining…' : 'Join as player'}
          </button>
          <button
            onClick={() => handleJoin(true)}
            disabled={joining || connectionStatus === 'connecting'}
            className="flex-1 rounded-xl border border-slate-700 px-4 py-3 text-lg font-semibold text-slate-200 transition hover:border-brand hover:text-white"
          >
            Spectate
          </button>
        </div>
      </div>
    </div>
  );

  const renderPlayers = (players: PlayerPublicState[]) => (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {players.map((player) => (
        <div
          key={player.id}
          className={`rounded-2xl border px-4 py-3 ${
            player.id === playerId ? 'border-brand/70 bg-brand/10' : 'border-slate-800 bg-slate-900/70'
          }`}
        >
          <div className="flex items-center justify-between">
            <div>
              <div className="text-lg font-semibold text-white">{player.name}</div>
              <div className="text-sm text-slate-400">{player.isHost ? 'Host' : player.spectator ? 'Spectator' : 'Player'}</div>
            </div>
            <div className="text-3xl" aria-hidden>
              {player.avatar}
            </div>
          </div>
          <div className="mt-3 flex items-center justify-between text-sm text-slate-300">
            <span>{player.connected ? 'Online' : 'Offline'}</span>
            <span className="font-semibold text-brand-light">{player.score} pts</span>
          </div>
        </div>
      ))}
    </div>
  );

  const renderHand = (hand: MemeCard[], submittedId?: string) => (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {hand.map((card) => (
        <button
          key={card.id}
          onClick={() => handleSubmitMeme(card)}
          disabled={Boolean(submittedId)}
          className={`group overflow-hidden rounded-2xl border transition ${
            submittedId === card.id
              ? 'border-brand bg-brand/20'
              : 'border-slate-800 bg-slate-900/70 hover:border-brand hover:bg-slate-900'
          }`}
        >
          <img src={card.url} alt={card.alt ?? 'Meme card'} className="h-56 w-full object-cover" />
          <div className="px-4 py-3 text-left">
            <p className="text-sm text-slate-300">Tap to submit this meme</p>
          </div>
        </button>
      ))}
    </div>
  );

  const moveVote = (index: number, direction: -1 | 1) => {
    setVoteOrder((prev) => {
      const next = [...prev];
      const newIndex = index + direction;
      if (newIndex < 0 || newIndex >= next.length) return prev;
      [next[index], next[newIndex]] = [next[newIndex], next[index]];
      return next;
    });
  };

  const renderVoting = (submissions: RoundSubmissionView[]) => {
    const ordered = voteOrder.length
      ? voteOrder.map((id) => submissions.find((submission) => submission.playerId === id)).filter(Boolean) as RoundSubmissionView[]
      : submissions;
    return (
      <div className="space-y-4">
        {ordered.map((submission, index) => (
          <div key={submission.playerId} className="flex flex-col gap-4 rounded-2xl border border-slate-800 bg-slate-900/70 p-4 md:flex-row">
            <div className="flex-shrink-0 text-2xl font-semibold text-brand">{String.fromCharCode(65 + index)}</div>
            <img src={submission.meme.url} alt={submission.meme.alt ?? 'Submitted meme'} className="h-48 w-full rounded-xl object-cover md:w-72" />
            <div className="flex flex-1 flex-col justify-between">
              <div>
                <p className="text-sm text-slate-300">Use the arrows to reorder from funniest to least.</p>
              </div>
              <div className="mt-4 flex items-center gap-2">
                <button
                  onClick={() => moveVote(index, -1)}
                  className="rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-300 transition hover:border-brand hover:text-white"
                  disabled={index === 0}
                >
                  ▲ Up
                </button>
                <button
                  onClick={() => moveVote(index, 1)}
                  className="rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-300 transition hover:border-brand hover:text-white"
                  disabled={index === ordered.length - 1}
                >
                  ▼ Down
                </button>
                <span className="ml-auto rounded-full bg-brand/10 px-4 py-2 text-sm font-semibold text-brand">Rank {index + 1}</span>
              </div>
            </div>
          </div>
        ))}
        <button
          onClick={handleSubmitVote}
          className="w-full rounded-xl bg-brand px-4 py-3 text-lg font-semibold text-white shadow-lg transition hover:bg-brand-light"
        >
          Submit ranking
        </button>
      </div>
    );
  };

  const renderRoundResults = (roundState: LobbyStatePayload['round']) => (
    <div className="space-y-4">
      <h3 className="text-xl font-semibold text-white">Round leaderboard</h3>
      <div className="grid gap-4 md:grid-cols-2">
        {roundState?.leaderboard.map((entry) => {
          const player = state?.players.find((p) => p.id === entry.playerId);
          if (!player) return null;
          return (
            <div key={entry.playerId} className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-lg font-semibold text-white">{player.name}</div>
                  <div className="text-sm text-slate-400">{player.avatar}</div>
                </div>
                <span className="rounded-full bg-brand/20 px-3 py-1 text-sm font-semibold text-brand">+{entry.points}</span>
              </div>
              <p className="mt-3 text-sm text-slate-300">1st place votes: {entry.firstPlaceVotes}</p>
            </div>
          );
        })}
      </div>
    </div>
  );

  const renderFinalMoments = (moments: HighlightMoment[] | undefined) => {
    if (!moments?.length) return null;
    return (
      <div className="mt-6 grid gap-4 md:grid-cols-2">
        {moments.slice(0, 3).map((moment, index) => (
          <div key={`${moment.card.id}-${index}`} className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
            <img src={moment.card.url} alt={moment.card.alt ?? 'Winning meme'} className="h-48 w-full rounded-xl object-cover" />
            <p className="mt-3 text-sm text-slate-300">
              Round {moment.roundNumber} · {moment.situation.text}
            </p>
            <p className="text-sm font-semibold text-brand">{moment.points} points</p>
          </div>
        ))}
      </div>
    );
  };

  if (!state) {
    if (summaryLoading) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-slate-950 text-white">
          <p>Loading lobby…</p>
        </div>
      );
    }
    return <div className="min-h-screen bg-slate-950 text-white">{renderJoinCard()}</div>;
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <header className="border-b border-slate-900 bg-slate-950/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-6 py-6 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Lobby #{lobbyId}</h1>
            <p className="text-sm text-slate-400">Theme: {state.settings.theme} · Rounds: {state.settings.rounds}</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={copyInviteLink}
              className="rounded-xl border border-slate-700 px-4 py-2 text-sm text-slate-200 transition hover:border-brand hover:text-white"
            >
              Copy invite link
            </button>
            {!isSpectator && state.phase === 'lobby' && (
              <button
                onClick={() => {
                  console.log('🎮 [LobbyPage] Start Game button clicked', { isHost, isSpectator, phase: state.phase });
                  alert('Button clicked! Check console for details.');
                  console.log('🎮 [DIRECT] About to call startGame()');
                  startGame();
                  console.log('🎮 [DIRECT] startGame() called');
                }}
                className="rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-white shadow-lg transition hover:bg-brand-light"
              >
                Start game
              </button>
            )}
            <button
              onClick={() => navigate('/')}
              className="rounded-xl border border-slate-800 px-4 py-2 text-sm text-slate-300 transition hover:border-rose-500 hover:text-white"
            >
              Exit
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto flex max-w-6xl flex-col gap-8 px-6 py-8">
        {error && <div className="rounded-xl border border-rose-500 bg-rose-500/10 p-4 text-sm text-rose-200">{error}</div>}

        <section className="space-y-5">
          <div className="flex flex-col gap-3 rounded-3xl border border-slate-800 bg-slate-900/70 p-6 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm uppercase tracking-wide text-slate-400">Current phase</p>
              <h2 className="text-2xl font-semibold text-white">{state.phase}</h2>
              {round?.situation && (
                <p className="mt-2 text-lg text-slate-200">{round.situation.text}</p>
              )}
            </div>
            {round?.endsAt && (
              <div className="text-right">
                <p className="text-sm text-slate-400">Time remaining</p>
                <p className="text-3xl font-semibold text-brand">{timeLeft}s</p>
              </div>
            )}
          </div>

          {state.phase === 'lobby' && (
            <div className="space-y-6">
              {isHost && (
                <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-6">
                  <h3 className="text-lg font-semibold text-white">Host controls</h3>
                  <div className="mt-4 grid gap-4 sm:grid-cols-3">
                    <label className="flex flex-col text-sm text-slate-300">
                      Rounds
                      <input
                        type="number"
                        min={5}
                        max={20}
                        value={state.settings.rounds}
                        onChange={(event) => handleSettingChange({ rounds: Number(event.target.value) })}
                        className="mt-2 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-white"
                      />
                    </label>
                    <label className="flex flex-col text-sm text-slate-300">
                      Max players
                      <input
                        type="number"
                        min={2}
                        max={7}
                        value={state.settings.maxPlayers}
                        onChange={(event) => handleSettingChange({ maxPlayers: Number(event.target.value) })}
                        className="mt-2 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-white"
                      />
                    </label>
                    <label className="flex flex-col text-sm text-slate-300">
                      Theme
                      <select
                        value={state.settings.theme}
                        onChange={(event) => handleSettingChange({ theme: event.target.value as LobbySettings['theme'] })}
                        className="mt-2 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-white"
                      >
                        <option value="fun">Fun</option>
                        <option value="university">University</option>
                        <option value="18+">18+</option>
                      </select>
                    </label>
                  </div>
                </div>
              )}
              <div>
                <h3 className="text-lg font-semibold text-white">Players</h3>
                {renderPlayers(sortPlayers(state.players))}
              </div>
            </div>
          )}

          {state.phase === 'selection' && !isSpectator && state.you && (
            <div className="space-y-5">
              <h3 className="text-lg font-semibold text-white">Pick the perfect meme</h3>
              {state.you.submittedMemeId ? (
                <p className="rounded-xl border border-brand/40 bg-brand/10 px-4 py-3 text-brand">
                  Meme locked in! Waiting for other players…
                </p>
              ) : (
                renderHand(state.you.hand, state.you.submittedMemeId)
              )}
            </div>
          )}

          {state.phase === 'voting' && !isSpectator && (
            <div className="space-y-5">
              <h3 className="text-lg font-semibold text-white">Rank the funniest memes</h3>
              {renderVoting(round?.submissions ?? [])}
            </div>
          )}

          {state.phase === 'roundResults' && round && renderRoundResults(round)}

          {state.phase === 'finalResults' && state.finalResults && (
            <div className="space-y-5">
              <h3 className="text-2xl font-semibold text-white">Final standings</h3>
              <div className="grid gap-4 md:grid-cols-3">
                {state.finalResults.slice(0, 3).map((entry, index) => {
                  const player = state.players.find((p) => p.id === entry.playerId);
                  if (!player) return null;
                  const medal = ['🥇', '🥈', '🥉'][index];
                  return (
                    <div key={entry.playerId} className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6 text-center">
                      <div className="text-4xl">{medal}</div>
                      <div className="mt-3 text-xl font-semibold text-white">{player.name}</div>
                      <div className="text-sm text-slate-400">{player.avatar}</div>
                      <div className="mt-2 text-lg font-semibold text-brand">{entry.score} pts</div>
                    </div>
                  );
                })}
              </div>
              {(() => {
                const moments = state.finalResults
                  .map((entry) => entry.bestMoment)
                  .filter((moment): moment is HighlightMoment => Boolean(moment));
                return renderFinalMoments(moments);
              })()}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
