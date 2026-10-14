import type { GauntletResult } from './daily'
import { getPokemon } from './pokemon'
import type { Lineup, RosterSlot } from './types'

/** Landscape performance summary — you vs CPU. */
const W = 1200
const H = 900

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
  lineup?: Lineup
  cpuLineup?: Lineup
}

function slotShort(slot: RosterSlot): string {
  if (slot === 'BENCH1') return 'B1'
  if (slot === 'BENCH2') return 'B2'
  return slot
}

const LINE_SLOTS: RosterSlot[] = [
  'PG',
  'SG',
  'SF',
  'PF',
  'C',
  'BENCH1',
  'BENCH2',
]

type LineOpts = {
  cy: number
  size: number
  /** Desaturate / dim for CPU side */
  muted?: boolean
  chipFill: string
  chipText: string
}

async function paintPartyLine(
  ctx: CanvasRenderingContext2D,
  lineup: Lineup,
  opts: LineOpts,
) {
  const { cy, size, muted = false, chipFill, chipText } = opts
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

  const overlap = size * 0.26
  const step = size - overlap
  const totalW = size + step * (filled.length - 1)
  const startX = (W - totalW) / 2
  const bob = [4, -3, 5, 0, 4, -2, 3]

  ctx.fillStyle = muted ? 'rgba(40, 30, 20, 0.06)' : 'rgba(40, 30, 20, 0.1)'
  ctx.beginPath()
  ctx.ellipse(W / 2, cy + size * 0.78, totalW * 0.42, 22, 0, 0, Math.PI * 2)
  ctx.fill()

  for (let i = 0; i < filled.length; i++) {
    const { slot, img } = filled[i]!
    const x = startX + i * step
    const y = cy + (bob[i % bob.length] ?? 0)

    if (img) {
      ctx.save()
      if (muted) {
        ctx.filter = 'grayscale(0.35) brightness(0.92) contrast(0.95)'
        ctx.globalAlpha = 0.9
      }
      ctx.imageSmoothingEnabled = false
      ctx.drawImage(img, x, y, size, size)
      ctx.restore()
    }

    const label = slotShort(slot)
    ctx.font = '800 14px "Barlow Condensed", Barlow, system-ui, sans-serif'
    const tw = ctx.measureText(label).width
    const lx = x + size / 2 - (tw + 14) / 2
    const ly = y + size + 6
    roundRect(ctx, lx, ly - 11, tw + 14, 20, 6)
    ctx.fillStyle = chipFill
    ctx.fill()
    ctx.fillStyle = chipText
    ctx.textAlign = 'center'
    ctx.fillText(label, x + size / 2, ly + 3)
  }
  ctx.textAlign = 'left'
}

function paintSideLabel(
  ctx: CanvasRenderingContext2D,
  text: string,
  y: number,
  kind: 'you' | 'cpu',
) {
  const isCpu = kind === 'cpu'
  ctx.font = '800 22px "Barlow Condensed", Barlow, system-ui, sans-serif'
  const tw = ctx.measureText(text).width
  const w = tw + 28
  const x = (W - w) / 2
  roundRect(ctx, x, y - 18, w, 28, 8)
  ctx.fillStyle = isCpu ? '#44403c' : '#ea580c'
  ctx.fill()
  ctx.fillStyle = '#fafafa'
  ctx.textAlign = 'center'
  ctx.fillText(text, W / 2, y + 2)
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

/** Paint a landscape you-vs-CPU performance card. */
export async function paintShareImage(
  canvas: HTMLCanvasElement,
  result: GauntletResult,
  options: ShareImageOptions = {},
): Promise<void> {
  const { lineup, cpuLineup } = options
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  await document.fonts.ready.catch(() => undefined)
  const logo = await loadImage(logoUrl())

  const bg = ctx.createLinearGradient(0, 0, 0, H)
  bg.addColorStop(0, '#f3efe6')
  bg.addColorStop(0.55, '#ebe4d6')
  bg.addColorStop(1, '#e2d8c6')
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, W, H)

  ctx.save()
  ctx.globalAlpha = 0.035
  for (let i = 0; i < 120; i++) {
    ctx.fillStyle = i % 2 === 0 ? '#000' : '#fff'
    ctx.fillRect((i * 97) % W, (i * 53) % H, 3, 3)
  }
  ctx.restore()

  const pad = 48
  const record = `${result.wins}-${result.losses}${result.ties ? `-${result.ties}` : ''}`
  const diff = result.pointDiff >= 0 ? `+${result.pointDiff}` : `${result.pointDiff}`

  if (logo) {
    ctx.drawImage(logo, pad, 32, 52, 52)
  }
  ctx.fillStyle = '#1c1917'
  ctx.font = '800 34px "Barlow Condensed", Barlow, system-ui, sans-serif'
  ctx.textAlign = 'left'
  ctx.fillText('POKEBALLERS', pad + 66, 52)
  ctx.fillStyle = '#78716c'
  ctx.font = '600 17px Barlow, system-ui, sans-serif'
  ctx.fillText(`Daily  ·  ${result.dateKey}`, pad + 66, 76)

  // Score / record — performance summary
  ctx.textAlign = 'right'
  ctx.fillStyle = '#ea580c'
  ctx.font = '800 84px "Barlow Condensed", Barlow, system-ui, sans-serif'
  ctx.fillText(String(result.score), W - pad, 88)

  ctx.fillStyle = '#1c1917'
  ctx.font = '800 38px "Barlow Condensed", Barlow, system-ui, sans-serif'
  ctx.fillText(record, W - pad, 130)

  ctx.fillStyle = '#78716c'
  ctx.font = '650 18px Barlow, system-ui, sans-serif'
  ctx.fillText(`${shareHeadline(result)}  ·  ${diff}`, W - pad, 156)
  ctx.textAlign = 'left'

  paintOutcomeStrip(ctx, result, pad, 100)

  if (result.slateMvp) {
    ctx.fillStyle = '#a16207'
    ctx.font = '700 16px Barlow, system-ui, sans-serif'
    ctx.fillText(
      `MVP  ${result.slateMvp.name}  ·  ${result.slateMvp.blurb}`,
      pad,
      156,
    )
  }

  const spriteSize = 128

  // ——— YOU ———
  paintSideLabel(ctx, 'YOU', 198, 'you')
  if (lineup) {
    await paintPartyLine(ctx, lineup, {
      cy: 220,
      size: spriteSize,
      chipFill: 'rgba(234, 88, 12, 0.92)',
      chipText: '#fff',
    })
  }

  // VS divider
  const vsY = 420
  ctx.strokeStyle = 'rgba(28, 25, 23, 0.12)'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(pad + 40, vsY)
  ctx.lineTo(W / 2 - 50, vsY)
  ctx.moveTo(W / 2 + 50, vsY)
  ctx.lineTo(W - pad - 40, vsY)
  ctx.stroke()

  roundRect(ctx, W / 2 - 42, vsY - 16, 84, 32, 8)
  ctx.fillStyle = '#1c1917'
  ctx.fill()
  ctx.fillStyle = '#fafafa'
  ctx.font = '800 20px "Barlow Condensed", Barlow, system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText('VS', W / 2, vsY + 6)
  ctx.textAlign = 'left'

  // ——— CPU ———
  paintSideLabel(ctx, 'CPU', 470, 'cpu')
  if (cpuLineup) {
    await paintPartyLine(ctx, cpuLineup, {
      cy: 492,
      size: spriteSize,
      muted: true,
      chipFill: 'rgba(68, 64, 60, 0.92)',
      chipText: '#fafafa',
    })
  }

  ctx.fillStyle = '#a8a29e'
  ctx.font = '500 15px Barlow, system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText('ryazlee.github.io/pokeballers', W / 2, H - 26)
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
