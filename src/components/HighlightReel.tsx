import { useCallback, useEffect, useRef, useState } from 'react'
import { Download, Film, RotateCcw, X } from 'lucide-react'
import {
  kindTitle,
  periodStamp,
  type HighlightReel as ReelData,
} from '../domain/highlightReel'
import {
  HIGHLIGHT_DURATION,
  HIGHLIGHT_H,
  HIGHLIGHT_W,
  loadReelAssets,
  paintCourtsideFrame,
  type LoadedAssets,
} from '../domain/courtsideHighlight'

type Props = {
  reel: ReelData
  compact?: boolean
  /** Featured slate highlight vs in-game clip */
  featured?: boolean
}

export default function HighlightReel({
  reel,
  compact = false,
  featured = false,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const assetsRef = useRef<LoadedAssets | null>(null)
  const rafRef = useRef<number>(0)
  const [open, setOpen] = useState(false)
  const [tick, setTick] = useState(0)
  const [ready, setReady] = useState(false)
  const [saving, setSaving] = useState(false)
  const [savePct, setSavePct] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const replay = useCallback(() => {
    setTick((t) => t + 1)
  }, [])

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setReady(false)
    void loadReelAssets(reel).then((assets) => {
      if (cancelled) return
      assetsRef.current = assets
      setReady(true)
    })
    return () => {
      cancelled = true
    }
  }, [open, reel])

  useEffect(() => {
    if (!open || !ready) return
    const canvas = canvasRef.current
    const assets = assetsRef.current
    if (!canvas || !assets) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduced) {
      paintCourtsideFrame(ctx, reel, assets, HIGHLIGHT_DURATION * 0.92)
      return
    }

    const start = performance.now()
    const loop = (now: number) => {
      const t = Math.min(HIGHLIGHT_DURATION, (now - start) / 1000)
      paintCourtsideFrame(ctx, reel, assets, t)
      if (t < HIGHLIGHT_DURATION) {
        rafRef.current = requestAnimationFrame(loop)
      }
    }
    rafRef.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(rafRef.current)
  }, [open, ready, reel, tick])

  async function saveMp4() {
    setError(null)
    setSaving(true)
    setSavePct(0)
    try {
      const { downloadBlob, recordHighlightMp4 } = await import(
        '../domain/recordHighlight'
      )
      const blob = await recordHighlightMp4(
        reel,
        assetsRef.current ?? undefined,
        setSavePct,
      )
      downloadBlob(blob, `pokeballers-highlight-g${reel.gameIndex + 1}.mp4`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Couldn’t save MP4')
    } finally {
      setSaving(false)
    }
  }

  if (!open) {
    return (
      <div
        className={`hl-reel hl-reel--closed${compact ? ' hl-reel--compact' : ''}${featured ? ' hl-reel--featured' : ''}`}
        data-kind={reel.kind}
      >
        <button
          type="button"
          className="hl-reel__reveal"
          onClick={() => setOpen(true)}
        >
          <span className="hl-reel__reveal-play" aria-hidden="true">
            <Film size={featured ? 18 : 15} strokeWidth={2.2} />
          </span>
          <span className="hl-reel__reveal-copy">
            <span className="hl-reel__reveal-title">
              {featured ? 'Watch highlight reel' : 'Watch play'}
            </span>
            <span className="hl-reel__reveal-sub">
              <span className="hl-reel__badge">
                {kindTitle(reel.kind, reel.finish)}
              </span>
              <span>
                G{reel.gameIndex + 1} · {periodStamp(reel.quarter, reel.clock)}
              </span>
            </span>
            {!compact ? (
              <span className="hl-reel__reveal-caption">{reel.caption}</span>
            ) : null}
          </span>
        </button>
      </div>
    )
  }

  return (
    <div
      className={`hl-reel${compact ? ' hl-reel--compact' : ''}${featured ? ' hl-reel--featured' : ''}`}
      data-kind={reel.kind}
      data-finish={reel.finish ?? ''}
      data-shot={reel.shot ?? 'mid'}
    >
      <div className="hl-reel__chrome">
        <div className="hl-reel__eyebrow">
          <span className="hl-reel__badge">
            {kindTitle(reel.kind, reel.finish)}
          </span>
          <span className="hl-reel__meta">
            G{reel.gameIndex + 1} · {reel.stadiumName}
          </span>
          <span className="hl-reel__clock">
            {periodStamp(reel.quarter, reel.clock)}
          </span>
        </div>
        <div className="hl-reel__actions">
          <button type="button" className="hl-reel__btn" onClick={replay}>
            <RotateCcw size={14} strokeWidth={2.2} aria-hidden="true" />
            Replay
          </button>
          <button
            type="button"
            className="hl-reel__btn hl-reel__btn--primary"
            disabled={!ready || saving}
            onClick={() => void saveMp4()}
          >
            <Download size={14} strokeWidth={2.2} aria-hidden="true" />
            {saving ? `Saving ${Math.round(savePct * 100)}%` : 'Save MP4'}
          </button>
          <button
            type="button"
            className="hl-reel__btn hl-reel__btn--ghost"
            onClick={() => setOpen(false)}
            aria-label="Hide highlight"
          >
            <X size={14} strokeWidth={2.2} aria-hidden="true" />
            Hide
          </button>
        </div>
      </div>

      <div className="hl-reel__stage-wrap">
        <canvas
          ref={canvasRef}
          className="hl-reel__canvas"
          width={HIGHLIGHT_W}
          height={HIGHLIGHT_H}
          aria-label={`Highlight: ${reel.caption}`}
        />
        {!ready ? <p className="hl-reel__loading">Loading sprites…</p> : null}
      </div>

      {error ? <p className="hl-reel__error">{error}</p> : null}
    </div>
  )
}
