export type AtwState = {
  station: number
  stations: number[]
  totalPoints: number
  history: { stationDistance: number; makes: number; points: number }[]
}

export function createAtw(): AtwState {
  return { station: 0, stations: [5,6,7,8,9,10], totalPoints: 0, history: [] }
}

export function applyAtwSet(state: AtwState, makes: number): { next: AtwState; points: number } {
  const points = makes // 1p per make
  const nextStation = (state.station + 1) % state.stations.length
  const next: AtwState = {
    station: nextStation,
    stations: state.stations,
    totalPoints: state.totalPoints + points,
    history: [...state.history, { stationDistance: state.stations[state.station], makes, points }]
  }
  return { next, points }
}
