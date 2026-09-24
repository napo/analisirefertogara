// Small, non-eval interpreter for the seven functions in the source workbook.
// Formula strings are extracted verbatim; IF evaluates only the selected branch.
export function column(n) {
  let s = ''
  for (; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + (n - 1) % 26) + s
  return s
}
const address = (s) => { const [, c, r] = s.replaceAll('$', '').match(/^([A-Z]+)(\d+)$/); return [Array.from(c).reduce((n, v) => n * 26 + v.charCodeAt(0) - 64, 0), +r] }
const parsed = new Map()
function parse(formula) {
  if (parsed.has(formula)) return parsed.get(formula)
  const tokens = formula.slice(1).match(/"(?:[^"]|"")*"|(?:[A-Za-z_][A-Za-z_0-9]*!)?\$?[A-Z]+\$?\d+|[A-Z_]+|\d+(?:\.\d+)?|>=|<=|<>|[()+\-*/,:=<>]/g) || []
  if (tokens.join('') !== formula.slice(1).replace(/\s+(?=(?:[^"]*"[^"]*")*[^"]*$)/g, '')) throw Error(`Formula non supportata: ${formula}`)
  let pos = 0
  const eat = (v) => { if (tokens[pos++] !== v) throw Error(`Atteso ${v}: ${formula}`) }
  const precedence = { '=': 1, '<>': 1, '>': 1, '<': 1, '>=': 1, '<=': 1, '+': 2, '-': 2, '*': 3, '/': 3 }
  function expression(min = 0) {
    let t = tokens[pos++], node
    if (t === '(') { node = expression(); eat(')') }
    else if (t === '-') node = { op: '*', a: { value: -1 }, b: expression(4) }
    else if (t?.startsWith('"')) node = { value: t.slice(1, -1).replaceAll('""', '"') }
    else if (/^\d/.test(t)) node = { value: +t }
    else if (t === 'FALSE' || t === 'TRUE') node = { value: t === 'TRUE' }
    else if (tokens[pos] === '(') {
      pos++; const args = []
      if (tokens[pos] !== ')') { do { args.push(expression()); if (tokens[pos] !== ',') break; pos++ } while (pos < tokens.length) }
      eat(')'); node = { fn: t, args }
    } else {
      node = { ref: t?.replaceAll('$', '') }
      if (tokens[pos] === ':') { pos++; node.end = tokens[pos++].replaceAll('$', '') }
    }
    while (precedence[tokens[pos]] > min) { const op = tokens[pos++]; node = { op, a: node, b: expression(precedence[op]) } }
    return node
  }
  const ast = expression()
  if (pos !== tokens.length) throw Error(`Formula incompleta: ${formula}`)
  parsed.set(formula, ast)
  return ast
}
const number = (v) => { if (v === '') return 0; if (typeof v === 'number' || typeof v === 'boolean') return Number(v); throw Error(`Valore non numerico: ${v}`) }
const compare = (a, b, op) => ({ '=': a === b, '<>': a !== b, '>': a > b, '<': a < b, '>=': a >= b, '<=': a <= b })[op]
export function workbookEngine(sheets) {
  const cache = new Map(), busy = new Set()
  function cell(sheet, ref) {
    const key = `${sheet}!${ref}`
    if (cache.has(key)) return cache.get(key)
    if (busy.has(key)) throw Error(`Riferimento circolare: ${key}`)
    if (!sheets[sheet]) throw Error(`Foglio mancante: ${sheet}`)
    busy.add(key)
    const raw = sheets[sheet][ref] ?? ''
    try {
      const value = typeof raw === 'string' && raw.startsWith('=') ? run(parse(raw), sheet) : raw
      if (typeof value === 'number' && !Number.isFinite(value)) throw Error(`Risultato non finito: ${key}`)
      cache.set(key, value); return value
    } finally { busy.delete(key) }
  }
  function run(n, sheet) {
    if ('value' in n) return n.value
    if (n.ref) {
      const [s, c] = n.ref.includes('!') ? n.ref.split('!') : [sheet, n.ref]
      if (!n.end) return cell(s, c)
      const [x, y] = address(c), [xx, yy] = address(n.end)
      return Array.from({ length: yy - y + 1 }, (_, r) => Array.from({ length: xx - x + 1 }, (_, col) => cell(s, `${column(x + col)}${y + r}`)))
    }
    if (n.op) {
      const a = run(n.a, sheet), b = run(n.b, sheet)
      if (['=', '<>', '<', '>', '<=', '>='].includes(n.op)) return compare(a, b, n.op)
      const x = number(a), y = number(b)
      if (n.op === '/' && y === 0) throw Error('Divisione per zero nel modello originale')
      return { '+': () => x + y, '-': () => x - y, '*': () => x * y, '/': () => x / y }[n.op]()
    }
    if (n.fn === 'IF') return run(n.args[run(n.args[0], sheet) ? 1 : 2], sheet)
    const a = n.args.map(v => run(v, sheet)), flat = a.flat(Infinity)
    switch (n.fn) {
      case 'UPPER': return String(a[0]).toUpperCase()
      case 'OR': return a.some(Boolean)
      case 'SUM': return flat.filter(v => typeof v === 'number').reduce((s, v) => s + v, 0)
      case 'MAX': return Math.max(0, ...flat.filter(v => typeof v === 'number'))
      case 'COUNTIF': { const [, op, val] = String(a[1]).match(/^(>=|<=|<>|>|<|=)?(.*)$/); return a[0].flat().filter(v => typeof v === 'number' && compare(v, +val, op || '=')).length }
      case 'HLOOKUP': { const idx = a[1][0].findIndex(v => v === a[0]); if (idx < 0) throw Error('Posizione P mancante o non valida'); return a[1][a[2] - 1][idx] }
      default: throw Error(`Funzione non supportata: ${n.fn}`)
    }
  }
  return { cell }
}
