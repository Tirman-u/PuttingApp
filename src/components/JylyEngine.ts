// src/components/JylyEngine.ts
export type JylyHistoryItem = {
  distanceM: number
  makes: number
  points: number
}

export type JylyState = {
  distanceM: number
  history: JylyHistoryItem[]
  targetSets: number
}

/** Algseis — soovi korral muuda algdistantsi või seeriate arvu */
export function createJyly(): JylyState {
  return { distanceM: 10, history: [], targetSets: 20 }
}

/** Punktiarvutus — muuda vastavalt oma reeglile (hetkel 1p per make) */
function score(makes: number) {
  return makes
}

/** Kui tahad distantsi muuta voorude vahel, arvuta siin. */
function nextDistance(prev: JylyState) {
  return prev.distanceM
}

/** Lisa üks set lõppu */
export function applyJylySet(state: JylyState, makes: number): JylyState {
  const points = score(makes)
  const item: JylyHistoryItem = { distanceM: state.distanceM, makes, points }
  return {
    distanceM: nextDistance(state),
    history: [...state.history, item],
    targetSets: state.targetSets,
  }
}

/** Ehita seis algusest, kui on teada kõigi set’ide makes */
export function rebuildJylyFromMakes(makesArr: number[]): JylyState {
  let s = createJyly()
  for (const m of makesArr) s = applyJylySet(s, m)
  return s
}
