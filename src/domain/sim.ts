import {
  enduranceGrade,
  staminaDrainMult,
  subStaminaThreshold,
} from './endurance'
import { getPokemon } from './pokemon'
import { positionFit, rateTeam } from './ratings'
import { hashString, mulberry32, pickWeighted } from './rng'
import {
  effectiveStat,
  hasTypeBoost,
  shotModifierMult,
  type Stadium,
} from './terrains'
import {
  offensiveTypeEdge,
  stadiumAffinityMult,
  typeEdgeTag,
} from './typeChart'
import { POSITION_SHOT_BIAS, SIM } from './weights'
import {
  ALL_SLOTS,
  STARTER_SLOTS,
  type Lineup,
  type PlayEvent,
  type PlayerBox,
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

const QUARTER_SECONDS = 12 * 60

/** Map possession index → quarter + countdown clock (12:00 → 0:00). */
function periodClock(
  possessionIndex: number,
  totalPossessions: number,
): { quarter: number; clock: string } {
  const quarter = clamp(
    Math.floor((possessionIndex / totalPossessions) * 4) + 1,
    1,
    4,
  )
  const qStart = Math.floor(((quarter - 1) / 4) * totalPossessions)
  const qEnd = Math.floor((quarter / 4) * totalPossessions)
  const qLen = Math.max(1, qEnd - qStart)
  const within = possessionIndex - qStart
  const remaining = Math.max(
    0,
    Math.round(QUARTER_SECONDS * (1 - (within + 0.5) / qLen)),
  )
  const m = Math.floor(remaining / 60)
  const s = remaining % 60
  return { quarter, clock: `${m}:${String(s).padStart(2, '0')}` }
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

function fitMult(player: OnCourt): number {
  const fit = positionFit(player.pokemon, player.slot)
  const t = (fit - 1) / 98
  return SIM.fitMultMin + t * (SIM.fitMultMax - SIM.fitMultMin)
}

function shotWeights(offense: OnCourt[], ratings: TeamRatings): { item: ShotType; weight: number }[] {
  const spa = avg(offense.map((o) => o.pokemon.stats.spa))
  const atk = avg(offense.map((o) => o.pokemon.stats.atk))
  const spe = avg(offense.map((o) => o.pokemon.stats.spe))
  const bias = { three: 0, mid: 0, paint: 0, transition: 0 }
  for (const o of offense) {
    const b = POSITION_SHOT_BIAS[o.slot]
    const fit = fitMult(o)
    bias.three += b.three * fit
    bias.mid += b.mid * fit
    bias.paint += b.paint * fit
    bias.transition += b.transition * fit
  }
  const n = Math.max(1, offense.length)
  return [
    { item: 'three', weight: (spa * 1.2 + ratings.perimeter * 0.4) * (bias.three / n) },
    { item: 'mid', weight: (spa + atk) * 0.7 * (bias.mid / n) },
    { item: 'paint', weight: (atk * 1.2 + ratings.paint * 0.5) * (bias.paint / n) },
    { item: 'transition', weight: (spe * 1.3 + ratings.playmaking * 0.3) * (bias.transition / n) },
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
      weight *= POSITION_SHOT_BIAS[o.slot][shot]
      weight *= fitMult(o)
      if (o.slot === 'PG') weight *= 1.2
      weight *= 0.5 + o.stamina / 200
      return { item: o, weight }
    }),
  )
}

function defenderFor(defense: OnCourt[], shooter: OnCourt, rng: () => number): OnCourt {
  const same = defense.find((d) => d.slot === shooter.slot)
  if (same && rng() < 0.75) return same
  return pickWeighted(
    rng,
    defense.map((d) => ({
      item: d,
      weight:
        (d.pokemon.stats.spd + d.pokemon.stats.spe * 0.5 + d.stamina * 0.2) *
        fitMult(d) *
        (d.slot === shooter.slot ? 1.35 : 1),
    })),
  )
}

function terrainMult(pokemon: Pokemon, stadium?: Stadium): number {
  if (!stadium) return 1
  return stadiumAffinityMult(pokemon.types, stadium)
}

function eff(
  pokemon: Pokemon,
  stat: 'hp' | 'atk' | 'def' | 'spa' | 'spd' | 'spe',
  stadium?: Stadium,
): number {
  return effectiveStat(pokemon.stats[stat], stat, pokemon.types, stadium)
}

/** Live form from remaining stamina — gassed legs finish and defend worse. */
function liveForm(player: OnCourt): number {
  // 100 → ~1.0; 50 → ~0.76; 25 → ~0.58; 0 → 0.42
  return clamp(0.42 + player.stamina / 170, 0.42, 1.0)
}

/**
 * Thin rotations collapse as a unit once the floor gets tired.
 * High-endurance starters soften it; glass-cannon benches get punished.
 */
function rotationForm(side: Side): number {
  const benchSize = side.bench.length
  if (benchSize >= 2) return 1

  const avgSta = avg(side.onCourt.map((o) => o.stamina))
  const avgEnd = avg(side.onCourt.map((o) => enduranceGrade(o.pokemon)))
  const endShield = avgEnd / 140

  if (benchSize === 1) {
    if (avgSta >= 64) return 1
    // Down to ~0.80 for a gassed low-endurance five with one seat
    return clamp(0.8 + (avgSta / 64) * 0.12 + endShield * 0.08, 0.8, 1)
  }

  // Empty bench
  if (avgSta >= 72) return 1
  return clamp(0.7 + (avgSta / 72) * 0.16 + endShield * 0.1, 0.7, 1)
}

function offenseStat(shooter: OnCourt, shot: ShotType, stadium?: Stadium): number {
  const p = shooter.pokemon
  const typeMult = terrainMult(p, stadium)
  const shotMult = shotModifierMult(shot, stadium)
  const posMult = fitMult(shooter) * (0.85 + 0.15 * POSITION_SHOT_BIAS[shooter.slot][shot])
  let raw: number
  if (shot === 'three') raw = eff(p, 'spa', stadium)
  else if (shot === 'mid') raw = (eff(p, 'spa', stadium) + eff(p, 'atk', stadium)) / 2
  else if (shot === 'paint') raw = eff(p, 'atk', stadium) + p.weight / 80
  else raw = eff(p, 'spe', stadium) * 0.7 + eff(p, 'atk', stadium) * 0.5
  return raw * typeMult * shotMult * posMult * liveForm(shooter)
}

function defenseStat(defender: OnCourt, shot: ShotType, stadium?: Stadium): number {
  const p = defender.pokemon
  const typeMult = terrainMult(p, stadium)
  const posMult = fitMult(defender)
  let raw: number
  if (shot === 'three' || shot === 'mid' || shot === 'transition') {
    raw = eff(p, 'spd', stadium) * 0.9 + eff(p, 'spe', stadium) * 0.7
  } else {
    raw = eff(p, 'def', stadium) * 1.1 + p.height * 2 + eff(p, 'hp', stadium) * 0.15
  }
  return raw * typeMult * posMult * liveForm(defender)
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
  const benchSize = side.bench.length
  // One seat still works, but minutes stack — empty bench is brutal.
  const rotationTax = benchSize === 0 ? 1.48 : benchSize === 1 ? 1.3 : 1
  for (const o of side.onCourt) {
    const end = enduranceGrade(o.pokemon)
    let drain = SIM.staminaDrain * staminaDrainMult(o.pokemon) * rotationTax
    // Cooked + thin rotation: low-endurance players fall off a cliff.
    if (benchSize <= 1 && o.stamina <= subStaminaThreshold(o.pokemon)) {
      const thin = benchSize === 0 ? 1.35 : 1.18
      const glass = 1 + (100 - end) / 220
      drain *= thin * glass
    }
    o.stamina = clamp(o.stamina - drain, 0, 100)
  }
}

function maybeSub(side: Side, rng: () => number): string | null {
  if (side.bench.length === 0) return null

  // Prefer the most gassed player who has crossed their endurance threshold
  const candidates = side.onCourt
    .filter((o) => o.stamina <= subStaminaThreshold(o.pokemon))
    .sort((a, b) => a.stamina - b.stamina)
  const tired = candidates[0]
  if (!tired) return null

  // Low endurance + low remaining stamina → more likely to actually sub
  const end = enduranceGrade(tired.pokemon)
  const urgency = (subStaminaThreshold(tired.pokemon) - tired.stamina) / 40
  const subChance = clamp(0.28 + (100 - end) / 220 + urgency * 0.45, 0.2, 0.92)
  if (rng() > subChance) return null

  // Prefer a fresher, higher-endurance bench piece when possible
  const rankedBench = [...side.bench].sort(
    (a, b) => enduranceGrade(b) - enduranceGrade(a),
  )
  const incoming = rankedBench[0]!
  const benchIdx = side.bench.findIndex((p) => p.id === incoming.id)
  if (benchIdx >= 0) side.bench.splice(benchIdx, 1)

  const outgoing = tired.pokemon
  tired.pokemon = incoming
  // One-man bench = incomplete rest when you check back in.
  tired.stamina =
    side.bench.length === 0 ? SIM.subInStaminaThin : SIM.subInStamina
  side.bench.push(outgoing)
  return `${incoming.name} checks in for ${outgoing.name} (${tired.slot}) · End ${end}`
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
  /** Away defense multiplier (legacy / modifiers). */
  awayDefenseMult?: number
  homeDefenseMult?: number
  /** Type stadium — matching types get a stat boost. */
  stadium?: Stadium
}

function initBoxScore(lineup: Lineup, side: 'home' | 'away'): Map<number, PlayerBox> {
  const map = new Map<number, PlayerBox>()
  for (const slot of ALL_SLOTS) {
    const entry = lineup[slot]
    if (!entry) continue
    const p = getPokemon(entry.pokemonId)
    if (!p || map.has(p.id)) continue
    map.set(p.id, {
      pokemonId: p.id,
      name: p.name,
      side,
      points: 0,
      assists: 0,
      blocks: 0,
      rebounds: 0,
    })
  }
  return map
}

function bump(
  boxes: Map<number, PlayerBox>,
  pokemonId: number,
  key: 'points' | 'assists' | 'blocks' | 'rebounds',
  n = 1,
): void {
  const row = boxes.get(pokemonId)
  if (row) row[key] += n
}

function pickPasser(
  rng: () => number,
  offense: OnCourt[],
  shooter: OnCourt,
): OnCourt | null {
  const others = offense.filter((o) => o.pokemon.id !== shooter.pokemon.id)
  if (others.length === 0 || rng() > 0.58) return null
  return pickWeighted(
    rng,
    others.map((o) => {
      const s = o.pokemon.stats
      let weight = s.atk * 1.1 + s.spe * 0.9 + s.spa * 0.4
      if (o.slot === 'PG') weight *= 1.45
      if (o.slot === 'SG' || o.slot === 'SF') weight *= 1.1
      weight *= 0.55 + o.stamina / 220
      return { item: o, weight }
    }),
  )
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

  const homeBox = initBoxScore(homeLineup, 'home')
  const awayBox = initBoxScore(awayLineup, 'away')
  const boxFor = (side: Side) => (side === home ? homeBox : awayBox)

  const plays: PlayEvent[] = []
  let possession: 'home' | 'away' = rng() < 0.5 ? 'home' : 'away'

  for (let i = 0; i < SIM.possessions; i++) {
    const { quarter, clock } = periodClock(i, SIM.possessions)
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
          clock,
          text: `${home.name}: ${subH}`,
          scoreHome: home.score,
          scoreAway: away.score,
        })
      }
      if (subA) {
        plays.push({
          quarter,
          clock,
          text: `${away.name}: ${subA}`,
          scoreHome: home.score,
          scoreAway: away.score,
        })
      }
    }

    const shot = pickWeighted(rng, shotWeights(offense.onCourt, offense.ratings))
    const shooter = pickShooter(rng, offense.onCourt, shot)
    const defender = defenderFor(defense.onCourt, shooter, rng)

    const stadium = options.stadium
    const offForm = rotationForm(offense)
    const defForm = rotationForm(defense)
    const typeEdge = offensiveTypeEdge(
      shooter.pokemon.types,
      defender.pokemon.types,
    )
    const off =
      offenseStat(shooter, shot, stadium) * offForm * typeEdge +
      offense.ratings.playmaking * 0.08
    const def =
      defenseStat(defender, shot, stadium) * defMult * defForm +
      defense.ratings.defense * 0.12
    const noise = (rng() - 0.5) * 2 * SIM.noiseScale
    const makeChance = clamp(
      baseMake(shot) + (sigmoid(off - def + noise) - 0.5) * 0.55,
      SIM.makeClamp.min,
      SIM.makeClamp.max,
    )

    const made = rng() < makeChance
    let text: string
    const boosted =
      stadium &&
      (hasTypeBoost(shooter.pokemon.types, stadium) ||
        stadium.modifiers.some((m) => m.kind === 'shot' && m.shot === shot))
        ? ' ⚡'
        : ''
    const matchupTag = typeEdgeTag(typeEdge)

    if (made) {
      const pts = pointsFor(shot)
      offense.score += pts
      bump(boxFor(offense), shooter.pokemon.id, 'points', pts)
      const passer = pickPasser(rng, offense.onCourt, shooter)
      if (passer) {
        bump(boxFor(offense), passer.pokemon.id, 'assists')
        text = `${shooter.pokemon.name}${boosted} hits a ${shotLabel(shot)} over ${defender.pokemon.name} (+${pts}) · assist ${passer.pokemon.name}${matchupTag}`
      } else {
        text = `${shooter.pokemon.name}${boosted} hits a ${shotLabel(shot)} over ${defender.pokemon.name} (+${pts})${matchupTag}`
      }
      possession = possession === 'home' ? 'away' : 'home'
    } else {
      // Resisted looks get blocked a bit more; type edges finish cleaner.
      const resistBlock = typeEdge < 1 ? 1 + (1 - typeEdge) * 0.55 : 1
      const blockChance = clamp(
        (0.1 +
          defender.pokemon.stats.def / 280 +
          defender.pokemon.height / 120 -
          shooter.pokemon.stats.spe / 400) *
          resistBlock,
        0.08,
        0.36,
      )
      if (rng() < blockChance) {
        bump(boxFor(defense), defender.pokemon.id, 'blocks')
        text = `${defender.pokemon.name} blocks ${shooter.pokemon.name}'s ${shotLabel(shot)}${matchupTag}`
        possession = possession === 'home' ? 'away' : 'home'
      } else {
        const board = reboundWinner(rng, offense.onCourt, defense.onCourt)
        if (board === 'offense') {
          const rebounder = pickWeighted(
            rng,
            offense.onCourt.map((d) => ({
              item: d,
              weight: d.pokemon.stats.hp + d.pokemon.stats.def + d.pokemon.weight / 30,
            })),
          )
          bump(boxFor(offense), rebounder.pokemon.id, 'rebounds')
          text = `${shooter.pokemon.name} misses the ${shotLabel(shot)} — ${rebounder.pokemon.name} tips it back${matchupTag}`
        } else {
          const rebounder = pickWeighted(
            rng,
            defense.onCourt.map((d) => ({
              item: d,
              weight: d.pokemon.stats.hp + d.pokemon.stats.def + d.pokemon.weight / 30,
            })),
          )
          bump(boxFor(defense), rebounder.pokemon.id, 'rebounds')
          text = `${shooter.pokemon.name} misses — ${rebounder.pokemon.name} boards it${matchupTag}`
          possession = possession === 'home' ? 'away' : 'home'
        }
      }
    }

    plays.push({
      quarter,
      clock,
      text: `${offense.name}: ${text}`,
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
      const pts = pointsFor(shot)
      offense.score += pts
      bump(boxFor(offense), shooter.pokemon.id, 'points', pts)
      const otRemain = Math.max(0, 60 - ot * 3)
      plays.push({
        quarter: 5,
        clock: `0:${String(otRemain).padStart(2, '0')}`,
        text: `${offense.name}: ${shooter.pokemon.name} scores in overtime`,
        scoreHome: home.score,
        scoreAway: away.score,
      })
    }
  }

  const tied = home.score === away.score
  const boxScore = [...homeBox.values(), ...awayBox.values()]
  return {
    homeScore: home.score,
    awayScore: away.score,
    homeWon: home.score > away.score,
    tied,
    plays,
    boxScore,
    homeRatings,
    awayRatings,
    seed,
  }
}
