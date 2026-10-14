import { POKEMON } from './pokemon'
import { rateTeam } from './ratings'
import { hashString, mulberry32, pickWeighted } from './rng'
import {
  BST_CAP,
  emptyLineup,
  STARTER_SLOTS,
  type Lineup,
  type Position,
  type Pokemon,
} from './types'

export type DailyModifier = {
  id: string
  label: string
  description: string
  awayDefenseMult: number
}

const MODIFIERS: DailyModifier[] = [
  {
    id: 'lockdown',
    label: 'Lockdown Defense',
    description: 'Today’s boss contests everything harder on the perimeter.',
    awayDefenseMult: 1.12,
  },
  {
    id: 'paint-pack',
    label: 'Paint Pack',
    description: 'Interior defense is stacked — drives and posts suffer.',
    awayDefenseMult: 1.08,
  },
  {
    id: 'pace-up',
    label: 'Up-Tempo',
    description: 'A speedy boss that lives in transition.',
    awayDefenseMult: 1.0,
  },
  {
    id: 'grind',
    label: 'Half-Court Grind',
    description: 'Slow, physical basketball. Every possession is a fight.',
    awayDefenseMult: 1.06,
  },
]

export function todayKey(d = new Date()): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function poolForRole(): Pokemon[] {
  // Prefer BST bands that fit the role without blowing the cap
  return POKEMON.filter((p) => p.bst >= 400 && p.bst <= 600)
}

function scoreForBoss(p: Pokemon, position: Position): number {
  const s = p.stats
  if (position === 'PG') return s.spe * 1.4 + s.spa * 1.2
  if (position === 'SG') return s.spa * 1.4 + s.spe * 1.1 + s.atk
  if (position === 'SF') return s.atk + s.spa + s.spe + s.spd
  if (position === 'PF') return s.atk * 1.3 + s.def * 1.2 + s.hp
  return s.def * 1.4 + s.hp * 1.1 + s.spd + p.height * 2
}

export function buildDailyBoss(dateKey: string, cap = BST_CAP): {
  lineup: Lineup
  modifier: DailyModifier
  seed: number
} {
  const seed = hashString(`pokeballers-daily-${dateKey}`)
  const rng = mulberry32(seed)
  const modifier = MODIFIERS[Math.floor(rng() * MODIFIERS.length)]!

  const lineup = emptyLineup()
  let used = 0
  const usedIds = new Set<number>()

  for (const slot of STARTER_SLOTS) {
    const remainingSlots = 7 - [...usedIds].length
    const budgetLeft = cap - used
    const softMax = Math.floor(budgetLeft / Math.max(1, remainingSlots)) + 40

    const candidates = poolForRole()
      .filter((p) => !usedIds.has(p.id) && p.bst <= softMax + 80)
      .map((p) => ({
        item: p,
        weight: Math.max(1, scoreForBoss(p, slot) + (rng() - 0.5) * 40),
      }))

    const pick =
      candidates.length > 0
        ? pickWeighted(rng, candidates)
        : POKEMON[Math.floor(rng() * POKEMON.length)]!

    lineup[slot] = { pokemonId: pick.id }
    usedIds.add(pick.id)
    used += pick.bst
  }

  for (const bench of ['BENCH1', 'BENCH2'] as const) {
    const budgetLeft = cap - used
    const candidates = POKEMON.filter(
      (p) => !usedIds.has(p.id) && p.bst >= 380 && p.bst <= Math.min(580, budgetLeft),
    )
    if (candidates.length === 0) continue
    const pick = candidates[Math.floor(rng() * candidates.length)]!
    lineup[bench] = { pokemonId: pick.id }
    usedIds.add(pick.id)
    used += pick.bst
  }

  // If somehow over cap, strip bench
  while (rateTeam(lineup).bst > cap) {
    if (lineup.BENCH2) {
      lineup.BENCH2 = null
      continue
    }
    if (lineup.BENCH1) {
      lineup.BENCH1 = null
      continue
    }
    break
  }

  return { lineup, modifier, seed }
}

export function formatShareCard(args: {
  dateKey: string
  homeScore: number
  awayScore: number
  won: boolean
  tied: boolean
  offense: number
  defense: number
}): string {
  const result = args.tied ? 'T' : args.won ? 'W' : 'L'
  const blocks = args.won ? '🟩🟩🟩' : args.tied ? '🟨🟨⬜' : '🟥⬜⬜'
  return [
    `Pokeballers ${args.dateKey}`,
    `${args.homeScore}-${args.awayScore} ${result}`,
    `OFF ${args.offense} DEF ${args.defense}`,
    `🏀${blocks}`,
  ].join('\n')
}
