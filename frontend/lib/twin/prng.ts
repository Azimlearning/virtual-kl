/** Small seeded PRNG so the sandbox is deterministic (same seed => same population and outcomes). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Stateless hash -> uniform [0,1) for (a, b, salt): lets us ask "is resident a outdoors at hour b" repeatably. */
export function hash01(a: number, b: number, salt = 0): number {
  let h = (Math.imul(a + 1, 0x9e3779b1) ^ Math.imul(b + 1, 0x85ebca6b) ^ Math.imul(salt + 1, 0xc2b2ae35)) >>> 0
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d) >>> 0
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b) >>> 0
  h = (h ^ (h >>> 16)) >>> 0
  return h / 4294967296
}

export function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x))
}

/** Standard normal via Box-Muller using the supplied uniform source. */
export function normal(rand: () => number): number {
  const u = Math.max(rand(), 1e-12)
  const v = rand()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}
