export async function compressImage(file, { maxDimension = 1600, quality = 0.8 } = {}) {
  if (!file?.type?.startsWith('image/') || file.type === 'image/gif') return file

  let bitmap
  try {
    bitmap = typeof createImageBitmap === 'function'
      ? await createImageBitmap(file)
      : await loadImage(file)

    if (bitmap.width <= maxDimension && bitmap.height <= maxDimension && file.size <= 2 * 1024 * 1024) {
      return file
    }

    const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(bitmap.width * scale))
    canvas.height = Math.max(1, Math.round(bitmap.height * scale))
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Unable to prepare image for upload.')
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)

    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob((result) => {
        if (result) resolve(result)
        else reject(new Error('Unable to compress image for upload.'))
      }, 'image/jpeg', quality)
    })
    const baseName = file.name.replace(/\.[^.]+$/, '') || 'image'
    return new File([blob], `${baseName}.jpg`, { type: 'image/jpeg', lastModified: Date.now() })
  } finally {
    bitmap?.close?.()
  }
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const image = new Image()
    const url = URL.createObjectURL(file)
    image.onload = () => {
      URL.revokeObjectURL(url)
      resolve(image)
    }
    image.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Unable to read image file.'))
    }
    image.src = url
  })
}
