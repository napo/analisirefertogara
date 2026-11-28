// Color arithmetic for the palettes (theme.js) and their tests: sRGB <-> OKLab, simulation of color
// vision deficiencies (Machado, Oliveira, Fernandes 2009, severity 1), perceptual difference and WCAG
// contrast. No dependencies.

const clamp01 = value => Math.min(1, Math.max(0, value))
export const hexToRgb = hex => {
  const text = hex.replace('#', '')
  const full = text.length === 3 ? [...text].map(c => c + c).join('') : text
  return [0, 2, 4].map(i => parseInt(full.slice(i, i + 2), 16) / 255)
}
export const rgbToHex = rgb => `#${rgb.map(v => Math.round(clamp01(v) * 255).toString(16).padStart(2, '0')).join('')}`

const toLinear = v => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
const toGamma = v => (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055)

export function rgbToOklab(rgb) {
  const [r, g, b] = rgb.map(toLinear)
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s]
}
export function oklabToRgb([L, a, b]) {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3
  return [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s].map(v => toGamma(clamp01(v)))
}

// Perceptual difference (OKLab distance x 100): about 2 is just noticeable, 15+ is clearly different
export const deltaE = (x, y) => {
  const [a, b] = [rgbToOklab(hexToRgb(x)), rgbToOklab(hexToRgb(y))]
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) * 100
}

const MACHADO = {
  protan: [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]],
  deutan: [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.01182, 0.04294, 0.968881]],
  tritan: [[1.255528, -0.076749, -0.178779], [-0.078411, 0.930809, 0.147602], [0.004733, 0.691367, 0.3039]],
}
// How a color looks with a deficiency: 'protan', 'deutan', 'tritan', 'achromat' (lightness only)
export function simulate(hex, kind) {
  const rgb = hexToRgb(hex).map(toLinear)
  if (kind === 'achromat') {
    const y = 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]
    return rgbToHex([y, y, y].map(toGamma))
  }
  const m = MACHADO[kind]
  return rgbToHex(m.map(row => toGamma(clamp01(row[0] * rgb[0] + row[1] * rgb[1] + row[2] * rgb[2]))))
}

const luminance = hex => {
  const [r, g, b] = hexToRgb(hex).map(toLinear)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
export const contrast = (x, y) => {
  const [a, b] = [luminance(x), luminance(y)].sort((p, q) => q - p)
  return (a + 0.05) / (b + 0.05)
}

// Lightness moved linearly into [lo, hi] (OKLab L), hue and chroma kept: the order and the differences
// between colors survive, e.g. when the whole palette must become light for a dark surface
export function remapLightness(hex, lo, hi) {
  const [L, a, b] = rgbToOklab(hexToRgb(hex))
  return rgbToHex(oklabToRgb([lo + (hi - lo) * L, a, b]))
}
