export type Position = 'PG' | 'SG' | 'SF' | 'PF' | 'C'
export type BenchSlot = 'BENCH1' | 'BENCH2'
export type RosterSlot = Position | BenchSlot

export type PokemonStats = {
  hp: number
  atk: number
  def: number
  spa: number
  spd: number
  spe: number
}

export type Pokemon = {
  id: number
  name: string
  types: string[]
  gen: number
  height: number
  weight: number
  stats: PokemonStats
  bst: number
  sprite: string
}

/** Items deferred to v2 — roster is Pokémon only for now. */
export type RosterPlayer = {
  pokemonId: number
}

export type Lineup = Record<RosterSlot, RosterPlayer | null>

export type TeamRatings = {
  offense: number
  defense: number
  perimeter: number
  paint: number
  depth: number
  playmaking: number
  bst: number
  slotFits: Partial<Record<RosterSlot, number>>
}

export type ShotType = 'three' | 'mid' | 'paint' | 'transition'

export type PlayEvent = {
  quarter: number
  text: string
  scoreHome: number
  scoreAway: number
}

export type SimResult = {
  homeScore: number
  awayScore: number
  homeWon: boolean
  tied: boolean
  plays: PlayEvent[]
  homeRatings: TeamRatings
  awayRatings: TeamRatings
  seed: number
}

export const STARTER_SLOTS: Position[] = ['PG', 'SG', 'SF', 'PF', 'C']
export const BENCH_SLOTS: BenchSlot[] = ['BENCH1', 'BENCH2']
export const ALL_SLOTS: RosterSlot[] = [...STARTER_SLOTS, ...BENCH_SLOTS]

export const BST_CAP = 3600

export function emptyLineup(): Lineup {
  return {
    PG: null,
    SG: null,
    SF: null,
    PF: null,
    C: null,
    BENCH1: null,
    BENCH2: null,
  }
}

export function slotLabel(slot: RosterSlot): string {
  if (slot === 'BENCH1') return 'Bench 1'
  if (slot === 'BENCH2') return 'Bench 2'
  return slot
}
