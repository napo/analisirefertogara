// Roster entries (numbers or { number, name, isSetter }) and the "p" (possible setter) mark.
// No imports: shared by athletes.js and rally-state.js without cycles.
export const rosterPlayer = player => typeof player === 'object' ? player : { number: player, name: '', setterRole: '' }
export const isSetter = player => Boolean(player.isSetter || player.setterRole === 'P1' || player.setterRole === 'P2')
