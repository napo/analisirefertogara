// Image helpers for scoresheets printed as images (TieBreakTech "TBT ScoreSheet").
// Works on plain grayscale images { data: Uint8Array, width, height } so it runs in the browser (canvas)
// and in Node (tests) alike. No OCR here: only cropping and cleaning of single cells.

export const DARK = 150 // gray level below which a pixel is ink

export function cropGray(image, x0, y0, x1, y1) {
  const left = Math.max(0, Math.round(x0)), top = Math.max(0, Math.round(y0))
  const width = Math.max(1, Math.min(image.width, Math.round(x1)) - left)
  const height = Math.max(1, Math.min(image.height, Math.round(y1)) - top)
  const data = new Uint8Array(width * height)
  for (let y = 0; y < height; y++) {
    const from = (top + y) * image.width + left
    data.set(image.data.subarray(from, from + width), y * width)
  }
  return { data, width, height }
}

// Connected components of ink (8-connectivity)
export function components(image, threshold = DARK) {
  const { data, width, height } = image
  const seen = new Uint8Array(width * height)
  const list = []
  const stack = []
  for (let start = 0; start < data.length; start++) {
    if (seen[start] || data[start] >= threshold) continue
    seen[start] = 1
    stack.push(start)
    const pixels = []
    let minX = width, maxX = 0, minY = height, maxY = 0
    while (stack.length) {
      const i = stack.pop()
      pixels.push(i)
      const x = i % width, y = (i / width) | 0
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx, ny = y + dy
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue
          const j = ny * width + nx
          if (!seen[j] && data[j] < threshold) { seen[j] = 1; stack.push(j) }
        }
      }
    }
    list.push({ pixels, minX, maxX, minY, maxY, w: maxX - minX + 1, h: maxY - minY + 1 })
  }
  return list
}

// Ring drawn around a value (final points, captain): tall, roughly square, mostly empty inside
const isRing = (c, charHeight) => c.h > charHeight * 1.2 && c.w > charHeight * 1.1 &&
  Math.abs(c.w - c.h) < Math.max(c.w, c.h) * 0.35 && c.pixels.length < c.w * c.h * 0.45

// Morphological opening of the ink (erosion then dilation, square of side 2r+1): removes the thin strokes
// (the "/" mark of a service turn, rings, small corner digits) and keeps the bold digits of the values.
// `restore` steps of growth inside the original ink give back the thinner parts of the digits.
export function openInk(image, radius = 1, restore = 0) {
  const { data, width, height } = image
  const ink = (x, y) => x >= 0 && y >= 0 && x < width && y < height && data[y * width + x] < DARK
  const eroded = new Uint8Array(width * height)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let all = true
      for (let dy = -radius; dy <= radius && all; dy++) for (let dx = -radius; dx <= radius && all; dx++) all = ink(x + dx, y + dy)
      eroded[y * width + x] = all ? 1 : 0
    }
  }
  const out = new Uint8Array(width * height).fill(255)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!eroded[y * width + x]) continue
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          const nx = x + dx, ny = y + dy
          if (nx >= 0 && ny >= 0 && nx < width && ny < height && ink(nx, ny)) out[ny * width + nx] = 0
        }
      }
    }
  }
  for (let step = 0; step < restore; step++) {
    const grown = out.slice()
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (!out[y * width + x] || !ink(x, y)) continue
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx, ny = y + dy
            if (nx >= 0 && ny >= 0 && nx < width && ny < height && !out[ny * width + nx]) { grown[y * width + x] = 0; dy = dx = 2 }
          }
        }
      }
    }
    out.set(grown)
  }
  return { data: out, width, height }
}

// Keep the ink of printed values: characters of about `charHeight` px; drops the small corner digits,
// the "/" marks of the scoresheet grid and the separator ":" printed in empty score boxes. Rings around a
// value are removed keeping what is inside. Returns { image, glyphs } or null when the cell is empty.
export function cleanCell(image, { charHeight = 24, minRatio = 0.62, maxRatio = 1.3, accept = () => true } = {}) {
  const minH = charHeight * minRatio, maxH = charHeight * maxRatio
  const all = components(image)
  const glyphs = []
  const keep = new Uint8Array(image.width * image.height)
  for (const c of all) {
    if (!accept(c)) continue
    if (isRing(c, charHeight)) {
      // keep the part of a ring component that lies inside the circle (a digit touching the ring)
      const cx = (c.minX + c.maxX) / 2, cy = (c.minY + c.maxY) / 2, r = Math.min(c.w, c.h) / 2
      const inner = c.pixels.filter(i => Math.hypot((i % image.width) - cx, ((i / image.width) | 0) - cy) < r * 0.7)
      if (inner.length > 20) {
        for (const i of inner) keep[i] = 1
        glyphs.push({ ...c, pixels: inner, ring: true })
      }
      continue
    }
    // grid lines are 1-2 px wide: never a character
    if (c.h >= minH && c.h <= maxH && c.w <= charHeight * 1.6 && c.w > Math.max(2, charHeight * 0.1)) {
      for (const i of c.pixels) keep[i] = 1
      glyphs.push(c)
    }
  }
  if (!glyphs.length) return null
  const data = new Uint8Array(image.width * image.height).fill(255)
  for (let i = 0; i < data.length; i++) if (keep[i]) data[i] = 0
  glyphs.sort((a, b) => a.minX - b.minX)
  return { image: { data, width: image.width, height: image.height }, glyphs, ringed: glyphs.some(g => g.ring) }
}

// Split the glyphs of "a : b" at the widest horizontal gap: two groups (the ":" dots are not glyphs)
export function splitPair(glyphs) {
  if (glyphs.length < 2) return null
  let best = -1, at = -1
  for (let i = 1; i < glyphs.length; i++) {
    const gap = glyphs[i].minX - glyphs[i - 1].maxX
    if (gap > best) { best = gap; at = i }
  }
  return [glyphs.slice(0, at), glyphs.slice(at)]
}

// Tight crop around some glyphs, upscaled and padded with white: the input given to the OCR engine
export function glyphImage(cleaned, glyphs, { scale = 3, pad = 12 } = {}) {
  const src = cleaned.image
  const minX = Math.min(...glyphs.map(g => g.minX)), maxX = Math.max(...glyphs.map(g => g.maxX))
  const minY = Math.min(...glyphs.map(g => g.minY)), maxY = Math.max(...glyphs.map(g => g.maxY))
  const w = maxX - minX + 1, h = maxY - minY + 1
  const width = (w + pad * 2) * scale, height = (h + pad * 2) * scale
  const data = new Uint8Array(width * height).fill(255)
  for (let y = 0; y < height; y++) {
    const sy = Math.floor(y / scale) - pad + minY
    if (sy < minY || sy > maxY) continue
    for (let x = 0; x < width; x++) {
      const sx = Math.floor(x / scale) - pad + minX
      if (sx < minX || sx > maxX) continue
      data[y * width + x] = src.data[sy * src.width + sx]
    }
  }
  return { data, width, height }
}

// Whole crop upscaled (for text fields such as names), binarized, padded
export function scaledImage(image, { scale = 2, pad = 10 } = {}) {
  const width = (image.width + pad * 2) * scale, height = (image.height + pad * 2) * scale
  const data = new Uint8Array(width * height).fill(255)
  for (let y = 0; y < height; y++) {
    const sy = Math.floor(y / scale) - pad
    if (sy < 0 || sy >= image.height) continue
    for (let x = 0; x < width; x++) {
      const sx = Math.floor(x / scale) - pad
      if (sx < 0 || sx >= image.width) continue
      data[y * width + x] = image.data[sy * image.width + sx] < DARK ? 0 : 255
    }
  }
  return { data, width, height }
}

// Share of ink in an area (e.g. an "X" mark in a box)
export function inkRatio(image) {
  let dark = 0
  for (const v of image.data) if (v < DARK) dark++
  return dark / image.data.length
}

// Text fields: remove box borders, grid lines and the small ticks printed under the boxes, keep letters
export function cleanText(image, { charHeight = 22 } = {}) {
  const all = components(image)
  const data = new Uint8Array(image.width * image.height).fill(255)
  let kept = 0
  for (const c of all) {
    const touches = c.minX === 0 || c.minY === 0 || c.maxX === image.width - 1 || c.maxY === image.height - 1
    const line = (c.w > image.width * 0.5 && c.h < charHeight * 0.4) || (c.h > image.height * 0.85 && c.w < charHeight * 0.3)
    const tick = c.h < charHeight * 0.55 && c.w < charHeight * 0.2 && c.minY > image.height * 0.55
    if (line || tick || (touches && c.h > image.height * 0.7)) continue
    for (const i of c.pixels) data[i] = 0
    kept++
  }
  return kept ? { data, width: image.width, height: image.height } : null
}

// Very small print (page 2): bilinear upscale of the gray levels, then a contrast stretch (gray `low` →
// black, `high` → white). The OCR engine reads the smooth outlines much better than blocky binarized
// pixels. A wider horizontal scale and a darker range separate bold digits that touch ("27").
export function smoothImage(image, { scale = 8, scaleY = scale, pad = 6, low = 60, high = 220 } = {}) {
  const width = (image.width + pad * 2) * scale, height = (image.height + pad * 2) * scaleY
  const data = new Uint8Array(width * height).fill(255)
  const at = (x, y) => (x < 0 || y < 0 || x >= image.width || y >= image.height ? 255 : image.data[y * image.width + x])
  for (let y = 0; y < height; y++) {
    const fy = (y + 0.5) / scaleY - pad - 0.5, y0 = Math.floor(fy), ty = fy - y0
    for (let x = 0; x < width; x++) {
      const fx = (x + 0.5) / scale - pad - 0.5, x0 = Math.floor(fx), tx = fx - x0
      const v = (at(x0, y0) * (1 - tx) + at(x0 + 1, y0) * tx) * (1 - ty) + (at(x0, y0 + 1) * (1 - tx) + at(x0 + 1, y0 + 1) * tx) * ty
      data[y * width + x] = Math.max(0, Math.min(255, ((v - low) * 255) / (high - low)))
    }
  }
  return { data, width, height }
}

// Shape of a glyph for template matching: share of ink in each cell of a w×h grid over its bounding box
export function glyphShape(glyph, imageWidth, { w = 8, h = 12 } = {}) {
  const shape = new Float32Array(w * h), area = new Float32Array(w * h)
  for (let y = glyph.minY; y <= glyph.maxY; y++) {
    for (let x = glyph.minX; x <= glyph.maxX; x++) {
      area[Math.min(h - 1, Math.floor(((y - glyph.minY) * h) / glyph.h)) * w + Math.min(w - 1, Math.floor(((x - glyph.minX) * w) / glyph.w))]++
    }
  }
  for (const i of glyph.pixels) {
    const x = i % imageWidth, y = (i / imageWidth) | 0
    shape[Math.min(h - 1, Math.floor(((y - glyph.minY) * h) / glyph.h)) * w + Math.min(w - 1, Math.floor(((x - glyph.minX) * w) / glyph.w))]++
  }
  for (let i = 0; i < shape.length; i++) shape[i] = area[i] ? shape[i] / area[i] : 0
  return { shape, aspect: glyph.w / glyph.h }
}

// Similarity of two glyph shapes (1 = identical)
export function shapeSimilarity(a, b) {
  let diff = 0
  for (let i = 0; i < a.shape.length; i++) diff += Math.abs(a.shape[i] - b.shape[i])
  return 1 - diff / a.shape.length - Math.abs(a.aspect - b.aspect) * 0.5
}
