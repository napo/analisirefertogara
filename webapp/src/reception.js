// Each opponent service turn is a reception phase for the analyzed team.
// Remove the opponent's point that won service; it was played on our serve.
export function servicePoints(progressions = []) {
  let previous = 0
  let points = 0
  for (const value of progressions) {
    if (value === 'X') continue
    if (!Number.isInteger(value)) continue
    points += Math.max(0, value - previous - 1)
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
