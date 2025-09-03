// src/components/session.ts
import {
  addDoc,
  collection,
  deleteDoc,
  doc as fsDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  arrayUnion,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  Firestore,
} from 'firebase/firestore';
import { db } from '../firebase';
import {
  applyJylySet,
  isJylyFinished,
  sumJylyPoints,
  JYLY_MAX_SETS,
  type JylyState,
} from './JylyEngine';

export function observeSession(
  sessionId: string,
  cb: (s: Session | null) => void
): () => void {
  const ref = fsDoc(db, 'sessions', sessionId);
  return onSnapshot(
    ref,
    (snap) => {
      if (!snap.exists()) {
        cb(null);
      } else {
        cb({ id: snap.id, ...(snap.data() as any) } as Session);
      }
    },
    (err) => {
      console.error('observeSession', err);
      cb(null);
    }
  );
}

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
export async function createSession(ownerUid: string, game: Game, name?: string): Promise<string> {
  const ref = await addDoc(collection(db, 'sessions'), {
    ownerUid,
    game,
    name: name ?? null,
    code: randomCode(5),
    status: 'lobby',
    createdAt: serverTimestamp(), // <- lets us order without composite index
    players: [],
  });
  return ref.id;
}

export async function joinSession(sessionId: string, p: Player): Promise<void> {
  const ref = fsDoc(db, 'sessions', sessionId);
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

export async function joinByCode(code: string, player: Player): Promise<string> {
  const qy = query(collection(db, 'sessions'), where('code', '==', code.toUpperCase()));
  const snap = await getDocs(qy);
  if (snap.empty) throw new Error('Session not found');

  const docSnap = snap.docs[0];
  const id = docSnap.id;

  await updateDoc(fsDoc(db, 'sessions', id), {
    status: 'live',
    players: arrayUnion(player),
  });

  return id;
}

// ---------- Observe ----------
export function observeOpenSessions(cb: (rooms: Session[]) => void): () => void {
  const qy = query(collection(db, 'sessions'), orderBy('createdAt', 'desc'), limit(50));
  return onSnapshot(
    qy,
    (qs) => {
      const all = qs.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as Session[];
      const rooms = all.filter((r) => r.status === 'lobby' || r.status === 'live');
      cb(rooms);
    },
    (err) => {
      console.error('observeOpenSessions', err);
      cb([]);
    },
  );
}

// ---------- JYLY: ühe seti salvestus ----------
export async function recordJylySet(
  sessionId: string,
  uid: string,
  makes: number
): Promise<void> {
  if (makes < 0 || makes > 5) throw new Error('Makes must be 0..5');

  const ref = fsDoc(db, 'sessions', sessionId);

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
  const ref = fsDoc(db, 'sessions', sessionId);
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
  await deleteDoc(fsDoc(db, 'sessions', sessionId));
}

