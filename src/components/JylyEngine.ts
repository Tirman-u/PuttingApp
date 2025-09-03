// components/JylyEngine.ts

// --- Types ---
export type JylySet = { distanceM: number; makes: number; points: number };
export type JylyState = { distanceM: number; history: JylySet[] };

export const JYLY_START_DISTANCE = 10;
export const JYLY_MAX_SETS = 20;

// Punktid ühe tabamuse eest: 10m=10, 9m=9, ... 5m=5
export function scorePerMake(distanceM: number): number {
  const d = Math.max(5, Math.min(10, Math.round(distanceM)));
  return d;
}

// Järgmine tee sõltuvalt tabamuste arvust
export function nextDistanceFromMakes(makes: number): number {
  switch (makes) {
    case 0: return 5;
    case 1: return 6;
    case 2: return 7;
    case 3: return 8;
    case 4: return 9;
    case 5: return 10;
    default: return 10;
  }
}

export function startJyly(): JylyState {
  return { distanceM: JYLY_START_DISTANCE, history: [] };
}

// Lisa üks frame (5 putti samalt distantsilt) – tagastab UUE seisu
export function applyJylySet(prev: JylyState | undefined, makes: number): JylyState {
  const state = prev ?? startJyly();
  if (state.history.length >= JYLY_MAX_SETS) return state;

  const distanceM = state.distanceM ?? JYLY_START_DISTANCE;
  const points = makes * scorePerMake(distanceM);

  const set: JylySet = { distanceM, makes, points };
  const history = [...state.history, set];

  const nextDistance = nextDistanceFromMakes(makes);

  return { distanceM: nextDistance, history };
}

// Summaarne skoor (kasulik leader-board’ile)
export function sumJylyPoints(s?: JylyState): number {
  if (!s) return 0;
  return s.history.reduce((sum, h) => sum + (h.points || 0), 0);
}

export function isJylyFinished(s?: JylyState): boolean {
  return !!s && s.history.length >= JYLY_MAX_SETS;
}
