import type { GauntletResult } from './daily'
import { getPokemon } from './pokemon'
import { ALL_SLOTS, type Lineup } from './types'

const W = 1080
const H = 1080

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

  const spriteSize = filled.length >= 7 ? 168 : 188
  const overlap = spriteSize * 0.38
  const step = spriteSize - overlap
  const totalW = spriteSize + step * (filled.length - 1)
  const startX = (W - totalW) / 2
  // Bob pattern so the row feels stacked, not flat
  const bob = [18, -6, 22, 0, 20, -4, 16]

  // Soft ground oval under the party
  ctx.save()
  ctx.fillStyle = 'rgba(0,0,0,0.35)'
  ctx.beginPath()
  ctx.ellipse(W / 2, baseY + spriteSize * 0.82, totalW * 0.48, 36, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()

  // Draw back-to-front (left → right) so later sprites overlap earlier ones
  for (let i = 0; i < filled.length; i++) {
    const { short, p, img } = filled[i]!
    const x = startX + i * step
    const y = baseY + (bob[i % bob.length] ?? 0)

    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.28)'
    ctx.beginPath()
    ctx.ellipse(
      x + spriteSize / 2,
      y + spriteSize * 0.92,
      spriteSize * 0.34,
      14,
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
    ctx.font = '700 20px Barlow, system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText(short, x + spriteSize / 2, y + spriteSize + 26)

    ctx.fillStyle = '#fafafa'
    ctx.font = '650 22px Barlow, system-ui, sans-serif'
    const name = p?.name ?? '—'
    const clipped = name.length > 10 ? `${name.slice(0, 9)}…` : name
    ctx.fillText(clipped, x + spriteSize / 2, y + spriteSize + 50)
  }
  ctx.textAlign = 'left'
}

/** Paint a 1080×1080 Instagram share card onto the canvas. */
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

  // Hardwood night court
  ctx.fillStyle = '#1a1410'
  ctx.fillRect(0, 0, W, H)
  ctx.save()
  ctx.globalAlpha = 0.38
  for (let x = 0; x < W; x += 28) {
    ctx.fillStyle = x % 56 === 0 ? '#2a2118' : '#231c16'
    ctx.fillRect(x, 0, 28, H)
  }
  ctx.restore()

  const wash = ctx.createRadialGradient(W * 0.5, H * 0.2, 40, W * 0.5, H * 0.4, 640)
  wash.addColorStop(0, 'rgba(234, 88, 12, 0.24)')
  wash.addColorStop(0.5, 'rgba(234, 88, 12, 0.06)')
  wash.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = wash
  ctx.fillRect(0, 0, W, H)

  const vignette = ctx.createRadialGradient(W / 2, H / 2, 260, W / 2, H / 2, 740)
  vignette.addColorStop(0, 'rgba(0,0,0,0)')
  vignette.addColorStop(1, 'rgba(0,0,0,0.58)')
  ctx.fillStyle = vignette
  ctx.fillRect(0, 0, W, H)

  const pad = 64
  let y = 48

  // Brand row
  const mark = 78
  if (logo) {
    ctx.drawImage(logo, pad, y, mark, mark)
  }
  ctx.fillStyle = '#fafafa'
  ctx.font = '800 48px "Barlow Condensed", Barlow, system-ui, sans-serif'
  ctx.textAlign = 'left'
  ctx.fillText('POKEBALLERS', pad + mark + 18, y + 36)
  ctx.fillStyle = '#a8a29e'
  ctx.font = '600 22px Barlow, system-ui, sans-serif'
  ctx.fillText(`DAILY  ·  ${result.dateKey}`, pad + mark + 18, y + 66)
  y += mark + 36

  const record = `${result.wins}-${result.losses}${result.ties ? `-${result.ties}` : ''}`
  const diff = result.pointDiff >= 0 ? `+${result.pointDiff}` : `${result.pointDiff}`

  ctx.fillStyle = '#ea580c'
  ctx.font = '800 132px "Barlow Condensed", Barlow, system-ui, sans-serif'
  ctx.fillText(String(result.score), pad, y + 100)
  y += 112

  ctx.fillStyle = '#e7e5e4'
  ctx.font = '650 28px Barlow, system-ui, sans-serif'
  ctx.fillText(`${shareHeadline(result)}  ·  ${record}  ·  ${diff}`, pad, y)
  y += 34

  if (result.slateMvp) {
    ctx.fillStyle = '#fdba74'
    ctx.font = '700 24px Barlow, system-ui, sans-serif'
    ctx.fillText(`MVP  ${result.slateMvp.name}  ·  ${result.slateMvp.blurb}`, pad, y)
    y += 28
  }

  y += 14
  // Outcome strip (centered)
  const markSize = 42
  const markGap = 8
  const marksWidth =
    result.games.length * markSize + (result.games.length - 1) * markGap
  let mx = (W - marksWidth) / 2
  for (const g of result.games) {
    const fill =
      g.outcome === 'W' ? '#15803d' : g.outcome === 'T' ? '#44403c' : '#be123c'
    roundRect(ctx, mx, y, markSize, markSize, 9)
    ctx.fillStyle = fill
    ctx.fill()
    ctx.fillStyle = '#fafafa'
    ctx.font = '800 18px "Barlow Condensed", Barlow, system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText(g.outcome, mx + markSize / 2, y + 28)
    mx += markSize + markGap
  }
  ctx.textAlign = 'left'
  y += markSize + 20

  if (showTeam && lineup) {
    // Party stack is the hero — skip the dense game list
    await paintTeamStack(ctx, lineup, y + 8)
  } else {
    const rowH = 44
    roundRect(ctx, pad - 4, y - 8, W - pad * 2 + 8, result.games.length * rowH + 16, 14)
    ctx.fillStyle = 'rgba(255,255,255,0.04)'
    ctx.fill()

    for (const g of result.games) {
      const fill =
        g.outcome === 'W' ? '#15803d' : g.outcome === 'T' ? '#57534e' : '#be123c'
      ctx.fillStyle = fill
      ctx.beginPath()
      ctx.arc(pad + 16, y + 8, 6, 0, Math.PI * 2)
      ctx.fill()

      const score = `${g.result.homeScore}–${g.result.awayScore}`
      ctx.fillStyle = '#fafafa'
      ctx.font = '700 26px Barlow, system-ui, sans-serif'
      ctx.fillText(score, pad + 36, y + 16)

      ctx.fillStyle = '#a8a29e'
      ctx.font = '500 22px Barlow, system-ui, sans-serif'
      ctx.fillText(g.stadium.name, pad + 150, y + 16)
      y += rowH
    }
  }

  ctx.fillStyle = '#78716c'
  ctx.font = '500 22px Barlow, system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText('ryazlee.github.io/pokeballers', W / 2, H - 40)
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
