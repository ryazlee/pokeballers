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

/** Relative height vs baseline (~1.0 at 1.5m). */
function heightFactor(p: Pokemon): number {
  return clamp(p.height / SIM.heightBaseline, 0.4, 2.4)
}

/** Relative mass vs baseline (~1.0 at 60kg). */
function weightFactor(p: Pokemon): number {
  return clamp(p.weight / SIM.weightBaseline, 0.3, 2.8)
}

/** Combined size — paint/rim work. */
function bulkFactor(p: Pokemon): number {
  return (heightFactor(p) * 1.05 + weightFactor(p) * 0.95) / 2
}

/** Light/quick bodies for transition and heaves. */
function lightnessFactor(p: Pokemon): number {
  return clamp(1.35 - weightFactor(p) * 0.35, 0.55, 1.35)
}

function clockSecs(clock: string): number {
  const [m = 0, s = 0] = clock.split(':').map(Number)
  return m * 60 + s
}

function shotWeights(offense: OnCourt[], ratings: TeamRatings): { item: ShotType; weight: number }[] {
  const spa = avg(offense.map((o) => o.pokemon.stats.spa))
  const atk = avg(offense.map((o) => o.pokemon.stats.atk))
  const spe = avg(offense.map((o) => o.pokemon.stats.spe))
  const bulk = avg(offense.map((o) => bulkFactor(o.pokemon)))
  const light = avg(offense.map((o) => lightnessFactor(o.pokemon)))
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
    {
      item: 'paint',
      weight:
        (atk * 1.2 + ratings.paint * 0.5) * (bias.paint / n) * (0.82 + bulk * 0.22),
    },
    {
      item: 'transition',
      weight:
        (spe * 1.3 + ratings.playmaking * 0.3) *
        (bias.transition / n) *
        (0.85 + light * 0.2),
    },
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
      const p = o.pokemon
      let weight = 1
      if (shot === 'three') {
        // Length helps get shots off; heavy bodies less likely to hunt threes
        weight = s.spa * 1.4 + s.spe * 0.5 + heightFactor(p) * 8
        weight *= 0.9 + lightnessFactor(p) * 0.12
      } else if (shot === 'mid') {
        weight = s.spa * 0.8 + s.atk * 0.8 + heightFactor(p) * 4
      } else if (shot === 'paint') {
        weight =
          s.atk * 1.3 + s.def * 0.4 + heightFactor(p) * 14 + weightFactor(p) * 12
      } else {
        // Transition: quick + light first
        weight = s.spe * 1.4 + s.atk * 0.6
        weight *= lightnessFactor(p)
      }
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
  const h = heightFactor(p)
  const w = weightFactor(p)
  let raw: number
  if (shot === 'three') {
    // Elevation helps release; excess mass slows into the shot slightly
    raw = eff(p, 'spa', stadium) * (0.92 + h * 0.1) * (0.96 + lightnessFactor(p) * 0.06)
  } else if (shot === 'mid') {
    raw =
      ((eff(p, 'spa', stadium) + eff(p, 'atk', stadium)) / 2) * (0.94 + h * 0.08)
  } else if (shot === 'paint') {
    // Big bodies finish through contact
    raw =
      eff(p, 'atk', stadium) +
      w * 18 +
      h * 12 +
      p.weight / 90
  } else {
    // Transition: speed + lightness, bulk is a drag
    raw =
      (eff(p, 'spe', stadium) * 0.7 + eff(p, 'atk', stadium) * 0.5) *
      lightnessFactor(p) *
      (0.95 + (2 - Math.min(h, 1.6)) * 0.04)
  }
  return raw * typeMult * shotMult * posMult * liveForm(shooter)
}

function defenseStat(defender: OnCourt, shot: ShotType, stadium?: Stadium): number {
  const p = defender.pokemon
  const typeMult = terrainMult(p, stadium)
  const posMult = fitMult(defender)
  const h = heightFactor(p)
  const w = weightFactor(p)
  let raw: number
  if (shot === 'three' || shot === 'mid' || shot === 'transition') {
    // Length contests jumpers; heavy feet a bit worse on the perimeter
    raw =
      eff(p, 'spd', stadium) * 0.9 +
      eff(p, 'spe', stadium) * 0.7 +
      h * 10 -
      Math.max(0, w - 1.15) * 4
  } else {
    // Rim protection: height first, then mass
    raw =
      eff(p, 'def', stadium) * 1.1 +
      h * 28 +
      w * 14 +
      eff(p, 'hp', stadium) * 0.15
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

function shotLabel(
  shot: ShotType,
  shooter?: OnCourt,
  rng?: () => number,
): string {
  if (shot === 'three') return 'three'
  if (shot === 'mid') return 'mid-range jumper'
  if (shot === 'transition') return 'layup'
  // Paint: taller / heavier / stronger finishers throw it down more often.
  if (shooter && rng) {
    const p = shooter.pokemon
    const dunkChance = clamp(
      0.16 +
        heightFactor(p) * 0.18 +
        weightFactor(p) * 0.1 +
        p.stats.atk / 480,
      0.14,
      0.78,
    )
    return rng() < dunkChance ? 'dunk' : 'layup'
  }
  return 'layup'
}

function drainStamina(side: Side): void {
  const benchSize = side.bench.length
  // One seat still works, but minutes stack — empty bench is brutal.
  const rotationTax = benchSize === 0 ? 1.48 : benchSize === 1 ? 1.3 : 1
  for (const o of side.onCourt) {
    const end = enduranceGrade(o.pokemon)
    // Heavier bodies tax the legs a bit more over a long slate
    const massTax = 0.92 + weightFactor(o.pokemon) * 0.1
    let drain =
      SIM.staminaDrain * staminaDrainMult(o.pokemon) * rotationTax * massTax
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
  const boardScore = (o: OnCourt, defSide: boolean) => {
    const p = o.pokemon
    return (
      p.stats.hp * SIM.reboundBulkWeight +
      p.stats.def * (defSide ? 0.5 : 0.4) +
      heightFactor(p) * 22 +
      weightFactor(p) * 18 +
      p.weight / 45
    )
  }
  const offBulk = avg(offense.map((o) => boardScore(o, false)))
  const defBulk = avg(defense.map((o) => boardScore(o, true)))
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
      steals: 0,
      rebounds: 0,
    })
  }
  return map
}

function bump(
  boxes: Map<number, PlayerBox>,
  pokemonId: number,
  key: 'points' | 'assists' | 'blocks' | 'steals' | 'rebounds',
  n = 1,
): void {
  const row = boxes.get(pokemonId)
  if (row) row[key] += n
}

/**
 * Steal rating: Spe (first step) + SpD (hands / read) — not raw Def.
 * Lighter wings get a bump; true bigs are a step slower to the poke.
 */
function stealRating(d: OnCourt, stadium?: Stadium): number {
  const p = d.pokemon
  return (
    (eff(p, 'spe', stadium) * 1.2 +
      eff(p, 'spd', stadium) * 0.95 +
      lightnessFactor(p) * 14 -
      Math.max(0, heightFactor(p) - 1.25) * 8) *
    fitMult(d) *
    liveForm(d)
  )
}

/** Ball security vs steals: Spe + SpA (handle / vision). */
function handleRating(o: OnCourt, stadium?: Stadium): number {
  const p = o.pokemon
  return (
    (eff(p, 'spe', stadium) * 0.95 +
      eff(p, 'spa', stadium) * 0.65 +
      lightnessFactor(p) * 8) *
    fitMult(o) *
    liveForm(o)
  )
}

function pickStealer(
  rng: () => number,
  defense: OnCourt[],
  stadium?: Stadium,
): OnCourt {
  return pickWeighted(
    rng,
    defense.map((d) => ({
      item: d,
      weight: Math.max(1, stealRating(d, stadium)),
    })),
  )
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

    const secsLeft = clockSecs(clock)
    const lastPossOfGame = i === SIM.possessions - 1
    const buzzerWindow = secsLeft <= 3 || lastPossOfGame
    const margin = Math.abs(home.score - away.score)
    // End-of-period desperation looks — more likely in Q4 when it's close
    let heaveChance = 0
    if (secsLeft <= 2) heaveChance = quarter >= 4 ? 0.72 : 0.38
    else if (secsLeft <= 4) heaveChance = quarter >= 4 ? 0.42 : 0.18
    if (lastPossOfGame && margin <= 6) heaveChance = Math.max(heaveChance, 0.8)
    else if (quarter === 4 && secsLeft <= 6 && margin <= 4) {
      heaveChance = Math.max(heaveChance, 0.35)
    }
    const isHeave = buzzerWindow && rng() < heaveChance
    const isBuzzer =
      isHeave && (secsLeft <= 1 || lastPossOfGame || (quarter === 4 && secsLeft <= 3))

    const shot: ShotType = isHeave
      ? 'three'
      : pickWeighted(rng, shotWeights(offense.onCourt, offense.ratings))
    const shooter = isHeave
      ? pickWeighted(
          rng,
          offense.onCourt.map((o) => ({
            item: o,
            weight:
              o.pokemon.stats.spa * 1.2 +
              o.pokemon.stats.spe * 0.5 +
              heightFactor(o.pokemon) * 6 +
              lightnessFactor(o.pokemon) * 10,
          })),
        )
      : pickShooter(rng, offense.onCourt, shot)
    const defender = defenderFor(defense.onCourt, shooter, rng)

    const stadium = options.stadium
    const offForm = rotationForm(offense)
    const defForm = rotationForm(defense)
    const typeEdge = offensiveTypeEdge(
      shooter.pokemon.types,
      defender.pokemon.types,
    )

    let makeChance: number
    if (isHeave) {
      const clutch =
        quarter >= 4 && margin <= 5 ? 0.025 : quarter >= 4 ? 0.01 : 0
      makeChance = clamp(
        SIM.heaveBase +
          shooter.pokemon.stats.spa / 2200 +
          heightFactor(shooter.pokemon) * 0.012 +
          lightnessFactor(shooter.pokemon) * 0.01 +
          clutch +
          (rng() - 0.5) * 0.02,
        0.02,
        0.14,
      )
    } else {
      const off =
        offenseStat(shooter, shot, stadium) * offForm * typeEdge +
        offense.ratings.playmaking * 0.08
      const def =
        defenseStat(defender, shot, stadium) * defMult * defForm +
        defense.ratings.defense * 0.12
      const noise = (rng() - 0.5) * 2 * SIM.noiseScale
      makeChance = clamp(
        baseMake(shot) + (sigmoid(off - def + noise) - 0.5) * 0.55,
        SIM.makeClamp.min,
        SIM.makeClamp.max,
      )
    }

    const made = rng() < makeChance
    let text: string
    const boosted =
      stadium &&
      (hasTypeBoost(shooter.pokemon.types, stadium) ||
        stadium.modifiers.some((m) => m.kind === 'shot' && m.shot === shot))
        ? ' ⚡'
        : ''
    const matchupTag = typeEdgeTag(typeEdge)

    const label = isHeave
      ? isBuzzer
        ? 'buzzer-beater from half court'
        : 'half-court heave'
      : shotLabel(shot, shooter, rng)

    // Steal check before the shot (not on heaves — those are desperation flings)
    let stolen = false
    if (!isHeave) {
      const stealer = pickStealer(rng, defense.onCourt, stadium)
      const stealGap =
        stealRating(stealer, stadium) * defForm -
        handleRating(shooter, stadium) * offForm
      const perimeter =
        shot === 'transition' ? 0.045 : shot === 'three' || shot === 'mid' ? 0.02 : -0.025
      const stealChance = clamp(
        SIM.stealBase +
          (sigmoid(stealGap) - 0.5) * 0.2 +
          perimeter +
          (rng() - 0.5) * 0.03,
        0.025,
        0.2,
      )
      if (rng() < stealChance) {
        stolen = true
        bump(boxFor(defense), stealer.pokemon.id, 'steals')
        text = `${stealer.pokemon.name} steals it from ${shooter.pokemon.name}${matchupTag}`
        possession = possession === 'home' ? 'away' : 'home'
      }
    }

    if (stolen) {
      // already set text + possession
    } else if (isHeave) {
      if (made) {
        const pts = 3
        offense.score += pts
        bump(boxFor(offense), shooter.pokemon.id, 'points', pts)
        const verb = rng() < 0.45 ? 'drains' : rng() < 0.5 ? 'banks' : 'hits'
        text = `${shooter.pokemon.name}${boosted} ${verb} a ${label} (+${pts})${matchupTag}`
      } else {
        text =
          rng() < 0.5
            ? `${shooter.pokemon.name}'s ${label} misses long${matchupTag}`
            : `${shooter.pokemon.name} airs out a ${label}${matchupTag}`
      }
      possession = possession === 'home' ? 'away' : 'home'
    } else if (made) {
      const pts = pointsFor(shot)
      offense.score += pts
      bump(boxFor(offense), shooter.pokemon.id, 'points', pts)
      const passer = pickPasser(rng, offense.onCourt, shooter)
      if (passer) {
        bump(boxFor(offense), passer.pokemon.id, 'assists')
        text = `${shooter.pokemon.name}${boosted} hits a ${label} over ${defender.pokemon.name} (+${pts}) · assist ${passer.pokemon.name}${matchupTag}`
      } else {
        text = `${shooter.pokemon.name}${boosted} hits a ${label} over ${defender.pokemon.name} (+${pts})${matchupTag}`
      }
      possession = possession === 'home' ? 'away' : 'home'
    } else {
      // Length mismatch: taller defenders reject more; smaller shooters get stuffed more
      const sizeGap =
        heightFactor(defender.pokemon) - heightFactor(shooter.pokemon)
      const resistBlock = typeEdge < 1 ? 1 + (1 - typeEdge) * 0.55 : 1
      const blockChance = clamp(
        (0.09 +
          defender.pokemon.stats.def / 300 +
          heightFactor(defender.pokemon) * 0.07 +
          weightFactor(defender.pokemon) * 0.025 +
          sizeGap * 0.05 -
          shooter.pokemon.stats.spe / 420) *
          resistBlock,
        0.07,
        0.4,
      )
      if (rng() < blockChance) {
        bump(boxFor(defense), defender.pokemon.id, 'blocks')
        text = `${defender.pokemon.name} blocks ${shooter.pokemon.name}'s ${label}${matchupTag}`
        possession = possession === 'home' ? 'away' : 'home'
      } else {
        const board = reboundWinner(rng, offense.onCourt, defense.onCourt)
        const boardWeight = (d: OnCourt) =>
          d.pokemon.stats.hp +
          d.pokemon.stats.def +
          heightFactor(d.pokemon) * 20 +
          weightFactor(d.pokemon) * 16 +
          d.pokemon.weight / 30
        if (board === 'offense') {
          const rebounder = pickWeighted(
            rng,
            offense.onCourt.map((d) => ({
              item: d,
              weight: boardWeight(d),
            })),
          )
          bump(boxFor(offense), rebounder.pokemon.id, 'rebounds')
          text = `${shooter.pokemon.name} misses the ${label} — ${rebounder.pokemon.name} tips it back${matchupTag}`
        } else {
          const rebounder = pickWeighted(
            rng,
            defense.onCourt.map((d) => ({
              item: d,
              weight: boardWeight(d),
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
