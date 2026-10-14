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

function slotShort(slot: RosterSlot): string {
  if (slot === 'BENCH1') return 'B1'
  if (slot === 'BENCH2') return 'B2'
  return slot
}

/** Roster order left → right for the share lineup. */
const LINE_SLOTS: RosterSlot[] = [
  'PG',
  'SG',
  'SF',
  'PF',
  'C',
  'BENCH1',
  'BENCH2',
]

/** Single horizontal stack with light overlap + position chips. */
async function paintPartyLine(
  ctx: CanvasRenderingContext2D,
  lineup: Lineup,
  cy: number,
) {
  const members = await Promise.all(
    LINE_SLOTS.map(async (slot) => {
      const entry = lineup[slot]
      const p = entry ? getPokemon(entry.pokemonId) : null
      const img = p ? await loadImage(p.sprite) : null
      return { slot, p, img }
    }),
  )

  const filled = members.filter((m) => m.img || m.p)
  if (filled.length === 0) return

  const size = filled.length >= 7 ? 168 : 180
  const overlap = size * 0.28
  const step = size - overlap
  const totalW = size + step * (filled.length - 1)
  const startX = (W - totalW) / 2
  // Tiny bob so it isn’t perfectly flat
  const bob = [6, -4, 8, 0, 7, -3, 5]

  ctx.fillStyle = 'rgba(40, 30, 20, 0.1)'
  ctx.beginPath()
  ctx.ellipse(W / 2, cy + size * 0.78, totalW * 0.42, 28, 0, 0, Math.PI * 2)
  ctx.fill()

  for (let i = 0; i < filled.length; i++) {
    const { slot, img } = filled[i]!
    const x = startX + i * step
    const y = cy + (bob[i % bob.length] ?? 0)

    ctx.fillStyle = 'rgba(40, 30, 20, 0.12)'
    ctx.beginPath()
    ctx.ellipse(x + size / 2, y + size * 0.88, size * 0.28, 10, 0, 0, Math.PI * 2)
    ctx.fill()

    if (img) {
      ctx.imageSmoothingEnabled = false
      ctx.drawImage(img, x, y, size, size)
      ctx.imageSmoothingEnabled = true
    }

    const label = slotShort(slot)
    ctx.font = '800 16px "Barlow Condensed", Barlow, system-ui, sans-serif'
    const tw = ctx.measureText(label).width
    const lx = x + size / 2 - (tw + 16) / 2
    const ly = y + size + 8
    roundRect(ctx, lx, ly - 12, tw + 16, 22, 7)
    ctx.fillStyle = 'rgba(28, 25, 23, 0.78)'
    ctx.fill()
    ctx.fillStyle = '#fafafa'
    ctx.textAlign = 'center'
    ctx.fillText(label, x + size / 2, ly + 3)
  }
  ctx.textAlign = 'left'
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

  // Party line — the visual hero
  if (showTeam && lineup) {
    await paintPartyLine(ctx, lineup, H * 0.38)
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
