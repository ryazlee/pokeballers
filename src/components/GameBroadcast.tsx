import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ChevronLeft,
  ChevronRight,
  Pause,
  Play,
  Tv,
  X,
} from 'lucide-react'
import {
  buildGameBroadcast,
  clipAtTime,
  periodStamp,
} from '../domain/gameBroadcast'
import {
  BROADCAST_H,
  BROADCAST_W,
  loadBroadcastAssets,
  paintBroadcastFrame,
  type BroadcastAssets,
} from '../domain/broadcastCourt'
import { simulateGame } from '../domain/sim'
import type { Stadium } from '../domain/terrains'
import type { Lineup, SimResult } from '../domain/types'

type Props = {
  result: SimResult
  stadium: Stadium
  gameIndex: number
  homeLineup: Lineup
  awayLineup: Lineup
  compact?: boolean
}

const SPEEDS = [1, 2, 4] as const

export default function GameBroadcast({
  result,
  stadium,
  gameIndex,
  homeLineup,
  awayLineup,
  compact = false,
}: Props) {
  const broadcast = useMemo(() => {
    // Gauntlet persists strip plays — rebuild from seed for the full broadcast.
    const full =
      result.plays.length > 0
        ? result
        : simulateGame(homeLineup, awayLineup, {
            homeName: 'You',
            awayName: 'CPU',
            seed: result.seed,
            stadium,
          })
    return buildGameBroadcast(
      full,
      stadium.name,
      gameIndex,
      homeLineup,
      awayLineup,
    )
  }, [result, stadium, gameIndex, homeLineup, awayLineup])

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const assetsRef = useRef<BroadcastAssets | null>(null)
  const rafRef = useRef(0)
  const timeRef = useRef(0)
  const playingRef = useRef(true)
  const speedRef = useRef(2)

  const [open, setOpen] = useState(false)
  const [ready, setReady] = useState(false)
  const [playing, setPlaying] = useState(true)
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(2)
  const [time, setTime] = useState(0)
  const [clipIndex, setClipIndex] = useState(0)

  const current = clipAtTime(broadcast, time)
  const clip = current?.clip ?? broadcast.clips[0] ?? null

  useEffect(() => {
    playingRef.current = playing
  }, [playing])

  useEffect(() => {
    speedRef.current = speed
  }, [speed])

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setReady(false)
    timeRef.current = 0
    setTime(0)
    setPlaying(true)
    void loadBroadcastAssets(broadcast).then((assets) => {
      if (cancelled) return
      assetsRef.current = assets
      setReady(true)
    })
    return () => {
      cancelled = true
    }
  }, [open, broadcast])

  const paint = useCallback(
    (t: number) => {
      const canvas = canvasRef.current
      const assets = assetsRef.current
      if (!canvas || !assets) return
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      const at = clipAtTime(broadcast, t)
      if (!at) return
      paintBroadcastFrame(ctx, broadcast, at.clip, assets, at.localT)
    },
    [broadcast],
  )

  useEffect(() => {
    if (!open || !ready) return
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduced) {
      paint(broadcast.totalDuration * 0.5)
      return
    }

    let last = performance.now()
    let uiAccum = 0
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      if (playingRef.current) {
        timeRef.current = Math.min(
          broadcast.totalDuration,
          timeRef.current + dt * speedRef.current,
        )
        if (timeRef.current >= broadcast.totalDuration - 0.001) {
          playingRef.current = false
          setPlaying(false)
        }
      }
      paint(timeRef.current)
      uiAccum += dt
      if (uiAccum >= 0.12 || !playingRef.current) {
        uiAccum = 0
        setTime(timeRef.current)
        const at = clipAtTime(broadcast, timeRef.current)
        if (at) setClipIndex(at.index)
      }
      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(rafRef.current)
  }, [open, ready, broadcast, paint])

  function seekToClip(index: number) {
    const i = Math.max(0, Math.min(broadcast.clips.length - 1, index))
    const t = broadcast.clipStarts[i] ?? 0
    timeRef.current = t
    setTime(t)
    setClipIndex(i)
    paint(t)
  }

  function togglePlay() {
    if (timeRef.current >= broadcast.totalDuration - 0.01) {
      timeRef.current = 0
      setTime(0)
    }
    setPlaying((p) => !p)
  }

  if (!broadcast.clips.length) return null

  if (!open) {
    return (
      <div className={`gb-sim gb-sim--closed${compact ? ' gb-sim--compact' : ''}`}>
        <button
          type="button"
          className="gb-sim__reveal"
          onClick={() => setOpen(true)}
        >
          <span className="gb-sim__reveal-play" aria-hidden="true">
            <Tv size={compact ? 15 : 18} strokeWidth={2.2} />
          </span>
          <span className="gb-sim__reveal-copy">
            <span className="gb-sim__reveal-title">Watch game sim</span>
            <span className="gb-sim__reveal-sub">
              Full broadcast · {broadcast.clips.length} possessions · view only
            </span>
          </span>
        </button>
      </div>
    )
  }

  const progress =
    broadcast.totalDuration > 0 ? time / broadcast.totalDuration : 0

  return (
    <div className={`gb-sim${compact ? ' gb-sim--compact' : ''}`}>
      <div className="gb-sim__chrome">
        <div className="gb-sim__eyebrow">
          <span className="gb-sim__badge">SIM</span>
          <span className="gb-sim__meta">
            G{gameIndex + 1} · {stadium.name}
          </span>
          {clip ? (
            <span className="gb-sim__clock">
              {periodStamp(clip.quarter, clip.clock)}
            </span>
          ) : null}
        </div>
        <div className="gb-sim__actions">
          <button
            type="button"
            className="gb-sim__btn"
            onClick={() => seekToClip(clipIndex - 1)}
            aria-label="Previous possession"
          >
            <ChevronLeft size={14} strokeWidth={2.2} />
          </button>
          <button
            type="button"
            className="gb-sim__btn gb-sim__btn--primary"
            onClick={togglePlay}
            aria-label={playing ? 'Pause' : 'Play'}
          >
            {playing ? (
              <Pause size={14} strokeWidth={2.2} />
            ) : (
              <Play size={14} strokeWidth={2.2} />
            )}
            {playing ? 'Pause' : 'Play'}
          </button>
          <button
            type="button"
            className="gb-sim__btn"
            onClick={() => seekToClip(clipIndex + 1)}
            aria-label="Next possession"
          >
            <ChevronRight size={14} strokeWidth={2.2} />
          </button>
          <button
            type="button"
            className="gb-sim__btn"
            onClick={() => {
              const i = SPEEDS.indexOf(speed)
              setSpeed(SPEEDS[(i + 1) % SPEEDS.length]!)
            }}
          >
            {speed}×
          </button>
          <button
            type="button"
            className="gb-sim__btn gb-sim__btn--ghost"
            onClick={() => setOpen(false)}
            aria-label="Hide broadcast"
          >
            <X size={14} strokeWidth={2.2} />
            Hide
          </button>
        </div>
      </div>

      <div className="gb-sim__stage-wrap">
        <canvas
          ref={canvasRef}
          className="gb-sim__canvas"
          width={BROADCAST_W}
          height={BROADCAST_H}
          aria-label="Game simulation broadcast"
        />
        {!ready ? <p className="gb-sim__loading">Loading roster…</p> : null}
      </div>

      <div className="gb-sim__scrub">
        <input
          type="range"
          min={0}
          max={1000}
          value={Math.round(progress * 1000)}
          aria-label="Scrub broadcast"
          onChange={(e) => {
            const next =
              (Number(e.target.value) / 1000) * broadcast.totalDuration
            timeRef.current = next
            setTime(next)
            setPlaying(false)
            paint(next)
          }}
        />
        <span className="gb-sim__scrub-meta">
          {clipIndex + 1}/{broadcast.clips.length}
        </span>
      </div>
    </div>
  )
}
