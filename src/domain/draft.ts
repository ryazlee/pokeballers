import { getPokemon } from './pokemon'
import { positionFit } from './ratings'
import {
  ALL_SLOTS,
  BST_CAP,
  BENCH_SLOTS,
  emptyLineup,
  STARTER_SLOTS,
  type Lineup,
  type Pokemon,
  type Position,
} from './types'

function roleScore(p: Pokemon, position: Position): number {
  return positionFit(p, position) * 2 + p.bst * 0.05
}

function takeFromPool(available: Pokemon[], pokemon: Pokemon): void {
  const idx = available.findIndex((p) => p.id === pokemon.id)
  if (idx >= 0) available.splice(idx, 1)
}

function cheapestN(available: Pokemon[], n: number): number {
  const sorted = [...available].sort((a, b) => a.bst - b.bst)
  let sum = 0
  for (let i = 0; i < n; i++) {
    sum += sorted[i]?.bst ?? 280
  }
  return sum
}

function bestUnderBudget(
  available: Pokemon[],
  budget: number,
  scoreOf: (p: Pokemon) => number,
): Pokemon | null {
  let best: Pokemon | null = null
  let bestScore = -Infinity
  for (const p of available) {
    if (p.bst > budget) continue
    const score = scoreOf(p)
    if (score > bestScore) {
      bestScore = score
      best = p
    }
  }
  return best
}

/**
 * Greedy CPU draft under BST cap.
 * Always fills both benches — reserves cheapest remaining pool BST for
 * unfinished slots so starters can't starve the rotation.
 */
export function autoDraftFromPool(pool: Pokemon[], cap = BST_CAP): Lineup {
  const lineup = emptyLineup()
  const available = [...pool]
  let used = 0
  const totalSlots = STARTER_SLOTS.length + BENCH_SLOTS.length

  for (let i = 0; i < STARTER_SLOTS.length; i++) {
    const slot = STARTER_SLOTS[i]!
    const remainingAfter = totalSlots - i - 1
    const budgetLeft = cap - used
    const reserve = cheapestN(available, remainingAfter)
    // Never spend into the reserved cheapest seats for later picks.
    const spendCap = Math.max(0, budgetLeft - reserve)
    const softMax = Math.floor(spendCap / Math.max(1, remainingAfter + 1)) + 40
    const pickBudget = Math.min(spendCap, Math.max(softMax, Math.floor(spendCap * 0.55)))

    let best =
      bestUnderBudget(available, pickBudget, (p) => roleScore(p, slot)) ??
      bestUnderBudget(available, spendCap, (p) => roleScore(p, slot))

    // Absolute last resort: still honor the reserve if anything cheaper exists.
    if (!best) {
      best = bestUnderBudget(available, spendCap, (p) => -p.bst)
    }
    if (!best) continue

    lineup[slot] = { pokemonId: best.id }
    used += best.bst
    takeFromPool(available, best)
  }

  for (const bench of BENCH_SLOTS) {
    const remainingAfter = BENCH_SLOTS.indexOf(bench) === 0 ? 1 : 0
    const budgetLeft = cap - used
    const reserve = cheapestN(available, remainingAfter)
    const spendCap = Math.max(0, budgetLeft - reserve)

    let best = bestUnderBudget(
      available,
      spendCap,
      (p) =>
        (positionFit(p, 'SG') + positionFit(p, 'SF') + positionFit(p, 'PF')) / 3 +
        p.stats.hp * 0.2,
    )
    if (!best) best = bestUnderBudget(available, budgetLeft, (p) => -p.bst)
    if (!best) continue

    lineup[bench] = { pokemonId: best.id }
    used += best.bst
    takeFromPool(available, best)
  }

  // If a bench is still empty, force the cheapest leftover that fits.
  for (const bench of BENCH_SLOTS) {
    if (lineup[bench]) continue
    const budgetLeft = cap - used
    const filler = bestUnderBudget(available, budgetLeft, (p) => -p.bst)
    if (!filler) continue
    lineup[bench] = { pokemonId: filler.id }
    used += filler.bst
    takeFromPool(available, filler)
  }

  return lineup
}

export function lineupPokemonIds(lineup: Lineup): number[] {
  const ids: number[] = []
  for (const slot of ALL_SLOTS) {
    const e = lineup[slot]
    if (e) ids.push(e.pokemonId)
  }
  return ids
}

export function resolvePool(ids: number[]): Pokemon[] {
  return ids.map((id) => getPokemon(id)).filter((p): p is Pokemon => p != null)
}
