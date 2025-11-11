import { FormEvent, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createLobby } from '../api';
import { pickRandomAvatar, pickRandomName } from '../data';

interface Profile {
  name: string;
  avatar: string;
}

const PROFILE_KEY = 'meme-game:profile';

export default function LandingPage() {
  const navigate = useNavigate();
  const [profile, setProfile] = useState<Profile>({ name: pickRandomName(), avatar: pickRandomAvatar() });
  const [rounds, setRounds] = useState(7);
  const [theme, setTheme] = useState<'fun' | 'university' | '18+'>('fun');
  const [maxPlayers, setMaxPlayers] = useState(6);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [joinCode, setJoinCode] = useState('');

  useEffect(() => {
    const stored = window.localStorage.getItem(PROFILE_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as Profile;
        if (parsed.name && parsed.avatar) {
          setProfile(parsed);
        }
      } catch (err) {
        console.warn('Failed to parse stored profile', err);
      }
    }
  }, []);

  const handleCreate = async (event: FormEvent) => {
    event.preventDefault();
    setCreating(true);
    setError(null);
    try {
      const response = await createLobby({
        rounds,
        theme,
        maxPlayers,
        name: profile.name,
        avatar: profile.avatar
      });
      window.localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
      window.localStorage.setItem(`meme-game:lobby:${response.lobbyId}`, response.playerId);
      navigate(`/lobby/${response.lobbyId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create lobby');
    } finally {
      setCreating(false);
    }
  };

  const handleJoin = (event: FormEvent) => {
    event.preventDefault();
    if (!joinCode.trim()) return;
    navigate(`/lobby/${joinCode.trim()}`);
  };

  const randomizeProfile = () => {
    setProfile({ name: pickRandomName(), avatar: pickRandomAvatar() });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-950 to-black">
      <div className="mx-auto flex max-w-5xl flex-col gap-8 px-6 py-16">
        <header className="text-center">
          <h1 className="text-4xl font-bold text-white sm:text-5xl">Meme Showdown</h1>
          <p className="mt-3 text-lg text-slate-300">
            Host outrageous meme battles with friends in seconds.
          </p>
        </header>

        <div className="grid gap-8 lg:grid-cols-2">
          <section className="rounded-3xl border border-slate-800 bg-slate-900/60 p-8 shadow-xl">
            <h2 className="text-2xl font-semibold text-white">Create a Lobby</h2>
            <p className="mt-2 text-sm text-slate-300">Configure rounds, pick a theme, and share the invite link.</p>
            <form className="mt-6 space-y-5" onSubmit={handleCreate}>
              <div>
                <label className="block text-sm font-semibold text-slate-200">Display name</label>
                <div className="mt-2 flex items-center gap-3">
                  <span className="text-3xl" aria-hidden>
                    {profile.avatar}
                  </span>
                  <input
                    className="flex-1 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-white focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/40"
                    value={profile.name}
                    onChange={(event) => setProfile((prev) => ({ ...prev, name: event.target.value }))}
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
                  onChange={(event) => setProfile((prev) => ({ ...prev, avatar: event.target.value.slice(0, 4) }))}
                  required
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="flex flex-col text-sm font-semibold text-slate-200">
                  Rounds
                  <input
                    type="number"
                    min={5}
                    max={20}
                    className="mt-2 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-white"
                    value={rounds}
                    onChange={(event) => setRounds(Number(event.target.value))}
                  />
                </label>

                <label className="flex flex-col text-sm font-semibold text-slate-200">
                  Max players
                  <input
                    type="number"
                    min={2}
                    max={7}
                    className="mt-2 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-white"
                    value={maxPlayers}
                    onChange={(event) => setMaxPlayers(Number(event.target.value))}
                  />
                </label>
              </div>

              <div>
                <span className="block text-sm font-semibold text-slate-200">Theme</span>
                <div className="mt-2 flex gap-3">
                  {['fun', 'university', '18+'].map((value) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setTheme(value as typeof theme)}
                      className={`rounded-full border px-4 py-2 text-sm capitalize transition ${
                        theme === value
                          ? 'border-brand bg-brand/20 text-white'
                          : 'border-slate-700 text-slate-300 hover:border-brand'
                      }`}
                    >
                      {value}
                    </button>
                  ))}
                </div>
              </div>

              {error && <p className="text-sm text-rose-400">{error}</p>}

              <button
                type="submit"
                disabled={creating}
                className="w-full rounded-xl bg-brand px-4 py-3 text-lg font-semibold text-white shadow-lg transition hover:bg-brand-light disabled:cursor-not-allowed disabled:opacity-70"
              >
                {creating ? 'Creating…' : 'Create lobby'}
              </button>
            </form>
          </section>

          <section className="rounded-3xl border border-slate-800 bg-slate-900/40 p-8 shadow-xl">
            <h2 className="text-2xl font-semibold text-white">Join with a code</h2>
            <p className="mt-2 text-sm text-slate-300">Paste a lobby ID shared by your host to jump right in.</p>
            <form className="mt-6 space-y-4" onSubmit={handleJoin}>
              <input
                className="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-white focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/40"
                placeholder="Enter lobby ID"
                value={joinCode}
                onChange={(event) => setJoinCode(event.target.value)}
                required
              />
              <button
                type="submit"
                className="w-full rounded-xl border border-slate-700 px-4 py-3 text-lg font-semibold text-slate-200 transition hover:border-brand hover:text-white"
              >
                Join lobby
              </button>
            </form>

            <div className="mt-10 rounded-2xl border border-slate-800 bg-slate-950/60 p-6 text-sm text-slate-300">
              <h3 className="text-lg font-semibold text-white">How it works</h3>
              <ol className="mt-3 list-decimal space-y-2 pl-5">
                <li>Create your lobby and copy the invite link.</li>
                <li>Everyone picks memes that match the situation prompt.</li>
                <li>Rank the funniest memes, score points, and crown the winner!</li>
              </ol>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
