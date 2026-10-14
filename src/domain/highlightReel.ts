import { getPokemon } from './pokemon'
import type {
  Lineup,
  PlayEvent,
  PlayerBox,
  Pokemon,
  ShotType,
  SimResult,
} from './types'
import { ALL_SLOTS } from './types'

export type ReelActor = {
  id: number
  name: string
  side: 'home' | 'away'
  sprite: string
}

export type HighlightKind = 'make' | 'block' | 'steal' | 'board' | 'tip' | 'ot'

/** How a scoring finish should animate. */
export type FinishStyle = 'dunk' | 'layup' | 'jumper' | 'heave' | 'buzzer'

export type HighlightReel = {
  stadiumName: string
  gameIndex: number
  quarter: number
  clock: string
  scoreHome: number
  scoreAway: number
  /** Score before this play’s points (for the flash). */
  prevHome: number
  prevAway: number
  offenseSide: 'home' | 'away'
  kind: HighlightKind
  shot: ShotType | null
  finish: FinishStyle | null
  points: number
  caption: string
  /** Shooter, or blocker on blocks. */
  star: ReelActor
  /** Defender on makes/misses, rebounder on boards, null on OT. */
  foil: ReelActor | null
  assist: ReelActor | null
  homeBench: ReelActor[]
  awayBench: ReelActor[]
}

function actorFromPokemon(
  p: Pokemon,
  side: 'home' | 'away',
): ReelActor {
  return { id: p.id, name: p.name, side, sprite: p.sprite }
}

function rosterFromLineup(
  lineup: Lineup,
  side: 'home' | 'away',
): ReelActor[] {
  const out: ReelActor[] = []
  for (const slot of ALL_SLOTS) {
    const entry = lineup[slot]
    if (!entry) continue
    const p = getPokemon(entry.pokemonId)
    if (p) out.push(actorFromPokemon(p, side))
  }
  return out
}

function findByName(
  name: string,
  boxes: PlayerBox[],
  home: ReelActor[],
  away: ReelActor[],
): ReelActor | null {
  const box = boxes.find((b) => b.name === name)
  if (box) {
    const p = getPokemon(box.pokemonId)
    if (p) return actorFromPokemon(p, box.side)
  }
  return (
    home.find((a) => a.name === name) ??
    away.find((a) => a.name === name) ??
    null
  )
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

function dramaScore(play: PlayEvent, finalHome: number, finalAway: number): number {
  let score = 0
  const t = play.text
  const pts = parsePoints(t)
  if (pts) score += pts * 14
  if (/buzzer/.test(t)) score += 55
  if (/half-court|half court|heave/.test(t)) score += 40
  if (/dunk/.test(t)) score += 18
  if (/layup/.test(t)) score += 8
  if (/steals it/.test(t)) score += 26
  if (/blocks/.test(t)) score += 28
  if (/tips it back/.test(t)) score += 18
  if (/boards it/.test(t)) score += 12
  if (/overtime/.test(t)) score += 40
  if (play.quarter >= 4) score += 10
  if (play.quarter >= 5) score += 16
  const [m = 0, s = 0] = (play.clock ?? '12:00').split(':').map(Number)
  const secs = m * 60 + s
  if (play.quarter >= 4 && secs <= 60) score += 14
  if (play.quarter >= 4 && secs <= 24) score += 10
  if (secs <= 3) score += 16

  const margin = Math.abs(play.scoreHome - play.scoreAway)
  if (margin <= 6) score += 12
  if (margin <= 3) score += 10

  // Prefer plays that match the final winner’s side when decisive
  const homeWon = finalHome > finalAway
  const isHome = t.startsWith('You:')
  if (!homeWon && !isHome && /hits|blocks|boards|tips|scores/.test(t)) score += 4
  if (homeWon && isHome && /hits|scores/.test(t)) score += 6

  return score
}

function stripTeam(text: string): { side: 'home' | 'away'; body: string } {
  if (text.startsWith('You:')) {
    return { side: 'home', body: text.slice(4).trim() }
  }
  if (text.startsWith('CPU:')) {
    return { side: 'away', body: text.slice(4).trim() }
  }
  return { side: 'home', body: text }
}

function buildFromPlay(
  play: PlayEvent,
  stadiumName: string,
  gameIndex: number,
  boxes: PlayerBox[],
  homeBench: ReelActor[],
  awayBench: ReelActor[],
): HighlightReel | null {
  const { side: offenseSide, body } = stripTeam(play.text)
  const shot = parseShot(body)
  const points = parsePoints(body)

  let kind: HighlightKind = 'make'
  let starName = ''
  let foilName: string | null = null
  let assistName: string | null = null

  const heaveHit = body.match(
    /^(.+?)(?:\s*⚡)?\s+(?:drains|banks|hits|launches)\s+a\s+(?:buzzer-beater(?:\s+from half court)?|half-court heave)/i,
  )
  const heaveMiss = body.match(
    /^(.+?)(?:'s)?\s+(?:buzzer-beater(?:\s+from half court)?|half-court heave|buzzer heave)/i,
  )
  const hit = body.match(
    /^(.+?)(?:\s*⚡)?\s+hits a .+? over (.+?)(?:\s*\(\+\d+\))?(?:\s*·\s*assist\s+(.+?))?(?:\s*[·•].*)?$/,
  )
  const steal = body.match(/^(.+?)\s+steals it from\s+(.+?)(?:\s*[·•].*)?$/)
  const block = body.match(/^(.+?)\s+blocks\s+(.+?)(?:'s|\s)/)
  const tip = body.match(/^(.+?)\s+misses the .+? — (.+?)\s+tips it back/)
  const board = body.match(/^(.+?)\s+misses — (.+?)\s+boards it/)
  const ot = body.match(/^(.+?)\s+scores in overtime/)

  if (heaveHit) {
    kind = 'make'
    starName = heaveHit[1]!.replace(/\s*⚡$/, '').trim()
  } else if (heaveMiss && /misses|airs out/.test(body)) {
    // Missed heaves rarely headline the reel — skip unless nothing else
    return null
  } else if (hit) {
    kind = 'make'
    starName = hit[1]!.replace(/\s*⚡$/, '').trim()
    foilName = hit[2]!.trim()
    assistName = hit[3]?.trim() ?? null
  } else if (steal) {
    kind = 'steal'
    starName = steal[1]!.trim()
    foilName = steal[2]!.trim()
  } else if (block) {
    kind = 'block'
    starName = block[1]!.trim()
    foilName = block[2]!.trim()
  } else if (tip) {
    kind = 'tip'
    starName = tip[2]!.trim()
    foilName = tip[1]!.trim()
  } else if (board) {
    kind = 'board'
    starName = board[2]!.trim()
    foilName = board[1]!.trim()
  } else if (ot) {
    kind = 'ot'
    starName = ot[1]!.trim()
  } else {
    return null
  }

  const star = findByName(starName, boxes, homeBench, awayBench)
  if (!star) return null
  const foil = foilName
    ? findByName(foilName, boxes, homeBench, awayBench)
    : null
  const assist = assistName
    ? findByName(assistName, boxes, homeBench, awayBench)
    : null

  const prevHome =
    offenseSide === 'home' && kind === 'make'
      ? play.scoreHome - points
      : kind === 'ot' && offenseSide === 'home'
        ? play.scoreHome - (points || 2)
        : play.scoreHome
  const prevAway =
    offenseSide === 'away' && (kind === 'make' || kind === 'ot')
      ? play.scoreAway - (points || (kind === 'ot' ? 2 : 0))
      : play.scoreAway

  const caption = body
    .replace(/\s*⚡/g, '')
    .replace(/\s*[·•].*$/, '')
    .trim()

  return {
    stadiumName,
    gameIndex,
    quarter: play.quarter,
    clock: play.clock,
    scoreHome: play.scoreHome,
    scoreAway: play.scoreAway,
    prevHome: Math.max(0, prevHome),
    prevAway: Math.max(0, prevAway),
    offenseSide,
    kind,
    finish: parseFinish(body, shot),
    shot,
    points: points || (kind === 'ot' ? 2 : 0),
    caption,
    star,
    foil,
    assist,
    homeBench,
    awayBench,
  }
}

/** Pick the most dramatic play of a finished sim. */
export function buildHighlightReel(
  result: SimResult,
  stadiumName: string,
  gameIndex: number,
  homeLineup: Lineup,
  awayLineup: Lineup,
): HighlightReel | null {
  const homeBench = rosterFromLineup(homeLineup, 'home')
  const awayBench = rosterFromLineup(awayLineup, 'away')
  const boxes = result.boxScore ?? []

  const candidates = result.plays.filter((p) =>
    /hits a |drains a |banks a |steals it|blocks |tips it back|boards it|scores in overtime|buzzer-beater|half-court heave/.test(
      p.text,
    ),
  )
  const pool = candidates.length ? candidates : result.plays
  if (pool.length === 0) return null

  let best = pool[0]!
  let bestScore = -1
  for (const play of pool) {
    const s = dramaScore(play, result.homeScore, result.awayScore)
    if (s > bestScore) {
      bestScore = s
      best = play
    }
  }

  return buildFromPlay(
    best,
    stadiumName,
    gameIndex,
    boxes,
    homeBench,
    awayBench,
  )
}

/**
 * Rebuild a reel from stored highlight strings (older saves with plays stripped).
 */
export function reelFromHighlightLines(
  lines: string[],
  stadiumName: string,
  gameIndex: number,
  homeScore: number,
  awayScore: number,
  boxes: PlayerBox[],
  homeLineup: Lineup,
  awayLineup: Lineup,
): HighlightReel | null {
  const homeBench = rosterFromLineup(homeLineup, 'home')
  const awayBench = rosterFromLineup(awayLineup, 'away')

  for (const line of [...lines].reverse()) {
    // "Q4 0:18  98–96  You: Pikachu hits a three …"
    const m = line.match(
      /^(?:Q(\d+)|OT)\s+(\d+:\d+)\s+(\d+)[–-](\d+)\s+(.+)$/,
    )
    if (!m) continue
    const body = m[5]!
    if (
      !/hits a |drains a |banks a |steals it|blocks |tips it back|boards it|scores in overtime|buzzer-beater|half-court heave/.test(
        body,
      )
    ) {
      continue
    }
    const quarter = line.startsWith('OT') ? 5 : Number(m[1])
    const play: PlayEvent = {
      quarter,
      clock: m[2]!,
      text: body,
      scoreHome: Number(m[3]),
      scoreAway: Number(m[4]),
    }
    const reel = buildFromPlay(
      play,
      stadiumName,
      gameIndex,
      boxes,
      homeBench,
      awayBench,
    )
    if (reel) {
      // Prefer final score on the bug if the line was mid-game
      if (homeScore && awayScore) {
        // keep play scores for authenticity
      }
      return reel
    }
  }

  // Fallback: pose MVP as a make from the arc
  const mvp = boxes
    .slice()
    .sort(
      (a, b) =>
        b.points + b.assists * 2 - (a.points + a.assists * 2),
    )[0]
  if (!mvp) return null
  const p = getPokemon(mvp.pokemonId)
  if (!p) return null
  const foilBox = boxes.find((b) => b.side !== mvp.side)
  const foilP = foilBox ? getPokemon(foilBox.pokemonId) : null

  return {
    stadiumName,
    gameIndex,
    quarter: 4,
    clock: '0:24',
    scoreHome: homeScore,
    scoreAway: awayScore,
    prevHome: Math.max(0, homeScore - (mvp.side === 'home' ? 2 : 0)),
    prevAway: Math.max(0, awayScore - (mvp.side === 'away' ? 2 : 0)),
    offenseSide: mvp.side,
    kind: 'make',
    shot: 'mid',
    finish: 'jumper',
    points: 2,
    caption: `${mvp.name} takes over`,
    star: actorFromPokemon(p, mvp.side),
    foil: foilP && foilBox ? actorFromPokemon(foilP, foilBox.side) : null,
    assist: null,
    homeBench,
    awayBench,
  }
}

export function periodStamp(quarter: number, clock: string): string {
  if (quarter >= 5) return `OT ${clock}`
  return `Q${quarter} ${clock}`
}

export function kindTitle(
  kind: HighlightKind,
  finish?: FinishStyle | null,
): string {
  if (kind === 'block') return 'REJECTED'
  if (kind === 'steal') return 'STEAL'
  if (kind === 'board') return 'BOARDS'
  if (kind === 'tip') return 'TIP-IN'
  if (kind === 'ot') return 'OVERTIME'
  if (finish === 'buzzer') return 'BUZZER'
  if (finish === 'heave') return 'HEAVE'
  if (finish === 'dunk') return 'DUNK'
  if (finish === 'layup') return 'LAYUP'
  return 'BUCKET'
}
