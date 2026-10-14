import { RATING, POSITION_WEIGHTS } from './weights'
import { getPokemon } from './pokemon'
import {
  ALL_SLOTS,
  BENCH_SLOTS,
  BST_CAP,
  STARTER_SLOTS,
  type Lineup,
  type Position,
  type Pokemon,
  type RosterSlot,
  type TeamRatings,
} from './types'

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n))
}

function sizeScore(p: Pokemon): { height: number; weight: number } {
  // Typical national-dex ranges roughly height 1–25 dm, weight 1–9999 hg
  return {
    height: clamp((p.height / 20) * 100, 0, 100),
    weight: clamp((p.weight / 1500) * 100, 0, 100),
  }
}

/** Grade how well a Pokémon fits a basketball position (0–100). */
export function positionFit(pokemon: Pokemon, position: Position): number {
  const weights = POSITION_WEIGHTS[position]
  const size = sizeScore(pokemon)
  let weighted = 0
  let totalW = 0

  for (const [key, w] of Object.entries(weights)) {
    if (w == null) continue
    totalW += w
    if (key === 'height') weighted += size.height * w
    else if (key === 'weight') weighted += size.weight * w
    else {
      const stat = pokemon.stats[key as keyof typeof pokemon.stats]
      weighted += clamp(stat, 0, 180) * w
    }
  }

  if (totalW === 0) return 50
  const avg = weighted / totalW
  // Base stats ~40–150 → map toward 0–100
  return clamp(Math.round((avg / 100) * 100 * RATING.fitScale), 1, 99)
}

export function lineupBst(lineup: Lineup): number {
  let sum = 0
  for (const slot of ALL_SLOTS) {
    const entry = lineup[slot]
    if (!entry) continue
    const p = getPokemon(entry.pokemonId)
    if (p) sum += p.bst
  }
  return sum
}

export function startersFilled(lineup: Lineup): boolean {
  return STARTER_SLOTS.every((s) => lineup[s] != null)
}

export function isOverCap(lineup: Lineup, cap = BST_CAP): boolean {
  return lineupBst(lineup) > cap
}

export function canPlay(lineup: Lineup, cap = BST_CAP): boolean {
  return startersFilled(lineup) && !isOverCap(lineup, cap)
}

function avg(nums: number[]): number {
  if (nums.length === 0) return 0
  return nums.reduce((a, b) => a + b, 0) / nums.length
}

export function rateTeam(lineup: Lineup): TeamRatings {
  const slotFits: Partial<Record<RosterSlot, number>> = {}
  const starters: { slot: Position; pokemon: Pokemon; fit: number }[] = []

  for (const slot of STARTER_SLOTS) {
    const entry = lineup[slot]
    if (!entry) continue
    const pokemon = getPokemon(entry.pokemonId)
    if (!pokemon) continue
    const fit = positionFit(pokemon, slot)
    slotFits[slot] = fit
    starters.push({ slot, pokemon, fit })
  }

  const perimeterParts: number[] = []
  const paintParts: number[] = []
  const offenseParts: number[] = []
  const defenseParts: number[] = []
  let playmaking = 40

  for (const { slot, pokemon, fit } of starters) {
    const { spa, atk, spe, def, spd, hp } = pokemon.stats
    const size = sizeScore(pokemon)
    const periOff = (spa * 1.2 + spe * 0.9) / 2.1
    const paintOff = (atk * 1.2 + def * 0.4 + size.weight * 0.3) / 1.9
    const periDef = (spd * 1.1 + spe * 0.9) / 2
    const intDef = (def * 1.2 + hp * 0.5 + size.height * 0.5 + size.weight * 0.3) / 2.5

    perimeterParts.push(periOff * 0.55 + periDef * 0.45)
    paintParts.push(paintOff * 0.55 + intDef * 0.45)
    offenseParts.push(periOff * 0.5 + paintOff * 0.5 + fit * 0.15)
    defenseParts.push(periDef * 0.5 + intDef * 0.5 + fit * 0.1)

    if (slot === 'PG') {
      playmaking = clamp(Math.round((spe * 1.1 + spa * 1.0) / 2.1), 1, 99)
    }
  }

  const benchFits: number[] = []
  for (const slot of BENCH_SLOTS) {
    const entry = lineup[slot]
    if (!entry) {
      slotFits[slot] = 0
      continue
    }
    const pokemon = getPokemon(entry.pokemonId)
    if (!pokemon) continue
    // Flex: average fit across wing/big roles
    const fit = avg([
      positionFit(pokemon, 'SG'),
      positionFit(pokemon, 'SF'),
      positionFit(pokemon, 'PF'),
    ])
    slotFits[slot] = fit
    benchFits.push(fit * (1 - RATING.benchDepthHpWeight) + clamp(pokemon.stats.hp, 0, 180) * RATING.benchDepthHpWeight)
  }

  const depth =
    benchFits.length === 0
      ? 25
      : clamp(Math.round(avg(benchFits)), 1, 99)

  return {
    offense: clamp(Math.round(avg(offenseParts.length ? offenseParts : [40])), 1, 99),
    defense: clamp(Math.round(avg(defenseParts.length ? defenseParts : [40])), 1, 99),
    perimeter: clamp(Math.round(avg(perimeterParts.length ? perimeterParts : [40])), 1, 99),
    paint: clamp(Math.round(avg(paintParts.length ? paintParts : [40])), 1, 99),
    depth,
    playmaking,
    bst: lineupBst(lineup),
    slotFits,
  }
}
