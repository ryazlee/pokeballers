import type { HighlightReel, ReelActor } from './highlightReel'
import { kindTitle, periodStamp } from './highlightReel'

export const HIGHLIGHT_DURATION = 6.0
export const HIGHLIGHT_W = 960
export const HIGHLIGHT_H = 540
export const HIGHLIGHT_FPS = 30

export type LoadedAssets = {
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

export async function loadReelAssets(reel: HighlightReel): Promise<LoadedAssets> {
  const actors = [reel.star, reel.foil, reel.assist].filter(Boolean) as ReelActor[]
  const sprites = new Map<number, HTMLImageElement>()
  await Promise.all(
    actors.map(async (a) => {
      if (sprites.has(a.id)) return
      const img = await loadImage(a.sprite)
      if (img) sprites.set(a.id, img)
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

function easeInCubic(t: number) {
  return t * t * t
}

function easeInOut(t: number) {
  return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2
}

function easeOutBack(t: number) {
  const c = 1.4
  return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2
}

/** Basket on the right for YOU offense, left for CPU — courtside looks along the floor. */
function hoopOnRight(reel: HighlightReel): boolean {
  if (reel.kind === 'block') {
    // Blocker is star; foil is shooter — hoop is the basket the shooter was attacking
    return reel.foil?.side === 'home'
  }
  return reel.offenseSide === 'home'
}

/**
 * Court space for sideline camera:
 * u: 0 → hoop-near baseline … 1 → far baseline (mapped so hoop sits on left or right)
 * v: 0 near sideline (camera) → 1 far sideline
 */
function courtToScreen(
  u: number,
  v: number,
  W: number,
  H: number,
  rightHoop: boolean,
) {
  // Zoomed half-court: only the offensive end fills the frame
  const uu = rightHoop ? u : 1 - u
  const y = lerp(H * 0.9, H * 0.34, v)
  const halfNear = W * 0.52
  const halfFar = W * 0.34
  const half = lerp(halfNear, halfFar, v)
  // Shift so hoop sits near the edge, action fills center
  const mid = rightHoop ? W * 0.42 : W * 0.58
  const x = mid + (uu - 0.55) * 2 * half
  const scale = lerp(1.7, 0.85, v)
  return { x, y, scale }
}

type Pose = {
  u: number
  v: number
  hop: number
  squash: number
  /** lean toward hoop: -1 left … 1 right */
  lean: number
  arms: number
}

type SceneState = {
  fade: number
  zoom: number
  focusU: number
  focusV: number
  rightHoop: boolean
  star: Pose
  foil: Pose | null
  assist: Pose | null
  ball: { u: number; v: number; visible: number; z: number } | null
  scoreFlash: number
  showNextScore: boolean
  burst: number
  caption: number
  net: number
  spark: number
  flash: number
}

function pose(
  u: number,
  v: number,
  hop = 0,
  squash = 1,
  lean = 0,
  arms = 0,
): Pose {
  return { u, v, hop, squash, lean, arms }
}

function idleBob(t: number, phase: number) {
  return Math.sin(t * 5.2 + phase) * 0.01
}

function sceneAt(reel: HighlightReel, t: number): SceneState {
  const kind = reel.kind
  const shot = reel.shot ?? 'mid'
  const finish = reel.finish
  const isDunk = finish === 'dunk' || (finish == null && shot === 'paint' && /dunk/i.test(reel.caption))
  const isLayup =
    finish === 'layup' ||
    (!isDunk && (shot === 'paint' || shot === 'transition'))
  const isThree = shot === 'three'
  const rightHoop = hoopOnRight(reel)

  // Spots relative to hoop at u≈0.92
  const hoopU = 0.92
  const shootU = isDunk ? 0.62 : isLayup ? 0.7 : isThree ? 0.28 : 0.48
  const shootV = isDunk || isLayup ? 0.48 : isThree ? 0.42 : 0.46
  const defU = shootU + (isDunk ? 0.08 : 0.1)
  const defV = shootV + (isDunk || isLayup ? 0.02 : 0.08)

  let star = pose(shootU, shootV, idleBob(t, 0))
  let foil: Pose | null = reel.foil
    ? pose(defU, defV, idleBob(t, 1.1), 1, 0, 0.15)
    : null
  let assist: Pose | null = reel.assist
    ? pose(shootU - 0.22, shootV + 0.1, idleBob(t, 2), 1, 0.2)
    : null

  let ball: SceneState['ball'] = null
  let fade = 1
  let scoreFlash = 0
  let showNextScore = false
  let burst = 0
  let caption = 0
  let net = 0
  let spark = 0
  let flash = 0
  let zoom = 1.18
  let focusU = shootU
  let focusV = shootV

  if (t < 0.4) fade = easeOutCubic(t / 0.4)
  zoom = 1.18 + 0.1 * easeInOut(clamp(t / 3.5, 0, 1))

  // ——— Assist pass ———
  if (assist && t >= 0.35 && t < 1.25) {
    const p = easeInOut(clamp((t - 0.35) / 0.9, 0, 1))
    assist = pose(
      lerp(shootU - 0.28, shootU - 0.08, p),
      lerp(shootV + 0.12, shootV + 0.04, p),
      Math.sin(p * Math.PI) * 0.035,
      1,
      0.35,
      0.4,
    )
    ball = {
      u: lerp(assist.u + 0.04, shootU, p),
      v: lerp(assist.v - 0.02, shootV - 0.06, p),
      visible: 1,
      z: 0.14 + Math.sin(p * Math.PI) * 0.18,
    }
    focusU = lerp(assist.u, shootU, p)
  } else if (assist && t >= 1.25) {
    assist = pose(shootU - 0.1, shootV + 0.08, idleBob(t, 2), 1, 0.15)
  }

  if (kind === 'block') {
    // motionStar = shooter, motionFoil = blocker (swapped at draw)
    const gather = clamp((t - 1.2) / 0.45, 0, 1)
    const rise = clamp((t - 1.65) / 0.55, 0, 1)
    const swat = clamp((t - 2.25) / 0.35, 0, 1)

    star = pose(
      shootU,
      shootV,
      rise > 0 ? Math.sin(Math.min(rise, 1) * Math.PI) * 0.22 : idleBob(t, 0),
      gather > 0 && gather < 1 ? lerp(1, 1.12, Math.sin(gather * Math.PI)) : rise > 0.7 ? 0.92 : 1,
      0.25,
      rise * 0.7,
    )

    if (foil) {
      const leap = clamp((t - 2.05) / 0.5, 0, 1)
      foil = pose(
        lerp(defU, shootU + 0.04, easeOutCubic(leap) * 0.85),
        lerp(defV, shootV - 0.02, easeOutCubic(leap) * 0.7),
        leap > 0 ? easeOutBack(Math.min(leap * 1.1, 1)) * 0.32 : idleBob(t, 1.1),
        leap > 0.5 && leap < 0.85 ? 0.88 : 1,
        -0.2,
        0.3 + leap * 0.9,
      )
    }

    if (t >= 1.85 && t < 3.6) {
      if (t < 2.35) {
        const p = clamp((t - 1.85) / 0.5, 0, 1)
        ball = {
          u: lerp(shootU, defU - 0.02, p),
          v: lerp(shootV - 0.08, defV - 0.14, p),
          visible: 1,
          z: 0.16 + p * 0.28,
        }
      } else {
        const q = clamp((t - 2.35) / 0.9, 0, 1)
        const away = rightHoop ? -1 : 1
        ball = {
          u: lerp(defU, defU + away * -0.25, q),
          v: lerp(defV - 0.14, 0.2, q),
          visible: 1 - q * 0.15,
          z: 0.35 - q * 0.15,
        }
      }
    }

    if (swat > 0) {
      burst = clamp(swat / 0.4, 0, 1) * (1 - clamp((t - 3.3) / 0.6, 0, 1))
      spark = burst
      flash = burst * 0.9
      scoreFlash = burst
      zoom = 1.28 + burst * 0.06
    }
    focusU = shootU
    focusV = shootV
  } else if (kind === 'board' || kind === 'tip') {
    if (foil) {
      const missJump = clamp((t - 1.35) / 0.5, 0, 1)
      foil = pose(
        shootU,
        shootV,
        missJump > 0 && missJump < 1 ? Math.sin(missJump * Math.PI) * 0.16 : idleBob(t, 1.1),
        1,
        0.2,
        missJump * 0.5,
      )
    }
    if (t >= 1.55 && t < 3.9) {
      const p = clamp((t - 1.55) / 1.2, 0, 1)
      if (p < 0.65) {
        ball = {
          u: lerp(shootU, hoopU - 0.02, p / 0.65),
          v: lerp(shootV - 0.08, 0.5, p / 0.65),
          visible: 1,
          z: 0.16 + Math.sin((p / 0.65) * Math.PI) * 0.35,
        }
      } else {
        const q = (p - 0.65) / 0.35
        ball = {
          u: lerp(hoopU - 0.02, hoopU - 0.08, q),
          v: lerp(0.5, 0.55, q),
          visible: 1,
          z: 0.08,
        }
      }
    }
    const tip = clamp((t - 2.95) / 0.65, 0, 1)
    star = pose(
      lerp(0.78, hoopU - 0.06, tip),
      lerp(0.55, 0.5, tip),
      Math.sin(tip * Math.PI) * 0.2,
      tip > 0.75 ? 0.9 : 1,
      0.4,
      0.5 + tip * 0.4,
    )
    if (t >= 3.2) {
      burst = clamp((t - 3.2) / 0.25, 0, 1) * (1 - clamp((t - 4.1) / 0.5, 0, 1))
      spark = burst * 0.8
      flash = burst * 0.5
      net = kind === 'tip' ? burst * 0.8 : 0
    }
    focusU = hoopU - 0.1
    focusV = 0.5
  } else if (isDunk) {
    // Approach → plant → explode above the rim → throw it down
    const approach = clamp((t - 1.05) / 0.75, 0, 1)
    const plant = clamp((t - 1.7) / 0.28, 0, 1)
    const leap = clamp((t - 1.95) / 0.55, 0, 1)
    const slam = clamp((t - 2.45) / 0.35, 0, 1)

    star = pose(
      lerp(shootU - 0.18, hoopU - 0.05, easeInOut(Math.max(approach, leap * 0.65))),
      lerp(shootV + 0.08, 0.5, approach),
      leap > 0
        ? easeOutBack(Math.min(leap, 1)) * 0.48
        : plant > 0
          ? -0.05 * plant
          : idleBob(t, 0),
      plant > 0 && leap <= 0
        ? lerp(1, 1.22, plant)
        : leap > 0 && leap < 0.45
          ? lerp(1.22, 0.82, leap / 0.45)
          : slam > 0.4
            ? 0.92
            : 1,
      0.7,
      0.35 + leap * 0.85,
    )

    if (foil) {
      foil = pose(
        lerp(defU, hoopU - 0.14, approach * 0.35),
        defV + 0.04,
        idleBob(t, 1.1),
        1,
        -0.25,
        0.4,
      )
    }

    // Ball rides with the dunker, then snaps through the rim from above
    if (t >= 1.9 && t < 4.1) {
      if (slam <= 0) {
        ball = {
          u: star.u + 0.04,
          v: star.v - 0.02,
          visible: 1,
          z: 0.22 + star.hop * 0.9,
        }
      } else {
        const p = easeInCubic(slam)
        ball = {
          u: lerp(star.u + 0.03, hoopU, p),
          v: lerp(0.48, 0.5, p),
          visible: p < 0.92 ? 1 : 1 - (p - 0.92) / 0.08,
          z: lerp(0.55, 0.05, p),
        }
      }
    }

    if (slam > 0) {
      net = clamp(slam / 0.3, 0, 1) * (1 - clamp((t - 4.35) / 0.4, 0, 1) * 0.25)
      burst = clamp((t - 2.55) / 0.18, 0, 1) * (1 - clamp((t - 4.35) / 0.55, 0, 1))
      spark = burst
      flash = burst
      scoreFlash = burst
      showNextScore = t >= 2.7
      zoom = 1.32 + burst * 0.08
    }
    focusU = lerp(shootU, hoopU - 0.04, Math.max(approach, leap))
    focusV = 0.5
  } else if (isLayup) {
    // Drive → gather → float → soft kiss off the glass/rim
    const drive = clamp((t - 1.1) / 0.7, 0, 1)
    const gather = clamp((t - 1.7) / 0.32, 0, 1)
    const floatUp = clamp((t - 2.0) / 0.5, 0, 1)
    const kiss = clamp((t - 2.45) / 0.4, 0, 1)

    star = pose(
      lerp(shootU - 0.14, hoopU - 0.1, easeInOut(Math.max(drive, floatUp * 0.55))),
      lerp(shootV + 0.07, 0.47, drive),
      floatUp > 0
        ? Math.sin(Math.min(floatUp, 1) * Math.PI) * 0.24
        : gather > 0
          ? -0.025
          : idleBob(t, 0),
      gather > 0 && floatUp <= 0
        ? lerp(1, 1.14, Math.sin(gather * Math.PI))
        : floatUp > 0.55
          ? 0.94
          : 1,
      0.6,
      0.25 + floatUp * 0.65,
    )

    if (foil) {
      foil = pose(
        lerp(defU, hoopU - 0.16, drive * 0.45),
        defV,
        idleBob(t, 1.1),
        1,
        -0.2,
        0.35,
      )
    }

    if (t >= 2.25 && t < 4.05) {
      const p = clamp((t - 2.25) / 0.95, 0, 1)
      // Soft arc — rises with the floater, then drops in
      ball = {
        u: lerp(star.u + 0.05, hoopU - 0.01, easeInOut(p)),
        v: lerp(0.46, 0.5, p),
        visible: p < 0.9 ? 1 : 1 - (p - 0.9) / 0.1,
        z: 0.18 + Math.sin(p * Math.PI) * 0.28,
      }
    }

    if (kiss > 0) {
      net = clamp(kiss / 0.35, 0, 1) * (1 - clamp((t - 4.35) / 0.4, 0, 1) * 0.3)
      burst = clamp((t - 2.7) / 0.2, 0, 1) * (1 - clamp((t - 4.35) / 0.55, 0, 1))
      spark = burst * 0.85
      flash = burst * 0.7
      scoreFlash = burst
      showNextScore = t >= 2.85
      zoom = 1.28 + burst * 0.05
    }
    focusU = lerp(shootU, hoopU - 0.06, Math.max(drive, floatUp))
    focusV = 0.48
  } else {
    // Jump shot / three — crouch → explode → hang → release
    const crouch = clamp((t - 1.25) / 0.4, 0, 1)
    const explode = clamp((t - 1.65) / 0.45, 0, 1)
    const hang = clamp((t - 2.05) / 0.35, 0, 1)
    const release = clamp((t - 2.25) / 0.25, 0, 1)

    let hop = idleBob(t, 0)
    let squash = 1
    if (crouch > 0 && explode <= 0) {
      hop = -0.04 * easeOutCubic(crouch)
      squash = lerp(1, 1.18, crouch)
    } else if (explode > 0) {
      hop = easeOutBack(Math.min(explode * 1.05, 1)) * (isThree ? 0.3 : 0.26)
      squash = explode < 0.3 ? lerp(1.18, 0.88, explode / 0.3) : lerp(0.88, 1, (explode - 0.3) / 0.7)
    }
    if (hang > 0 && hang < 1) hop = Math.max(hop, 0.22)

    star = pose(shootU, shootV, hop, squash, 0.2, 0.25 + release * 0.7)

    if (foil) {
      const contest = clamp((t - 1.8) / 0.5, 0, 1)
      foil = pose(
        defU,
        defV,
        contest > 0 ? contest * 0.14 : idleBob(t, 1.1),
        1,
        -0.1,
        0.2 + contest * 0.55,
      )
    }

    if (t >= 2.3 && t < 4.15) {
      const p = clamp((t - 2.3) / 1.5, 0, 1)
      const arc = Math.sin(p * Math.PI)
      ball = {
        u: lerp(shootU + 0.04, hoopU, easeInOut(p)),
        v: lerp(shootV - 0.05, 0.5, easeInOut(p)),
        visible: p < 0.92 ? 1 : 1 - (p - 0.92) / 0.08,
        z: 0.2 + arc * (isThree ? 0.55 : 0.4),
      }
      focusU = lerp(shootU, hoopU, easeInOut(p))
    }

    if (t >= 3.7) {
      net = clamp((t - 3.7) / 0.3, 0, 1) * (1 - clamp((t - 4.55) / 0.4, 0, 1) * 0.3)
      burst = clamp((t - 3.75) / 0.2, 0, 1) * (1 - clamp((t - 4.55) / 0.55, 0, 1))
      spark = burst
      flash = burst * 0.9
      scoreFlash = burst
      showNextScore = t >= 3.9
      zoom = 1.28 + burst * 0.06
    }
    focusV = shootV
  }

  if (t >= 4.25) caption = easeOutCubic(clamp((t - 4.25) / 0.35, 0, 1))

  return {
    fade,
    zoom,
    focusU,
    focusV,
    rightHoop,
    star,
    foil,
    assist,
    ball,
    scoreFlash,
    showNextScore,
    burst,
    caption,
    net,
    spark,
    flash,
  }
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const radius = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.arcTo(x + w, y, x + w, y + h, radius)
  ctx.arcTo(x + w, y + h, x, y + h, radius)
  ctx.arcTo(x, y + h, x, y, radius)
  ctx.arcTo(x, y, x + w, y, radius)
  ctx.closePath()
}

function drawArena(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  t: number,
  rightHoop: boolean,
  netSwish = 0,
) {
  const to = (u: number, v: number) => courtToScreen(u, v, W, H, rightHoop)

  const bg = ctx.createLinearGradient(0, 0, 0, H)
  bg.addColorStop(0, '#0f172a')
  bg.addColorStop(0.3, '#1e293b')
  bg.addColorStop(0.55, '#334155')
  bg.addColorStop(1, '#1e293b')
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, W, H)

  // Lights above the floor
  for (const [lx, strength] of [
    [0.35, 0.2],
    [0.55, 0.28],
    [0.75, 0.18],
  ] as const) {
    const pulse = 1 + Math.sin(t * 3 + lx * 6) * 0.04
    const g = ctx.createRadialGradient(
      W * lx,
      H * 0.06,
      4,
      W * lx,
      H * 0.3,
      W * 0.32 * pulse,
    )
    g.addColorStop(0, `rgba(254, 243, 199, ${strength})`)
    g.addColorStop(0.55, `rgba(251, 146, 60, ${strength * 0.22})`)
    g.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, W, H * 0.55)
  }

  // Crowd along far sideline
  ctx.save()
  for (let row = 0; row < 5; row++) {
    const y = 14 + row * 11
    ctx.globalAlpha = 0.18 + row * 0.04
    for (let i = 0; i < 40; i++) {
      const x = 20 + i * ((W - 40) / 39) + (row % 2) * 5
      const bob = Math.sin(t * 4.2 + i * 0.35 + row) * 1.4
      const palette = ['#fb923c', '#38bdf8', '#f87171', '#a3e635', '#e2e8f0', '#fbbf24']
      ctx.fillStyle = palette[(i + row) % palette.length]!
      roundRect(ctx, x, y + bob, 5.5, 8, 2)
      ctx.fill()
    }
  }
  ctx.restore()

  ctx.fillStyle = 'rgba(15, 23, 42, 0.5)'
  ctx.fillRect(0, H * 0.22, W, 8)
  ctx.fillStyle = 'rgba(251, 146, 60, 0.4)'
  ctx.fillRect(0, H * 0.22 + 8, W, 2)

  // Floor quad — along the court (u), across (v)
  const nearL = to(0.05, 0)
  const nearR = to(0.98, 0)
  const farL = to(0.05, 1)
  const farR = to(0.98, 1)

  ctx.beginPath()
  ctx.moveTo(nearL.x, nearL.y)
  ctx.lineTo(nearR.x, nearR.y)
  ctx.lineTo(farR.x, farR.y)
  ctx.lineTo(farL.x, farL.y)
  ctx.closePath()
  const floor = ctx.createLinearGradient(0, farL.y, 0, nearL.y)
  floor.addColorStop(0, '#b45309')
  floor.addColorStop(0.35, '#d97706')
  floor.addColorStop(0.65, '#fbbf24')
  floor.addColorStop(1, '#fde68a')
  ctx.fillStyle = floor
  ctx.fill()

  ctx.save()
  ctx.clip()
  // Planks run along length of court
  for (let i = 0; i < 12; i++) {
    const v0 = i / 12
    const v1 = (i + 1) / 12
    const a = to(0.05, v0)
    const b = to(0.98, v0)
    const c = to(0.98, v1)
    const d = to(0.05, v1)
    ctx.beginPath()
    ctx.moveTo(a.x, a.y)
    ctx.lineTo(b.x, b.y)
    ctx.lineTo(c.x, c.y)
    ctx.lineTo(d.x, d.y)
    ctx.closePath()
    ctx.fillStyle =
      i % 2 === 0 ? 'rgba(146, 64, 14, 0.1)' : 'rgba(255, 251, 235, 0.07)'
    ctx.fill()
  }
  ctx.restore()

  ctx.strokeStyle = 'rgba(255,255,255,0.85)'
  ctx.lineWidth = 3
  ctx.lineJoin = 'round'
  ctx.beginPath()
  ctx.moveTo(nearL.x, nearL.y)
  ctx.lineTo(nearR.x, nearR.y)
  ctx.lineTo(farR.x, farR.y)
  ctx.lineTo(farL.x, farL.y)
  ctx.closePath()
  ctx.stroke()

  // Key (paint) near the hoop
  const k1 = to(0.7, 0.28)
  const k2 = to(0.95, 0.28)
  const k3 = to(0.95, 0.72)
  const k4 = to(0.7, 0.72)
  ctx.beginPath()
  ctx.moveTo(k1.x, k1.y)
  ctx.lineTo(k2.x, k2.y)
  ctx.lineTo(k3.x, k3.y)
  ctx.lineTo(k4.x, k4.y)
  ctx.closePath()
  ctx.fillStyle = 'rgba(14, 116, 144, 0.42)'
  ctx.fill()
  ctx.strokeStyle = 'rgba(255,255,255,0.75)'
  ctx.lineWidth = 2.5
  ctx.stroke()

  // FT circle
  const ft = to(0.7, 0.5)
  ctx.beginPath()
  ctx.ellipse(ft.x, ft.y, 18 * ft.scale, 42 * ft.scale, 0, -Math.PI / 2, Math.PI / 2)
  ctx.stroke()

  // 3pt arc (curves away from hoop)
  ctx.beginPath()
  const t1 = to(0.22, 0.12)
  const t2 = to(0.35, 0.5)
  const t3 = to(0.22, 0.88)
  ctx.moveTo(t1.x, t1.y)
  ctx.quadraticCurveTo(t2.x, t2.y, t3.x, t3.y)
  ctx.strokeStyle = 'rgba(255,255,255,0.7)'
  ctx.stroke()

  // Hoop spotlight on the floor under the basket
  const rimFloor = to(0.9, 0.5)
  const spot = ctx.createRadialGradient(
    rimFloor.x,
    rimFloor.y,
    4,
    rimFloor.x,
    rimFloor.y,
    W * 0.16,
  )
  spot.addColorStop(0, 'rgba(255,255,255,0.3)')
  spot.addColorStop(0.45, 'rgba(251,146,60,0.12)')
  spot.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = spot
  ctx.beginPath()
  ctx.ellipse(rimFloor.x, rimFloor.y, W * 0.12, H * 0.08, 0, 0, Math.PI * 2)
  ctx.fill()

  drawSideHoop(ctx, to(0.96, 0.5), rightHoop, netSwish)
}

/**
 * Classic courtside side-profile hoop:
 * pole → arm → backboard slab → rim as a flat horizontal oval into the court → net down.
 */
function drawSideHoop(
  ctx: CanvasRenderingContext2D,
  anchor: { x: number; y: number; scale: number },
  rightHoop: boolean,
  netSwish: number,
) {
  const s = Math.max(0.75, anchor.scale)
  const into = rightHoop ? -1 : 1
  const baseX = anchor.x
  const rimY = anchor.y - 78 * s
  const boardX = baseX
  const rimCx = boardX + into * 28 * s

  // Pole
  ctx.fillStyle = '#475569'
  ctx.fillRect(baseX - 5 * s, rimY + 8 * s, 10 * s, 95 * s)
  ctx.fillStyle = '#334155'
  roundRect(ctx, baseX - 18 * s, anchor.y - 4 * s, 36 * s, 10 * s, 3)
  ctx.fill()

  // Arm
  ctx.strokeStyle = '#64748b'
  ctx.lineWidth = 6 * s
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(baseX, rimY + 18 * s)
  ctx.lineTo(boardX + into * 6 * s, rimY + 4 * s)
  ctx.stroke()

  // Backboard — tall thin side profile
  const boardW = 10 * s
  const boardH = 52 * s
  const boardLeft = boardX - boardW / 2
  const boardTop = rimY - boardH * 0.55

  ctx.fillStyle = 'rgba(226, 232, 240, 0.35)'
  roundRect(
    ctx,
    boardLeft + into * -2 * s,
    boardTop + 4 * s,
    boardW + 4 * s,
    boardH - 8 * s,
    2,
  )
  ctx.fill()

  ctx.fillStyle = '#f1f5f9'
  roundRect(ctx, boardLeft, boardTop, boardW, boardH, 2)
  ctx.fill()
  ctx.strokeStyle = '#0f172a'
  ctx.lineWidth = 1.5
  ctx.stroke()

  ctx.fillStyle = '#ea580c'
  ctx.fillRect(boardLeft + 2 * s, rimY - 10 * s, boardW - 4 * s, 18 * s)

  // Rim — flat horizontal oval into the court
  const rimRx = 22 * s
  const rimRy = 5.5 * s
  ctx.strokeStyle = '#ea580c'
  ctx.lineWidth = 4.5 * s
  ctx.beginPath()
  ctx.ellipse(rimCx, rimY, rimRx, rimRy, 0, 0, Math.PI * 2)
  ctx.stroke()
  ctx.strokeStyle = '#c2410c'
  ctx.lineWidth = 2 * s
  ctx.beginPath()
  ctx.ellipse(rimCx, rimY + 1.2 * s, rimRx * 0.88, rimRy * 0.75, 0, 0, Math.PI * 2)
  ctx.stroke()

  ctx.strokeStyle = '#94a3b8'
  ctx.lineWidth = 2.5 * s
  ctx.beginPath()
  ctx.moveTo(boardX + into * (boardW / 2), rimY)
  ctx.lineTo(rimCx - into * rimRx * 0.85, rimY)
  ctx.stroke()

  // Net
  const netLen = (18 + netSwish * 10) * s
  const flare = 1 - netSwish * 0.35
  ctx.strokeStyle = `rgba(248, 250, 252, ${0.75 + netSwish * 0.2})`
  ctx.lineWidth = 1.4 * s
  for (let i = -3; i <= 3; i++) {
    const tt = i / 3
    const topX = rimCx + tt * rimRx * 0.85
    const botX = rimCx + tt * rimRx * 0.35 * flare
    ctx.beginPath()
    ctx.moveTo(topX, rimY + rimRy * 0.3)
    ctx.quadraticCurveTo(
      topX + into * netSwish * 4 * s,
      rimY + netLen * 0.55,
      botX,
      rimY + netLen,
    )
    ctx.stroke()
  }
  ctx.save()
  ctx.globalAlpha = 0.45
  for (let row = 1; row <= 3; row++) {
    const yy = rimY + (netLen * row) / 3.5
    const spread = rimRx * (0.85 - row * 0.15) * flare
    ctx.beginPath()
    ctx.ellipse(rimCx, yy, spread, 2.2 * s, 0, 0, Math.PI * 2)
    ctx.stroke()
  }
  ctx.restore()
}

function hoopRimScreen(W: number, H: number, rightHoop: boolean) {
  const anchor = courtToScreen(0.96, 0.5, W, H, rightHoop)
  const into = rightHoop ? -1 : 1
  const s = Math.max(0.75, anchor.scale)
  const rimY = anchor.y - 78 * s
  const rimCx = anchor.x + into * 28 * s
  return { x: rimCx, y: rimY, scale: s, into }
}

function drawActor(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement | undefined,
  actor: ReelActor,
  p: Pose,
  W: number,
  H: number,
  rightHoop: boolean,
  emphasis: number,
) {
  const { x, y, scale } = courtToScreen(p.u, p.v, W, H, rightHoop)
  const size = (128 + emphasis * 32) * scale
  const hop = p.hop * H * 0.42
  const footY = y - hop
  const drawW = size * (2 - p.squash) * (1 + Math.abs(p.lean) * 0.04)
  const drawH = size * p.squash
  // Face toward the hoop slightly via mirror when leaning
  const flip = (rightHoop ? 1 : -1) * (p.lean >= 0 ? 1 : -1)

  const isHome = actor.side === 'home'
  const accent = isHome ? '#ea580c' : '#38bdf8'
  const accentRgb = isHome ? '234, 88, 12' : '56, 189, 248'

  // Floor ring
  ctx.strokeStyle = `rgba(${accentRgb}, 0.9)`
  ctx.lineWidth = 3.5 * scale
  ctx.beginPath()
  ctx.ellipse(x, y + 6, size * 0.4, size * 0.12, 0, 0, Math.PI * 2)
  ctx.stroke()
  ctx.fillStyle = `rgba(${accentRgb}, 0.22)`
  ctx.fill()

  // Glow
  const glow = ctx.createRadialGradient(
    x,
    footY - drawH * 0.45,
    4,
    x,
    footY - drawH * 0.4,
    drawW * 0.75,
  )
  glow.addColorStop(0, `rgba(${accentRgb}, ${0.4 + emphasis * 0.2})`)
  glow.addColorStop(1, `rgba(${accentRgb}, 0)`)
  ctx.fillStyle = glow
  ctx.beginPath()
  ctx.arc(x, footY - drawH * 0.45, drawW * 0.7, 0, Math.PI * 2)
  ctx.fill()

  ctx.fillStyle = 'rgba(15, 23, 42, 0.38)'
  ctx.beginPath()
  ctx.ellipse(x, y + 8, size * 0.34, size * 0.1, 0, 0, Math.PI * 2)
  ctx.fill()

  if (img) {
    ctx.save()
    ctx.translate(x, footY - drawH * 0.45)
    // Lean toward hoop
    ctx.rotate(p.lean * 0.12 * (rightHoop ? 1 : -1))
    ctx.scale(flip > 0 ? 1 : -1, 1)
    // Arms up exaggerate via slight stretch on jump
    const armStretch = 1 + p.arms * 0.08
    ctx.imageSmoothingEnabled = false
    ctx.shadowColor = 'rgba(15, 23, 42, 0.5)'
    ctx.shadowBlur = 16 * scale
    ctx.shadowOffsetY = 6 * scale
    ctx.drawImage(
      img,
      -drawW / 2,
      -drawH * 0.5 * armStretch,
      drawW,
      drawH * armStretch,
    )
    ctx.restore()
  }

  // Name plate
  const side = isHome ? 'YOU' : 'CPU'
  const name = actor.name.length > 10 ? `${actor.name.slice(0, 9)}…` : actor.name
  ctx.font = `800 ${Math.max(11, 13 * scale)}px "Barlow Condensed", Barlow, sans-serif`
  const sideW = ctx.measureText(side).width
  ctx.font = `700 ${Math.max(10, 12 * scale)}px Barlow, sans-serif`
  const nameW = ctx.measureText(name).width
  const pad = 6
  const gap = 5
  const plateW = sideW + nameW + pad * 3 + gap
  const plateH = 18 * Math.max(0.85, scale)
  const px = x - plateW / 2
  const py = footY + 8

  ctx.fillStyle = 'rgba(15, 23, 42, 0.9)'
  roundRect(ctx, px, py, plateW, plateH, 6)
  ctx.fill()
  ctx.fillStyle = accent
  roundRect(ctx, px, py, sideW + pad * 2, plateH, 6)
  ctx.fill()
  ctx.fillRect(px + sideW + pad, py, pad, plateH)

  ctx.fillStyle = '#fff'
  ctx.font = `800 ${Math.max(11, 13 * scale)}px "Barlow Condensed", Barlow, sans-serif`
  ctx.textAlign = 'left'
  ctx.fillText(side, px + pad, py + plateH * 0.7)
  ctx.fillStyle = '#f8fafc'
  ctx.font = `700 ${Math.max(10, 12 * scale)}px Barlow, sans-serif`
  ctx.fillText(name, px + sideW + pad * 2 + gap, py + plateH * 0.7)
}

function drawScorebug(
  ctx: CanvasRenderingContext2D,
  reel: HighlightReel,
  state: SceneState,
  W: number,
) {
  const home = state.showNextScore ? reel.scoreHome : reel.prevHome
  const away = state.showNextScore ? reel.scoreAway : reel.prevAway
  const w = 280
  const h = 48
  const x = (W - w) / 2
  const y = 16

  ctx.fillStyle = 'rgba(15, 23, 42, 0.92)'
  roundRect(ctx, x, y, w, h, 12)
  ctx.fill()
  if (state.scoreFlash > 0) {
    ctx.fillStyle = `rgba(251, 146, 60, ${0.35 * state.scoreFlash})`
    roundRect(ctx, x, y, w, h, 12)
    ctx.fill()
  }

  ctx.textAlign = 'center'
  ctx.fillStyle = '#ea580c'
  roundRect(ctx, x + 6, y + 6, 56, h - 12, 8)
  ctx.fill()
  ctx.fillStyle = '#fff'
  ctx.font = '800 14px "Barlow Condensed", sans-serif'
  ctx.fillText('YOU', x + 34, y + 30)

  ctx.fillStyle = '#f8fafc'
  ctx.font = '800 28px "Barlow Condensed", sans-serif'
  ctx.fillText(String(home), x + 92, y + 33)
  ctx.fillStyle = '#64748b'
  ctx.font = '700 18px "Barlow Condensed", sans-serif'
  ctx.fillText('–', x + 128, y + 32)
  ctx.fillStyle = '#f8fafc'
  ctx.font = '800 28px "Barlow Condensed", sans-serif'
  ctx.fillText(String(away), x + 164, y + 33)

  ctx.fillStyle = '#334155'
  roundRect(ctx, x + w - 62, y + 6, 56, h - 12, 8)
  ctx.fill()
  ctx.fillStyle = '#e2e8f0'
  ctx.font = '800 14px "Barlow Condensed", sans-serif'
  ctx.fillText('CPU', x + w - 34, y + 30)
  ctx.textAlign = 'left'
}

function drawSparks(
  ctx: CanvasRenderingContext2D,
  amount: number,
  cx: number,
  cy: number,
  color: string,
) {
  if (amount <= 0) return
  ctx.save()
  for (let i = 0; i < 20; i++) {
    const ang = (i / 20) * Math.PI * 2 + amount
    const dist = (24 + (i % 5) * 14) * amount
    ctx.globalAlpha = amount * (0.55 + (i % 3) * 0.15)
    ctx.fillStyle = i % 2 === 0 ? color : '#fff'
    ctx.beginPath()
    ctx.arc(
      cx + Math.cos(ang) * dist,
      cy + Math.sin(ang) * dist * 0.55,
      2.5 + (i % 3),
      0,
      Math.PI * 2,
    )
    ctx.fill()
  }
  ctx.restore()
}

export function paintCourtsideFrame(
  ctx: CanvasRenderingContext2D,
  reel: HighlightReel,
  assets: LoadedAssets,
  t: number,
  W = HIGHLIGHT_W,
  H = HIGHLIGHT_H,
) {
  const state = sceneAt(reel, clamp(t, 0, HIGHLIGHT_DURATION))
  const { rightHoop } = state
  const to = (u: number, v: number) => courtToScreen(u, v, W, H, rightHoop)

  ctx.clearRect(0, 0, W, H)
  ctx.save()
  ctx.globalAlpha = state.fade

  const focus = to(state.focusU, state.focusV)
  ctx.translate(W / 2, H / 2)
  ctx.scale(state.zoom, state.zoom)
  ctx.translate(-focus.x * 0.35 - W * 0.32, -focus.y * 0.15 - H * 0.42)

  drawArena(ctx, W, H, t, rightHoop, state.net)

  type DrawItem =
    | {
        z: number
        kind: 'assist' | 'foil' | 'star'
        actor: ReelActor
        pose: Pose
        emphasis: number
      }
    | { z: number; kind: 'ball'; u: number; v: number; elev: number; visible: number }

  const items: DrawItem[] = []
  const motionStar =
    reel.kind === 'block' && reel.foil ? reel.foil : reel.star
  const motionFoil = reel.kind === 'block' ? reel.star : reel.foil

  if (state.assist && reel.assist) {
    items.push({
      z: state.assist.v,
      kind: 'assist',
      actor: reel.assist,
      pose: state.assist,
      emphasis: 0.45,
    })
  }
  if (state.foil && motionFoil) {
    items.push({
      z: state.foil.v,
      kind: 'foil',
      actor: motionFoil,
      pose: state.foil,
      emphasis: reel.kind === 'block' ? 1 : 0.65,
    })
  }
  items.push({
    z: state.star.v,
    kind: 'star',
    actor: motionStar,
    pose: state.star,
    emphasis: 1,
  })
  if (state.ball) {
    items.push({
      z: state.ball.v + state.ball.z * 0.08,
      kind: 'ball',
      u: state.ball.u,
      v: state.ball.v,
      elev: state.ball.z,
      visible: state.ball.visible,
    })
  }
  items.sort((a, b) => a.z - b.z)

  if (state.ball && state.ball.visible > 0.2) {
    for (let g = 4; g >= 1; g--) {
      const s = to(state.ball.u - 0.012 * g * (rightHoop ? 1 : -1), state.ball.v)
      const elev = (state.ball.z - g * 0.03) * H * 0.4
      ctx.globalAlpha = state.fade * state.ball.visible * (0.15 / g)
      ctx.fillStyle = '#fdba74'
      ctx.beginPath()
      ctx.arc(s.x, s.y - elev, (11 - g) * s.scale, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.globalAlpha = state.fade
  }

  for (const item of items) {
    if (item.kind === 'ball') {
      const s = to(item.u, item.v)
      const elev = item.elev * H * 0.42
      ctx.globalAlpha = state.fade * item.visible
      ctx.fillStyle = 'rgba(15,23,42,0.32)'
      ctx.beginPath()
      ctx.ellipse(s.x, s.y, 9 * s.scale, 4.5 * s.scale, 0, 0, Math.PI * 2)
      ctx.fill()
      const grd = ctx.createRadialGradient(
        s.x - 3,
        s.y - elev - 3,
        1,
        s.x,
        s.y - elev,
        11 * s.scale,
      )
      grd.addColorStop(0, '#ffedd5')
      grd.addColorStop(0.4, '#fb923c')
      grd.addColorStop(1, '#9a3412')
      ctx.fillStyle = grd
      ctx.beginPath()
      ctx.arc(s.x, s.y - elev, 10 * s.scale, 0, Math.PI * 2)
      ctx.fill()
      ctx.globalAlpha = state.fade
      continue
    }
    drawActor(
      ctx,
      assets.sprites.get(item.actor.id),
      item.actor,
      item.pose,
      W,
      H,
      rightHoop,
      item.emphasis,
    )
  }

  if (state.spark > 0) {
    const rim =
      reel.kind === 'block'
        ? to(state.star.u + 0.05, state.star.v)
        : hoopRimScreen(W, H, rightHoop)
    drawSparks(
      ctx,
      state.spark,
      rim.x,
      rim.y - (reel.kind === 'block' ? 40 : 0),
      reel.kind === 'block' ? '#fda4af' : '#fdba74',
    )
  }

  ctx.restore()

  // HUD
  ctx.save()
  ctx.globalAlpha = state.fade

  if (state.flash > 0) {
    ctx.fillStyle = `rgba(255,255,255,${0.2 * state.flash})`
    ctx.fillRect(0, 0, W, H)
  }

  drawScorebug(ctx, reel, state, W)

  ctx.fillStyle = 'rgba(15, 23, 42, 0.9)'
  roundRect(ctx, 16, 16, 150, 48, 10)
  ctx.fill()
  ctx.fillStyle = '#fb923c'
  ctx.font = '800 13px "Barlow Condensed", sans-serif'
  ctx.fillText(kindTitle(reel.kind, reel.finish), 28, 36)
  ctx.fillStyle = '#e2e8f0'
  ctx.font = '600 13px Barlow, sans-serif'
  ctx.fillText(periodStamp(reel.quarter, reel.clock), 28, 54)

  ctx.textAlign = 'right'
  const stad =
    reel.stadiumName.length > 20
      ? `${reel.stadiumName.slice(0, 19)}…`
      : reel.stadiumName
  ctx.font = '600 12px Barlow, sans-serif'
  const sw = ctx.measureText(stad).width + 20
  ctx.fillStyle = 'rgba(15, 23, 42, 0.78)'
  roundRect(ctx, W - 16 - sw, 16, sw, 28, 8)
  ctx.fill()
  ctx.fillStyle = '#94a3b8'
  ctx.fillText(stad, W - 26, 35)
  ctx.textAlign = 'left'

  // Slim cinematic bars
  ctx.fillStyle = 'rgba(15, 23, 42, 0.85)'
  ctx.fillRect(0, 0, W, 5)
  ctx.fillRect(0, H - 5, W, 5)
  ctx.fillStyle = 'rgba(234, 88, 12, 0.85)'
  ctx.fillRect(0, 5, W, 1.5)
  ctx.fillRect(0, H - 6.5, W, 1.5)

  if (state.burst > 0) {
    ctx.globalAlpha = state.burst
    ctx.fillStyle = '#fff'
    ctx.font = '800 56px "Barlow Condensed", sans-serif'
    ctx.textAlign = 'center'
    ctx.shadowColor = 'rgba(15, 23, 42, 0.65)'
    ctx.shadowBlur = 20
    ctx.fillText(kindTitle(reel.kind, reel.finish), W / 2, H * 0.34)
    ctx.shadowBlur = 0
    ctx.textAlign = 'left'
  }

  if (state.caption > 0) {
    ctx.globalAlpha = state.caption
    const text = reel.caption
    ctx.font = '700 17px Barlow, sans-serif'
    const tw = Math.min(ctx.measureText(text).width + 36, W - 56)
    const cx = (W - tw) / 2
    const cy = H - 58
    ctx.fillStyle = 'rgba(15, 23, 42, 0.92)'
    roundRect(ctx, cx, cy, tw, 38, 10)
    ctx.fill()
    ctx.strokeStyle = 'rgba(251, 146, 60, 0.55)'
    ctx.lineWidth = 1.5
    ctx.stroke()
    ctx.fillStyle = '#f8fafc'
    ctx.textAlign = 'center'
    ctx.fillText(text, W / 2, cy + 25)
    ctx.textAlign = 'left'
  }

  ctx.globalAlpha = 1
  const vig = ctx.createRadialGradient(
    W / 2,
    H * 0.52,
    H * 0.2,
    W / 2,
    H * 0.5,
    H * 0.85,
  )
  vig.addColorStop(0, 'rgba(0,0,0,0)')
  vig.addColorStop(1, 'rgba(15, 23, 42, 0.42)')
  ctx.fillStyle = vig
  ctx.fillRect(0, 0, W, H)

  ctx.restore()
}
