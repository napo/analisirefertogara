// Points won on own serve (break points) from a service grid.
// Every turn starts with the side-out point won in reception: it is removed (-1). The first box (I, 1st
// round) of the team serving first has no side-out, the set starts on its serve: counted in full, as in
// the Excel model (cell U9 = D9, while V9 = E9-D9-1).
export function servicePoints(progressions = []) {
  let previous = 0
  let points = 0
  for (const [index, value] of progressions.entries()) {
    if (value === 'X') continue
    if (!Number.isInteger(value)) continue
    points += Math.max(0, value - previous - (index === 0 ? 0 : 1))
    previous = value
  }
  return points
}

export function receptionStats(matches) {
  let completed = 0
  let pointsBeforeSideout = 0
  let unfinishedPoints = 0
  let pointsInReception = 0
  for (const match of matches) {
    for (const set of match.sets) {
      pointsInReception += Math.max(0, Number(set.scoreOwn || 0) - servicePoints(set.own))
      const turns = set.other.filter(value => Number.isInteger(value))
      const opponentServedFirst = set.other[0] !== 'X'
      let previous = 0
      turns.forEach((score, index) => {
        const lost = Math.max(0, score - previous - (index === 0 && opponentServedFirst ? 0 : 1))
        previous = score
        if (index === turns.length - 1 && set.scoreOther > set.scoreOwn) {
          unfinishedPoints += lost
          return
        }
        completed += 1
        pointsBeforeSideout += lost
      })
    }
  }
  return {
    completed,
    pointsInReception,
    pointsBeforeSideout,
    unfinishedPoints,
    meanLost: completed ? pointsBeforeSideout / completed : null,
    meanRallies: completed ? (pointsBeforeSideout + completed) / completed : null,
  }
}
