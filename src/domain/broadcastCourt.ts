import type {
  BroadcastActor,
  BroadcastClip,
  GameBroadcast,
} from './gameBroadcast'
import { periodStamp } from './gameBroadcast'
import type { Position, ShotType } from './types'

export const BROADCAST_W = 960
export const BROADCAST_H = 540

export type BroadcastAssets = {
  sprites: Map<number, HTMLImageElement>
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = src
  })
}

export async function loadBroadcastAssets(
  broadcast: GameBroadcast,
): Promise<BroadcastAssets> {
  const ids = new Map<number, string>()
  for (const clip of broadcast.clips) {
    for (const a of clip.onCourt) ids.set(a.id, a.sprite)
  }
  const sprites = new Map<number, HTMLImageElement>()
  await Promise.all(
    [...ids.entries()].map(async ([id, src]) => {
      const img = await loadImage(src)
      if (img) sprites.set(id, img)
    }),
  )
  return { sprites }
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n))
}

function easeOutCubic(t: number) {
  return 1 - (1 - t) ** 3
}

function easeInOut(t: number) {
  return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2
}

/** Court space: x along length (home basket left), y across width. */
type Vec = { x: number; y: number }

const HOME_HOOP: Vec = { x: 0.08, y: 0.5 }
const AWAY_HOOP: Vec = { x: 0.92, y: 0.5 }

function slotSpot(slot: Position, offense: boolean, wing: number): Vec {
  // Relative to attacking the RIGHT basket; flip later for left attacks.
  if (offense) {
    if (slot === 'PG') return { x: 0.52, y: 0.5 }
    if (slot === 'SG') return { x: 0.58, y: 0.22 + wing * 0.04 }
    if (slot === 'SF') return { x: 0.62, y: 0.78 - wing * 0.04 }
    if (slot === 'PF') return { x: 0.72, y: 0.32 }
    return { x: 0.78, y: 0.55 } // C
  }
  if (slot === 'PG') return { x: 0.68, y: 0.5 }
  if (slot === 'SG') return { x: 0.74, y: 0.28 }
  if (slot === 'SF') return { x: 0.76, y: 0.72 }
  if (slot === 'PF') return { x: 0.84, y: 0.36 }
  return { x: 0.86, y: 0.58 }
}

function shotSpot(shot: ShotType | null, finish: BroadcastClip['finish']): Vec {
  if (finish === 'heave' || finish === 'buzzer') return { x: 0.28, y: 0.5 }
  if (shot === 'three') return { x: 0.48, y: 0.22 }
  if (shot === 'mid') return { x: 0.62, y: 0.42 }
  if (shot === 'paint' || shot === 'transition') return { x: 0.82, y: 0.5 }
  return { x: 0.64, y: 0.48 }
}

function flipForSide(v: Vec, attackRight: boolean): Vec {
  return attackRight ? v : { x: 1 - v.x, y: v.y }
}

function hoopFor(attackRight: boolean): Vec {
  return attackRight ? AWAY_HOOP : HOME_HOOP
}

/** Map court → screen with slight perspective (far sideline smaller). */
function toScreen(x: number, y: number, W: number, H: number) {
  const padX = W * 0.06
  const padTop = H * 0.16
  const padBot = H * 0.14
  const courtW = W - padX * 2
  const courtH = H - padTop - padBot
  // Mild perspective: compress width near top
  const persp = lerp(1.02, 0.92, y)
  const cx = W / 2
  const sx = cx + (x - 0.5) * courtW * persp
  const sy = padTop + y * courtH
  const scale = lerp(1.08, 0.82, y)
  return { sx, sy, scale }
}

type Pose = {
  x: number
  y: number
  hop: number
  squash: number
}

type Scene = {
  poses: Map<number, Pose>
  ball: { x: number; y: number; z: number; visible: number } | null
  flash: number
  scoreFlash: number
  showNextScore: boolean
  burstLabel: string | null
  burst: number
  focusX: number
  focusY: number
  zoom: number
}

function idleBob(t: number, seed: number) {
  return Math.sin(t * 5.2 + seed * 1.7) * 0.006
}

function hash(n: number) {
  const x = Math.sin(n * 12.9898) * 43758.5453
  return x - Math.floor(x)
}

function baseFormation(
  clip: BroadcastClip,
  localT: number,
): Map<number, Pose> {
  const attackRight = clip.offenseSide === 'home'
  const poses = new Map<number, Pose>()
  for (const a of clip.onCourt) {
    const onOffense = a.side === clip.offenseSide
    const wing = hash(a.id + clip.playIndex) * 2 - 1
    let spot = slotSpot(a.slot, onOffense, wing)
    spot = flipForSide(spot, attackRight)
    poses.set(a.id, {
      x: spot.x,
      y: spot.y + idleBob(localT, a.id),
      hop: 0,
      squash: 1,
    })
  }
  return poses
}

function actorById(clip: BroadcastClip, id: number | null): BroadcastActor | null {
  if (id == null) return null
  return clip.onCourt.find((a) => a.id === id) ?? null
}

function sceneForClip(clip: BroadcastClip, localT: number): Scene {
  const attackRight = clip.offenseSide === 'home'
  const hoop = hoopFor(attackRight)
  const poses = baseFormation(clip, localT)
  const p = clamp(localT / Math.max(clip.duration, 0.01), 0, 1)

  let ball: Scene['ball'] = null
  let flash = 0
  let scoreFlash = 0
  let showNextScore = false
  let burstLabel: string | null = null
  let burst = 0
  let focusX = 0.5
  let focusY = 0.5
  let zoom = 1

  const star = actorById(clip, clip.starId)
  const foil = actorById(clip, clip.foilId)
  const assist = actorById(clip, clip.assistId)

  if (clip.kind === 'sub') {
    focusX = 0.5
    focusY = 0.5
    zoom = 1
    burstLabel = 'SUB'
    burst = clamp((p - 0.15) / 0.3, 0, 1) * (1 - clamp((p - 0.7) / 0.3, 0, 1))
    return {
      poses,
      ball,
      flash,
      scoreFlash,
      showNextScore,
      burstLabel,
      burst,
      focusX,
      focusY,
      zoom,
    }
  }

  const shootRel = shotSpot(clip.shot, clip.finish)
  const shoot = flipForSide(shootRel, attackRight)
  const defSpot = flipForSide(
    { x: shootRel.x + 0.06, y: shootRel.y + 0.04 },
    attackRight,
  )

  // Move star / foil toward action spots
  if (star && clip.kind !== 'steal' && clip.kind !== 'block') {
    const gather = easeOutCubic(clamp(p / 0.35, 0, 1))
    const cur = poses.get(star.id)!
    poses.set(star.id, {
      x: lerp(cur.x, shoot.x, gather),
      y: lerp(cur.y, shoot.y, gather),
      hop:
        p > 0.35 && p < 0.7
          ? Math.sin(clamp((p - 0.35) / 0.25, 0, 1) * Math.PI) * 0.03
          : 0,
      squash: p > 0.3 && p < 0.45 ? 1.12 : 1,
    })
  }

  if (foil && (clip.kind === 'make' || clip.kind === 'miss' || clip.kind === 'heave_miss')) {
    const cur = poses.get(foil.id)!
    const g = easeOutCubic(clamp(p / 0.4, 0, 1))
    poses.set(foil.id, {
      x: lerp(cur.x, defSpot.x, g * 0.85),
      y: lerp(cur.y, defSpot.y, g * 0.85),
      hop: 0,
      squash: 1,
    })
  }

  if (clip.kind === 'steal' && star && foil) {
    const probe = easeOutCubic(clamp((p - 0.1) / 0.35, 0, 1))
    const poke = clamp((p - 0.4) / 0.25, 0, 1)
    const f = poses.get(foil.id)!
    const s = poses.get(star.id)!
    poses.set(foil.id, { ...f, x: shoot.x, y: shoot.y })
    poses.set(star.id, {
      x: lerp(s.x, shoot.x + (attackRight ? -0.04 : 0.04), Math.max(probe, poke)),
      y: lerp(s.y, shoot.y, probe),
      hop: poke > 0 ? Math.sin(Math.min(poke, 1) * Math.PI) * 0.02 : 0,
      squash: 1,
    })
    const st = poses.get(star.id)!
    if (p > 0.25 && p < 0.95) {
      ball = {
        x: poke < 1 ? lerp(shoot.x, st.x, poke) : st.x + (attackRight ? -0.05 : 0.05) * poke,
        y: shoot.y,
        z: 0.08,
        visible: 1,
      }
    }
    burstLabel = 'STEAL'
    burst = clamp((poke - 0.2) / 0.4, 0, 1) * (1 - clamp((p - 0.85) / 0.15, 0, 1))
    flash = burst * 0.5
    focusX = shoot.x
    focusY = shoot.y
    zoom = 1.12 + burst * 0.06
  } else if (clip.kind === 'block' && star && foil) {
    // star = blocker, foil = shooter
    const rise = clamp((p - 0.25) / 0.35, 0, 1)
    const swat = clamp((p - 0.55) / 0.2, 0, 1)
    const sh = poses.get(foil.id)!
    poses.set(foil.id, {
      x: lerp(sh.x, shoot.x, easeOutCubic(clamp(p / 0.3, 0, 1))),
      y: lerp(sh.y, shoot.y, easeOutCubic(clamp(p / 0.3, 0, 1))),
      hop: rise > 0 ? Math.sin(Math.min(rise, 1) * Math.PI) * 0.028 : 0,
      squash: 1,
    })
    const bl = poses.get(star.id)!
    poses.set(star.id, {
      x: lerp(bl.x, shoot.x + (attackRight ? 0.03 : -0.03), easeOutCubic(rise)),
      y: lerp(bl.y, shoot.y, easeOutCubic(rise)),
      hop: rise > 0 ? easeOutCubic(Math.min(rise * 1.2, 1)) * 0.04 : 0,
      squash: 1,
    })
    if (p > 0.35 && p < 0.9) {
      const flight = clamp((p - 0.35) / 0.4, 0, 1)
      ball = {
        x: lerp(shoot.x, shoot.x + (attackRight ? 0.08 : -0.08), flight),
        y: shoot.y,
        z: 0.12 + Math.sin(flight * Math.PI) * 0.2 - swat * 0.15,
        visible: 1,
      }
    }
    burstLabel = 'BLOCK'
    burst = clamp((swat - 0.1) / 0.35, 0, 1) * (1 - clamp((p - 0.85) / 0.15, 0, 1))
    flash = burst * 0.55
    focusX = shoot.x
    focusY = shoot.y
    zoom = 1.14
  } else if (
    clip.kind === 'make' ||
    clip.kind === 'ot' ||
    clip.kind === 'miss' ||
    clip.kind === 'heave_miss' ||
    clip.kind === 'board' ||
    clip.kind === 'tip'
  ) {
    // Pass then shot
    if (assist && star && p < 0.35) {
      const ap = poses.get(assist.id)!
      const pass = easeInOut(clamp(p / 0.32, 0, 1))
      ball = {
        x: lerp(ap.x, shoot.x, pass),
        y: lerp(ap.y, shoot.y, pass),
        z: 0.1 + Math.sin(pass * Math.PI) * 0.14,
        visible: 1,
      }
      focusX = lerp(ap.x, shoot.x, pass)
      focusY = shoot.y
    }

    const release = 0.38
    const flightEnd = clip.finish === 'heave' || clip.finish === 'buzzer' ? 0.92 : 0.78
    if (p >= release) {
      const flight = clamp((p - release) / (flightEnd - release), 0, 1)
      const arc =
        clip.finish === 'heave' || clip.finish === 'buzzer'
          ? Math.sin(flight * Math.PI) * 0.55
          : Math.sin(flight * Math.PI) * 0.28
      const made =
        clip.kind === 'make' || clip.kind === 'ot' || clip.kind === 'tip'
      const target = made
        ? hoop
        : {
            x: hoop.x + (attackRight ? 0.04 : -0.04),
            y: hoop.y + (hash(clip.playIndex) - 0.5) * 0.12,
          }
      ball = {
        x: lerp(shoot.x, target.x, easeInOut(flight)),
        y: lerp(shoot.y, target.y, easeInOut(flight)),
        z: 0.12 + arc,
        visible: flight < 0.97 ? 1 : 1 - (flight - 0.97) / 0.03,
      }
      focusX = lerp(shoot.x, target.x, flight * 0.75)
      focusY = 0.5
      zoom = 1.08 + (clip.finish === 'buzzer' ? 0.08 : 0)

      if (made && flight > 0.85) {
        scoreFlash = clamp((flight - 0.85) / 0.15, 0, 1)
        showNextScore = true
        flash = scoreFlash * 0.7
        burstLabel =
          clip.finish === 'buzzer'
            ? 'BUZZER'
            : clip.finish === 'heave'
              ? 'HEAVE'
              : clip.finish === 'dunk'
                ? 'DUNK'
                : clip.points === 3
                  ? 'THREE'
                  : 'BUCKET'
        burst = scoreFlash * (1 - clamp((p - 0.92) / 0.08, 0, 1))
      } else if (!made && flight > 0.8) {
        burstLabel =
          clip.kind === 'board' ? 'BOARD' : clip.kind === 'tip' ? 'TIP' : 'MISS'
        burst = clamp((flight - 0.8) / 0.2, 0, 1) * 0.7
      }
    } else if (!assist) {
      ball = { x: shoot.x, y: shoot.y, z: 0.06, visible: 0.9 }
      focusX = shoot.x
      focusY = shoot.y
    }

    // Rebounder drifts in
    if ((clip.kind === 'board' || clip.kind === 'tip') && star && p > 0.7) {
      const g = easeOutCubic(clamp((p - 0.7) / 0.25, 0, 1))
      const cur = poses.get(star.id)!
      const boardSpot = {
        x: lerp(hoop.x, 0.5, 0.15),
        y: hoop.y + (clip.kind === 'tip' ? 0.02 : -0.02),
      }
      poses.set(star.id, {
        x: lerp(cur.x, boardSpot.x, g),
        y: lerp(cur.y, boardSpot.y, g),
        hop: g * 0.02,
        squash: 1,
      })
      if (p > 0.82) {
        const st = poses.get(star.id)!
        ball = { x: st.x, y: st.y, z: 0.08, visible: 1 }
      }
    }
  }

  return {
    poses,
    ball,
    flash,
    scoreFlash,
    showNextScore,
    burstLabel,
    burst,
    focusX,
    focusY,
    zoom,
  }
}

function drawCourtFloor(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
) {
  const padX = W * 0.06
  const padTop = H * 0.16
  const padBot = H * 0.14
  const x0 = padX
  const y0 = padTop
  const cw = W - padX * 2
  const ch = H - padTop - padBot

  // Arena backdrop
  const bg = ctx.createLinearGradient(0, 0, 0, H)
  bg.addColorStop(0, '#1a2332')
  bg.addColorStop(0.35, '#243044')
  bg.addColorStop(1, '#151c28')
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, W, H)

  // Wood floor
  const wood = ctx.createLinearGradient(x0, y0, x0, y0 + ch)
  wood.addColorStop(0, '#c4a574')
  wood.addColorStop(0.5, '#d4b896')
  wood.addColorStop(1, '#b8956a')
  ctx.fillStyle = wood
  ctx.beginPath()
  ctx.roundRect(x0, y0, cw, ch, 10)
  ctx.fill()

  // Lane planks
  ctx.save()
  ctx.beginPath()
  ctx.roundRect(x0, y0, cw, ch, 10)
  ctx.clip()
  for (let i = 0; i < 14; i++) {
    ctx.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)'
    ctx.fillRect(x0, y0 + (ch / 14) * i, cw, ch / 14)
  }

  const line = 'rgba(255,255,255,0.72)'
  ctx.strokeStyle = line
  ctx.lineWidth = 2.2

  // Boundary
  ctx.strokeRect(x0 + 4, y0 + 4, cw - 8, ch - 8)

  // Half court
  const midX = x0 + cw / 2
  const midY = y0 + ch / 2
  ctx.beginPath()
  ctx.moveTo(midX, y0 + 4)
  ctx.lineTo(midX, y0 + ch - 4)
  ctx.stroke()
  ctx.beginPath()
  ctx.arc(midX, midY, ch * 0.12, 0, Math.PI * 2)
  ctx.stroke()

  // Keys + hoops
  for (const side of [-1, 1] as const) {
    const basketX = side < 0 ? x0 + cw * 0.08 : x0 + cw * 0.92
    const keyW = cw * 0.14
    const keyH = ch * 0.42
    const keyX = side < 0 ? x0 + 4 : x0 + cw - 4 - keyW
    const keyY = midY - keyH / 2
    ctx.strokeRect(keyX, keyY, keyW, keyH)
    ctx.beginPath()
    ctx.arc(
      side < 0 ? keyX + keyW : keyX,
      midY,
      ch * 0.12,
      side < 0 ? -Math.PI / 2 : Math.PI / 2,
      side < 0 ? Math.PI / 2 : -Math.PI / 2,
    )
    ctx.stroke()
    // Hoop
    ctx.beginPath()
    ctx.strokeStyle = '#ea580c'
    ctx.lineWidth = 3
    ctx.arc(basketX, midY, 7, 0, Math.PI * 2)
    ctx.stroke()
    ctx.strokeStyle = line
    ctx.lineWidth = 2.2
    // Backboard
    ctx.beginPath()
    ctx.moveTo(basketX + side * 12, midY - 16)
    ctx.lineTo(basketX + side * 12, midY + 16)
    ctx.stroke()
  }

  ctx.restore()
}

function drawScoreboard(
  ctx: CanvasRenderingContext2D,
  broadcast: GameBroadcast,
  clip: BroadcastClip,
  showNext: boolean,
  W: number,
) {
  const home = showNext ? clip.scoreHome : clip.prevHome
  const away = showNext ? clip.scoreAway : clip.prevAway

  ctx.save()
  // Banner
  ctx.fillStyle = 'rgba(10, 14, 22, 0.82)'
  ctx.beginPath()
  ctx.roundRect(W / 2 - 210, 10, 420, 52, 10)
  ctx.fill()

  ctx.fillStyle = '#f8fafc'
  ctx.font = '700 13px ui-sans-serif, system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText(`${broadcast.homeName}`, W / 2 - 110, 28)
  ctx.fillText(`${broadcast.awayName}`, W / 2 + 110, 28)

  ctx.font = '800 22px ui-sans-serif, system-ui, sans-serif'
  ctx.fillStyle = '#fb923c'
  ctx.fillText(String(home), W / 2 - 110, 50)
  ctx.fillStyle = '#93c5fd'
  ctx.fillText(String(away), W / 2 + 110, 50)

  ctx.fillStyle = '#e2e8f0'
  ctx.font = '700 12px ui-sans-serif, system-ui, sans-serif'
  ctx.fillText(periodStamp(clip.quarter, clip.clock), W / 2, 30)
  ctx.fillStyle = '#94a3b8'
  ctx.font = '600 10px ui-sans-serif, system-ui, sans-serif'
  ctx.fillText(broadcast.stadiumName.toUpperCase(), W / 2, 48)
  ctx.restore()
}

function drawTicker(
  ctx: CanvasRenderingContext2D,
  clip: BroadcastClip,
  W: number,
  H: number,
) {
  ctx.save()
  ctx.fillStyle = 'rgba(10, 14, 22, 0.88)'
  ctx.beginPath()
  ctx.roundRect(W * 0.08, H - 52, W * 0.84, 38, 8)
  ctx.fill()
  ctx.fillStyle = clip.offenseSide === 'home' ? '#fb923c' : '#93c5fd'
  ctx.font = '800 10px ui-sans-serif, system-ui, sans-serif'
  ctx.textAlign = 'left'
  ctx.fillText(clip.teamLabel, W * 0.08 + 14, H - 30)
  ctx.fillStyle = '#f1f5f9'
  ctx.font = '600 12px ui-sans-serif, system-ui, sans-serif'
  const label = `${clip.teamLabel}: ${clip.caption}`
  ctx.fillText(label.length > 72 ? `${label.slice(0, 70)}…` : label, W * 0.08 + 52, H - 30)
  ctx.restore()
}

function drawActor(
  ctx: CanvasRenderingContext2D,
  actor: BroadcastActor,
  pose: Pose,
  img: HTMLImageElement | undefined,
  W: number,
  H: number,
  emphasis: number,
) {
  const { sx, sy, scale } = toScreen(pose.x, pose.y, W, H)
  const baseR = 16 * scale * (0.95 + emphasis * 0.12)
  const y = sy - pose.hop * H * 0.35

  // Shadow
  ctx.save()
  ctx.fillStyle = 'rgba(15, 23, 42, 0.28)'
  ctx.beginPath()
  ctx.ellipse(sx, sy + 6 * scale, baseR * 0.9, baseR * 0.35, 0, 0, Math.PI * 2)
  ctx.fill()

  // Pad
  ctx.beginPath()
  ctx.fillStyle =
    actor.side === 'home'
      ? 'rgba(234, 88, 12, 0.9)'
      : 'rgba(59, 130, 246, 0.9)'
  ctx.ellipse(sx, y + 10 * scale, baseR, baseR * 0.42, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = 'rgba(255,255,255,0.35)'
  ctx.lineWidth = 1.2
  ctx.stroke()

  const size = 36 * scale * pose.squash
  if (img) {
    ctx.drawImage(img, sx - size / 2, y - size * 0.92, size, size)
  } else {
    ctx.fillStyle = '#fff'
    ctx.beginPath()
    ctx.arc(sx, y - 10, 10 * scale, 0, Math.PI * 2)
    ctx.fill()
  }

  // Name crumb for stars
  if (emphasis > 0.7) {
    ctx.fillStyle = 'rgba(15,23,42,0.75)'
    ctx.beginPath()
    ctx.roundRect(sx - 28, y - size * 0.95 - 14, 56, 12, 4)
    ctx.fill()
    ctx.fillStyle = '#fff'
    ctx.font = '700 8px ui-sans-serif, system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText(actor.name.slice(0, 10), sx, y - size * 0.95 - 5)
  }
  ctx.restore()
}

export function paintBroadcastFrame(
  ctx: CanvasRenderingContext2D,
  broadcast: GameBroadcast,
  clip: BroadcastClip,
  assets: BroadcastAssets,
  localT: number,
) {
  const W = BROADCAST_W
  const H = BROADCAST_H
  ctx.clearRect(0, 0, W, H)

  const scene = sceneForClip(clip, localT)

  // Fixed wide shot — pan/zoom is too jumpy above 1×
  drawCourtFloor(ctx, W, H)

  // Sort by y for depth
  const drawn = [...clip.onCourt].sort((a, b) => {
    const pa = scene.poses.get(a.id)?.y ?? 0
    const pb = scene.poses.get(b.id)?.y ?? 0
    return pa - pb
  })

  for (const a of drawn) {
    const pose = scene.poses.get(a.id)
    if (!pose) continue
    const emphasis =
      a.id === clip.starId ? 1 : a.id === clip.foilId || a.id === clip.assistId ? 0.75 : 0.35
    drawActor(ctx, a, pose, assets.sprites.get(a.id), W, H, emphasis)
  }

  if (scene.ball && scene.ball.visible > 0.05) {
    const { sx, sy, scale } = toScreen(scene.ball.x, scene.ball.y, W, H)
    const r = 6.5 * scale
    const by = sy - scene.ball.z * 70 * scale
    ctx.save()
    ctx.globalAlpha = scene.ball.visible
    ctx.fillStyle = 'rgba(15,23,42,0.25)'
    ctx.beginPath()
    ctx.ellipse(sx, sy + 4, r * 0.8, r * 0.3, 0, 0, Math.PI * 2)
    ctx.fill()
    const grad = ctx.createRadialGradient(sx - 2, by - 2, 1, sx, by, r)
    grad.addColorStop(0, '#fdba74')
    grad.addColorStop(1, '#ea580c')
    ctx.fillStyle = grad
    ctx.beginPath()
    ctx.arc(sx, by, r, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }

  if (scene.flash > 0.05) {
    ctx.save()
    ctx.globalAlpha = scene.flash * 0.25
    ctx.fillStyle = '#fff7ed'
    ctx.fillRect(0, 0, W, H)
    ctx.restore()
  }

  if (scene.burstLabel && scene.burst > 0.05) {
    ctx.save()
    ctx.globalAlpha = scene.burst
    ctx.fillStyle = '#fff'
    ctx.strokeStyle = 'rgba(15,23,42,0.55)'
    ctx.lineWidth = 4
    ctx.font = '900 42px ui-sans-serif, system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.strokeText(scene.burstLabel, W / 2, H * 0.42)
    ctx.fillText(scene.burstLabel, W / 2, H * 0.42)
    ctx.restore()
  }

  drawScoreboard(ctx, broadcast, clip, scene.showNextScore, W)
  drawTicker(ctx, clip, W, H)
}
