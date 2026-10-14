import { getPokemon } from './pokemon'
import type {
  FinishStyle,
  HighlightKind,
} from './highlightReel'
import type {
  Lineup,
  PlayerBox,
  Pokemon,
  Position,
  ShotType,
  SimResult,
} from './types'
import { STARTER_SLOTS } from './types'

export type BroadcastActor = {
  id: number
  name: string
  side: 'home' | 'away'
  slot: Position
  sprite: string
}

export type BroadcastKind =
  | HighlightKind
  | 'miss'
  | 'sub'
  | 'heave_miss'

export type BroadcastClip = {
  playIndex: number
  quarter: number
  clock: string
  scoreHome: number
  scoreAway: number
  prevHome: number
  prevAway: number
  offenseSide: 'home' | 'away'
  kind: BroadcastKind
  shot: ShotType | null
  finish: FinishStyle | null
  points: number
  caption: string
  teamLabel: string
  starId: number | null
  foilId: number | null
  assistId: number | null
  duration: number
  onCourt: BroadcastActor[]
}

export type GameBroadcast = {
  stadiumName: string
  gameIndex: number
  homeName: string
  awayName: string
  clips: BroadcastClip[]
  finalHome: number
  finalAway: number
  /** Cumulative start times for each clip (seconds at 1×). */
  clipStarts: number[]
  totalDuration: number
}

function actorFrom(
  p: Pokemon,
  side: 'home' | 'away',
  slot: Position,
): BroadcastActor {
  return { id: p.id, name: p.name, side, slot, sprite: p.sprite }
}

function startersFromLineup(
  lineup: Lineup,
  side: 'home' | 'away',
): Map<Position, BroadcastActor> {
  const map = new Map<Position, BroadcastActor>()
  for (const slot of STARTER_SLOTS) {
    const entry = lineup[slot]
    if (!entry) continue
    const p = getPokemon(entry.pokemonId)
    if (p) map.set(slot, actorFrom(p, side, slot))
  }
  return map
}

function benchPool(lineup: Lineup, side: 'home' | 'away'): BroadcastActor[] {
  const out: BroadcastActor[] = []
  for (const slot of ['BENCH1', 'BENCH2'] as const) {
    const entry = lineup[slot]
    if (!entry) continue
    const p = getPokemon(entry.pokemonId)
    if (p) out.push(actorFrom(p, side, 'SF'))
  }
  return out
}

function findActor(
  name: string,
  boxes: PlayerBox[],
  home: Map<Position, BroadcastActor>,
  away: Map<Position, BroadcastActor>,
  homeBench: BroadcastActor[],
  awayBench: BroadcastActor[],
): BroadcastActor | null {
  const on = [...home.values(), ...away.values(), ...homeBench, ...awayBench]
  const hit = on.find((a) => a.name === name)
  if (hit) return hit
  const box = boxes.find((b) => b.name === name)
  if (!box) return null
  const p = getPokemon(box.pokemonId)
  if (!p) return null
  return actorFrom(p, box.side, 'SF')
}

function stripTeam(text: string): { side: 'home' | 'away'; body: string } {
  if (text.startsWith('You:')) return { side: 'home', body: text.slice(4).trim() }
  if (text.startsWith('CPU:')) return { side: 'away', body: text.slice(4).trim() }
  return { side: 'home', body: text }
}

function parseShot(text: string): ShotType | null {
  if (/buzzer|half-court|half court|heave/.test(text)) return 'three'
  if (/three/.test(text)) return 'three'
  if (/mid-range|mid /.test(text)) return 'mid'
  if (/dunk|paint/.test(text)) return 'paint'
  if (/transition|layup/.test(text)) return 'transition'
  return null
}

function parseFinish(text: string, shot: ShotType | null): FinishStyle | null {
  if (/buzzer/.test(text)) return 'buzzer'
  if (/half-court|half court|heave/.test(text)) return 'heave'
  if (/dunk/.test(text)) return 'dunk'
  if (/layup|paint finish|transition/.test(text)) return 'layup'
  if (shot === 'paint' || shot === 'transition') return 'layup'
  if (shot === 'three' || shot === 'mid') return 'jumper'
  if (/hits a |scores in overtime|drains|banks/.test(text)) return 'jumper'
  return null
}

function parsePoints(text: string): number {
  const m = text.match(/\(\+(\d+)\)/)
  return m ? Number(m[1]) : 0
}

function clipDuration(kind: BroadcastKind, finish: FinishStyle | null): number {
  if (kind === 'sub') return 0.85
  if (finish === 'buzzer' || finish === 'heave') return 2.35
  if (kind === 'heave_miss') return 1.9
  if (kind === 'steal') return 1.45
  if (kind === 'block') return 1.65
  if (kind === 'tip' || kind === 'board') return 1.55
  if (kind === 'ot') return 1.5
  if (kind === 'make') return 1.7
  return 1.55
}

function courtSnapshot(
  home: Map<Position, BroadcastActor>,
  away: Map<Position, BroadcastActor>,
): BroadcastActor[] {
  return [...home.values(), ...away.values()]
}

function applySub(
  body: string,
  side: 'home' | 'away',
  court: Map<Position, BroadcastActor>,
  bench: BroadcastActor[],
): boolean {
  const m = body.match(
    /^(.+?)\s+checks in for\s+(.+?)\s+\((PG|SG|SF|PF|C)\)/i,
  )
  if (!m) return false
  const incomingName = m[1]!.trim()
  const slot = m[3]!.toUpperCase() as Position
  const outgoing = court.get(slot)
  if (!outgoing) return false

  const next = bench.find((a) => a.name === incomingName)
  if (!next) return false

  const idx = bench.findIndex((a) => a.id === next.id)
  if (idx >= 0) bench.splice(idx, 1)
  bench.push(outgoing)
  court.set(slot, { ...next, slot, side })
  return true
}

type ParsedAction = {
  kind: BroadcastKind
  starName: string
  foilName: string | null
  assistName: string | null
}

function parseAction(body: string): ParsedAction | null {
  const heaveHit = body.match(
    /^(.+?)(?:\s*⚡)?\s+(?:drains|banks|hits|launches)\s+a\s+(?:buzzer-beater(?:\s+from half court)?|half-court heave)/i,
  )
  if (heaveHit) {
    return {
      kind: 'make',
      starName: heaveHit[1]!.replace(/\s*⚡$/, '').trim(),
      foilName: null,
      assistName: null,
    }
  }

  if (/buzzer|half-court|heave/i.test(body) && /misses|airs out/i.test(body)) {
    const starName =
      body.match(/^(.+?)'s\s+/i)?.[1]?.trim() ??
      body.match(/^(.+?)\s+airs out/i)?.[1]?.trim() ??
      body.split(/\s/)[0]!
    return {
      kind: 'heave_miss',
      starName,
      foilName: null,
      assistName: null,
    }
  }

  const hit = body.match(
    /^(.+?)(?:\s*⚡)?\s+hits a .+? over (.+?)(?:\s*\(\+\d+\))?(?:\s*·\s*assist\s+(.+?))?(?:\s*[·•].*)?$/,
  )
  if (hit) {
    return {
      kind: 'make',
      starName: hit[1]!.replace(/\s*⚡$/, '').trim(),
      foilName: hit[2]!.trim(),
      assistName: hit[3]?.trim() ?? null,
    }
  }

  const steal = body.match(/^(.+?)\s+steals it from\s+(.+?)(?:\s*[·•].*)?$/)
  if (steal) {
    return {
      kind: 'steal',
      starName: steal[1]!.trim(),
      foilName: steal[2]!.trim(),
      assistName: null,
    }
  }

  const block = body.match(/^(.+?)\s+blocks\s+(.+?)(?:'s|\s)/)
  if (block) {
    return {
      kind: 'block',
      starName: block[1]!.trim(),
      foilName: block[2]!.trim(),
      assistName: null,
    }
  }

  const tip = body.match(/^(.+?)\s+misses the .+? — (.+?)\s+tips it back/)
  if (tip) {
    return {
      kind: 'tip',
      starName: tip[2]!.trim(),
      foilName: tip[1]!.trim(),
      assistName: null,
    }
  }

  const board = body.match(/^(.+?)\s+misses — (.+?)\s+boards it/)
  if (board) {
    return {
      kind: 'board',
      starName: board[2]!.trim(),
      foilName: board[1]!.trim(),
      assistName: null,
    }
  }

  const ot = body.match(/^(.+?)\s+scores in overtime/)
  if (ot) {
    return {
      kind: 'ot',
      starName: ot[1]!.trim(),
      foilName: null,
      assistName: null,
    }
  }

  // Generic miss without board text (shouldn't be common)
  const miss = body.match(/^(.+?)(?:\s*⚡)?\s+misses/i)
  if (miss) {
    return {
      kind: 'miss',
      starName: miss[1]!.replace(/\s*⚡$/, '').trim(),
      foilName: null,
      assistName: null,
    }
  }

  return null
}

/**
 * Build a watch-only broadcast from a finished sim — every possession, no interaction.
 */
export function buildGameBroadcast(
  result: SimResult,
  stadiumName: string,
  gameIndex: number,
  homeLineup: Lineup,
  awayLineup: Lineup,
  homeName = 'YOU',
  awayName = 'CPU',
): GameBroadcast {
  const homeCourt = startersFromLineup(homeLineup, 'home')
  const awayCourt = startersFromLineup(awayLineup, 'away')
  const homeBench = benchPool(homeLineup, 'home')
  const awayBench = benchPool(awayLineup, 'away')
  const boxes = result.boxScore ?? []

  const clips: BroadcastClip[] = []

  for (let i = 0; i < result.plays.length; i++) {
    const play = result.plays[i]!
    const { side, body } = stripTeam(play.text)
    const teamLabel = side === 'home' ? homeName : awayName
    const court = side === 'home' ? homeCourt : awayCourt
    const bench = side === 'home' ? homeBench : awayBench

    if (/checks in for/.test(body)) {
      applySub(body, side, court, bench)
      clips.push({
        playIndex: i,
        quarter: play.quarter,
        clock: play.clock,
        scoreHome: play.scoreHome,
        scoreAway: play.scoreAway,
        prevHome: play.scoreHome,
        prevAway: play.scoreAway,
        offenseSide: side,
        kind: 'sub',
        shot: null,
        finish: null,
        points: 0,
        caption: body.replace(/\s*[·•].*$/, '').trim(),
        teamLabel,
        starId: null,
        foilId: null,
        assistId: null,
        duration: clipDuration('sub', null),
        onCourt: courtSnapshot(homeCourt, awayCourt),
      })
      continue
    }

    const action = parseAction(body)
    if (!action) continue

    const shot = parseShot(body)
    const finish = parseFinish(body, shot)
    const points = parsePoints(body)
    const star = findActor(
      action.starName,
      boxes,
      homeCourt,
      awayCourt,
      homeBench,
      awayBench,
    )
    const foil = action.foilName
      ? findActor(
          action.foilName,
          boxes,
          homeCourt,
          awayCourt,
          homeBench,
          awayBench,
        )
      : null
    const assist = action.assistName
      ? findActor(
          action.assistName,
          boxes,
          homeCourt,
          awayCourt,
          homeBench,
          awayBench,
        )
      : null

    const scoring = action.kind === 'make' || action.kind === 'ot'
    const prevHome =
      scoring && side === 'home'
        ? play.scoreHome - (points || (action.kind === 'ot' ? 2 : 0))
        : play.scoreHome
    const prevAway =
      scoring && side === 'away'
        ? play.scoreAway - (points || (action.kind === 'ot' ? 2 : 0))
        : play.scoreAway

    clips.push({
      playIndex: i,
      quarter: play.quarter,
      clock: play.clock,
      scoreHome: play.scoreHome,
      scoreAway: play.scoreAway,
      prevHome: Math.max(0, prevHome),
      prevAway: Math.max(0, prevAway),
      offenseSide: side,
      kind: action.kind,
      shot,
      finish,
      points: points || (action.kind === 'ot' || action.kind === 'tip' ? 2 : 0),
      caption: body
        .replace(/\s*⚡/g, '')
        .replace(/\s*[·•].*$/, '')
        .trim(),
      teamLabel,
      starId: star?.id ?? null,
      foilId: foil?.id ?? null,
      assistId: assist?.id ?? null,
      duration: clipDuration(action.kind, finish),
      onCourt: courtSnapshot(homeCourt, awayCourt),
    })
  }

  const clipStarts: number[] = []
  let t = 0
  for (const c of clips) {
    clipStarts.push(t)
    t += c.duration
  }

  return {
    stadiumName,
    gameIndex,
    homeName,
    awayName,
    clips,
    finalHome: result.homeScore,
    finalAway: result.awayScore,
    clipStarts,
    totalDuration: t,
  }
}

export function clipAtTime(
  broadcast: GameBroadcast,
  time: number,
): { clip: BroadcastClip; index: number; localT: number } | null {
  if (!broadcast.clips.length) return null
  const t = Math.max(0, Math.min(time, broadcast.totalDuration - 0.001))
  let lo = 0
  let hi = broadcast.clips.length - 1
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2)
    if (broadcast.clipStarts[mid]! <= t) lo = mid
    else hi = mid - 1
  }
  const clip = broadcast.clips[lo]!
  const start = broadcast.clipStarts[lo]!
  return { clip, index: lo, localT: t - start }
}

export function periodStamp(quarter: number, clock: string): string {
  if (quarter >= 5) return `OT ${clock}`
  return `Q${quarter} ${clock}`
}
