import { ALL_TYPES, type PokemonType } from './terrains'

/**
 * Standard Gen 6+ offensive efficacy (attacking type → defending type).
 * Only non-neutral entries are stored; missing = 1×.
 */
const CHART: Partial<
  Record<PokemonType, Partial<Record<PokemonType, number>>>
> = {
  normal: { rock: 0.5, ghost: 0, steel: 0.5 },
  fire: {
    fire: 0.5,
    water: 0.5,
    grass: 2,
    ice: 2,
    bug: 2,
    rock: 0.5,
    dragon: 0.5,
    steel: 2,
  },
  water: {
    fire: 2,
    water: 0.5,
    grass: 0.5,
    ground: 2,
    rock: 2,
    dragon: 0.5,
  },
  electric: {
    water: 2,
    electric: 0.5,
    grass: 0.5,
    ground: 0,
    flying: 2,
    dragon: 0.5,
  },
  grass: {
    fire: 0.5,
    water: 2,
    grass: 0.5,
    poison: 0.5,
    ground: 2,
    flying: 0.5,
    bug: 0.5,
    rock: 2,
    dragon: 0.5,
    steel: 0.5,
  },
  ice: {
    fire: 0.5,
    water: 0.5,
    grass: 2,
    ice: 0.5,
    ground: 2,
    flying: 2,
    dragon: 2,
    steel: 0.5,
  },
  fighting: {
    normal: 2,
    ice: 2,
    poison: 0.5,
    flying: 0.5,
    psychic: 0.5,
    bug: 0.5,
    rock: 2,
    ghost: 0,
    dark: 2,
    steel: 2,
    fairy: 0.5,
  },
  poison: {
    grass: 2,
    poison: 0.5,
    ground: 0.5,
    rock: 0.5,
    ghost: 0.5,
    steel: 0,
    fairy: 2,
  },
  ground: {
    fire: 2,
    electric: 2,
    grass: 0.5,
    poison: 2,
    flying: 0,
    bug: 0.5,
    rock: 2,
    steel: 2,
  },
  flying: {
    electric: 0.5,
    grass: 2,
    fighting: 2,
    bug: 2,
    rock: 0.5,
    steel: 0.5,
  },
  psychic: {
    fighting: 2,
    poison: 2,
    psychic: 0.5,
    dark: 0,
    steel: 0.5,
  },
  bug: {
    fire: 0.5,
    grass: 2,
    fighting: 0.5,
    poison: 0.5,
    flying: 0.5,
    psychic: 2,
    ghost: 0.5,
    dark: 2,
    steel: 0.5,
    fairy: 0.5,
  },
  rock: {
    fire: 2,
    ice: 2,
    fighting: 0.5,
    ground: 0.5,
    flying: 2,
    bug: 2,
    steel: 0.5,
  },
  ghost: {
    normal: 0,
    psychic: 2,
    ghost: 2,
    dark: 0.5,
  },
  dragon: { dragon: 2, steel: 0.5, fairy: 0 },
  dark: {
    fighting: 0.5,
    psychic: 2,
    ghost: 2,
    dark: 0.5,
    fairy: 0.5,
  },
  steel: {
    fire: 0.5,
    water: 0.5,
    electric: 0.5,
    ice: 2,
    rock: 2,
    steel: 0.5,
    fairy: 2,
  },
  fairy: {
    fire: 0.5,
    fighting: 2,
    poison: 0.5,
    dragon: 2,
    dark: 2,
    steel: 0.5,
  },
}

function asType(t: string): PokemonType | null {
  return t in CHART ||
    (
      [
        'normal',
        'fire',
        'water',
        'electric',
        'grass',
        'ice',
        'fighting',
        'poison',
        'ground',
        'flying',
        'psychic',
        'bug',
        'rock',
        'ghost',
        'dragon',
        'dark',
        'steel',
        'fairy',
      ] as string[]
    ).includes(t)
    ? (t as PokemonType)
    : null
}

function efficacy(atk: PokemonType, def: PokemonType): number {
  return CHART[atk]?.[def] ?? 1
}

/** One attacking type vs a (possibly dual-type) defender. */
function vsDefender(atk: PokemonType, defTypes: string[]): number {
  let mult = 1
  for (const raw of defTypes) {
    const def = asType(raw)
    if (def) mult *= efficacy(atk, def)
  }
  return mult
}

/**
 * Compress Pokémon 0 / 0.25 / 0.5 / 2 / 4× into a soft basketball edge.
 * Strong enough to notice in matchups, not enough to overwrite BST/stadiums.
 */
export function hoopTypeMult(raw: number): number {
  if (raw >= 4) return 1.18
  if (raw >= 2) return 1.1
  if (raw === 0) return 0.84
  if (raw <= 0.25) return 0.88
  if (raw <= 0.5) return 0.93
  return 1
}

/**
 * Best attacking type the shooter can lean on vs this defender.
 * Dual-type defenders multiply like the games (e.g. 2×2 = 4).
 */
export function offensiveTypeEdge(
  attackerTypes: string[],
  defenderTypes: string[],
): number {
  if (attackerTypes.length === 0 || defenderTypes.length === 0) return 1

  let best = 0
  let saw = false
  for (const raw of attackerTypes) {
    const atk = asType(raw)
    if (!atk) continue
    saw = true
    best = Math.max(best, vsDefender(atk, defenderTypes))
  }
  if (!saw) return 1
  return hoopTypeMult(best)
}

/** Short PBP tag when the matchup actually bites. */
export function typeEdgeTag(edge: number): string {
  if (edge >= 1.09) return ' · type edge'
  if (edge <= 0.9) return ' · tough matchup'
  return ''
}

/** Types the stadium element is super-effective against (bad day on this court). */
export function typesHurtByStadium(stadiumType: PokemonType): PokemonType[] {
  return ALL_TYPES.filter((def) => efficacy(stadiumType, def) >= 2)
}

/**
 * Same-type stadium boost, plus a soft nerf when the court type beats you
 * (e.g. Grass on Inferno Arena). Resisting the court helps a little if you
 * don't already match it.
 */
export function stadiumAffinityMult(
  pokemonTypes: string[],
  stadium: { type: PokemonType; boost: number },
): number {
  const matched = pokemonTypes.some((t) => t === stadium.type)
  let mult = matched ? stadium.boost : 1

  if (matched) return mult

  const pressure = vsDefender(stadium.type, pokemonTypes)
  if (pressure >= 4) return mult * 0.8
  if (pressure >= 2) return mult * 0.87
  if (pressure === 0) return mult * 1.05
  if (pressure <= 0.5) return mult * 1.03
  return mult
}

export function stadiumHurtHint(stadiumType: PokemonType): string {
  const hurts = typesHurtByStadium(stadiumType)
  if (hurts.length === 0) return ''
  return ` · hurts ${hurts.join('/')}`
}
