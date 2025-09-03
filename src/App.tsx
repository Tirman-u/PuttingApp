// src/App.tsx
import { useEffect, useMemo, useState } from 'react'
import { onAuthStateChanged } from 'firebase/auth'
import create from 'zustand'

import { auth, completeRedirect } from './firebase'
import SignIn from './components/SignIn'
import './styles/tailwind.css'

import { applyJylySet, rebuildJylyFromMakes } from './components/JylyEngine'
import {
  createSession,
  joinSession,
  joinByCode,
  observeSession,
  observeOpenSessions,
  endSessionAndSave,
  fetchGlobalLeaderboard,
  deleteSession,
  recordJylySet,
  type Session,
  type Player,
  type Game,
} from './components/session'

import Spectator from './screens/Spectator'

type AuthState = { user: any | null }
const useAuth = create<AuthState>(() => ({ user: null }))

const GAMES: Game[] = ['JYLY', 'ATW', 'LADDER', 'T21', 'RACE']
const cx = (...xs: (string | false | null | undefined)[]) => xs.filter(Boolean).join(' ')

function mkPlayer(u: any): Player {
  return {
    uid: u?.uid,
    name: u?.displayName || 'Player',
    photoURL: u?.photoURL || undefined,
    totalPoints: 0,
  } as Player
}

export default function App() {
  // Big-screen: ?screen=<sessionId>
  const screenId = new URLSearchParams(window.location.search).get('screen')
  if (screenId) return <Spectator sessionId={screenId} />

  const { user } = useAuth()
  const [session, setSession] = useState<Session | null>(null)
  const [openRooms, setOpenRooms] = useState<Session[]>([])
  const [tab, setTab] = useState<'play' | 'leaderboard'>('play')
  const [leader, setLeader] = useState<any[]>([])

  const [game, setGame] = useState<Game>('JYLY')
  const [roomName, setRoomName] = useState('')
  const [joinCode, setJoinCode] = useState('')
  const [ending, setEnding] = useState(false)

  // kohalik optimistlik JYLY
  const [localJyly, setLocalJyly] = useState<any | null>(null)

  // auth
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => useAuth.setState({ user: u }))
    completeRedirect().catch(() => void 0)
    return () => unsub()
  }, [])

  // lobby/live list
  useEffect(() => {
    const off = observeOpenSessions((rows) => setOpenRooms(rows || []))
    return () => off?.()
  }, [])

  // global leaderboard tab
  useEffect(() => {
    if (tab !== 'leaderboard') return
    fetchGlobalLeaderboard().then(setLeader).catch(() => setLeader([]))
  }, [tab])

  // realtime session
  useEffect(() => {
    if (!session?.id) return
    const off = observeSession(session.id, (s) => setSession(s as any))
    return () => off?.()
  }, [session?.id])

  const me = useMemo(() => session?.players?.find((p) => p.uid === user?.uid) || null, [session, user])
  const isOwner = !!(session && user && session.ownerUid === user.uid)

  // rebuild jyly from server + local overlay
  const jylyFromServer = useMemo(() => {
    if (!me) return rebuildJylyFromMakes([])
    const makes = (me as any)?.jyly?.makes || (Array.isArray((me as any)?.jyly) ? (me as any).jyly : []) || []
    return rebuildJylyFromMakes(makes)
  }, [me])

  useEffect(() => setLocalJyly(null), [me?.uid, (me as any)?.jyly?.makes, session?.id])

  const jyly = localJyly ?? jylyFromServer
  const roundCount = jyly?.history?.length ?? 0
  const distanceM = jyly?.next?.distanceM ?? 10

  async function handleCreateRoom() {
    if (!user) return alert('Logi sisse, et ruumi luua.')
    try {
      await createSession(user.uid, game, roomName || undefined) // ei liitu automaatselt
      alert('Room created. Join when ready.')
    } catch (e: any) {
      alert('Create room failed: ' + (e?.message || String(e)))
    }
  }

  async function handleJoinByCode() {
    if (!user) return alert('Logi sisse.')
    if (!joinCode.trim()) return alert('Sisesta kood.')
    try {
      const sid = await joinByCode(joinCode.trim().toUpperCase(), mkPlayer(user))
      const off = observeSession(sid, (s) => setSession(s as any))
      return () => off?.()
    } catch (e: any) {
      alert('Join failed: ' + (e?.message || String(e)))
    }
  }

  async function handleJoin(id: string) {
    if (!user) return alert('Logi sisse.')
    try {
      await joinSession(id, mkPlayer(user))
      const off = observeSession(id, (s) => setSession(s as any))
      return () => off?.()
    } catch (e: any) {
      alert('Join failed: ' + (e?.message || String(e)))
    }
  }

  function leaveRoom() {
    setSession(null) // kohalik tagasi lobby'sse
  }

  async function handleSpectate(id: string) {
    const url = new URL(window.location.href)
    url.searchParams.set('screen', id)
    window.location.assign(url.toString())
  }

  async function handleDelete(id: string) {
    if (!user) return
    try {
      await deleteSession(id)
    } catch (e: any) {
      alert('Delete failed: ' + (e?.message || String(e)))
    }
  }

  async function handleEndSession() {
    if (!session) return
    if (!isOwner) return alert('Ainult ruumi looja saab sessiooni lõpetada.')
    try {
      setEnding(true)
      await endSessionAndSave(session)
      alert('Session ended and saved to leaderboard.')
    } catch (e: any) {
      alert('End session failed: ' + (e?.message || String(e)))
    } finally {
      setEnding(false)
    }
  }

  async function setJyly(n: 0 | 1 | 2 | 3 | 4 | 5) {
    if (!session || !user) return
    if ((jyly?.history?.length ?? 0) >= 20) return // max 20 setti

    try {
      const next = applyJylySet(jyly, n)
      setLocalJyly(next) // optimistlik UI
      await recordJylySet(session.id, user.uid, n) // püsiv salvestus
    } catch (e: any) {
      setLocalJyly(null)
      alert('Save failed: ' + (e?.message || String(e)))
    }
  }

  // --------- render ----------
  if (!user) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <div className="w-full max-w-sm p-6">
          <h1 className="text-2xl font-bold mb-6">PuttApp</h1>
        <SignIn />
        </div>
      </div>
    )
  }

  if (session) {
    const isHost = isOwner
    return (
      <div className="min-h-screen bg-black text-white">
        <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
          <div className="flex justify-between items-start">
            <div>
              <div className="text-2xl font-bold">{session.name || 'Session'}</div>
              <div className="text-neutral-400">
                {session.game} • Code: <span className="font-mono">{session.code}</span>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button className="px-4 py-2 rounded-2xl bg-neutral-800 hover:bg-neutral-700" onClick={leaveRoom}>
                Leave room
              </button>
              {isHost ? (
                <button
                  className={cx('px-4 py-2 rounded-2xl font-semibold', ending ? 'bg-neutral-700' : 'bg-red-600 hover:bg-red-500')}
                  onClick={handleEndSession}
                  disabled={ending}
                >
                  {ending ? 'Saving…' : 'End Session → Save'}
                </button>
              ) : (
                <button className="px-4 py-2 rounded-2xl bg-neutral-800 text-neutral-400 cursor-not-allowed" title="Only the host can end the session" disabled>
                  End Session
                </button>
              )}
            </div>
          </div>

          {/* JYLY */}
          {session.game === 'JYLY' && (
            <div className="rounded-2xl border border-neutral-800 p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="text-4xl font-bold">{distanceM} m</div>
                <div className="text-sm text-neutral-400 font-mono">{(jyly?.history?.length ?? 0)} / 20</div>
              </div>
              <div className="text-neutral-300 mb-3">Put from here • Enter your makes (0–5)</div>
              <div className="flex gap-3">
                {[0,1,2,3,4,5].map((k) => (
                  <button
                    key={k}
                    onClick={() => setJyly(k as 0|1|2|3|4|5)}
                    className="w-12 h-12 rounded-xl flex items-center justify-center font-semibold bg-neutral-800 hover:bg-neutral-700"
                  >
                    {k}
                  </button>
                ))}
              </div>

              <div className="mt-4 text-sm text-neutral-400">
                Points: <span className="text-white font-semibold">{(me?.totalPoints ?? 0) as number}</span>
              </div>

              {Array.isArray(jyly?.history) && jyly.history.length > 0 && (
                <div className="mt-3 text-sm text-neutral-400">
                  History: {jyly.history.map((v: number, i: number) => `${i + 1}) ${v}/5`).join(' • ')}
                </div>
              )}
            </div>
          )}

          {/* sessiooni leaderboard */}
          <div className="rounded-2xl border border-neutral-800">
            <div className="px-4 py-3 text-neutral-400">Leaderboard</div>
            {(session.players || [])
              .slice()
              .sort((a, b) => (b.totalPoints || 0) - (a.totalPoints || 0))
              .map((p) => (
                <div key={p.uid} className="flex items-center justify-between px-4 py-3 border-t border-neutral-900">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-neutral-800" />
                    <div>
                      <div className="font-medium">{p.name}</div>
                      <div className="text-xs text-neutral-500">{p.uid === user.uid ? 'You' : ''}</div>
                    </div>
                  </div>
                  <div className="text-lg font-semibold">{p.totalPoints || 0}</div>
                </div>
              ))}
          </div>
        </div>
      </div>
    )
  }

  // Lobby
  return (
    <div className="min-h-screen bg-black text-white">
      <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
        <div className="flex items-center gap-2">
          <button className={cx('px-4 py-2 rounded-2xl', tab === 'play' ? 'bg-sky-600' : 'bg-neutral-800')} onClick={() => setTab('play')}>
            Play
          </button>
        </div>

        {/* Create room */}
        <div className="rounded-2xl border border-neutral-800 p-4 space-y-3">
          <div className="text-neutral-300">Create a room</div>

          <div className="flex flex-wrap gap-3">
            {GAMES.map((g) => (
              <button key={g} onClick={() => setGame(g)} className={cx('px-4 py-2 rounded-2xl', game === g ? 'bg-sky-600' : 'bg-neutral-800')}>
                {g}
              </button>
            ))}
          </div>

          <input
            className="w-full mt-2 rounded-xl bg-neutral-900 border border-neutral-800 px-3 py-2"
            placeholder="Room name (optional)"
            value={roomName}
            onChange={(e) => setRoomName(e.target.value)}
          />

          <button onClick={handleCreateRoom} className="w-full mt-2 px-4 py-3 rounded-xl bg-sky-600 hover:bg-sky-500 font-semibold">
            Create {game} Room
          </button>

          <div className="mt-4 flex gap-3">
            <input
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              className="flex-1 rounded-xl bg-neutral-900 border border-neutral-800 px-3 py-2"
              placeholder="Join with code"
            />
            <button onClick={handleJoinByCode} className="px-4 rounded-xl bg-neutral-800 hover:bg-neutral-700">
              Join
            </button>
          </div>
        </div>

        {/* Available rooms */}
        <div className="rounded-2xl border border-neutral-800">
          <div className="px-4 py-3 text-neutral-400">Available rooms</div>
          {(openRooms || []).length === 0 && <div className="px-4 py-6 text-neutral-500">No rooms yet.</div>}
          {(openRooms || []).map((r) => (
            <div key={r.id} className="flex items-center justify-between px-4 py-3 border-t border-neutral-900">
              <div>
                <div className="font-medium">{(r as any).name || r.game} • {r.code}</div>
                <div className="text-xs text-neutral-500">Players: {r.players?.length || 0}</div>
              </div>
              <div className="flex items-center gap-2">
                <button className="px-3 py-1.5 rounded-xl bg-neutral-800 hover:bg-neutral-700" onClick={() => handleJoin(r.id)}>
                  Join
                </button>
                <button className="px-3 py-1.5 rounded-xl bg-neutral-800 hover:bg-neutral-700" onClick={() => handleSpectate(r.id)}>
                  Spectate
                </button>
                {r.ownerUid === user.uid && (
                  <button className="px-3 py-1.5 rounded-xl bg-red-600 hover:bg-red-500" onClick={() => handleDelete(r.id)}>
                    Delete
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
