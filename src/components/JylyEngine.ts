export type JylyState = {
  distanceM: number
  totalPoints: number
  history: { distanceM: number; makes: number; points: number }[]
}
export function createJyly(): JylyState { return { distanceM: 10, totalPoints: 0, history: [] } }
export function jylyScoreForSet(distanceM: number, makes: number){ return distanceM * makes }
export function jylyNextDistance(makes: number){ return Math.max(5, Math.min(10, 5 + makes)) }
export function applyJylySet(state: JylyState, makes: number): JylyState {
  const points = jylyScoreForSet(state.distanceM, makes)
  const next = jylyNextDistance(makes)
  return { distanceM: next, totalPoints: state.totalPoints + points, history: [...state.history, { distanceM: state.distanceM, makes, points }] }
}
