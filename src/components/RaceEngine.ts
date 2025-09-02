export type RaceState = {
  total: number
  target: number
  history: { makes: number; points: number; total: number }[]
}
export function createRace(): RaceState {
  return { total: 0, target: 50, history: [] }
}
/** Esimesena 50-ni: 1p/maak. */
export function applyRaceSet(state: RaceState, makes: number): { next: RaceState; points: number } {
  const total = Math.min(state.target, state.total + makes)
  const next = { total, target: state.target, history: [...state.history, { makes, points: makes, total }] }
  return { next, points: makes }
}
