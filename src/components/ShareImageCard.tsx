import { useEffect, useRef, useState } from 'react'
import { Download, ImageIcon } from 'lucide-react'
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
  showTeam: boolean
}

export default function ShareImageCard({ result, lineup, showTeam }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [busy, setBusy] = useState(false)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    let cancelled = false
    setReady(false)
    void paintShareImage(canvas, result, { showTeam, lineup }).then(() => {
      if (!cancelled) setReady(true)
    })
    return () => {
      cancelled = true
    }
  }, [result, lineup, showTeam])

  async function saveImage() {
    const canvas = canvasRef.current
    if (!canvas || !ready) return
    setBusy(true)
    try {
      // Re-paint so export matches current toggle even if effect is mid-flight
      await paintShareImage(canvas, result, { showTeam, lineup })
      const blob = await canvasToPngBlob(canvas)
      await shareOrDownloadPng(blob, `pokeballers-${result.dateKey}.png`)
    } catch {
      // ignore
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="share-image">
      <div className="share-image__frame">
        <canvas
          ref={canvasRef}
          className="share-image__canvas"
          width={1080}
          height={1080}
          aria-label="Shareable results image"
        />
      </div>
      <button
        type="button"
        className="share-image__save"
        disabled={!ready || busy}
        onClick={() => void saveImage()}
      >
        {busy ? (
          <ImageIcon size={15} strokeWidth={2} aria-hidden="true" />
        ) : (
          <Download size={15} strokeWidth={2} aria-hidden="true" />
        )}
        {busy ? 'Preparing…' : 'Save / share image'}
      </button>
    </div>
  )
}
