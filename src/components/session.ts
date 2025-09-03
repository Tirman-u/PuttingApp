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
} from 'firebase/firestore';
import { db } from '../firebase';
import {
  applyJylySet,
  isJylyFinished,
  sumJylyPoints,
  JYLY_MAX_SETS,
  type JylyState,
} from './JylyEngine';

// ---------- Tüübid ----------
export type Game = 'JYLY' | 'ATW' | 'LADDER' | 'T21' | 'RACE';

export type Player = {
  uid: string;
  name: string;
  photoURL?: string;
  jyly?: JylyState;
  totalPoints?: number;
  joinedAt?: any;
  status?: 'lobby' | 'live' | 'done';
};

export type Session = {
  id: string;
  code: string;
  ownerUid: string;
  game: Game;
  name?: string;
  createdAt?: any;
  status: 'lobby' | 'live' | 'closed';
  players: Player[];
};

// ---------- Abifunktsioonid ----------
function randomCode(len = 5): string {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXZ123456789';
  return Array.from({ length: len })
    .map(() => alphabet[Math.floor(Math.random() * alphabet.length)])
    .join('');
}

// ---------- Loome / liitume ----------
export async function createSession(
  ownerUid: string,
  name?: string,
  game: Game = 'JYLY'
): Promise<{ id: string; code: string }> {
  const code = randomCode(5);

  const ref = await addDoc(collection(db, 'sessions'), {
    code,
    ownerUid,
    game,
    name: name || null,
    createdAt: serverTimestamp(),
    status: 'lobby',
    players: [] as Player[],
  });

  return { id: ref.id, code };
}

export async function joinSession(sessionId: string, p: Player): Promise<void> {
  const ref = doc(db, 'sessions', sessionId);
  await runTransaction(db as any, async (tx: any) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('Session not found');
    const s = snap.data() as Session;

    const players = [...(s.players || [])];
    const i = players.findIndex((x) => x.uid === p.uid);
    if (i === -1) {
      players.push({
        uid: p.uid,
        name: p.name,
        photoURL: p.photoURL,
        status: 'live',
        joinedAt: serverTimestamp(),
      });
    }
    tx.update(ref, { status: 'live', players });
  });
}

export async function joinByCode(code: string, p: Player): Promise<string> {
  const qq = query(collection(db, 'sessions'), where('code', '==', code), limit(1));
  const res = await getDocs(qq);
  if (res.empty) throw new Error('Session not found');
  const docSnap = res.docs[0];
  await joinSession(docSnap.id, p);
  return docSnap.id;
}

// ---------- Observe ----------
export function observeSession(
  sessionId: string,
  cb: (s: Session) => void
): () => void {
  const ref = doc(db, 'sessions', sessionId);
  return onSnapshot(ref, (snap) => {
    if (!snap.exists()) return;
    const s = { id: snap.id, ...(snap.data() as any) } as Session;
    cb(s);
  });
}

export function observeOpenSessions(cb: (rooms: Session[]) => void): () => void {
  const qq = query(
    collection(db, 'sessions'),
    where('status', 'in', ['lobby', 'live']),
    orderBy('createdAt', 'desc'),
    limit(50)
  );
  return onSnapshot(qq, (qs) => {
    const rooms = qs.docs.map((d) => ({ id: d.id, ...(d.data() as any) } as Session));
    cb(rooms);
  });
}

// ---------- JYLY: ühe seti salvestus ----------
export async function recordJylySet(
  sessionId: string,
  uid: string,
  makes: number
): Promise<void> {
  if (makes < 0 || makes > 5) throw new Error('Makes must be 0..5');

  const ref = doc(db, 'sessions', sessionId);

  await runTransaction(db as any, async (tx: any) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('Session not found');

    const s = snap.data() as Session;
    const players = [...(s.players || [])];
    const i = players.findIndex((p) => p.uid === uid);
    if (i === -1) throw new Error('Player not in session');

    const prev = players[i].jyly;
    if (prev && prev.history.length >= JYLY_MAX_SETS) {
      // juba valmis
      return;
    }

    const next = applyJylySet(prev, makes);
    const total = sumJylyPoints(next);

    players[i] = {
      ...players[i],
      jyly: next,
      totalPoints: total,
      status: isJylyFinished(next) ? 'done' : (players[i].status ?? 'live'),
    };

    tx.update(ref, { players });
  });
}

// ---------- Sessiooni lõpetamine (ainult host) ----------
export async function endSessionAndSave(sessionId: string): Promise<void> {
  const ref = doc(db, 'sessions', sessionId);
  await updateDoc(ref, { status: 'closed' });

  // (soovi korral võiks siia lisada ka globaalse edetabeli salvestuse)
}

// Lihtne globaalne edetabel (kui soovid kuvada top’i)
export async function fetchGlobalLeaderboard(limitN = 50): Promise<
  { name: string; points: number }[]
> {
  // Hetkel ei kogu globaalselt; tagastame tühja listi, et UI ei katkeks.
  return [];
}

export async function deleteSession(sessionId: string): Promise<void> {
  await deleteDoc(doc(db, 'sessions', sessionId));
}
