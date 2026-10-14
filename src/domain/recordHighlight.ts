import {
  BufferTarget,
  CanvasSource,
  getFirstEncodableVideoCodec,
  Mp4OutputFormat,
  Output,
  QUALITY_HIGH,
} from 'mediabunny'
import type { HighlightReel } from './highlightReel'
import {
  HIGHLIGHT_DURATION,
  HIGHLIGHT_FPS,
  HIGHLIGHT_H,
  HIGHLIGHT_W,
  loadReelAssets,
  paintCourtsideFrame,
  type LoadedAssets,
} from './courtsideHighlight'

export async function recordHighlightMp4(
  reel: HighlightReel,
  assets?: LoadedAssets,
  onProgress?: (ratio: number) => void,
): Promise<Blob> {
  const loaded = assets ?? (await loadReelAssets(reel))
  const canvas = document.createElement('canvas')
  canvas.width = HIGHLIGHT_W
  canvas.height = HIGHLIGHT_H
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas unavailable')

  const output = new Output({
    format: new Mp4OutputFormat(),
    target: new BufferTarget(),
  })

  const codec = await getFirstEncodableVideoCodec(
    output.format.getSupportedVideoCodecs(),
    { width: HIGHLIGHT_W, height: HIGHLIGHT_H },
  )
  if (!codec) {
    throw new Error('This browser can’t encode MP4 (WebCodecs needed).')
  }

  const source = new CanvasSource(canvas, {
    codec,
    quality: QUALITY_HIGH,
  })
  output.addVideoTrack(source, { frameRate: HIGHLIGHT_FPS })
  await output.start()

  const totalFrames = Math.round(HIGHLIGHT_DURATION * HIGHLIGHT_FPS)
  const frameDur = 1 / HIGHLIGHT_FPS

  for (let i = 0; i < totalFrames; i++) {
    const t = i * frameDur
    paintCourtsideFrame(ctx, reel, loaded, t)
    await source.add(t, frameDur)
    onProgress?.(i / (totalFrames - 1))
  }

  source.close()
  await output.finalize()

  const buffer = output.target.buffer
  if (!buffer) throw new Error('MP4 encode produced no data')
  return new Blob([buffer], { type: 'video/mp4' })
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
