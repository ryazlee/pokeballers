import type { GauntletResult } from './daily'
import { getPokemon } from './pokemon'
import { ALL_SLOTS, type Lineup } from './types'

/** Landscape share card — closer to feed/post than phone story. */
const W = 1200
const H = 675

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

function paintStatChip(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  label: string,
  value: string,
) {
  roundRect(ctx, x, y, w, h, 12)
  ctx.fillStyle = 'rgba(255,255,255,0.07)'
  ctx.fill()
  ctx.strokeStyle = 'rgba(255,255,255,0.12)'
  ctx.lineWidth = 1.5
  ctx.stroke()

  ctx.fillStyle = '#a8a29e'
  ctx.font = '700 16px Barlow, system-ui, sans-serif'
  ctx.textAlign = 'left'
  ctx.fillText(label, x + 16, y + 26)

  ctx.fillStyle = '#fafafa'
  ctx.font = '800 40px "Barlow Condensed", Barlow, system-ui, sans-serif'
  ctx.fillText(value, x + 16, y + h - 16)
}

/** Classic party “stack”: overlapping sprites with a slight bounce. */
async function paintTeamStack(
  ctx: CanvasRenderingContext2D,
  lineup: Lineup,
  baseY: number,
) {
  const members = await Promise.all(
    ALL_SLOTS.map(async (slot) => {
      const entry = lineup[slot]
      const p = entry ? getPokemon(entry.pokemonId) : null
      const img = p ? await loadImage(p.sprite) : null
      const short =
        slot === 'BENCH1' ? 'B1' : slot === 'BENCH2' ? 'B2' : slot
      return { slot, short, p, img }
    }),
  )

  const filled = members.filter((m) => m.img || m.p)
  if (filled.length === 0) return

  const spriteSize = filled.length >= 7 ? 132 : 148
  const overlap = spriteSize * 0.42
  const step = spriteSize - overlap
  const totalW = spriteSize + step * (filled.length - 1)
  const startX = (W - totalW) / 2
  const bob = [10, -8, 14, -2, 12, -6, 8]

  ctx.save()
  ctx.fillStyle = 'rgba(0,0,0,0.32)'
  ctx.beginPath()
  ctx.ellipse(W / 2, baseY + spriteSize * 0.78, totalW * 0.46, 28, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()

  for (let i = 0; i < filled.length; i++) {
    const { short, p, img } = filled[i]!
    const x = startX + i * step
    const y = baseY + (bob[i % bob.length] ?? 0)

    ctx.fillStyle = 'rgba(0,0,0,0.26)'
    ctx.beginPath()
    ctx.ellipse(
      x + spriteSize / 2,
      y + spriteSize * 0.9,
      spriteSize * 0.32,
      11,
      0,
      0,
      Math.PI * 2,
    )
    ctx.fill()

    if (img) {
      ctx.imageSmoothingEnabled = false
      ctx.drawImage(img, x, y, spriteSize, spriteSize)
      ctx.imageSmoothingEnabled = true
    }

    ctx.fillStyle = '#a8a29e'
    ctx.font = '700 17px Barlow, system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText(short, x + spriteSize / 2, y + spriteSize + 20)

    ctx.fillStyle = '#fafafa'
    ctx.font = '650 18px Barlow, system-ui, sans-serif'
    const name = p?.name ?? '—'
    const clipped = name.length > 9 ? `${name.slice(0, 8)}…` : name
    ctx.fillText(clipped, x + spriteSize / 2, y + spriteSize + 40)
  }
  ctx.textAlign = 'left'
}

/** Paint a landscape Instagram / feed share card onto the canvas. */
export async function paintShareImage(
  canvas: HTMLCanvasElement,
  result: GauntletResult,
  options: ShareImageOptions = {},
): Promise<void> {
  const { showTeam = false, lineup } = options
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  await document.fonts.ready.catch(() => undefined)
  const logo = await loadImage(logoUrl())

  ctx.fillStyle = '#1a1410'
  ctx.fillRect(0, 0, W, H)
  ctx.save()
  ctx.globalAlpha = 0.36
  for (let x = 0; x < W; x += 28) {
    ctx.fillStyle = x % 56 === 0 ? '#2a2118' : '#231c16'
    ctx.fillRect(x, 0, 28, H)
  }
  ctx.restore()

  const wash = ctx.createRadialGradient(W * 0.28, H * 0.2, 30, W * 0.35, H * 0.45, 560)
  wash.addColorStop(0, 'rgba(234, 88, 12, 0.26)')
  wash.addColorStop(0.55, 'rgba(234, 88, 12, 0.05)')
  wash.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = wash
  ctx.fillRect(0, 0, W, H)

  const vignette = ctx.createRadialGradient(W / 2, H / 2, 220, W / 2, H / 2, 720)
  vignette.addColorStop(0, 'rgba(0,0,0,0)')
  vignette.addColorStop(1, 'rgba(0,0,0,0.5)')
  ctx.fillStyle = vignette
  ctx.fillRect(0, 0, W, H)

  const pad = 48
  let y = 36

  // Brand
  const mark = 64
  if (logo) {
    ctx.drawImage(logo, pad, y, mark, mark)
  }
  ctx.fillStyle = '#fafafa'
  ctx.font = '800 40px "Barlow Condensed", Barlow, system-ui, sans-serif'
  ctx.textAlign = 'left'
  ctx.fillText('POKEBALLERS', pad + mark + 16, y + 30)
  ctx.fillStyle = '#a8a29e'
  ctx.font = '600 20px Barlow, system-ui, sans-serif'
  ctx.fillText(`DAILY  ·  ${result.dateKey}`, pad + mark + 16, y + 56)

  // Outcome strip top-right
  const markSize = 34
  const markGap = 6
  const marksWidth =
    result.games.length * markSize + (result.games.length - 1) * markGap
  let mx = W - pad - marksWidth
  for (const g of result.games) {
    const fill =
      g.outcome === 'W' ? '#15803d' : g.outcome === 'T' ? '#44403c' : '#be123c'
    roundRect(ctx, mx, y + 12, markSize, markSize, 8)
    ctx.fillStyle = fill
    ctx.fill()
    ctx.fillStyle = '#fafafa'
    ctx.font = '800 16px "Barlow Condensed", Barlow, system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText(g.outcome, mx + markSize / 2, y + 35)
    mx += markSize + markGap
  }
  ctx.textAlign = 'left'
  y += mark + 28

  const record = `${result.wins}-${result.losses}${result.ties ? `-${result.ties}` : ''}`
  const diff = result.pointDiff >= 0 ? `+${result.pointDiff}` : `${result.pointDiff}`

  // Score + record row (no overlap — score block has fixed height)
  const scoreTop = y
  ctx.fillStyle = '#ea580c'
  ctx.font = '800 112px "Barlow Condensed", Barlow, system-ui, sans-serif'
  ctx.textBaseline = 'alphabetic'
  ctx.fillText(String(result.score), pad, scoreTop + 92)

  ctx.fillStyle = '#a8a29e'
  ctx.font = '700 18px Barlow, system-ui, sans-serif'
  ctx.fillText('SCORE', pad, scoreTop + 18)

  const chipY = scoreTop + 8
  const chipH = 78
  const chipW = 112
  const chipGap = 12
  const chipsLeft = pad + 280
  paintStatChip(ctx, chipsLeft, chipY, chipW, chipH, 'RECORD', record)
  paintStatChip(
    ctx,
    chipsLeft + chipW + chipGap,
    chipY,
    chipW,
    chipH,
    'W',
    String(result.wins),
  )
  paintStatChip(
    ctx,
    chipsLeft + (chipW + chipGap) * 2,
    chipY,
    chipW,
    chipH,
    'L',
    String(result.losses),
  )
  paintStatChip(
    ctx,
    chipsLeft + (chipW + chipGap) * 3,
    chipY,
    chipW + 8,
    chipH,
    'DIFF',
    diff,
  )

  y = scoreTop + 108

  ctx.fillStyle = '#e7e5e4'
  ctx.font = '650 24px Barlow, system-ui, sans-serif'
  let meta = shareHeadline(result)
  if (result.slateMvp) {
    meta += `  ·  MVP ${result.slateMvp.name} ${result.slateMvp.blurb}`
  }
  ctx.fillText(meta, pad, y)
  y += 20

  if (showTeam && lineup) {
    await paintTeamStack(ctx, lineup, y + 4)
  } else {
    y += 12
    const rowH = 36
    const listH = Math.min(result.games.length, 5) * rowH + 12
    roundRect(ctx, pad, y, W - pad * 2, listH, 12)
    ctx.fillStyle = 'rgba(255,255,255,0.04)'
    ctx.fill()
    let ly = y + 28
    for (const g of result.games.slice(0, 5)) {
      const score = `${g.result.homeScore}–${g.result.awayScore}`
      ctx.fillStyle = '#fafafa'
      ctx.font = '700 22px Barlow, system-ui, sans-serif'
      ctx.fillText(score, pad + 20, ly)
      ctx.fillStyle = '#a8a29e'
      ctx.font = '500 20px Barlow, system-ui, sans-serif'
      ctx.fillText(g.stadium.name, pad + 120, ly)
      ly += rowH
    }
  }

  ctx.fillStyle = '#78716c'
  ctx.font = '500 18px Barlow, system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText('ryazlee.github.io/pokeballers', W / 2, H - 22)
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
