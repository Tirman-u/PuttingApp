// src/App.tsx
import React, { useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from './firebase';
import SignIn from './components/SignIn';
import './styles/tailwind.css';

import {
  createSession,
  joinSession,
  joinByCode,
  observeOpenSessions,
  endSessionAndSave,
  deleteSession,
  recordJylySet,
  type Session,
  type Player,
  type Game,
} from './components/session';

import { isJylyFinished } from './components/JylyEngine';

// ---------- Väike “store” Appi sees ----------
type AuthUser = { uid: string; displayName: string; photoURL?: string } | null;

export default function App() {
  const [user, setUser] = useState<AuthUser>(null);
  const [game, setGame] = useState<Game>('JYLY');

  const [roomName, setRoomName] = useState('');
  const [joinCode, setJoinCode] = useState('');

  const [session, setSession] = useState<Session | null>(null);
  const [openRooms, setOpenRooms] = useState<Session[]>([]);
  const [saving, setSaving] = useState(false);

  // Auth
  useEffect(() => {
    return onAuthStateChanged(auth, (u) => {
      if (!u) {
        setUser(null);
        setSession(null);
        return;
      }
      setUser({
        uid: u.uid,
        displayName: u.displayName || u.email || 'User',
        photoURL: u.photoURL || undefined,
      });
    });
  }, []);

  // Ava ruumide “lobby/live” vaade
  useEffect(() => {
    if (!user || session) return;
    const off = observeOpenSessions((rows) => setOpenRooms(rows || []));
    return () => off?.();
  }, [user, session]);

  // --------- Helperid ----------
  const me: Player | null = useMemo(() => {
    if (!user || !session) return null;
    return (session.players || []).find((p) => p.uid === user.uid) || null;
  }, [user, session]);

  const iAmOwner = useMemo(
    () => !!user && !!session && session.ownerUid === user.uid,
    [user, session]
  );

  // --------- Toimingud ----------
  async function handleCreateRoom() {
    if (!user) {
      alert('Please sign in first.');
      return;
    }
    try {
      await createSession(user.uid, game, roomName.trim() || undefined);
      alert('Room created. Share the code and press Join when ready.');
      setRoomName('');
    } catch (e: any) {
      console.error(e);
      alert(`Create failed: ${e.message ?? e}`);
    }
  }

  async function handleJoinByCode() {
    if (!user) {
      alert('Please sign in first.');
      return;
    }
    const code = joinCode.trim().toUpperCase();
    if (!code) return;
  
    const player: Player = {
      uid: user.uid,
      name: user.displayName || 'Player',
      photoURL: user.photoURL || undefined,
      totalPoints: 0,
    };
  
    try {
      await joinByCode(code, player);
      // your session observer will take over; optionally clear field
      setJoinCode('');
    } catch (e: any) {
      console.error(e);
      alert(`Join failed: ${e.message ?? e}`);
    }
  }
  

  async function handleJoinRoom(s: Session) {
    if (!user) return;
    const p: Player = {
      uid: user.uid,
      name: user.displayName,
      photoURL: user.photoURL,
      status: 'live',
    };
    await joinSession(s.id, p);
    // Directly set the session to the room object we just joined.
    // For real-time updates consider adding an observeSession export to ./components/session.
    setSession(s);
  }

  async function submitMakes(n: number) {
    if (!user || !session) return;
    try {
      setSaving(true);
      await recordJylySet(session.id, user.uid, n);
    } finally {
      setSaving(false);
    }
  }

  async function handleEndSession() {
    if (!session) return;
    try {
      setSaving(true);
      await endSessionAndSave(session.id);
      alert('Session ended.');
      setSession(null);
    } catch (e: any) {
      alert(`End session failed: ${e?.message || e}`);
    } finally {
      setSaving(false);
    }
  }

  // --------- UI osad ----------
  if (!user) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <SignIn />
      </div>
    );
  }

  // Lobby ekraan
  if (!session) {
    return (
      <div className="min-h-screen bg-black text-white">
        <div className="mx-auto max-w-4xl p-6">
          <div className="flex justify-between items-center mb-6">
            <div className="text-2xl font-bold">PuttApp</div>
            <div className="opacity-80">Hi, {user.displayName} 👋</div>
          </div>

          <div className="rounded-2xl border border-neutral-800 p-6 space-y-4">
            <div className="text-lg font-semibold">Create a room</div>

            <div className="flex gap-2">
              {(['JYLY', 'ATW', 'LADDER', 'T21', 'RACE'] as Game[]).map((g) => (
                <button
                  key={g}
                  onClick={() => setGame(g)}
                  className={`px-4 py-2 rounded-xl ${
                    game === g ? 'bg-sky-600 text-white' : 'bg-neutral-800'
                  }`}
                >
                  {g}
                </button>
              ))}
            </div>

            <input
              value={roomName}
              onChange={(e) => setRoomName(e.target.value)}
              className="w-full rounded-xl bg-neutral-900 px-4 py-3"
              placeholder="Room name (optional)"
            />

            <button
              onClick={handleCreateRoom}
              className="w-full bg-sky-600 hover:bg-sky-500 rounded-xl py-3 font-semibold"
            >
              Create {game} Room
            </button>

            <div className="flex gap-2 pt-2">
              <input
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value)}
                className="flex-1 rounded-xl bg-neutral-900 px-4 py-3"
                placeholder="Join with code"
              />
              <button
                onClick={handleJoinByCode}
                className="px-5 rounded-xl bg-neutral-800"
              >
                Join
              </button>
            </div>
          </div>

          <div className="mt-8 rounded-2xl border border-neutral-800 p-6">
            <div className="text-lg font-semibold mb-3">Available rooms</div>
            {openRooms.length === 0 && <div className="opacity-60">No rooms yet.</div>}
            <div className="space-y-2">
              {openRooms.map((r) => (
                <div
                  key={r.id}
                  className="flex items-center justify-between bg-neutral-900 rounded-xl p-4"
                >
                  <div className="space-y-1">
                    <div className="font-semibold">{r.name || 'Untitled'}</div>
                    <div className="text-sm opacity-70">
                      {r.game} • Code: {r.code} • Players: {r.players?.length || 0}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleJoinRoom(r)}
                      className="px-4 py-2 rounded-xl bg-neutral-800"
                    >
                      Join
                    </button>
                    {iAmOwner && r.status !== 'closed' && r.ownerUid === user.uid ? (
                      <button
                        onClick={() => deleteSession(r.id)}
                        className="px-4 py-2 rounded-xl bg-red-900/60"
                      >
                        Delete
                      </button>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Session ekraan
  const myJyly = me?.jyly;
  const myLast =
    myJyly && myJyly.history.length > 0
      ? myJyly.history[myJyly.history.length - 1]
      : undefined;
  const myDistance = myJyly?.distanceM ?? 10;
  const myDone = !!myJyly && isJylyFinished(myJyly);

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="mx-auto max-w-4xl p-6">
        <div className="flex justify-between items-center mb-4">
          <div className="space-y-1">
            <div className="text-2xl font-bold">{session.name || 'Session'}</div>
            <div className="opacity-70 text-sm">
              {session.game} • Code: {session.code}
            </div>
          </div>

          <div className="flex items-center gap-3">
            {iAmOwner && session.status !== 'closed' ? (
              <button
                onClick={handleEndSession}
                className="bg-red-600 hover:bg-red-500 rounded-xl px-4 py-2"
              >
                End Session → Save
              </button>
            ) : null}
          </div>
        </div>

        {/* JYLY sisestus */}
        {session.game === 'JYLY' && me && (
          <div className="rounded-2xl border border-neutral-800 p-6 mb-8">
            <div className="text-3xl font-bold mb-2">{myDistance} m</div>
            <div className="opacity-70 mb-4">
              Put from here • Enter your makes (0–5){' '}
              {saving ? <span className="ml-2 opacity-60">Saving…</span> : null}
            </div>

            <div className="flex gap-3">
              {[0, 1, 2, 3, 4, 5].map((n) => {
                const isLast = myLast?.makes === n;
                return (
                  <button
                    key={n}
                    disabled={myDone || session.status === 'closed'}
                    onClick={() => submitMakes(n)}
                    className={`w-16 h-16 rounded-2xl text-xl font-semibold ${
                      isLast ? 'bg-neutral-700' : 'bg-neutral-800'
                    } ${myDone ? 'opacity-50' : ''}`}
                  >
                    {n}
                  </button>
                );
              })}
            </div>

            <div className="mt-4 text-sm opacity-80">
              Points: <span className="font-semibold">{me.totalPoints || 0}</span> •{' '}
              Sets: {myJyly?.history.length || 0}/20
            </div>

            {myJyly && myJyly.history.length > 0 && (
              <div className="mt-3 text-sm opacity-70">
                History:{' '}
                {myJyly.history
                  .map(
                    (h, i) => `${i + 1}) ${h.makes}/5 @${h.distanceM}m (+${h.points})`
                  )
                  .join(' · ')}
              </div>
            )}
          </div>
        )}

        {/* Leaderboard */}
        <div className="rounded-2xl border border-neutral-800">
          <div className="p-4 font-semibold">Leaderboard</div>
          <div className="divide-y divide-neutral-900">
            {[...(session.players || [])]
              .sort((a, b) => (b.totalPoints || 0) - (a.totalPoints || 0))
              .map((p) => (
                <div
                  key={p.uid}
                  className="px-4 py-3 flex items-center justify-between"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-neutral-800" />
                    <div>
                      <div className="font-medium">
                        {p.name} {p.uid === user!.uid ? <span className="opacity-60">• You</span> : null}
                      </div>
                      <div className="text-xs opacity-60">
                        {p.status === 'done'
                          ? 'Finished'
                          : p.status === 'live'
                          ? 'Playing'
                          : 'Joined'}
                      </div>
                    </div>
                  </div>
                  <div className="text-xl font-bold">{p.totalPoints || 0}</div>
                </div>
              ))}
          </div>
        </div>
      </div>
    </div>
  );
}
