// src/components/session.ts
import { db } from '../firebase'
import {
  collection, doc, serverTimestamp, setDoc, getDoc, getDocs,
  onSnapshot, updateDoc, arrayUnion, query, where, orderBy, limit,
  addDoc, deleteDoc
} from 'firebase/firestore'
import type { JylyState } from './JylyEngine'
import type { AtwState } from './AtwEngine'
import type { LadderState } from './LadderEngine'
import type { T21State } from './TwentyOneEngine'
import type { RaceState } from './RaceEngine'
import { createJyly } from './JylyEngine'
import { createAtw } from './AtwEngine'
import { createLadder } from './LadderEngine'
import { createT21 } from './TwentyOneEngine'
import { createRace } from './RaceEngine'

export type Game = 'JYLY' | 'ATW' | 'LADDER' | 'T21' | 'RACE'

export type Player = {
  uid: string
  name: string
  photoURL?: string
  jyly?: JylyState
  atw?: AtwState
  ladder?: LadderState
  t21?: T21State
  race?: RaceState
  totalPoints: number
  joinedAt?: any
}

export type Session = {
  id: string
  code: string
  name?: string
  ownerUid: string
  game: Game
  createdAt?: any
  players: Player[]
  status: 'lobby' | 'live' | 'closed'
}

function randomCode(len = 5) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  return Array.from({ length: len })
    .map(() => alphabet[Math.floor(Math.random() * alphabet.length)])
    .join('')
}

/** Host loob ruumi (ei liitu automaatselt). */
export async function createSession(
  ownerUid: string, game: Game, name?: string
): Promise<{ id: string; code: string }> {
  const code = randomCode()
  const ref = doc(collection(db, 'sessions'))
  const session: Session = {
    id: ref.id,
    code,
    name: name?.trim() || new Date().toLocaleString(),
    ownerUid,
    game,
    createdAt: serverTimestamp(),
    players: [],
    status: 'lobby',
  }
  await setDoc(ref, session)
  return { id: ref.id, code }
}

/** Ruumi kustutamine (näitame UI-s ainult loojale). */
export async function deleteSession(sessionId: string) {
  await deleteDoc(doc(db, 'sessions', sessionId))
}

/** Liitu ID järgi – saab õige algseisundi. */
export async function joinSession(sessionId: string, player: Player) {
  const ref = doc(db, 'sessions', sessionId)
  const snap = await getDoc(ref)
  if (!snap.exists()) throw new Error('Session not found')
  const s = snap.data() as Session

  const exists = (s.players || []).some((p) => p.uid === player.uid)
  if (!exists) {
    const base: any = {
      uid: player.uid,
      name: player.name || 'Player',
      totalPoints: 0,
      joinedAt: new Date(),
    }
    if (player.photoURL) base.photoURL = player.photoURL

    const joined: Player =
      s.game === 'JYLY'   ? { ...base, jyly: createJyly() } :
      s.game === 'ATW'    ? { ...base, atw: createAtw() } :
      s.game === 'LADDER' ? { ...base, ladder: createLadder() } :
      s.game === 'T21'    ? { ...base, t21: createT21() } :
                            { ...base, race: createRace() }

    await updateDoc(ref, { players: arrayUnion(joined), status: 'live' })
  }
}
export async function saveJylyState(sessionId: string, uid: string, newState: JylyState) {
  const ref = doc(db, 'sessions', sessionId)
  const snap = await getDoc(ref)
  if (!snap.exists()) throw new Error('Session not found')
  const s = snap.data() as Session

  // arvuta punktid otse seisust (vältimaks sumJylyPoints importi)
  const total =
    (newState.history ?? []).reduce((acc, h: any) => acc + (h.points ?? 0), 0)

  const updated = (s.players || []).map((p) =>
    p.uid === uid ? { ...p, jyly: newState, totalPoints: total } : p
  )
  await updateDoc(ref, { players: updated })
}


/** Ava/live ruumid listi jaoks. */
export function observeOpenSessions(cb: (rows: Session[]) => void) {
  const qy = query(collection(db, 'sessions'), orderBy('createdAt', 'desc'), limit(25))
  return onSnapshot(qy, (sn) => {
    const rows = sn.docs.map((d) => ({ id: d.id, ...(d.data() as any) } as Session))
      .filter((s) => s.status !== 'closed')
    cb(rows)
  })
}

/** Leia sess koodi järgi. */
export async function resolveSessionIdByCode(code: string): Promise<string | null> {
  const qy = query(collection(db, 'sessions'), where('code', '==', code.toUpperCase()), limit(1))
  const sn = await getDocs(qy)
  return sn.empty ? null : sn.docs[0].id
}

/** Liitu koodiga. */
export async function joinByCode(code: string, player: Player): Promise<string> {
  const id = await resolveSessionIdByCode(code)
  if (!id) throw new Error('Session not found')
  await joinSession(id, player)
  return id
}

export function observeSession(sessionId: string, cb: (s: Session) => void) {
  const ref = doc(db, 'sessions', sessionId)
  return onSnapshot(ref, (snap) => { if (snap.exists()) cb({ id: snap.id, ...(snap.data() as any) }) })
}

/** ——— Skooride salvestamine ——— */

export async function recordJylySet(sessionId: string, uid: string, next: JylyState, points: number) {
  const ref = doc(db, 'sessions', sessionId)
  const snap = await getDoc(ref)
  if (!snap.exists()) throw new Error('Session not found')
  const s = snap.data() as Session

  const updated = (s.players || []).map((p) =>
    p.uid === uid ? { ...p, jyly: next, totalPoints: (p.totalPoints || 0) + points } : p
  )
  await updateDoc(ref, { players: updated })

  // AUTOFINISH: JYLY lõppeb, kui KÕIGIL on 20 setti tehtud
  const everyoneDone = updated.length > 0 && updated.every(p => p.jyly && p.jyly.history.length >= 20)
  if (everyoneDone) {
    await endSessionAndSave({ ...s, players: updated })
  }
}

export async function recordAtwSet(sessionId: string, uid: string, next: AtwState, points: number) {
  await bump(sessionId, uid, { atw: next }, points)
}
export async function recordLadderSet(sessionId: string, uid: string, next: LadderState, points: number) {
  await bump(sessionId, uid, { ladder: next }, points)
}
export async function recordT21Set(sessionId: string, uid: string, next: T21State, points: number) {
  await bump(sessionId, uid, { t21: next }, points)
}
export async function recordRaceSet(sessionId: string, uid: string, next: RaceState, points: number) {
  await bump(sessionId, uid, { race: next }, points)
}

async function bump(sessionId: string, uid: string, patch: Partial<Player>, points: number) {
  const ref = doc(db, 'sessions', sessionId)
  const snap = await getDoc(ref)
  if (!snap.exists()) throw new Error('Session not found')
  const s = snap.data() as Session
  const updated = (s.players || []).map(p =>
    p.uid === uid ? { ...p, ...patch, totalPoints: (p.totalPoints || 0) + points } : p
  )
  await updateDoc(ref, { players: updated })
}

/** Lõpeta sessioon ja kirjuta globaalsesse leaderboardi kokkuvõtted. */
export async function endSessionAndSave(session: Session) {
  const ref = doc(db, 'sessions', session.id)
  await updateDoc(ref, { status: 'closed' })
  await Promise.all(
    (session.players || []).map((p) =>
      addDoc(collection(db, 'leaderboard'), {
        sessionId: session.id,
        sessionName: session.name || session.code,
        game: session.game,
        createdAt: serverTimestamp(),
        uid: p.uid,
        name: p.name,
        points: p.totalPoints || 0,
      })
    )
  )
}

/** Globaalne leaderboard (lihtne perioodifilter). */
export async function fetchGlobalLeaderboard(days?: number, game?: Game) {
  const qy = query(collection(db, 'leaderboard'), orderBy('createdAt', 'desc'), limit(200))
  const sn = await getDocs(qy)
  const now = Date.now()
  const rows = sn.docs.map((d) => ({ id: d.id, ...(d.data() as any) }))
    .filter((r) => !days || (r.createdAt?.toMillis?.() ?? now) >= now - days * 864e5)
    .filter((r) => !game || r.game === game)
  const map = new Map<string, { uid: string; name: string; points: number }>()
  for (const r of rows) {
    const k = r.uid
    const cur = map.get(k) || { uid: r.uid, name: r.name, points: 0 }
    cur.points += r.points || 0
    map.set(k, cur)
  }
  return Array.from(map.values()).sort((a, b) => b.points - a.points).slice(0, 20)
}
