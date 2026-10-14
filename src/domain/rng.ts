/** Mulberry32 — tiny seeded PRNG. */
export function mulberry32(seed: number): () => number {
  let t = seed >>> 0
  return () => {
    t += 0x6d2b79f5
    let r = Math.imul(t ^ (t >>> 15), 1 | t)
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r)
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296
  }
}

export function hashString(input: string): number {
  let h = 2166136261
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

export function pickWeighted<T>(
  rng: () => number,
  items: { item: T; weight: number }[],
): T {
  const total = items.reduce((s, x) => s + Math.max(0, x.weight), 0)
  if (total <= 0) return items[0]!.item
  let roll = rng() * total
  for (const { item, weight } of items) {
    roll -= Math.max(0, weight)
    if (roll <= 0) return item
  }
  return items[items.length - 1]!.item
}
