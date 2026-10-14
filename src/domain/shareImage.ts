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
  ctx.globalAlpha = 0.35
  for (let x = 0; x < W; x += 28) {
    ctx.fillStyle = x % 56 === 0 ? '#2a2118' : '#231c16'
    ctx.fillRect(x, 0, 28, H)
  }
  ctx.restore()

  const wash = ctx.createRadialGradient(W * 0.5, H * 0.18, 40, W * 0.5, H * 0.35, 620)
  wash.addColorStop(0, 'rgba(234, 88, 12, 0.22)')
  wash.addColorStop(0.45, 'rgba(234, 88, 12, 0.06)')
  wash.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = wash
  ctx.fillRect(0, 0, W, H)

  const vignette = ctx.createRadialGradient(W / 2, H / 2, 280, W / 2, H / 2, 720)
  vignette.addColorStop(0, 'rgba(0,0,0,0)')
  vignette.addColorStop(1, 'rgba(0,0,0,0.55)')
  ctx.fillStyle = vignette
  ctx.fillRect(0, 0, W, H)

  const pad = 72
  let y = 64

  // Brand row
  const mark = 92
  if (logo) {
    ctx.drawImage(logo, pad, y, mark, mark)
  }
  ctx.fillStyle = '#fafafa'
  ctx.font = '800 54px "Barlow Condensed", Barlow, system-ui, sans-serif'
  ctx.textAlign = 'left'
  ctx.fillText('POKEBALLERS', pad + mark + 22, y + 42)
  ctx.fillStyle = '#a8a29e'
  ctx.font = '600 24px Barlow, system-ui, sans-serif'
  ctx.fillText('DAILY CHALLENGE', pad + mark + 22, y + 74)
  y += mark + 48

  // Score hero
  const record = `${result.wins}-${result.losses}${result.ties ? `-${result.ties}` : ''}`
  const diff = result.pointDiff >= 0 ? `+${result.pointDiff}` : `${result.pointDiff}`

  ctx.fillStyle = '#ea580c'
  ctx.font = '800 148px "Barlow Condensed", Barlow, system-ui, sans-serif'
  ctx.fillText(String(result.score), pad, y + 110)
  y += 128

  ctx.fillStyle = '#e7e5e4'
  ctx.font = '650 30px Barlow, system-ui, sans-serif'
  ctx.fillText(`${shareHeadline(result)}  ·  ${record}  ·  ${diff}`, pad, y)
  y += 36

  ctx.fillStyle = '#a8a29e'
  ctx.font = '500 26px Barlow, system-ui, sans-serif'
  ctx.fillText(result.dateKey, pad, y)
  y += 28

  if (result.slateMvp) {
    ctx.fillStyle = '#fdba74'
    ctx.font = '700 26px Barlow, system-ui, sans-serif'
    ctx.fillText(`MVP  ${result.slateMvp.name}  ·  ${result.slateMvp.blurb}`, pad, y)
    y += 30
  }

  y += 18
  // Divider
  ctx.strokeStyle = 'rgba(255,255,255,0.12)'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(pad, y)
  ctx.lineTo(W - pad, y)
  ctx.stroke()
  y += 28

  // Outcome strip
  const markSize = 44
  const markGap = 8
  const marksWidth =
    result.games.length * markSize + (result.games.length - 1) * markGap
  let mx = pad
  // center the strip if no team crowding
  if (!showTeam) mx = (W - marksWidth) / 2
  for (const g of result.games) {
    const fill =
      g.outcome === 'W' ? '#15803d' : g.outcome === 'T' ? '#44403c' : '#be123c'
    roundRect(ctx, mx, y, markSize, markSize, 9)
    ctx.fillStyle = fill
    ctx.fill()
    ctx.fillStyle = '#fafafa'
    ctx.font = '800 20px "Barlow Condensed", Barlow, system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText(g.outcome, mx + markSize / 2, y + 29)
    mx += markSize + markGap
  }
  ctx.textAlign = 'left'
  y += markSize + 26

  // Game lines in a soft panel
  const listTop = y
  const rowH = showTeam ? 40 : 46
  const listH = result.games.length * rowH + 20
  roundRect(ctx, pad - 8, listTop - 12, W - pad * 2 + 16, listH, 16)
  ctx.fillStyle = 'rgba(255,255,255,0.04)'
  ctx.fill()

  for (const g of result.games) {
    const fill =
      g.outcome === 'W' ? '#15803d' : g.outcome === 'T' ? '#57534e' : '#be123c'
    ctx.fillStyle = fill
    ctx.beginPath()
    ctx.arc(pad + 14, y + 4, 6, 0, Math.PI * 2)
    ctx.fill()

    const score = `${g.result.homeScore}–${g.result.awayScore}`
    ctx.fillStyle = '#fafafa'
    ctx.font = '700 28px Barlow, system-ui, sans-serif'
    ctx.fillText(score, pad + 36, y + 12)

    ctx.fillStyle = '#a8a29e'
    ctx.font = '500 24px Barlow, system-ui, sans-serif'
    ctx.fillText(g.stadium.name, pad + 160, y + 12)
    y += rowH
  }

  if (showTeam && lineup) {
    y += 18
    ctx.fillStyle = '#78716c'
    ctx.font = '700 18px Barlow, system-ui, sans-serif'
    ctx.letterSpacing = '0.08em'
    ctx.fillText('TEAM', pad, y)
    ctx.letterSpacing = '0'
    y += 16

    const slotW = (W - pad * 2) / ALL_SLOTS.length
    const spriteSize = 78
    const images = await Promise.all(
      ALL_SLOTS.map(async (slot) => {
        const entry = lineup[slot]
        const p = entry ? getPokemon(entry.pokemonId) : null
        const img = p ? await loadImage(p.sprite) : null
        return { slot, p, img }
      }),
    )

    for (let i = 0; i < images.length; i++) {
      const { slot, p, img } = images[i]!
      const cx = pad + slotW * i + slotW / 2
      const short =
        slot === 'BENCH1' ? 'B1' : slot === 'BENCH2' ? 'B2' : slot

      roundRect(
        ctx,
        cx - spriteSize / 2 - 8,
        y,
        spriteSize + 16,
        spriteSize + 48,
        14,
      )
      ctx.fillStyle = 'rgba(255,255,255,0.05)'
      ctx.fill()

      if (img) {
        ctx.drawImage(img, cx - spriteSize / 2, y + 8, spriteSize, spriteSize)
      }

      ctx.fillStyle = '#a8a29e'
      ctx.font = '700 18px Barlow, system-ui, sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText(short, cx, y + spriteSize + 28)

      ctx.fillStyle = '#e7e5e4'
      ctx.font = '600 17px Barlow, system-ui, sans-serif'
      const name = p?.name ?? '—'
      const clipped = name.length > 9 ? `${name.slice(0, 8)}…` : name
      ctx.fillText(clipped, cx, y + spriteSize + 48)
      ctx.textAlign = 'left'
    }
  }

  ctx.fillStyle = '#78716c'
  ctx.font = '500 22px Barlow, system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText('ryazlee.github.io/pokeballers', W / 2, H - 44)
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
