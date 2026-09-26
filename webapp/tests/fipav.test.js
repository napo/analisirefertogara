import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { parseItems, refreshImportedMatch } from '../src/pdf-parser.js'
import { validateMatch, analyze } from '../src/analysis.js'
import { athleteStats } from '../src/athletes.js'
// Text items extracted with PDF.js from the reported Referto11605-1.pdf.
const fixture = JSON.parse(readFileSync(new URL('./fixtures/referto11605-items.json', import.meta.url)))
const parse = (items = fixture.items) => parseItems(items, fixture.width, fixture.height)
test('NEWBIT 11605 follows team B through court changes, scores and tie-break', () => {
  const m = parse()
  assert.equal(m.team, 'FAAM MATESE CE')
  assert.deepEqual(m.sets.map(s => [s.scoreOwn,s.scoreOther]), [[25,14],[24,26],[25,23],[15,25],[15,11]])
  assert.deepEqual(m.sets[0].lineup, ['1','12','18','10','17','11'])
  assert.deepEqual(m.sets.map(s => [s.own[0],s.other[0]]), [['X',0],[0,'X'],['X',0],[1,'X'],['X',0]])
  assert.deepEqual(m.sets[4].own.filter(v => v !== ''), ['X',6,7,11,12,13,15])
  assert.deepEqual(validateMatch(m,false), [])
  const result = analyze([m])
  assert.equal(result.scored,104)
  assert.equal(result.conceded,99)
  assert.equal(result.wins,1)
})
test('libero labels cannot become jerseys or steal names across columns', () => {
  const m = parse()
  assert.equal(m.roster.length,12)
  assert.equal(m.opponentRoster.length,11)
  assert.equal(m.opponentRoster.find(p=>p.number===1).name,'MARTINELLI EMMA')
  assert.equal(m.opponentRoster.find(p=>p.number===17).name,'DI SCHIENA NOEMI - L1')
  assert.equal(m.roster.find(p=>p.number===7).name,'NASI CAROLA - L1')
  assert.ok(athleteStats([m]).every(p=>p.name))
  assert.ok(!athleteStats([m]).some(p=>String(p.number)==='96'))
})
test('team letters are read, not assumed from a fixed A/B order', () => {
  const items=fixture.items.map(t=>({...t,str:t.str==='A'?'B':t.str==='B'?'A':t.str}))
  assert.deepEqual(parse(items).sets,parse().sets)
})
test('reimport repairs old reversed data, including already swapped matches', () => {
  const m=parse()
  for(const reversed of [false,true]) {
    const old={...m,parserVersion:undefined,team:reversed?m.opponent:m.team,opponent:reversed?m.team:m.opponent,roster:[{number:1,name:'Wrong name'}],sets:m.sets.map(s=>({...s,lineup:['96'],scoreOwn:0,libero:{onCourt:['96']}}))}
    const repaired=refreshImportedMatch(old,m)
    assert.equal(repaired.roster.find(p=>p.number===1).name,reversed?'MARTINELLI EMMA':'JOTOV LAURA')
    assert.deepEqual(repaired.sets[0].lineup,reversed?m.sets[0].opponentLineup:m.sets[0].lineup)
    assert.deepEqual(repaired.sets[0].libero,reversed?m.sets[0].opponentLibero:m.sets[0].libero)
    assert.equal(repaired.sets[0].scoreOwn,reversed?14:25)
    assert.equal(repaired.sets[0].rotation,'')
  }
})
test('short matches do not require team letters in unused set panels', () => {
  const items=fixture.items.filter(t => {
    const x=t.transform[4]*1190.55/fixture.width
    const y=(fixture.height-t.transform[5])*841.89/fixture.height
    return !(x>630&&x<730&&y>706&&y<736) && !(Math.abs(y-429.4)<3&&x<400&&/^[AB]$/.test(t.str))
  })
  assert.equal(parse(items).sets.length,3)
})
test('counts single-libero annotations and substitutes, not the entire roster', () => {
  const m=parse()
  assert.deepEqual(m.sets[0].libero.onCourt.slice(0,4),['17','12','17','12'])
  assert.deepEqual(m.sets[0].libero.entered.slice(0,4),['7','7','7','7'])
  assert.deepEqual(m.sets[2].substituteNumbers,['16'])
  const entered=athleteStats([m]).filter(p=>p.entered)
  assert.equal(analyze([m]).athletesInvolved,8)
  assert.deepEqual(entered.map(p=>Number(p.number)).sort((a,b)=>a-b),[1,7,10,11,12,16,17,18])
  assert.equal(entered.find(p=>Number(p.number)===7).services,0)
  assert.equal(entered.find(p=>Number(p.number)===16).name,'PUCA DALIA')
})
test('version 2 reimport refreshes participation while preserving scores and rotations', () => {
  const m=parse()
  for(const reversed of [false,true]) {
    const old={...m,parserVersion:2,team:reversed?m.opponent:m.team,opponent:reversed?m.team:m.opponent,sets:m.sets.map(s=>({...s,rotation:4,libero:{},opponentLibero:{},substituteNumbers:[],opponentSubstituteNumbers:[]}))}
    const updated=refreshImportedMatch(old,m)
    assert.equal(updated.sets[0].rotation,4)
    assert.equal(updated.sets[0].scoreOwn,old.sets[0].scoreOwn)
    assert.deepEqual(updated.sets[2].substituteNumbers,reversed?m.sets[2].opponentSubstituteNumbers:m.sets[2].substituteNumbers)
    assert.deepEqual(updated.sets[0].libero,reversed?m.sets[0].opponentLibero:m.sets[0].libero)
  }
})
