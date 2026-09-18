'use client'

// Uploaded cover photos are often exported with solid black pillarbox or
// letterbox bars baked into the pixels (for example, a 16:9 photo padded onto a
// wider canvas so it can be shared from a phone). `object-fit: cover` cannot
// remove those bars because they are real image content, and the profile hero
// is a wide banner, so the bars stay visible at both sides of the cover.
//
// The fix therefore happens before the file reaches storage: detect border
// lines that are both very dark and almost perfectly uniform across the whole
// line, then crop them away. Everything runs in the browser with canvas APIs,
// so no extra dependency and no server round trip is required.

const DEFAULT_OPTIONS = {
  // A border line counts as a bar only when it is this dark on average ...
  maxLuminance: 26,
  // ... and this uniform across the whole line, i.e. it carries no detail.
  maxSpread: 14,
  // Bars thinner than this share of the image are left untouched.
  minTrimFraction: 0.005,
  // Safety cap so a mostly dark photo is never cropped down to a sliver.
  maxTrimFraction: 0.25,
  // Detection runs on a downscaled copy so very large photos stay cheap.
  analysisMaxEdge: 1600,
  quality: 0.92,
}

// Animated and vector images cannot be safely flattened into a canvas.
const UNSUPPORTED_TYPES = new Set(['image/gif', 'image/svg+xml'])

function resolveOptions(options) {
  return { ...DEFAULT_OPTIONS, ...options }
}

function createCanvas(width, height) {
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(width))
  canvas.height = Math.max(1, Math.round(height))
  return canvas
}

async function loadDrawable(file) {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file)
      return { source: bitmap, width: bitmap.width, height: bitmap.height, release: () => bitmap.close?.() }
    } catch {
      // fall through to the <img> path below
    }
  }

  const objectUrl = URL.createObjectURL(file)
  try {
    const image = await new Promise((resolve, reject) => {
      const element = new Image()
      element.onload = () => resolve(element)
      element.onerror = () => reject(new Error('Unable to read the selected image.'))
      element.src = objectUrl
    })
    return {
      source: image,
      width: image.naturalWidth,
      height: image.naturalHeight,
      release: () => URL.revokeObjectURL(objectUrl),
    }
  } catch (error) {
    URL.revokeObjectURL(objectUrl)
    throw error
  }
}

function luminanceOf(data, index) {
  return 0.2126 * data[index] + 0.7152 * data[index + 1] + 0.0722 * data[index + 2]
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve) => {
    if (typeof canvas.toBlob !== 'function') {
      resolve(null)
      return
    }
    canvas.toBlob((blob) => resolve(blob), type, quality)
  })
}

// Walks inwards from each edge while the border lines stay dark and uniform.
function measureBars(imageData, options) {
  const { width, height, data } = imageData
  const columnMeans = new Array(width)
  const columnSpreads = new Array(width)
  const rowMeans = new Array(height)
  const rowSpreads = new Array(height)
  const columnLow = new Array(width).fill(255)
  const columnHigh = new Array(width).fill(0)
  const rowLow = new Array(height).fill(255)
  const rowHigh = new Array(height).fill(0)

  for (let y = 0; y < height; y++) {
    let rowTotal = 0
    for (let x = 0; x < width; x++) {
      const value = luminanceOf(data, (y * width + x) * 4)
      rowTotal += value
      if (value < rowLow[y]) rowLow[y] = value
      if (value > rowHigh[y]) rowHigh[y] = value
      if (value < columnLow[x]) columnLow[x] = value
      if (value > columnHigh[x]) columnHigh[x] = value
    }
    rowMeans[y] = rowTotal / width
  }

  for (let x = 0; x < width; x++) {
    let columnTotal = 0
    for (let y = 0; y < height; y++) {
      columnTotal += luminanceOf(data, (y * width + x) * 4)
    }
    columnMeans[x] = columnTotal / height
    columnSpreads[x] = columnHigh[x] - columnLow[x]
  }

  for (let y = 0; y < height; y++) {
    rowSpreads[y] = rowHigh[y] - rowLow[y]
  }

  const isBar = (mean, spread) => mean <= options.maxLuminance && spread <= options.maxSpread
  const walk = (means, spreads) => {
    let leading = 0
    while (leading < means.length && isBar(means[leading], spreads[leading])) leading += 1
    let trailing = 0
    while (trailing < means.length - leading && isBar(means[means.length - 1 - trailing], spreads[means.length - 1 - trailing])) trailing += 1
    return { leading, trailing, total: means.length }
  }

  return { columns: walk(columnMeans, columnSpreads), rows: walk(rowMeans, rowSpreads) }
}

function barsToFractions(bars, options) {
  const usable = (count, total) => {
    const fraction = total > 0 ? count / total : 0
    if (fraction < options.minTrimFraction || fraction > options.maxTrimFraction || fraction >= 0.5) return 0
    return fraction
  }

  return {
    left: usable(bars.columns.leading, bars.columns.total),
    right: usable(bars.columns.trailing, bars.columns.total),
    top: usable(bars.rows.leading, bars.rows.total),
    bottom: usable(bars.rows.trailing, bars.rows.total),
  }
}

async function cropDrawable(drawable, fractions) {
  const { source, width, height } = drawable
  // Round outward: a 1px sliver of bar is a visible dark line against the white
  // profile card, while cropping 1px of photo content is imperceptible.
  const left = Math.ceil(width * fractions.left)
  const top = Math.ceil(height * fractions.top)
  const right = Math.ceil(width * fractions.right)
  const bottom = Math.ceil(height * fractions.bottom)
  const cropWidth = width - left - right
  const cropHeight = height - top - bottom

  if (cropWidth < 16 || cropHeight < 16) return null

  const canvas = createCanvas(cropWidth, cropHeight)
  const context = canvas.getContext('2d')
  if (!context) return null

  context.drawImage(source, left, top, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight)
  return canvas
}

/**
 * Removes solid pillarbox / letterbox bars that were saved into an image file.
 *
 * Returns the original file untouched when nothing looks like a baked-in bar,
 * so callers can always forward `result.file` to FormData.
 */
export async function trimLetterboxBars(file, options = {}) {
  const resolved = resolveOptions(options)
  const untouched = { file, trimmed: false, removed: { left: 0, right: 0, top: 0, bottom: 0 } }

  if (!file || typeof file.type !== 'string') return untouched
  if (!file.type.startsWith('image/') || UNSUPPORTED_TYPES.has(file.type)) return untouched

  let drawable = null
  try {
    drawable = await loadDrawable(file)
    const { source, width, height } = drawable
    if (width < 32 || height < 32) return untouched

    // 1. Detect the bars on a cheap downscaled copy.
    const analysisScale = Math.min(1, resolved.analysisMaxEdge / Math.max(width, height))
    const analysisCanvas = createCanvas(width * analysisScale, height * analysisScale)
    const analysisContext = analysisCanvas.getContext('2d', { willReadFrequently: true })
    if (!analysisContext) return untouched
    analysisContext.drawImage(source, 0, 0, analysisCanvas.width, analysisCanvas.height)

    let imageData = null
    try {
      imageData = analysisContext.getImageData(0, 0, analysisCanvas.width, analysisCanvas.height)
    } catch {
      // Cross-origin pixels cannot be read; leave the file alone.
      return untouched
    }

    const fractions = barsToFractions(measureBars(imageData, resolved), resolved)
    const removedTotal = fractions.left + fractions.right + fractions.top + fractions.bottom
    if (removedTotal <= 0) return untouched

    // 2. Crop at the full resolution of the original file.
    const cropped = await cropDrawable(drawable, fractions)
    if (!cropped) return untouched

    const blob = await canvasToBlob(cropped, file.type, resolved.quality)
    if (!blob) return untouched

    const trimmedFile = typeof File === 'function'
      ? new File([blob], file.name || 'upload', { type: blob.type || file.type, lastModified: Date.now() })
      : blob

    return { file: trimmedFile, trimmed: true, removed: fractions }
  } catch {
    return untouched
  } finally {
    drawable?.release?.()
  }
}

export default trimLetterboxBars
