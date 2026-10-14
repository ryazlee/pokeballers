/** All 18 Pokémon types as stadiums — matching types get a boost. */
export const ALL_TYPES = [
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
] as const

export type PokemonType = (typeof ALL_TYPES)[number]

export type StatKey = 'hp' | 'atk' | 'def' | 'spa' | 'spd' | 'spe'
export type ShotFocus = 'three' | 'mid' | 'paint' | 'transition'

export type StadiumModifier =
  | {
      kind: 'stat'
      stat: StatKey
      percent: number
      /** Court-wide — every Pokémon. */
      label: string
    }
  | {
      kind: 'type_stat'
      stat: StatKey
      percent: number
      /** Extra for matching stadium type only. */
      label: string
    }
  | {
      kind: 'shot'
      shot: ShotFocus
      percent: number
      label: string
    }

export type Stadium = {
  /** Unique per daily slot (type + rolled mods). */
  id: string
  type: PokemonType
  name: string
  /** Off/def multiplier for Pokémon that include this type. */
  boost: number
  modifiers: StadiumModifier[]
}

const LABELS: Record<PokemonType, string> = {
  normal: 'Normal Court',
  fire: 'Inferno Arena',
  water: 'Tide Dome',
  electric: 'Volt Garden',
  grass: 'Grassy Field',
  ice: 'Frost Pavilion',
  fighting: 'Dojo Floor',
  poison: 'Toxis Court',
  ground: 'Dust Bowl',
  flying: 'Sky Pavilion',
  psychic: 'Mind Arena',
  bug: 'Hive Gym',
  rock: 'Stone Coliseum',
  ghost: 'Shadow Court',
  dragon: 'Dragon Roost',
  dark: 'Midnight Gym',
  steel: 'Iron Works',
  fairy: 'Misty Garden',
}

const STAT_LABEL: Record<StatKey, string> = {
  hp: 'HP / stamina',
  atk: 'Attack (drives / pass)',
  def: 'Defense (paint D)',
  spa: 'Sp. Atk (threes)',
  spd: 'Sp. Def (perim D)',
  spe: 'Speed',
}

const SHOT_LABEL: Record<ShotFocus, string> = {
  three: 'threes',
  mid: 'mid-range',
  paint: 'paint scoring',
  transition: 'transition',
}

export const TYPE_BOOST = 1.2

const STAT_KEYS: StatKey[] = ['hp', 'atk', 'def', 'spa', 'spd', 'spe']
const SHOT_KEYS: ShotFocus[] = ['three', 'mid', 'paint', 'transition']

function pickPercent(rng: () => number, min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1))
}

function rollModifier(rng: () => number, type: PokemonType): StadiumModifier {
  const roll = rng()
  if (roll < 0.4) {
    const stat = STAT_KEYS[Math.floor(rng() * STAT_KEYS.length)]!
    const percent = pickPercent(rng, 8, 14)
    return {
      kind: 'stat',
      stat,
      percent,
      label: `All ${STAT_LABEL[stat]} +${percent}%`,
    }
  }
  if (roll < 0.75) {
    const stat = STAT_KEYS[Math.floor(rng() * STAT_KEYS.length)]!
    const percent = pickPercent(rng, 10, 18)
    const typeName = type.charAt(0).toUpperCase() + type.slice(1)
    return {
      kind: 'type_stat',
      stat,
      percent,
      label: `${typeName} ${STAT_LABEL[stat]} +${percent}%`,
    }
  }
  const shot = SHOT_KEYS[Math.floor(rng() * SHOT_KEYS.length)]!
  const percent = pickPercent(rng, 8, 15)
  return {
    kind: 'shot',
    shot,
    percent,
    label: `${SHOT_LABEL[shot]} +${percent}%`,
  }
}

/** Sometimes roll a second, different-kind modifier for extra chaos. */
function rollModifiers(rng: () => number, type: PokemonType): StadiumModifier[] {
  const first = rollModifier(rng, type)
  const mods = [first]
  if (rng() < 0.35) {
    let second = rollModifier(rng, type)
    let tries = 0
    while (second.kind === first.kind && tries < 6) {
      second = rollModifier(rng, type)
      tries++
    }
    if (second.kind !== first.kind) mods.push(second)
  }
  return mods
}

export function stadiumFor(type: PokemonType, rng: () => number): Stadium {
  const modifiers = rollModifiers(rng, type)
  const modKey = modifiers.map((m) => m.label.replace(/\s+/g, '-')).join('_')
  return {
    id: `${type}-${modKey}`.slice(0, 80),
    type,
    name: LABELS[type],
    boost: TYPE_BOOST,
    modifiers,
  }
}

export function hasTypeBoost(types: string[], stadium: Stadium): boolean {
  return types.some((t) => t === stadium.type)
}

/** Effective base-stat after stadium secondary modifiers. */
export function effectiveStat(
  base: number,
  stat: StatKey,
  types: string[],
  stadium?: Stadium,
): number {
  if (!stadium) return base
  let mult = 1
  for (const mod of stadium.modifiers) {
    if (mod.kind === 'stat' && mod.stat === stat) {
      mult *= 1 + mod.percent / 100
    }
    if (
      mod.kind === 'type_stat' &&
      mod.stat === stat &&
      hasTypeBoost(types, stadium)
    ) {
      mult *= 1 + mod.percent / 100
    }
  }
  return base * mult
}

export function shotModifierMult(
  shot: ShotFocus,
  stadium?: Stadium,
): number {
  if (!stadium) return 1
  let mult = 1
  for (const mod of stadium.modifiers) {
    if (mod.kind === 'shot' && mod.shot === shot) {
      mult *= 1 + mod.percent / 100
    }
  }
  return mult
}

export function stadiumSummary(stadium: Stadium): string {
  const typePct = Math.round((stadium.boost - 1) * 100)
  const bits = [
    `${stadium.type} +${typePct}%`,
    ...stadium.modifiers.map((m) => m.label),
  ]
  return bits.join(' · ')
}

export function titleCaseType(type: string): string {
  return type.charAt(0).toUpperCase() + type.slice(1)
}
