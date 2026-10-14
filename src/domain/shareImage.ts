import type { GauntletResult } from './daily'
import { getPokemon } from './pokemon'
import type { Lineup, RosterSlot } from './types'

/** Landscape “team photo” card — closer to classic party art than a phone story. */
const W = 1200
const H = 800

function logoUrl(): string {
  return `${import.meta.env.BASE_URL}og.png`
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

export type ShareImageOptions = {
  showTeam?: boolean
  lineup?: Lineup
}

/**
 * Cluster layout inspired by classic party screenshots:
 * big pieces in back, wings mid, smaller up front — drawn back→front.
 */
const STACK: { slot: RosterSlot; x: number; y: number; size: number }[] = [
  { slot: 'C', x: 0, y: -70, size: 210 },
  { slot: 'PF', x: -150, y: -40, size: 190 },
  { slot: 'SF', x: 150, y: -40, size: 190 },
  { slot: 'SG', x: -210, y: 40, size: 175 },
  { slot: 'PG', x: 210, y: 40, size: 175 },
  { slot: 'BENCH1', x: -80, y: 110, size: 155 },
  { slot: 'BENCH2', x: 80, y: 110, size: 155 },
]

async function paintPartyCluster(
  ctx: CanvasRenderingContext2D,
  lineup: Lineup,
  cx: number,
  cy: number,
) {
  const loaded = await Promise.all(
    STACK.map(async (spot) => {
      const entry = lineup[spot.slot]
      const p = entry ? getPokemon(entry.pokemonId) : null
      const img = p ? await loadImage(p.sprite) : null
      return { ...spot, p, img }
    }),
  )

  // Soft ground shadow under the whole party
  ctx.fillStyle = 'rgba(40, 30, 20, 0.12)'
  ctx.beginPath()
  ctx.ellipse(cx, cy + 150, 340, 42, 0, 0, Math.PI * 2)
  ctx.fill()

  for (const spot of loaded) {
    if (!spot.img && !spot.p) continue
    const x = cx + spot.x - spot.size / 2
    const y = cy + spot.y - spot.size / 2

    ctx.fillStyle = 'rgba(40, 30, 20, 0.14)'
    ctx.beginPath()
    ctx.ellipse(
      cx + spot.x,
      cy + spot.y + spot.size * 0.42,
      spot.size * 0.32,
      12,
      0,
      0,
      Math.PI * 2,
    )
    ctx.fill()

    if (spot.img) {
      ctx.imageSmoothingEnabled = false
      ctx.drawImage(spot.img, x, y, spot.size, spot.size)
      ctx.imageSmoothingEnabled = true
    }
  }
}

function paintOutcomeStrip(
  ctx: CanvasRenderingContext2D,
  result: GauntletResult,
  x: number,
  y: number,
) {
  const size = 28
  const gap = 5
  let mx = x
  for (const g of result.games) {
    const fill =
      g.outcome === 'W' ? '#16a34a' : g.outcome === 'T' ? '#a8a29e' : '#e11d48'
    roundRect(ctx, mx, y, size, size, 6)
    ctx.fillStyle = fill
    ctx.fill()
    ctx.fillStyle = '#fff'
    ctx.font = '800 14px "Barlow Condensed", Barlow, system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText(g.outcome, mx + size / 2, y + 19)
    mx += size + gap
  }
  ctx.textAlign = 'left'
}

/** Paint a landscape share card onto the canvas. */
export async function paintShareImage(
  canvas: HTMLCanvasElement,
  result: GauntletResult,
  options: ShareImageOptions = {},
): Promise<void> {
  const { showTeam = true, lineup } = options
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  await document.fonts.ready.catch(() => undefined)
  const logo = await loadImage(logoUrl())

  // Soft paper / team-photo backdrop (like classic party art)
  const bg = ctx.createLinearGradient(0, 0, 0, H)
  bg.addColorStop(0, '#f3efe6')
  bg.addColorStop(0.55, '#ebe4d6')
  bg.addColorStop(1, '#e2d8c6')
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, W, H)

  // Subtle grain
  ctx.save()
  ctx.globalAlpha = 0.04
  for (let i = 0; i < 120; i++) {
    const gx = (i * 97) % W
    const gy = (i * 53) % H
    ctx.fillStyle = i % 2 === 0 ? '#000' : '#fff'
    ctx.fillRect(gx, gy, 3, 3)
  }
  ctx.restore()

  // Soft vignette
  const vig = ctx.createRadialGradient(W / 2, H * 0.45, 180, W / 2, H * 0.5, 700)
  vig.addColorStop(0, 'rgba(0,0,0,0)')
  vig.addColorStop(1, 'rgba(60, 45, 30, 0.12)')
  ctx.fillStyle = vig
  ctx.fillRect(0, 0, W, H)

  const pad = 48
  const record = `${result.wins}-${result.losses}${result.ties ? `-${result.ties}` : ''}`
  const diff = result.pointDiff >= 0 ? `+${result.pointDiff}` : `${result.pointDiff}`

  // Header — brand left, score/record right
  if (logo) {
    ctx.drawImage(logo, pad, 36, 56, 56)
  }
  ctx.fillStyle = '#1c1917'
  ctx.font = '800 36px "Barlow Condensed", Barlow, system-ui, sans-serif'
  ctx.textAlign = 'left'
  ctx.fillText('POKEBALLERS', pad + 70, 58)
  ctx.fillStyle = '#78716c'
  ctx.font = '600 18px Barlow, system-ui, sans-serif'
  ctx.fillText(`Daily  ·  ${result.dateKey}`, pad + 70, 84)

  // Score block (right)
  ctx.textAlign = 'right'
  ctx.fillStyle = '#ea580c'
  ctx.font = '800 92px "Barlow Condensed", Barlow, system-ui, sans-serif'
  ctx.fillText(String(result.score), W - pad, 96)

  ctx.fillStyle = '#1c1917'
  ctx.font = '800 42px "Barlow Condensed", Barlow, system-ui, sans-serif'
  ctx.fillText(record, W - pad, 142)

  ctx.fillStyle = '#78716c'
  ctx.font = '650 20px Barlow, system-ui, sans-serif'
  ctx.fillText(`${shareHeadline(result)}  ·  ${diff}`, W - pad, 170)
  ctx.textAlign = 'left'

  // Outcome strip under header
  paintOutcomeStrip(ctx, result, pad, 112)

  if (result.slateMvp) {
    ctx.fillStyle = '#a16207'
    ctx.font = '700 18px Barlow, system-ui, sans-serif'
    ctx.fillText(
      `MVP  ${result.slateMvp.name}  ·  ${result.slateMvp.blurb}`,
      pad,
      168,
    )
  }

  // Party cluster — the visual hero
  if (showTeam && lineup) {
    await paintPartyCluster(ctx, lineup, W / 2, H * 0.52)
  } else {
    // Text fallback if no lineup
    let y = 220
    for (const g of result.games) {
      ctx.fillStyle = '#1c1917'
      ctx.font = '700 22px Barlow, system-ui, sans-serif'
      ctx.fillText(
        `${g.result.homeScore}–${g.result.awayScore}  ${g.stadium.name}`,
        pad,
        y,
      )
      y += 36
    }
  }

  ctx.fillStyle = '#a8a29e'
  ctx.font = '500 16px Barlow, system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText('ryazlee.github.io/pokeballers', W / 2, H - 28)
  ctx.textAlign = 'left'
}

export async function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('PNG export failed'))),
      'image/png',
    )
  })
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export async function shareOrDownloadPng(
  blob: Blob,
  filename: string,
): Promise<'shared' | 'downloaded'> {
  const file = new File([blob], filename, { type: 'image/png' })
  const canShare =
    typeof navigator.share === 'function' &&
    typeof navigator.canShare === 'function' &&
    navigator.canShare({ files: [file] })

  if (canShare) {
    try {
      await navigator.share({
        files: [file],
        title: 'Pokeballers Daily',
      })
      return 'shared'
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        return 'shared'
      }
    }
  }

  downloadBlob(blob, filename)
  return 'downloaded'
}
