import { useEffect, useRef, useState } from 'react'
import { Download, ImageIcon, X } from 'lucide-react'
import type { GauntletResult } from '../domain/daily'
import {
  canvasToPngBlob,
  paintShareImage,
  shareOrDownloadPng,
} from '../domain/shareImage'
import type { Lineup } from '../domain/types'

type Props = {
  result: GauntletResult
  lineup: Lineup
}

export default function ShareImageCard({ result, lineup }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (!open) return
    const canvas = canvasRef.current
    if (!canvas) return
    let cancelled = false
    setReady(false)
    void paintShareImage(canvas, result, { showTeam: true, lineup }).then(() => {
      if (!cancelled) setReady(true)
    })
    return () => {
      cancelled = true
    }
  }, [open, result, lineup])

  async function saveImage() {
    const canvas = canvasRef.current
    if (!canvas) return
    setBusy(true)
    try {
      await paintShareImage(canvas, result, { showTeam: true, lineup })
      const blob = await canvasToPngBlob(canvas)
      await shareOrDownloadPng(blob, `pokeballers-${result.dateKey}.png`)
    } catch {
      // ignore
    } finally {
      setBusy(false)
    }
  }

  if (!open) {
    return (
      <div className="share-image share-image--closed">
        <button
          type="button"
          className="share-image__reveal"
          onClick={() => setOpen(true)}
        >
          <ImageIcon size={15} strokeWidth={2} aria-hidden="true" />
          Show shareable image
        </button>
      </div>
    )
  }

  return (
    <div className="share-image">
      <div className="share-image__frame">
        <canvas
          ref={canvasRef}
          className="share-image__canvas"
          width={1200}
          height={675}
          aria-label="Shareable results image"
        />
      </div>
      <div className="share-image__actions">
        <button
          type="button"
          className="share-image__save"
          disabled={!ready || busy}
          onClick={() => void saveImage()}
        >
          <Download size={15} strokeWidth={2} aria-hidden="true" />
          {busy ? 'Preparing…' : 'Save / share image'}
        </button>
        <button
          type="button"
          className="share-image__hide"
          onClick={() => setOpen(false)}
        >
          <X size={15} strokeWidth={2} aria-hidden="true" />
          Hide
        </button>
      </div>
    </div>
  )
}
