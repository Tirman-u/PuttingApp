// src/components/session.ts
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type Unsubscribe,
} from 'firebase/firestore'
import { db } from '../firebase'

// ---- Types ----
export type Game = 'JYLY' | 'ATW' | 'LADDER' | 'T21' | 'RACE'

export type Player = {
  uid: string
  name: string
  photoURL?: string
  // server-side scoreboard
  totalPoints: number
  // game-specific local state we hoian minimaalsena
  jyly?: { makes: number[] } // iga set = 0..5, max 20 kirjet
}

export type Session = {
  id: string
  name?: string | null
  code: string
  game: Game
  ownerUid: string
  status: 'lobby' | 'live' | 'done'
  createdAt?: any
  players: Player[]
}

// ---- Helpers ----
const SESSIONS = collection(db, 'sessions')
const LEADERBOARD = collection(db, 'leaderboard')

function randomCode(n = 5) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  return Array.from({ length: n }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join('')
}

function ensurePlayer(p: Partial<Player>): Player {
  return {
    uid: String(p.uid),
    name: p.name || 'Player',
    photoURL: p.photoURL || undefined,
    totalPoints: p.totalPoints ?? 0,
    jyly: p.jyly ?? { makes: [] },
  }
}

// ---- API ----

// Loob sessiooni, EI liitu automaatselt
export async function createSession(ownerUid: string, game: Game, name?: string) {
  const code = randomCode(5)
  const ref = await addDoc(SESSIONS, {
    name: name || null,
    code,
    game,
    ownerUid,
    status: 'lobby',
    players: [],
    createdAt: serverTimestamp(),
  })
  return { id: ref.id, code }
}

export function observeSession(id: string, cb: (s: Session | null) => void): Unsubscribe {
  const ref = doc(SESSIONS, id)
  return onSnapshot(ref, (snap) => {
    if (!snap.exists()) return cb(null)
    const data = snap.data() as Omit<Session, 'id'>
    cb({ id: snap.id, ...data })
  })
}

// Lobby/Live list (avalik vaade)
export function observeOpenSessions(cb: (rows: Session[]) => void): Unsubscribe {
  // Kui "in" nõuab indeksit, loo see konsoolis; vajadusel kasuta kahte päringut
  const q = query(SESSIONS, where('status', 'in', ['lobby', 'live']), orderBy('createdAt', 'desc'), limit(50))
  return onSnapshot(q, (qs) => {
    cb(qs.docs.map((d) => ({ id: d.id, ...(d.data() as any) })))
  })
}

export async function joinSession(sessionId: string, player: Player): Promise<string> {
  const ref = doc(SESSIONS, sessionId)
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref)
    if (!snap.exists()) throw new Error('Session not found')
    const s = snap.data() as Session
    const players: Player[] = Array.isArray(s.players) ? s.players.slice() : []
    const idx = players.findIndex((p) => p.uid === player.uid)
    if (idx >= 0) {
      // refresh nimi/foto, ära nulli skoori ega ajalugu
      const orig = players[idx]
      players[idx] = { ...orig, name: player.name, photoURL: player.photoURL }
    } else {
      players.push(ensurePlayer(player))
    }
    tx.update(ref, { players, status: 'live' })
  })
  return sessionId
}

export async function joinByCode(code: string, player: Player): Promise<string> {
  const q = query(SESSIONS, where('code', '==', code), where('status', 'in', ['lobby', 'live']), limit(1))
  const qs = await getDocs(q)
  if (qs.empty) throw new Error('Session not found')
  const id = qs.docs[0].id
  await joinSession(id, player)
  return id
}

export async function deleteSession(id: string) {
  await deleteDoc(doc(SESSIONS, id))
}

// --- JYLY: salvestame ühe seti (0..5) ---
// NB: hoian serveris ainult makes[] + totalPoints
export async function recordJylySet(sessionId: string, uid: string, makesInThisSet: 0 | 1 | 2 | 3 | 4 | 5) {
  const ref = doc(SESSIONS, sessionId)
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref)
    if (!snap.exists()) throw new Error('Session not found')
    const s = snap.data() as Session
    const players: Player[] = Array.isArray(s.players) ? s.players.slice() : []
    const i = players.findIndex((p) => p.uid === uid)
    if (i < 0) throw new Error('Player not in session')

    const p = ensurePlayer(players[i])
    const makes = Array.isArray(p.jyly?.makes) ? p.jyly!.makes.slice() : []
    if (makes.length >= 20) return // ignore üle 20

    makes.push(makesInThisSet)
    const totalPoints = makes.reduce((a, b) => a + b, 0)

    players[i] = { ...p, totalPoints, jyly: { makes } }
    tx.update(ref, { players })
  })
}

// Lõpeta sessioon (host) ja salvesta leaderboard’i
export async function endSessionAndSave(s: Session): Promise<void> {
  const ref = doc(SESSIONS, s.id)
  const batch = writeBatch(db)

  // 1) Sessiooni staatus "done"
  batch.update(ref, { status: 'done' })

  // 2) Kirjed leaderboard’i (1 rida per mängija)
  for (const p of s.players || []) {
    const rowRef = doc(LEADERBOARD) // auto-id
    batch.set(rowRef, {
      sessionId: s.id,
      sessionName: s.name || null,
      game: s.game,
      code: s.code,
      uid: p.uid,
      name: p.name,
      photoURL: p.photoURL || null,
      score: p.totalPoints || 0,
      createdAt: serverTimestamp(),
    })
  }

  await batch.commit()
}

// Globaalne tabel (Top)
export async function fetchGlobalLeaderboard(limitN = 50) {
  const q = query(LEADERBOARD, orderBy('score', 'desc'), limit(limitN))
  const qs = await getDocs(q)
  return qs.docs.map((d) => ({ id: d.id, ...(d.data() as any) }))
}
