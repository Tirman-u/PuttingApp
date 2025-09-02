// src/components/session.ts
import { db } from '../firebase'
import {
  collection, doc, serverTimestamp, setDoc, getDoc, getDocs,
  onSnapshot, updateDoc, arrayUnion, query, where, orderBy, limit, addDoc
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
  // täidetud on ainult vastava mängu väli
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
  code: string               // 5-kohaline kood
  name?: string              // vabatahtlik nimi
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

/** Host loob ruumi (EI liitu). Tagastab {id, code}. */
export async function createSession(
  ownerUid: string, game: Game, name?: string,
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

/** Liitu ID järgi – pannakse õige algseisund. */
export async function joinSession(sessionId: string, player: Player) {
  const ref = doc(db, 'sessions', sessionId)
  const snap = await getDoc(ref)
  if (!snap.exists()) throw new Error('Session not found')
  const s = snap.data() as Session

  const exists = (s.players || []).some((p) => p.uid === player.uid)
  if (!exists) {
    const joined: Player = {
      uid: player.uid,
      name: player.name,
      photoURL: player.photoURL,
      totalPoints: 0,
      joinedAt: new Date(),
      ...(s.game === 'JYLY'   ? { jyly:   createJyly() } :
        s.game === 'ATW'     ? { atw:    createAtw() } :
        s.game === 'LADDER'  ? { ladder: createLadder() } :
        s.game === 'T21'     ? { t21:    createT21() } :
                               { race:   createRace() }),
    }
    await updateDoc(ref, { players: arrayUnion(joined), status: 'live' })
  }
}

/** Ava ruumid (lobby/live) – viimased 25. */
export function observeOpenSessions(cb: (rows: Session[]) => void) {
  const qy = query(collection(db, 'sessions'), orderBy('createdAt', 'desc'), limit(25))
  return onSnapshot(qy, (sn) => {
    const rows = sn.docs.map((d) => ({ id: d.id, ...(d.data() as any) } as Session))
      .filter((s) => s.status !== 'closed')
    cb(rows)
  })
}

/** Leia sessioon koodi järgi. */
export async function resolveSessionIdByCode(code: string): Promise<string | null> {
  const qy = query(collection(db, 'sessions'), where('code', '==', code.toUpperCase()), limit(1))
  const sn = await getDocs(qy)
  return sn.empty ? null : sn.docs[0].id
}

/** Liitu koodi järgi, tagasta sessiooni ID. */
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

/** JYLY set */
export async function recordJylySet(sessionId: string, uid: string, next: JylyState, points: number) {
  await bumpPlayer(sessionId, uid, { jyly: next }, points)
}
/** ATW set */
export async function recordAtwSet(sessionId: string, uid: string, next: AtwState, points: number) {
  await bumpPlayer(sessionId, uid, { atw: next }, points)
}
/** Ladder set */
export async function recordLadderSet(sessionId: string, uid: string, next: LadderState, points: number) {
  await bumpPlayer(sessionId, uid, { ladder: next }, points)
}
/** 21 set */
export async function recordT21Set(sessionId: string, uid: string, next: T21State, points: number) {
  await bumpPlayer(sessionId, uid, { t21: next }, points)
}
/** Race set */
export async function recordRaceSet(sessionId: string, uid: string, next: RaceState, points: number) {
  await bumpPlayer(sessionId, uid, { race: next }, points)
}

async function bumpPlayer(sessionId: string, uid: string, patch: Partial<Player>, points: number) {
  const ref = doc(db, 'sessions', sessionId)
  const snap = await getDoc(ref)
  if (!snap.exists()) throw new Error('Session not found')
  const data = snap.data() as Session
  const updated = (data.players || []).map((p) =>
    p.uid === uid ? { ...p, ...patch, totalPoints: (p.totalPoints || 0) + points } : p
  )
  await updateDoc(ref, { players: updated })
}

/** Sulge ruum ja salvesta globaalsesse LB-sse. */
export async function endSessionAndSave(session: Session) {
  const ref = doc(db, 'sessions', session.id)
  // 1) märgi kinni
  await updateDoc(ref, { status: 'closed' })
  // 2) kirjuta kokkuvõtted leaderboardi
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

/** Loe globaalse leaderboardi ridu (lihtne perioodifilter). */
export async function fetchGlobalLeaderboard(days?: number, game?: Game) {
  // lihtsuse mõttes: võtame viimased 200 kirjet ja summeerime kliendis
  const qy = query(collection(db, 'leaderboard'), orderBy('createdAt', 'desc'), limit(200))
  const sn = await getDocs(qy)
  const now = Date.now()
  const rows = sn.docs.map((d) => ({ id: d.id, ...(d.data() as any) }))
    .filter((r) => !days || (r.createdAt?.toMillis?.() ?? now) >= now - days * 864e5)
    .filter((r) => !game || r.game === game)

  // summeeri kasutaja lõikes
  const map = new Map<string, { uid: string; name: string; points: number }>()
  for (const r of rows) {
    const k = r.uid
    const cur = map.get(k) || { uid: r.uid, name: r.name, points: 0 }
    cur.points += r.points || 0
    map.set(k, cur)
  }
  return Array.from(map.values()).sort((a, b) => b.points - a.points).slice(0, 20)
}
