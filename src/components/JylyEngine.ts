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

/** Algseis (kui sul oli teistsugune algdistants, jäta samaks) */
export function createJyly(): JylyState {
  return { distanceM: 10, history: [], targetSets: 20 }
}

/**
 * Rakenda üks seeria.
 * NB! Punktiloogika jäta samaks nagu sul varem oli.
 * Siin on näidis: 1p per make.
 */
export function applyJylySet(state: JylyState, makes: number): JylyState {
  const points = makes // <- kohanda kui sul on teine loogika
  const next: JylyState = {
    distanceM: state.distanceM, // kui sul oli distantsi muutus, arvuta siin
    history: [...state.history, { distanceM: state.distanceM, makes, points }],
    targetSets: state.targetSets,
  }
  return next
}

/** Summaarne punktisumma seisust */
export function sumJylyPoints(s: JylyState): number {
  return s.history.reduce((acc, h) => acc + (h.points || 0), 0)
}

/**
 * Ehita seis nullist, kui teame kõigi seeriate 'makes' massiivi.
 * Kasutame paranduste korral: muudame ühe elemendi ja arvutame kogu ajaloo uuesti.
 */
export function rebuildJylyFromMakes(makesArr: number[]): JylyState {
  let s = createJyly()
  for (const m of makesArr) {
    s = applyJylySet(s, m)
  }
  return s
}
