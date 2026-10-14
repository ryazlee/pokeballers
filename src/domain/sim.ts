import { getPokemon } from './pokemon'
import { rateTeam } from './ratings'
import { hashString, mulberry32, pickWeighted } from './rng'
import { SIM } from './weights'
import {
  STARTER_SLOTS,
  type Lineup,
  type PlayEvent,
  type Pokemon,
  type Position,
  type ShotType,
  type SimResult,
  type TeamRatings,
} from './types'

type OnCourt = {
  slot: Position
  pokemon: Pokemon
  stamina: number
}

type Side = {
  name: string
  lineup: Lineup
  ratings: TeamRatings
  onCourt: OnCourt[]
  bench: Pokemon[]
  score: number
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n))
}

function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x / 18))
}

function buildOnCourt(lineup: Lineup): { onCourt: OnCourt[]; bench: Pokemon[] } {
  const onCourt: OnCourt[] = []
  for (const slot of STARTER_SLOTS) {
    const entry = lineup[slot]
    if (!entry) continue
    const pokemon = getPokemon(entry.pokemonId)
    if (!pokemon) continue
    onCourt.push({ slot, pokemon, stamina: 100 })
  }
  const bench: Pokemon[] = []
  for (const slot of ['BENCH1', 'BENCH2'] as const) {
    const entry = lineup[slot]
    if (!entry) continue
    const pokemon = getPokemon(entry.pokemonId)
    if (pokemon) bench.push(pokemon)
  }
  return { onCourt, bench }
}

function shotWeights(offense: OnCourt[], ratings: TeamRatings): { item: ShotType; weight: number }[] {
  const spa = avg(offense.map((o) => o.pokemon.stats.spa))
  const atk = avg(offense.map((o) => o.pokemon.stats.atk))
  const spe = avg(offense.map((o) => o.pokemon.stats.spe))
  return [
    { item: 'three', weight: spa * 1.2 + ratings.perimeter * 0.4 },
    { item: 'mid', weight: (spa + atk) * 0.7 },
    { item: 'paint', weight: atk * 1.2 + ratings.paint * 0.5 },
    { item: 'transition', weight: spe * 1.3 + ratings.playmaking * 0.3 },
  ]
}

function avg(nums: number[]): number {
  if (!nums.length) return 50
  return nums.reduce((a, b) => a + b, 0) / nums.length
}

function pickShooter(rng: () => number, offense: OnCourt[], shot: ShotType): OnCourt {
  return pickWeighted(
    rng,
    offense.map((o) => {
      const s = o.pokemon.stats
      let weight = 1
      if (shot === 'three') weight = s.spa * 1.4 + s.spe * 0.5
      else if (shot === 'mid') weight = s.spa * 0.8 + s.atk * 0.8
      else if (shot === 'paint') weight = s.atk * 1.3 + s.def * 0.4
      else weight = s.spe * 1.4 + s.atk * 0.6
      if (o.slot === 'PG') weight *= 1.15
      weight *= 0.5 + o.stamina / 200
      return { item: o, weight }
    }),
  )
}

function defenderFor(defense: OnCourt[], shooter: OnCourt, rng: () => number): OnCourt {
  const same = defense.find((d) => d.slot === shooter.slot)
  if (same && rng() < 0.7) return same
  return pickWeighted(
    rng,
    defense.map((d) => ({
      item: d,
      weight: d.pokemon.stats.spd + d.pokemon.stats.spe * 0.5 + d.stamina * 0.2,
    })),
  )
}

function offenseStat(shooter: OnCourt, shot: ShotType): number {
  const s = shooter.pokemon.stats
  if (shot === 'three') return s.spa
  if (shot === 'mid') return (s.spa + s.atk) / 2
  if (shot === 'paint') return s.atk + shooter.pokemon.weight / 80
  return s.spe * 0.7 + s.atk * 0.5
}

function defenseStat(defender: OnCourt, shot: ShotType): number {
  const s = defender.pokemon.stats
  if (shot === 'three' || shot === 'mid' || shot === 'transition') {
    return s.spd * 0.9 + s.spe * 0.7
  }
  return s.def * 1.1 + defender.pokemon.height * 2 + s.hp * 0.15
}

function baseMake(shot: ShotType): number {
  if (shot === 'three') return SIM.threeBase
  if (shot === 'mid') return SIM.midBase
  if (shot === 'paint') return SIM.paintBase
  return SIM.transitionBase
}

function pointsFor(shot: ShotType): number {
  return shot === 'three' ? 3 : 2
}

function shotLabel(shot: ShotType): string {
  if (shot === 'three') return 'three'
  if (shot === 'mid') return 'mid-range jumper'
  if (shot === 'paint') return 'paint finish'
  return 'transition layup'
}

function drainStamina(side: Side): void {
  for (const o of side.onCourt) {
    o.stamina = clamp(o.stamina - SIM.staminaDrain * (0.7 + (100 - o.pokemon.stats.hp) / 200), 0, 100)
  }
}

function maybeSub(side: Side, rng: () => number): string | null {
  if (side.bench.length === 0) return null
  const tired = [...side.onCourt].sort((a, b) => a.stamina - b.stamina)[0]
  if (!tired || tired.stamina > 45) return null
  if (rng() > 0.55) return null

  const incoming = side.bench.shift()!
  const outgoing = tired.pokemon
  tired.pokemon = incoming
  tired.stamina = 88
  side.bench.push(outgoing)
  return `${incoming.name} checks in for ${outgoing.name} (${tired.slot})`
}

function reboundWinner(
  rng: () => number,
  offense: OnCourt[],
  defense: OnCourt[],
): 'offense' | 'defense' {
  const offBulk = avg(
    offense.map(
      (o) =>
        o.pokemon.stats.hp * SIM.reboundBulkWeight +
        o.pokemon.stats.def * 0.4 +
        o.pokemon.weight / 40,
    ),
  )
  const defBulk = avg(
    defense.map(
      (o) =>
        o.pokemon.stats.hp * SIM.reboundBulkWeight +
        o.pokemon.stats.def * 0.5 +
        o.pokemon.weight / 35,
    ),
  )
  const offSpe = avg(offense.map((o) => o.pokemon.stats.spe)) * SIM.reboundSpeWeight
  const chance = sigmoid(offBulk + offSpe - defBulk)
  return rng() < chance * 0.35 ? 'offense' : 'defense'
}

export function lineupSeed(lineup: Lineup, salt = ''): number {
  const parts = STARTER_SLOTS.map((s) => lineup[s]?.pokemonId ?? 0)
  const bench = [lineup.BENCH1?.pokemonId ?? 0, lineup.BENCH2?.pokemonId ?? 0]
  return hashString(`${parts.join('-')}|${bench.join('-')}|${salt}`)
}

export type SimOptions = {
  homeName?: string
  awayName?: string
  seed?: number
  /** Away defense multiplier (daily modifiers). */
  awayDefenseMult?: number
  homeDefenseMult?: number
}

export function simulateGame(
  homeLineup: Lineup,
  awayLineup: Lineup,
  options: SimOptions = {},
): SimResult {
  const seed = options.seed ?? (Date.now() >>> 0)
  const rng = mulberry32(seed)

  const homeBuilt = buildOnCourt(homeLineup)
  const awayBuilt = buildOnCourt(awayLineup)
  const homeRatings = rateTeam(homeLineup)
  const awayRatings = rateTeam(awayLineup)

  const home: Side = {
    name: options.homeName ?? 'You',
    lineup: homeLineup,
    ratings: homeRatings,
    onCourt: homeBuilt.onCourt,
    bench: homeBuilt.bench,
    score: 0,
  }
  const away: Side = {
    name: options.awayName ?? 'CPU',
    lineup: awayLineup,
    ratings: awayRatings,
    onCourt: awayBuilt.onCourt,
    bench: awayBuilt.bench,
    score: 0,
  }

  const plays: PlayEvent[] = []
  let possession: 'home' | 'away' = rng() < 0.5 ? 'home' : 'away'

  for (let i = 0; i < SIM.possessions; i++) {
    const quarter = clamp(Math.floor((i / SIM.possessions) * 4) + 1, 1, 4)
    const offense = possession === 'home' ? home : away
    const defense = possession === 'home' ? away : home
    const defMult =
      possession === 'home'
        ? (options.awayDefenseMult ?? 1)
        : (options.homeDefenseMult ?? 1)

    if (i > 0 && i % SIM.subEvery === 0) {
      const subH = maybeSub(home, rng)
      const subA = maybeSub(away, rng)
      if (subH) {
        plays.push({
          quarter,
          text: `${home.name}: ${subH}`,
          scoreHome: home.score,
          scoreAway: away.score,
        })
      }
      if (subA) {
        plays.push({
          quarter,
          text: `${away.name}: ${subA}`,
          scoreHome: home.score,
          scoreAway: away.score,
        })
      }
    }

    const shot = pickWeighted(rng, shotWeights(offense.onCourt, offense.ratings))
    const shooter = pickShooter(rng, offense.onCourt, shot)
    const defender = defenderFor(defense.onCourt, shooter, rng)

    const off = offenseStat(shooter, shot) + offense.ratings.playmaking * 0.08
    const def =
      defenseStat(defender, shot) * defMult + defense.ratings.defense * 0.12
    const noise = (rng() - 0.5) * 2 * SIM.noiseScale
    const makeChance = clamp(
      baseMake(shot) + (sigmoid(off - def + noise) - 0.5) * 0.55,
      SIM.makeClamp.min,
      SIM.makeClamp.max,
    )

    const made = rng() < makeChance
    let text: string

    if (made) {
      const pts = pointsFor(shot)
      offense.score += pts
      text = `${shooter.pokemon.name} hits a ${shotLabel(shot)} over ${defender.pokemon.name} (+${pts})`
      possession = possession === 'home' ? 'away' : 'home'
    } else {
      const board = reboundWinner(rng, offense.onCourt, defense.onCourt)
      if (board === 'offense') {
        text = `${shooter.pokemon.name} misses the ${shotLabel(shot)} — offensive rebound!`
        // keep possession
      } else {
        const rebounder = pickWeighted(
          rng,
          defense.onCourt.map((d) => ({
            item: d,
            weight: d.pokemon.stats.hp + d.pokemon.stats.def + d.pokemon.weight / 30,
          })),
        )
        text = `${shooter.pokemon.name} misses — ${rebounder.pokemon.name} boards it`
        possession = possession === 'home' ? 'away' : 'home'
      }
    }

    plays.push({
      quarter,
      text: `Q${quarter} ${offense.name}: ${text}`,
      scoreHome: home.score,
      scoreAway: away.score,
    })

    drainStamina(home)
    drainStamina(away)
  }

  // Light OT if tied
  let ot = 0
  while (home.score === away.score && ot < 20) {
    ot++
    const offense = ot % 2 === 1 ? home : away
    const shot: ShotType = pickWeighted(rng, [
      { item: 'three', weight: 1 },
      { item: 'paint', weight: 1.2 },
      { item: 'mid', weight: 0.8 },
    ])
    const shooter = pickShooter(rng, offense.onCourt, shot)
    if (rng() < 0.45) {
      offense.score += pointsFor(shot)
      plays.push({
        quarter: 5,
        text: `OT ${offense.name}: ${shooter.pokemon.name} scores in overtime`,
        scoreHome: home.score,
        scoreAway: away.score,
      })
    }
  }

  const tied = home.score === away.score
  return {
    homeScore: home.score,
    awayScore: away.score,
    homeWon: home.score > away.score,
    tied,
    plays,
    homeRatings,
    awayRatings,
    seed,
  }
}
