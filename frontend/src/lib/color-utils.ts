/**
 * OKLCH color space conversion and interpolation utilities.
 *
 * Provides perceptually uniform color blending for the theme blend system.
 * OKLCH produces better mid-tones than sRGB linear interpolation -- grays
 * stay neutral instead of going muddy brown.
 *
 * Pipeline: hex -> sRGB -> linear RGB -> OKLab (Bjorn Ottosson) -> OKLCH (polar)
 *
 * Zero external dependencies -- pure math implementation.
 */

// --- Matrices (Bjorn Ottosson OKLab) ---

// Linear RGB to LMS
const M1 = [
  [0.4122214708, 0.5363325363, 0.0514459929],
  [0.2119034982, 0.6806995451, 0.1073969566],
  [0.0883024619, 0.2817188376, 0.6299787005],
]

// LMS to OKLab
const M2 = [
  [0.2104542553, 0.793617785, -0.0040720468],
  [1.9779984951, -2.428592205, 0.4505937099],
  [0.0259040371, 0.7827717662, -0.808675766],
]

// LMS to linear RGB (M1 inverse)
const M1_INV = [
  [4.0767416621, -3.3077115913, 0.2309699292],
  [-1.2684380046, 2.6097574011, -0.3413193965],
  [-0.0041960863, -0.7034186147, 1.707614701],
]

// OKLab to LMS (M2 inverse)
const M2_INV = [
  [1.0, 0.3963377774, 0.2158037573],
  [1.0, -0.1055613458, -0.0638541728],
  [1.0, -0.0894841775, -1.291485548],
]

// --- Gamma transfer functions ---

function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

function linearToSrgb(c: number): number {
  return c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055
}

// --- Hex parsing and formatting ---

function parseHex(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16) / 255
  const g = parseInt(hex.slice(3, 5), 16) / 255
  const b = parseInt(hex.slice(5, 7), 16) / 255
  return [r, g, b]
}

function formatHex(r: number, g: number, b: number): string {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v * 255)))
  return (
    '#' +
    clamp(r).toString(16).padStart(2, '0') +
    clamp(g).toString(16).padStart(2, '0') +
    clamp(b).toString(16).padStart(2, '0')
  )
}

// --- Matrix multiplication helpers ---

function multiplyRow(row: number[], vec: number[]): number {
  return row[0] * vec[0] + row[1] * vec[1] + row[2] * vec[2]
}

function matVec(mat: number[][], vec: number[]): [number, number, number] {
  return [multiplyRow(mat[0], vec), multiplyRow(mat[1], vec), multiplyRow(mat[2], vec)]
}

// --- Public API ---

/**
 * Convert a 7-char hex color to OKLCH [L, C, H].
 *
 * L: lightness (0-1)
 * C: chroma (0 to ~0.4)
 * H: hue (0-360 degrees)
 */
export function hexToOklch(hex: string): [number, number, number] {
  const [r, g, b] = parseHex(hex)

  // sRGB to linear
  const lr = srgbToLinear(r)
  const lg = srgbToLinear(g)
  const lb = srgbToLinear(b)

  // Linear RGB to LMS (cube root)
  const lms = matVec(M1, [lr, lg, lb])
  const lms_ = [Math.cbrt(lms[0]), Math.cbrt(lms[1]), Math.cbrt(lms[2])] as [
    number,
    number,
    number,
  ]

  // LMS to OKLab
  const [L, a, bLab] = matVec(M2, lms_)

  // OKLab to OKLCH (polar)
  const C = Math.sqrt(a * a + bLab * bLab)
  let H = (Math.atan2(bLab, a) * 180) / Math.PI
  if (H < 0) H += 360

  return [L, C, H]
}

/**
 * Convert an OKLCH [L, C, H] tuple to a 7-char hex string.
 */
export function oklchToHex(oklch: [number, number, number]): string {
  const [L, C, H] = oklch

  // OKLCH to OKLab
  const hRad = (H * Math.PI) / 180
  const a = C * Math.cos(hRad)
  const b = C * Math.sin(hRad)

  // OKLab to LMS (cube each)
  const lms_ = matVec(M2_INV, [L, a, b])
  const lms = [lms_[0] ** 3, lms_[1] ** 3, lms_[2] ** 3] as [number, number, number]

  // LMS to linear RGB
  const [lr, lg, lb] = matVec(M1_INV, lms)

  // Linear to sRGB
  const sr = linearToSrgb(lr)
  const sg = linearToSrgb(lg)
  const sb = linearToSrgb(lb)

  return formatHex(sr, sg, sb)
}

/**
 * Interpolate between two hex colors in OKLCH space.
 *
 * Uses shortest-arc hue interpolation and handles achromatic colors
 * (where chroma is near zero and hue is meaningless).
 *
 * @param hex1 - Start color (7-char hex)
 * @param hex2 - End color (7-char hex)
 * @param t - Interpolation factor (0 = hex1, 1 = hex2, clamped to [0,1])
 */
export function interpolateHexOklch(hex1: string, hex2: string, t: number): string {
  // Clamp t to [0, 1]
  const tc = Math.max(0, Math.min(1, t))

  const [L1, C1, H1] = hexToOklch(hex1)
  const [L2, C2, H2] = hexToOklch(hex2)

  // Interpolate lightness and chroma linearly
  const L = L1 + (L2 - L1) * tc
  const C = C1 + (C2 - C1) * tc

  // Achromatic threshold
  const ACHROMATIC = 0.002

  let H: number
  const c1Achromatic = C1 < ACHROMATIC
  const c2Achromatic = C2 < ACHROMATIC

  if (c1Achromatic && c2Achromatic) {
    // Both achromatic -- hue is irrelevant
    H = 0
  } else if (c1Achromatic) {
    // First color achromatic -- use second's hue
    H = H2
  } else if (c2Achromatic) {
    // Second color achromatic -- use first's hue
    H = H1
  } else {
    // Shortest-arc hue interpolation
    let dH = H2 - H1
    if (dH > 180) dH -= 360
    if (dH < -180) dH += 360
    H = H1 + dH * tc
    if (H < 0) H += 360
    if (H >= 360) H -= 360
  }

  return oklchToHex([L, C, H])
}
