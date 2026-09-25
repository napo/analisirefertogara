// Each opponent service turn is a reception phase for the analyzed team.
// Remove the opponent's point that won service; it was played on our serve.
export function receptionStats(matches) {
  let completed = 0
  let pointsBeforeSideout = 0
  let unfinishedPoints = 0
  for (const match of matches) {
    for (const set of match.sets) {
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
    pointsBeforeSideout,
    unfinishedPoints,
    meanLost: completed ? pointsBeforeSideout / completed : null,
    meanRallies: completed ? (pointsBeforeSideout + completed) / completed : null,
  }
}
