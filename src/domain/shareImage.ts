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

/** Paint a 1080×1080 Instagram share card (logo-forward) onto the canvas. */
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

  // Black field so the logo preview matches og.png
  ctx.fillStyle = '#000000'
  ctx.fillRect(0, 0, W, H)

  const pad = 64
  let y = 56

  // Brand logo — dominant preview mark for IG
  const logoSize = showTeam ? 220 : 280
  if (logo) {
    ctx.drawImage(logo, (W - logoSize) / 2, y, logoSize, logoSize)
  }
  y += logoSize + 28

  ctx.fillStyle = '#a1a1aa'
  ctx.font = '600 26px Barlow, system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText('POKEBALLERS DAILY', W / 2, y)
  y += 40

  ctx.fillStyle = '#fafafa'
  ctx.font = '800 56px "Barlow Condensed", Barlow, system-ui, sans-serif'
  ctx.fillText(result.dateKey, W / 2, y)
  y += 58

  const record = `${result.wins}-${result.losses}${result.ties ? `-${result.ties}` : ''}`
  const diff = result.pointDiff >= 0 ? `+${result.pointDiff}` : `${result.pointDiff}`

  ctx.fillStyle = '#ea580c'
  ctx.font = '800 96px "Barlow Condensed", Barlow, system-ui, sans-serif'
  ctx.fillText(String(result.score), W / 2, y)
  y += 42

  ctx.fillStyle = '#d4d4d8'
  ctx.font = '600 28px Barlow, system-ui, sans-serif'
  ctx.fillText(`${shareHeadline(result)}  ·  ${record}  ·  ${diff}`, W / 2, y)
  y += 36

  if (result.slateMvp) {
    ctx.fillStyle = '#fdba74'
    ctx.font = '700 26px Barlow, system-ui, sans-serif'
    ctx.fillText(`MVP  ${result.slateMvp.name}  ·  ${result.slateMvp.blurb}`, W / 2, y)
    y += 34
  }

  y += 10
  ctx.textAlign = 'left'

  // Compact result marks row
  const marks = result.games.map((g) =>
    g.outcome === 'W' ? '#166534' : g.outcome === 'T' ? '#3f3f46' : '#9f1239',
  )
  const markSize = 52
  const markGap = 10
  const marksWidth = marks.length * markSize + (marks.length - 1) * markGap
  let mx = (W - marksWidth) / 2
  for (let i = 0; i < marks.length; i++) {
    roundRect(ctx, mx, y, markSize, markSize, 10)
    ctx.fillStyle = marks[i]!
    ctx.fill()
    ctx.fillStyle = '#fafafa'
    ctx.font = '800 22px "Barlow Condensed", Barlow, system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText(result.games[i]!.outcome, mx + markSize / 2, y + 34)
    mx += markSize + markGap
  }
  ctx.textAlign = 'left'
  y += markSize + 28

  // Score lines
  const rowH = showTeam ? 36 : 42
  for (const g of result.games) {
    const score = `${g.result.homeScore}–${g.result.awayScore}`
    ctx.fillStyle = '#fafafa'
    ctx.font = '700 26px Barlow, system-ui, sans-serif'
    ctx.fillText(score, pad, y)

    ctx.fillStyle = '#a1a1aa'
    ctx.font = '500 24px Barlow, system-ui, sans-serif'
    ctx.fillText(g.stadium.name, pad + 120, y)
    y += rowH
  }

  if (showTeam && lineup) {
    y += 8
    ctx.fillStyle = '#71717a'
    ctx.font = '600 20px Barlow, system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('TEAM', W / 2, y)
    ctx.textAlign = 'left'
    y += 14

    const slotW = (W - pad * 2) / ALL_SLOTS.length
    const spriteSize = 72
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

      if (img) {
        ctx.drawImage(img, cx - spriteSize / 2, y, spriteSize, spriteSize)
      }

      ctx.fillStyle = '#a1a1aa'
      ctx.font = '700 18px Barlow, system-ui, sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText(short, cx, y + spriteSize + 22)

      ctx.fillStyle = '#e4e4e7'
      ctx.font = '600 16px Barlow, system-ui, sans-serif'
      const name = p?.name ?? '—'
      const clipped = name.length > 9 ? `${name.slice(0, 8)}…` : name
      ctx.fillText(clipped, cx, y + spriteSize + 40)
      ctx.textAlign = 'left'
    }
  }

  ctx.fillStyle = '#52525b'
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
