/**
 * Client-side photo preparation: resize, re-encode, and score sharpness.
 *
 * WHY RESIZE ON THE PHONE AND NOT THE SERVER
 * A modern Android camera produces 4–8 MB per shot. Two shots per visit ×
 * 40 trees × 5 rounds = 400 photos. At full size that is ~2 GB and would blow
 * the Supabase free-tier storage allowance somewhere around check-in round 2 —
 * i.e. mid-pilot, unrecoverably. At 800px/q75 the same set is ~40 MB.
 *
 * It also makes the upload survivable on Ghanaian mobile data, which is the
 * difference between T0 taking one hour and taking three.
 *
 * 800px is comfortably above what DINOv2 ViT-S/14 consumes (it sees 224–518px),
 * so nothing is thrown away that the matching model would have used.
 */

/** Long edge, in pixels, of the stored photo. */
const MAX_EDGE = 800

/** JPEG quality of the stored photo. */
const QUALITY = 0.75

/**
 * Long edge used for the sharpness measurement only.
 *
 * Variance-of-Laplacian scales with resolution, so measuring at the native size
 * would make a 12 MP phone look "sharper" than an 8 MP one for the same actual
 * blur. Fixing the analysis size makes the number comparable across devices —
 * which matters because blur_score ends up in the signals table and gets
 * correlated against verdicts later.
 */
const ANALYSIS_EDGE = 320

/**
 * Below this, warn the user and offer a retake.
 *
 * PROVISIONAL. Chosen from desktop tests, not from field data. Recalibrate from
 * the T0 blur_score distribution once ~80 real photos exist — the honest way is
 * to look at the histogram and put the line under the tail we would actually
 * want to reject, not to pick a round number and defend it.
 */
export const BLUR_WARN_THRESHOLD = 120

export interface PreparedPhoto {
  /** Resized, re-encoded JPEG ready to upload. */
  blob: Blob
  width: number
  height: number
  /** Variance of Laplacian at a fixed 320px. Higher is sharper. */
  blurScore: number
  /** Object URL for preview. Caller must revokePreview() when done. */
  previewUrl: string
  /** Bytes, after resize — surfaced in the UI so a slow upload is explicable. */
  bytes: number
}

/**
 * Decode honouring EXIF orientation.
 *
 * Phones almost always store the sensor's native landscape frame plus an
 * orientation tag rather than physically rotating the pixels. Ignoring the tag
 * gives sideways trees — which breaks the preview, breaks the ghost overlay at
 * check-in, and quietly degrades image matching because the embedding of a
 * rotated tree is not the embedding of that tree.
 */
async function decode(file: Blob): Promise<ImageBitmap | HTMLImageElement> {
  if ('createImageBitmap' in window) {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' })
    } catch {
      // Older Safari rejects the options bag; fall through.
    }
  }
  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve()
      img.onerror = () => reject(new Error('Could not read that photo'))
      img.src = url
    })
    return img
  } finally {
    URL.revokeObjectURL(url)
  }
}

function drawScaled(
  src: ImageBitmap | HTMLImageElement,
  maxEdge: number,
): { canvas: HTMLCanvasElement; width: number; height: number } {
  const sw = 'width' in src ? src.width : 0
  const sh = 'height' in src ? src.height : 0
  const scale = Math.min(1, maxEdge / Math.max(sw, sh))
  const width = Math.round(sw * scale)
  const height = Math.round(sh * scale)

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('Canvas unavailable on this device')
  ctx.drawImage(src as CanvasImageSource, 0, 0, width, height)
  return { canvas, width, height }
}

/**
 * Variance of the Laplacian — the standard cheap sharpness proxy.
 *
 * A sharp photo has strong high-frequency content, so the second derivative
 * varies a lot. A blurred one is smooth, so it barely varies. We report the
 * number rather than silently discarding blurry frames, because "we rejected it
 * for blur" has to be auditable — and because a systematically blurry round
 * would otherwise show up as a mysterious drop in match scores.
 */
function varianceOfLaplacian(canvas: HTMLCanvasElement): number {
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return 0
  const { width: w, height: h } = canvas
  if (w < 3 || h < 3) return 0

  const { data } = ctx.getImageData(0, 0, w, h)

  // Rec. 601 luma. Integer weights keep this fast on a mid-range Android.
  const grey = new Float32Array(w * h)
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    grey[p] = (data[i]! * 299 + data[i + 1]! * 587 + data[i + 2]! * 114) / 1000
  }

  // 4-neighbour Laplacian: [0 1 0; 1 -4 1; 0 1 0]
  let sum = 0
  let sumSq = 0
  let n = 0
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x
      const v =
        grey[i - w]! + grey[i + w]! + grey[i - 1]! + grey[i + 1]! - 4 * grey[i]!
      sum += v
      sumSq += v * v
      n++
    }
  }
  if (n === 0) return 0
  const mean = sum / n
  return sumSq / n - mean * mean
}

function toBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('Could not encode that photo'))),
      'image/jpeg',
      quality,
    )
  })
}

/** Resize, re-encode and sharpness-score a camera capture. */
export async function preparePhoto(file: Blob): Promise<PreparedPhoto> {
  const src = await decode(file)
  try {
    const { canvas, width, height } = drawScaled(src, MAX_EDGE)
    const analysis = drawScaled(src, ANALYSIS_EDGE)
    const blurScore = varianceOfLaplacian(analysis.canvas)
    const blob = await toBlob(canvas, QUALITY)
    return {
      blob,
      width,
      height,
      blurScore: Math.round(blurScore * 10) / 10,
      previewUrl: URL.createObjectURL(blob),
      bytes: blob.size,
    }
  } finally {
    if ('close' in src && typeof src.close === 'function') src.close()
  }
}

export function revokePreview(photo: Pick<PreparedPhoto, 'previewUrl'>): void {
  URL.revokeObjectURL(photo.previewUrl)
}

export function isBlurry(photo: Pick<PreparedPhoto, 'blurScore'>): boolean {
  return photo.blurScore < BLUR_WARN_THRESHOLD
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
