// src/components/JylyEngine.ts

export type JylyState = {
  history: number[];              // iga seti tulemus 0..5
  next: { distanceM: number };    // kuhu edasi (meil alati 10m)
  points: number;                 // kogupunktid (history summa)
};

const MAX_SETS = 20;
const DIST = 10;

export function rebuildJylyFromMakes(makes: number[] = []): JylyState {
  // lõika 20 peale, kui kuskil on valesti salvestatud
  const history = makes.filter((x) => typeof x === 'number').slice(0, MAX_SETS);
  const points = history.reduce((a, b) => a + b, 0);
  return {
    history,
    next: { distanceM: DIST },
    points,
  };
}

export function applyJylySet(state: JylyState, n: number): JylyState {
  if (typeof n !== 'number') return state;
  if (n < 0) n = 0;
  if (n > 5) n = 5;
  if (state.history.length >= MAX_SETS) {
    // juba täis – ei lisa enam
    return state;
  }
  const history = [...state.history, n];
  const points = state.points + n;
  return {
    history,
    points,
    next: { distanceM: DIST },
  };
}
