import { useEffect, useMemo, useRef, useState } from 'react'
import { onAuthStateChanged } from 'firebase/auth'
import { auth, completeRedirect } from './firebase'
import SignIn from './components/SignIn'
import './styles/tailwind.css'
import {
  createSession, joinSession, joinByCode, observeSession, observeOpenSessions
  , recordAtwSet, recordLadderSet, recordT21Set, recordRaceSet,
  endSessionAndSave, fetchGlobalLeaderboard, deleteSession, saveJylyState,
  type Session, type Player, type Game,
} from './components/session'
import { applyJylySet, rebuildJylyFromMakes } from './components/JylyEngine'
import { applyAtwSet, createAtw } from './components/AtwEngine'
import { applyLadderSet, createLadder } from './components/LadderEngine'
import { applyT21Set, createT21 } from './components/TwentyOneEngine'
import { applyRaceSet, createRace } from './components/RaceEngine'
import { create } from 'zustand'

type AuthState = { user: any | null }
const useAuth = create<AuthState>(() => ({ user: null }))

const GAMES: Game[] = ['JYLY', 'ATW', 'LADDER', 'T21', 'RACE']

export default function App() {
  const { user } = useAuth()
  const [session, setSession] = useState<Session | null>(null)
  const [game, setGame] = useState<Game>('JYLY')
  const [roomName, setRoomName] = useState('')
  const [joinCode, setJoinCode] = useState('')
  const [openRooms, setOpenRooms] = useState<Session[]>([])
  const [tab, setTab] = useState<'play' | 'leaderboard'>('play')
  const [lbPeriod, setLbPeriod] = useState<'day' | 'week' | 'month' | 'all'>('week')
  const [lbGame, setLbGame] = useState<Game | undefined>(undefined)
  const [lbRows, setLbRows] = useState<{ uid: string; name: string; points: number }[]>([])
  const unsubRef = useRef<null | (() => void)>(null)
  const unsubListRef = useRef<null | (() => void)>(null)

  // spectator mode via query (?spectator=1&session=ID)
  const qs = new URLSearchParams(location.search)
  const spectator = qs.get('spectator') === '1'
  const spectatorSession = qs.get('session') || ''

  useEffect(() => {
    if (spectator && spectatorSession) {
      // loe sessioon otse (read rules already allow)
      unsubRef.current = observeSession(spectatorSession, setSession)
    }
  }, [])

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => useAuth.setState({ user: u }))
    return () => unsub()
  }, [])

  useEffect(() => {
    completeRedirect().catch((err) => err && console.error('Redirect login failed:', err))
  }, [])

  // list rooms on lobby
  useEffect(() => {
    if (session || spectator) {
      if (unsubListRef.current) { unsubListRef.current(); unsubListRef.current = null }
      return
    }
    unsubListRef.current = observeOpenSessions(setOpenRooms)
    return () => { if (unsubListRef.current) unsubListRef.current() }
  }, [session, spectator])

  async function refreshLeaderboard() {
    const days =
      lbPeriod === 'day' ? 1 :
      lbPeriod === 'week' ? 7 :
      lbPeriod === 'month' ? 30 : undefined
    const rows = await fetchGlobalLeaderboard(days, lbGame)
    setLbRows(rows)
  }
  useEffect(() => { if (tab === 'leaderboard') refreshLeaderboard() }, [tab, lbPeriod, lbGame])

  function leaveRoom() {
    if (unsubRef.current) unsubRef.current()
    unsubRef.current = null
    setSession(null)
  }
  useEffect(() => {
    if (session?.status === 'closed') {
      alert('Session ended and saved to leaderboard.')
      leaveRoom()
    }
  }, [session?.status])
  

  // spectator view
  if (spectator) {
    return session ? <Spectator session={session} /> : <div className="p-6 text-neutral-400">Loading…</div>
  }

  if (!user)
    return (
      <div className="min-h-screen grid place-items-center">
        <SignIn />
      </div>
    )

  return (
    <div className="max-w-md mx-auto p-4 space-y-4">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">PuttApp</h1>
        <div className="text-sm opacity-75">Hi, {user.displayName?.split(' ')[0] || 'player'} 👋</div>
      </header>

      {/* tabs */}
      <div className="flex gap-2">
        <button className={`px-3 py-1 rounded-xl ${tab==='play'?'bg-sky-600':'bg-neutral-800'}`} onClick={()=>setTab('play')}>Play</button>
        <button className={`px-3 py-1 rounded-xl ${tab==='leaderboard'?'bg-sky-600':'bg-neutral-800'}`} onClick={()=>setTab('leaderboard')}>Global Leaderboard</button>
      </div>

      {tab === 'leaderboard' && (
        <div className="space-y-3 rounded-2xl border border-neutral-800 p-4">
          <div className="flex gap-2">
            {(['day','week','month','all'] as const).map(p=>(
              <button key={p} className={`px-3 py-1 rounded-xl ${lbPeriod===p?'bg-sky-600':'bg-neutral-800'}`} onClick={()=>setLbPeriod(p)}>{p}</button>
            ))}
          </div>
          <div className="flex gap-2">
            <select className="flex-1 bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-2"
              value={lbGame||''} onChange={e=>setLbGame((e.target.value||undefined) as any)}>
              <option value="">All games</option>
              {GAMES.map(g=> <option key={g} value={g}>{g}</option>)}
            </select>
            <button className="px-3 rounded-xl bg-neutral-800" onClick={refreshLeaderboard}>Refresh</button>
          </div>
          <ul className="space-y-2">
            {lbRows.map((r,i)=>(
              <li key={r.uid} className="flex justify-between">
                <div>{i+1}. {r.name}</div>
                <div className="font-semibold">{r.points}</div>
              </li>
            ))}
            {lbRows.length===0 && <div className="text-neutral-500 text-sm">No data yet.</div>}
          </ul>
        </div>
      )}

      {tab === 'play' && !session && (
        <div className="space-y-6">
          {/* Create section */}
          <div className="rounded-2xl border border-neutral-800 p-4 space-y-3">
            <div className="text-sm text-neutral-400">Create a room</div>
            <div className="grid grid-cols-3 gap-2">
              {GAMES.map((g) => (
                <button key={g}
                  className={`py-2 rounded-2xl border ${game===g?'bg-sky-600 border-sky-600':'bg-neutral-900 border-neutral-800'}`}
                  onClick={()=>setGame(g)}>{g}</button>
              ))}
            </div>
            <input className="w-full px-3 py-2 rounded-xl bg-neutral-900 border border-neutral-800"
              placeholder="Room name (optional)" value={roomName} onChange={e=>setRoomName(e.target.value)} />
            <button className="w-full rounded-2xl bg-sky-500 py-3 font-medium"
              onClick={async()=>{
                try{
                  const { id, code } = await createSession(user.uid, game, roomName)
                  alert(`Room created. Share this code: ${code}`)
                }catch(e:any){ alert('Create room failed: '+(e?.message||e)) }
              }}>
              Create {game} Room
            </button>
          </div>

          {/* Join by code */}
          <div className="rounded-2xl border border-neutral-800 p-4 space-y-3">
            <div className="text-sm text-neutral-400">Join by code</div>
            <div className="flex gap-2">
              <input className="flex-1 px-3 py-2 rounded-xl bg-neutral-900 border border-neutral-800 uppercase tracking-widest font-mono"
                placeholder="ABCDE" maxLength={5} value={joinCode} onChange={e=>setJoinCode(e.target.value.toUpperCase())}/>
              <button className="px-3 rounded-xl bg-neutral-800"
                onClick={async()=>{
                  if(joinCode.length<5) return
                  try{
                    const base: Player = { uid:user.uid, name:user.displayName||'Player', photoURL:user.photoURL||undefined, totalPoints:0 } as any
                    const id = await joinByCode(joinCode, base)
                    unsubRef.current = observeSession(id, setSession)
                  }catch(e:any){ alert('Join failed: '+(e?.message||e)) }
                }}>Join</button>
            </div>
          </div>

          {/* Available rooms */}
          <div className="rounded-2xl border border-neutral-800 p-4">
            <div className="text-sm text-neutral-400 mb-2">Available rooms</div>
            {openRooms.length===0 ? <div className="text-sm text-neutral-500">No rooms yet.</div> :
              <ul className="space-y-2">
                {openRooms.map(r=>(
                  <li key={r.id} className="flex items-center justify-between">
                    <div>
                      <div className="font-medium">{r.name || r.code} • {r.game}</div>
                      <div className="text-xs text-neutral-500">Code: <span className="font-mono">{r.code}</span> • Players: {r.players?.length||0}</div>
                    </div>
                    <div className="flex gap-2">
                      <button className="px-3 py-1 rounded-xl bg-neutral-800" onClick={async()=>{
                        try{
                          const base: Player = { uid:user.uid, name:user.displayName||'Player', photoURL:user.photoURL||undefined, totalPoints:0 } as any
                          const id = await joinByCode(r.code, base)
                          unsubRef.current = observeSession(id, setSession)
                        }catch(e:any){ alert('Join failed: '+(e?.message||e)) }
                      }}>Join</button>
                      <a className="px-3 py-1 rounded-xl bg-neutral-900 border border-neutral-800"
                         href={`/?spectator=1&session=${r.id}`} target="_blank">Spectate</a>
                         {r.ownerUid === user.uid && (
  <button
    className="px-3 py-1 rounded-xl bg-red-600"
    onClick={async () => {
      if (!confirm(`Delete room "${r.name || r.code}"?`)) return
      try {
        await deleteSession(r.id)
      } catch (e: any) {
        alert('Delete failed: ' + (e?.message || e))
      }
    }}
  >
    Delete
  </button>
)}

                    </div>
                  </li>
                ))}
              </ul>}
          </div>
        </div>
      )}

      {tab === 'play' && session && (
        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <div className="text-sm text-neutral-400">Session</div>
            <div className="flex gap-2">
              <a className="px-3 py-1 rounded-xl bg-neutral-900 border border-neutral-800"
                 href={`/?spectator=1&session=${session.id}`} target="_blank">Spectator link</a>
              <button onClick={leaveRoom} className="text-sm px-3 py-1 rounded-xl bg-neutral-800">Leave room</button>
            </div>
          </div>

          {session.game==='JYLY'   && <JylyRoom   session={session} meUid={user.uid} /> }
          {session.game==='ATW'    && <AtwRoom    session={session} meUid={user.uid} /> }
          {session.game==='LADDER' && <LadderRoom session={session} meUid={user.uid} /> }
          {session.game==='T21'    && <T21Room    session={session} meUid={user.uid} /> }
          {session.game==='RACE'   && <RaceRoom   session={session} meUid={user.uid} /> }

          <button className="w-full rounded-2xl bg-red-600 py-3"
            onClick={async()=>{ try{ await endSessionAndSave(session); alert('Session saved to leaderboard. Room closed.'); leaveRoom() }catch(e:any){ alert('End session failed: '+(e?.message||e)) }}}>
            End Session → Save to Global Leaderboard
          </button>
        </div>
      )}
    </div>
  )
}

function Spectator({ session }: { session: Session }) {
  return (
    <div className="max-w-2xl mx-auto p-6">
      <div className="text-2xl font-bold mb-2">{session.game} • {session.name || session.code}</div>
      <div className="text-neutral-400 mb-4">Code: <span className="font-mono">{session.code}</span></div>
      <Leaderboard session={session} big />
    </div>
  )
}

function JylyRoom({ session, meUid }: { session: Session; meUid: string }) {
  const me = useMemo(() => session.players.find((p) => p.uid === meUid), [session, meUid])
  if (!me || !me.jyly) return <div>Joining…</div>

  const myState = me.jyly
  const [idx, setIdx] = useState(() =>
    Math.min(myState.history.length, myState.targetSets - 1)
  )
  // kui seis muutub (teine seade vms), hüppa uue "järgmise" peale
  useEffect(() => {
    const nextIndex = Math.min(
      myState.history.length, // "next" positsioon (või viimane, kui täis)
      myState.targetSets - 1
    )
    setIdx(nextIndex)
  }, [myState.history.length, myState.targetSets])

  const canAppend = myState.history.length < myState.targetSets
  const maxSelectable = canAppend ? myState.history.length : myState.targetSets - 1
  const viewingExisting = idx < myState.history.length

  const viewingDistance =
    viewingExisting ? myState.history[idx].distanceM : myState.distanceM

  const roundLabel = `${idx + 1} / ${myState.targetSets}`

  async function submitMakes(n: number) {
    if (viewingExisting) {
      // Muudame olemasolevat seeriat
      const makesArr = myState.history.map((h) => h.makes)
      makesArr[idx] = n
      const next = rebuildJylyFromMakes(makesArr)
      await saveJylyState(session.id, meUid, next)
    } else {
      // Lisame uue seeria (kui pole veel 20 täis)
      if (!canAppend) return
      const next = applyJylySet(myState, n)
      await saveJylyState(session.id, meUid, next)
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-neutral-800 p-4">
        <div className="text-lg font-semibold tracking-wide">JYLY • {session.name || session.code}</div>
        <div className="mt-1 text-sm text-neutral-400">
          Code: <span className="font-mono">{session.code}</span> • Players: {session.players.length}
        </div>
      </div>

      <div className="rounded-2xl border border-neutral-800 p-4">
        <div className="flex items-center justify-between">
          <div className="text-sm text-neutral-400">Round</div>
          <div className="flex items-center gap-2">
            <button
              className="px-3 py-1 rounded-xl bg-neutral-800 disabled:opacity-40"
              onClick={() => setIdx((i) => Math.max(0, i - 1))}
              disabled={idx <= 0}
            >
              ←
            </button>
            <div className="text-sm font-medium">{roundLabel}</div>
            <button
              className="px-3 py-1 rounded-xl bg-neutral-800 disabled:opacity-40"
              onClick={() => setIdx((i) => Math.min(maxSelectable, i + 1))}
              disabled={idx >= maxSelectable}
            >
              →
            </button>
          </div>
        </div>

        <div className="mt-2 text-5xl font-bold">{viewingDistance} m</div>
        <div className="text-neutral-400">
          {viewingExisting
            ? 'Editing this round • choose 0–5'
            : canAppend
              ? 'Put from here • Enter makes (0–5)'
              : 'Completed • you can still edit previous rounds'}
        </div>

        <div className="mt-3 grid grid-cols-6 gap-2">
          {[0, 1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              className="rounded-xl py-2 bg-neutral-800 hover:bg-neutral-700 disabled:opacity-40"
              onClick={() => submitMakes(n)}
              disabled={!canAppend && !viewingExisting} // kui täis ja vaatame "nexti", siis disable
            >
              {n}
            </button>
          ))}
        </div>

        <div className="mt-3 text-sm">
          Points: <span className="font-semibold">{me.totalPoints}</span>
        </div>
        <div className="mt-1 text-xs text-neutral-400">
          History:{' '}
          {myState.history.length
            ? myState.history
                .map((h, i) => `${i + 1}) ${h.makes}/5 @${h.distanceM}m (+${h.points})`)
                .join(' · ')
            : '—'}
        </div>
      </div>

      <Leaderboard session={session} />
    </div>
  )
}



function AtwRoom({ session, meUid }: { session: Session; meUid: string }) {
  const me = useMemo(()=>session.players.find(p=>p.uid===meUid),[session,meUid])
  if(!me?.atw) return <div>Joining…</div>
  const s = me.atw
  const dist = s.stations[s.station]
  const click = async(n:number)=> {
    const res = applyAtwSet(s, n)
    await recordAtwSet(session.id, meUid, res.next, res.points)
  }
  return (
    <Card title={`ATW • ${session.name || session.code}`} subtitle={`Station ${dist} m • Code ${session.code}`}>
      <BigLine main={`${dist} m`} sub="Enter makes (0–5). 1p per make." />
      <Pick onPick={click} />
      <Points me={me} note={s.history.map(h=>`${h.makes}/5 @${h.stationDistance}m (+${h.points})`).join(' · ')} />
      <Leaderboard session={session} />
    </Card>
  )
}

function LadderRoom({ session, meUid }: { session: Session; meUid: string }) {
  const me = useMemo(()=>session.players.find(p=>p.uid===meUid),[session,meUid])
  if(!me?.ladder) return <div>Joining…</div>
  const s = me.ladder
  const click = async(n:number)=> {
    const res = applyLadderSet(s, n)
    await recordLadderSet(session.id, meUid, res.next, res.points)
  }
  return (
    <Card title={`Ladder • ${session.name || session.code}`} subtitle={`Distance ${s.distanceM} m • 1p per make; 3+ → +1m; ≤1 → −1m`}>
      <BigLine main={`${s.distanceM} m`} sub="Enter makes (0–5)" />
      <Pick onPick={click} />
      <Points me={me} note={s.history.map(h=>`${h.makes}/5 @${h.distanceM}m (+${h.points})`).join(' · ')} />
      <Leaderboard session={session} />
    </Card>
  )
}

function T21Room({ session, meUid }: { session: Session; meUid: string }) {
  const me = useMemo(()=>session.players.find(p=>p.uid===meUid),[session,meUid])
  if(!me?.t21) return <div>Joining…</div>
  const s = me.t21
  const click = async(n:number)=> {
    const res = applyT21Set(s, n)
    await recordT21Set(session.id, meUid, res.next, res.points)
  }
  return (
    <Card title={`21 • ${session.name || session.code}`} subtitle="+makes; if >21 then drop to 15">
      <BigLine main={`${s.total} / 21`} sub="Enter makes (0–5)" />
      <Pick onPick={click} />
      <Points me={me} note={s.history.map(h=>`${h.makes}/5 → total ${h.total}`).join(' · ')} />
      <Leaderboard session={session} />
    </Card>
  )
}

function RaceRoom({ session, meUid }: { session: Session; meUid: string }) {
  const me = useMemo(()=>session.players.find(p=>p.uid===meUid),[session,meUid])
  if(!me?.race) return <div>Joining…</div>
  const s = me.race
  const click = async(n:number)=> {
    const res = applyRaceSet(s, n)
    await recordRaceSet(session.id, meUid, res.next, res.points)
  }
  return (
    <Card title={`Race • ${session.name || session.code}`} subtitle="First to 50 • 1p per make">
      <BigLine main={`${s.total} / ${s.target}`} sub="Enter makes (0–5)" />
      <Pick onPick={click} />
      <Points me={me} note={s.history.map(h=>`${h.makes}/5 → total ${h.total}`).join(' · ')} />
      <Leaderboard session={session} />
    </Card>
  )
}

/*** tiny UI helpers ***/
function Card({ title, subtitle, children }: any) {
  return <div className="space-y-3 rounded-2xl border border-neutral-800 p-4">
    <div className="text-lg font-semibold tracking-wide">{title}</div>
    <div className="text-sm text-neutral-400">{subtitle}</div>
    {children}
  </div>
}
function BigLine({ main, sub }: { main:string; sub:string }) {
  return <div><div className="text-5xl font-bold">{main}</div><div className="text-neutral-400">{sub}</div></div>
}
function Pick({ onPick }: { onPick: (n:number)=>void }) {
  return <div className="mt-3 grid grid-cols-6 gap-2">
    {[0,1,2,3,4,5].map(n=><button key={n} className="rounded-xl py-2 bg-neutral-800 hover:bg-neutral-700" onClick={()=>onPick(n)}>{n}</button>)}
  </div>
}
function Points({ me, note }: any) {
  return <>
    <div className="mt-3 text-sm">Points: <span className="font-semibold">{me.totalPoints}</span></div>
    <div className="mt-1 text-xs text-neutral-400">History: {note || '—'}</div>
  </>
}
function Leaderboard({ session, big=false }: { session: Session, big?: boolean }) {
  return (
    <div className={`rounded-2xl ${big?'':'border border-neutral-800 p-4'}`}>
      {!big && <div className="text-sm text-neutral-400 mb-2">Leaderboard</div>}
      <ul className="space-y-2">
        {session.players.slice().sort((a,b)=>(b.totalPoints||0)-(a.totalPoints||0)).map(p=>(
          <li key={p.uid} className="flex items-center justify-between text-lg">
            <div className="flex items-center gap-3">
              {p.photoURL ? <img src={p.photoURL} className="w-8 h-8 rounded-full"/> : <div className="w-8 h-8 rounded-full bg-neutral-800" />}
              <div className="font-medium">{p.name}</div>
            </div>
            <div className="font-semibold">{p.totalPoints || 0}</div>
          </li>
        ))}
      </ul>
    </div>
  )
}
