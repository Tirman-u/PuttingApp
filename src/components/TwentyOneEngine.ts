export type T21State = {
  total: number
  history: { makes: number; points: number; total: number }[]
}
export function createT21(): T21State {
  return { total: 0, history: [] }
}
/** 21 mäng: +makes, kui üle 21 → kukub 15 peale. */
export function applyT21Set(state: T21State, makes: number): { next: T21State; points: number } {
  let total = state.total + makes
  if (total > 21) total = 15
  const next = { total, history: [...state.history, { makes, points: makes, total }] }
  return { next, points: makes }
}
