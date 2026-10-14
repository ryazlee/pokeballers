import { autoDraftFromPool } from './draft'
import { getPokemon, POKEMON } from './pokemon'
import { hashString, mulberry32 } from './rng'
import { simulateGame, lineupSeed } from './sim'
import {
  ALL_TYPES,
  stadiumFor,
  type PokemonType,
  type Stadium,
} from './terrains'
import {
  ALL_SLOTS,
  BST_CAP,
  CPU_BST_CAP,
  type Lineup,
  type PlayerBox,
  type Pokemon,
  type RosterSlot,
  type SimResult,
} from './types'

export const POOL_SIZE = 25
export const TERRAIN_COUNT = 7

type BstBand = { min: number; max: number }

/**
 * Player pool: wide BST ladder so you can splash elites or stack mid-tier.
 * Cap (3000) still bites if you greed every star.
 */
const PLAYER_TIERS: { count: number; band: BstBand }[] = [
  { count: 4, band: { min: 540, max: 620 } }, // premium stars
  { count: 5, band: { min: 480, max: 535 } }, // high
  { count: 6, band: { min: 420, max: 475 } }, // mid starters
  { count: 5, band: { min: 360, max: 415 } }, // value
  { count: 5, band: { min: 280, max: 355 } }, // deep bargains
]

/**
 * CPU: a half-step above the player ladder — better pieces, not legend soup.
 * Drafts under CPU_BST_CAP (above player cap) so the slate is a real fight.
 */
const CPU_TIERS: { count: number; band: BstBand }[] = [
  { count: 3, band: { min: 520, max: 575 } },
  { count: 5, band: { min: 470, max: 515 } },
  { count: 6, band: { min: 420, max: 465 } },
  { count: 6, band: { min: 360, max: 415 } },
  { count: 5, band: { min: 300, max: 355 } },
]

export function todayKey(d = new Date()): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function pickFromBand(
  rng: () => number,
  band: BstBand,
  exclude: Set<number>,
): Pokemon | null {
  const candidates = POKEMON.filter(
    (p) => !exclude.has(p.id) && p.bst >= band.min && p.bst <= band.max,
  )
  if (candidates.length === 0) return null
  return candidates[Math.floor(rng() * candidates.length)]!
}

function sampleStratifiedPool(
  rng: () => number,
  tiers: { count: number; band: BstBand }[],
  exclude: Set<number>,
): Pokemon[] {
  const picked: Pokemon[] = []
  const used = new Set(exclude)

  for (const tier of tiers) {
    for (let i = 0; i < tier.count; i++) {
      const choice = pickFromBand(rng, tier.band, used)
      if (!choice) break
      used.add(choice.id)
      picked.push(choice)
    }
  }

  // Top up if a band ran dry
  while (picked.length < POOL_SIZE) {
    const fallback = POKEMON.filter((p) => !used.has(p.id) && p.bst >= 280 && p.bst <= 670)
    if (fallback.length === 0) break
    const choice = fallback[Math.floor(rng() * fallback.length)]!
    used.add(choice.id)
    picked.push(choice)
  }

  // Shuffle so tiers aren't visually grouped
  for (let i = picked.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[picked[i], picked[j]] = [picked[j]!, picked[i]!]
  }

  return picked.slice(0, POOL_SIZE)
}

function pickTerrains(rng: () => number, count: number): Stadium[] {
  const types = [...ALL_TYPES]
  // Fisher-Yates
  for (let i = types.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[types[i], types[j]] = [types[j]!, types[i]!]
  }
  return types.slice(0, count).map((t) => stadiumFor(t as PokemonType, rng))
}

export type DailyChallenge = {
  dateKey: string
  seed: number
  playerPool: Pokemon[]
  cpuPool: Pokemon[]
  playerPoolAvgBst: number
  cpuPoolAvgBst: number
  terrains: Stadium[]
  cpuLineup: Lineup
}

function avgBst(list: Pokemon[]): number {
  if (!list.length) return 0
  return Math.round(list.reduce((s, p) => s + p.bst, 0) / list.length)
}

export function buildDailyChallenge(dateKey: string): DailyChallenge {
  const seed = hashString(`pokeballers-daily-v5-${dateKey}`)
  const rng = mulberry32(seed)

  const playerPool = sampleStratifiedPool(rng, PLAYER_TIERS, new Set())
  const exclude = new Set(playerPool.map((p) => p.id))
  const cpuPool = sampleStratifiedPool(rng, CPU_TIERS, exclude)
  const terrains = pickTerrains(rng, TERRAIN_COUNT)
  const cpuLineup = autoDraftFromPool(cpuPool, CPU_BST_CAP)

  return {
    dateKey,
    seed,
    playerPool,
    cpuPool,
    playerPoolAvgBst: avgBst(playerPool),
    cpuPoolAvgBst: avgBst(cpuPool),
    terrains,
    cpuLineup,
  }
}

export type GameMvp = {
  name: string
  side: 'home' | 'away'
  /** e.g. "scored 22 pts" / "had 6 assists" */
  blurb: string
}

export type GauntletGame = {
  stadium: Stadium
  result: SimResult
  margin: number
  outcome: 'W' | 'L' | 'T'
  /** Compact play-by-play for the results dropdown. */
  highlights: string[]
  mvp: GameMvp | null
}

function sampleEvenly<T>(items: T[], count: number): T[] {
  if (items.length <= count) return [...items]
  const out: T[] = []
  for (let i = 0; i < count; i++) {
    const idx = Math.min(
      items.length - 1,
      Math.floor(((i + 0.5) * items.length) / count),
    )
    out.push(items[idx]!)
  }
  return out
}

function periodLabel(quarter: number, clock: string): string {
  if (quarter >= 5) return `OT ${clock}`
  return `Q${quarter} ${clock}`
}

/** Spread highlights across quarters instead of grabbing late-game only. */
function pickHighlights(result: SimResult): string[] {
  const interesting = result.plays.filter(
    (p) =>
      /\(\+\d\)/.test(p.text) ||
      /blocks|scores|boards|tips it back/.test(p.text),
  )
  const pool = interesting.length >= 8 ? interesting : result.plays

  const byQuarter = new Map<number, typeof pool>()
  for (const play of pool) {
    const list = byQuarter.get(play.quarter)
    if (list) list.push(play)
    else byQuarter.set(play.quarter, [play])
  }

  const quarters = [...byQuarter.keys()].sort((a, b) => a - b)
  const target = 8
  const perQuarter = Math.max(1, Math.ceil(target / Math.max(1, quarters.length)))

  const picked: typeof pool = []
  const seen = new Set<typeof pool[number]>()
  for (const q of quarters) {
    for (const play of sampleEvenly(byQuarter.get(q)!, perQuarter)) {
      if (seen.has(play)) continue
      seen.add(play)
      picked.push(play)
    }
  }

  picked.sort((a, b) => {
    if (a.quarter !== b.quarter) return a.quarter - b.quarter
    // Later clock string = earlier in game for countdown; compare as mm:ss desc within Q
    const [am = 0, as = 0] = (a.clock ?? '0:00').split(':').map(Number)
    const [bm = 0, bs = 0] = (b.clock ?? '0:00').split(':').map(Number)
    return bm * 60 + bs - (am * 60 + as)
  })

  return picked.slice(0, target).map((p) => {
    const stamp = periodLabel(p.quarter, p.clock ?? '0:00')
    return `${stamp}  ${p.scoreHome}–${p.scoreAway}  ${p.text}`
  })
}

function boxImpact(b: Pick<PlayerBox, 'points' | 'assists' | 'blocks' | 'rebounds'>): number {
  return b.points + b.assists * 2.8 + b.blocks * 3.6 + b.rebounds * 1.7
}

function mvpBlurb(b: Pick<PlayerBox, 'points' | 'assists' | 'blocks' | 'rebounds'>): string {
  const cats = [
    { n: b.points, w: b.points, label: `${b.points} pts` },
    {
      n: b.assists,
      w: b.assists * 3.2,
      label: `${b.assists} ast`,
    },
    {
      n: b.blocks,
      w: b.blocks * 4.2,
      label: `${b.blocks} blk`,
    },
    {
      n: b.rebounds,
      w: b.rebounds * 2.1,
      label: `${b.rebounds} reb`,
    },
  ]
    .filter((c) => c.n > 0)
    .sort((a, b) => b.w - a.w)

  return cats[0]?.label ?? `${b.points} pts`
}

/** Pick a standout player from the box score and their best line. */
export function pickMvp(result: SimResult): GameMvp | null {
  const boxes = result.boxScore ?? []
  if (boxes.length === 0) return null

  let best = boxes[0]!
  let bestVal = -1
  for (const b of boxes) {
    const val = boxImpact(b)
    if (val > bestVal) {
      bestVal = val
      best = b
    }
  }
  if (bestVal <= 0) return null

  return {
    name: best.name,
    side: best.side,
    blurb: mvpBlurb(best),
  }
}

export type SlateBoxLine = PlayerBox & {
  games: number
  slot: RosterSlot | null
  /**
   * Share of slot production vs the CPU at the same spot (0–100).
   * 50 = even; higher = you won the matchup.
   */
  matchupPct: number | null
}

function slotLabel(slot: RosterSlot | null): string {
  if (!slot) return '—'
  if (slot === 'BENCH1') return 'B1'
  if (slot === 'BENCH2') return 'B2'
  return slot
}

export function formatSlotLabel(slot: RosterSlot | null): string {
  return slotLabel(slot)
}

function slotForPokemon(lineup: Lineup | undefined, pokemonId: number): RosterSlot | null {
  if (!lineup) return null
  for (const slot of ALL_SLOTS) {
    if (lineup[slot]?.pokemonId === pokemonId) return slot
  }
  return null
}

type AggBox = PlayerBox & { games: number }

function aggregateSide(
  games: GauntletGame[],
  side: 'home' | 'away',
): Map<number, AggBox> {
  const totals = new Map<number, AggBox>()
  for (const g of games) {
    for (const b of g.result.boxScore ?? []) {
      if (b.side !== side) continue
      const prev = totals.get(b.pokemonId)
      if (prev) {
        prev.points += b.points
        prev.assists += b.assists
        prev.blocks += b.blocks
        prev.rebounds += b.rebounds
        prev.games += 1
      } else {
        totals.set(b.pokemonId, { ...b, games: 1 })
      }
    }
  }
  return totals
}

function matchupPercent(you: number, cpu: number): number {
  const sum = you + cpu
  if (sum <= 0) return 50
  return Math.round((100 * you) / sum)
}

/** Aggregate your (home) box scores across the slate. */
export function aggregateHomeBox(
  games: GauntletGame[],
  lineup?: Lineup,
  cpuLineup?: Lineup,
): SlateBoxLine[] {
  const home = aggregateSide(games, 'home')
  const away = aggregateSide(games, 'away')

  const cpuBySlot = new Map<RosterSlot, AggBox>()
  if (cpuLineup) {
    for (const slot of ALL_SLOTS) {
      const id = cpuLineup[slot]?.pokemonId
      if (id == null) continue
      const row = away.get(id)
      if (row) cpuBySlot.set(slot, row)
    }
  }

  const rows: SlateBoxLine[] = []
  for (const row of home.values()) {
    const slot = slotForPokemon(lineup, row.pokemonId)
    const cpu = slot ? cpuBySlot.get(slot) : undefined
    const matchupPct =
      cpu != null
        ? matchupPercent(boxImpact(row), boxImpact(cpu))
        : null
    rows.push({ ...row, slot, matchupPct })
  }

  if (lineup) {
    const order = new Map(ALL_SLOTS.map((s, i) => [s, i]))
    rows.sort(
      (a, b) =>
        (a.slot ? (order.get(a.slot) ?? 99) : 99) -
        (b.slot ? (order.get(b.slot) ?? 99) : 99),
    )
  } else {
    rows.sort((a, b) => boxImpact(b) - boxImpact(a))
  }
  return rows
}

/** Best home player across the 7-game slate (totals). */
export function pickSlateMvp(games: GauntletGame[]): GameMvp | null {
  const rows = aggregateHomeBox(games)
  const best = [...rows].sort((a, b) => boxImpact(b) - boxImpact(a))[0]
  if (!best || boxImpact(best) <= 0) return null

  return {
    name: best.name,
    side: 'home',
    blurb: mvpBlurb(best),
  }
}

export type GauntletResult = {
  dateKey: string
  games: GauntletGame[]
  wins: number
  losses: number
  ties: number
  /** Primary score: wins*100 + total point differential. */
  score: number
  pointDiff: number
  winningRecord: boolean
  /** Your best player across the slate. */
  slateMvp: GameMvp | null
}

/** Score rewards winning a lot and by a lot. */
export function scoreGauntlet(games: GauntletGame[]): {
  wins: number
  losses: number
  ties: number
  pointDiff: number
  score: number
  winningRecord: boolean
} {
  let wins = 0
  let losses = 0
  let ties = 0
  let pointDiff = 0
  for (const g of games) {
    pointDiff += g.margin
    if (g.outcome === 'W') wins++
    else if (g.outcome === 'L') losses++
    else ties++
  }
  const score = wins * 100 + pointDiff
  return {
    wins,
    losses,
    ties,
    pointDiff,
    score,
    winningRecord: wins > losses,
  }
}

export function runGauntlet(
  dateKey: string,
  homeLineup: Lineup,
  challenge: DailyChallenge,
): GauntletResult {
  const games: GauntletGame[] = []
  const base = challenge.seed ^ lineupSeed(homeLineup, dateKey)

  for (let i = 0; i < challenge.terrains.length; i++) {
    const stadium = challenge.terrains[i]!
    const result = simulateGame(homeLineup, challenge.cpuLineup, {
      homeName: 'You',
      awayName: 'CPU',
      seed: (base ^ hashString(stadium.id) ^ (i * 9973)) >>> 0,
      stadium,
    })
    const margin = result.homeScore - result.awayScore
    const outcome: 'W' | 'L' | 'T' = result.tied ? 'T' : result.homeWon ? 'W' : 'L'
    games.push({
      stadium,
      result: { ...result, plays: [] },
      margin,
      outcome,
      highlights: pickHighlights(result),
      mvp: pickMvp(result),
    })
  }

  const tallied = scoreGauntlet(games)
  return { dateKey, games, ...tallied, slateMvp: pickSlateMvp(games) }
}

const SHARE_URL = 'https://ryazlee.github.io/pokeballers/'

function shareHeadline(result: GauntletResult): string {
  const { wins, losses, ties } = result
  if (wins === 7) return 'Clean sweep'
  if (wins === 6) return 'Almost perfect'
  if (wins >= 5) return 'Strong slate'
  if (wins > losses) return 'Winning record'
  if (wins === losses && ties === 0) return 'Split decision'
  if (wins === 0) return 'Tough night'
  return 'Battle tested'
}

export type ShareOptions = {
  showTeam?: boolean
  lineup?: Lineup
}

function formatTeamLines(lineup: Lineup): string[] {
  return ALL_SLOTS.map((slot) => {
    const entry = lineup[slot]
    const p = entry ? getPokemon(entry.pokemonId) : null
    const short =
      slot === 'BENCH1' ? 'B1' : slot === 'BENCH2' ? 'B2' : slot
    return `${short} ${p?.name ?? '—'}`
  })
}

export function formatGauntletShare(
  result: GauntletResult,
  options: ShareOptions = {},
): string {
  const { showTeam = false, lineup } = options
  const record = `${result.wins}-${result.losses}${result.ties ? `-${result.ties}` : ''}`
  const diff = result.pointDiff >= 0 ? `+${result.pointDiff}` : `${result.pointDiff}`

  const lines = [
    `Pokeballers Daily`,
    result.dateKey,
    `${shareHeadline(result)} · ${record} · ${result.score} (${diff})`,
  ]

  if (result.slateMvp) {
    lines.push(`MVP ${result.slateMvp.name} · ${result.slateMvp.blurb}`)
  }

  lines.push('')

  result.games.forEach((g) => {
    const mark = g.outcome === 'W' ? '🟩' : g.outcome === 'T' ? '⬛' : '🟥'
    lines.push(
      `${mark} ${g.result.homeScore}–${g.result.awayScore} ${g.stadium.name}`,
    )
  })

  if (showTeam && lineup) {
    lines.push('', ...formatTeamLines(lineup))
  }

  lines.push('', SHARE_URL)
  return lines.join('\n')
}

/** Sandbox helper: randomish CPU under cap (no dual-pool). */
export function buildSandboxCpu(salt: string): Lineup {
  const rng = mulberry32(hashString(`sandbox-cpu-${salt}`))
  const pool = sampleStratifiedPool(rng, PLAYER_TIERS, new Set())
  return autoDraftFromPool(pool, BST_CAP)
}
