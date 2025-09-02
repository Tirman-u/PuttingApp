export type LadderState = {
  distanceM: number
  history: { distanceM: number; makes: number; points: number }[]
}
export function createLadder(): LadderState {
  return { distanceM: 5, history: [] }
}
/** 1p/maak. Kui makes >=3 → +1m; makes <=1 → -1m; muidu jääb. 4..12 m piirid. */
export function applyLadderSet(state: LadderState, makes: number): { next: LadderState; points: number } {
  const points = makes
  const d = state.distanceM + (makes >= 3 ? 1 : makes <= 1 ? -1 : 0)
  const nextD = Math.max(4, Math.min(12, d))
  const next = { distanceM: nextD, history: [...state.history, { distanceM: state.distanceM, makes, points }] }
  return { next, points }
}
