'use client'

import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import { ImagePlus, LoaderCircle, Move, RotateCcw, Trash2, Upload, X } from 'lucide-react'

const MAX_FILE_SIZE = 10 * 1024 * 1024
const OUTPUT_SIZE = 512
const MAX_ZOOM = 5

function limitOffset(value, renderedSize, viewportSize) {
  const limit = Math.max(0, (renderedSize - viewportSize) / 2)
  return Math.min(limit, Math.max(-limit, value))
}

export default function ProfilePhotoCropper({ userId, imageUrl, onUploadComplete, onUploadError }) {
  const [selectedImage, setSelectedImage] = useState(null)
  const [imageSize, setImageSize] = useState(null)
  const [stageSize, setStageSize] = useState(null)
  const [zoom, setZoom] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [dragging, setDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [error, setError] = useState('')
  const inputRef = useRef(null)
  const stageRef = useRef(null)
  const imageRef = useRef(null)
  const dragRef = useRef(null)

  useEffect(() => {
    if (!selectedImage?.previewUrl) return undefined
    return () => URL.revokeObjectURL(selectedImage.previewUrl)
  }, [selectedImage?.previewUrl])

  useEffect(() => {
    if (!selectedImage) return undefined
    const stage = stageRef.current
    if (!stage) return undefined
    const observer = new ResizeObserver(() => {
      const bounds = stage.getBoundingClientRect()
      setStageSize({ width: bounds.width, height: bounds.height })
    })
    observer.observe(stage)
    return () => observer.disconnect()
  }, [selectedImage])

  const selectImage = (event) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (!file.type.startsWith('image/') || file.type === 'image/gif' || file.type === 'image/svg+xml') {
      setError('Choose a JPG, PNG, or WebP image.')
      return
    }
    if (file.size > MAX_FILE_SIZE) {
      setError('Choose an image smaller than 10 MB.')
      return
    }

    setError('')
    setZoom(1)
    setOffset({ x: 0, y: 0 })
    setImageSize(null)
    setStageSize(null)
    setSelectedImage({ file, previewUrl: URL.createObjectURL(file) })
  }

  const handlePointerDown = (event) => {
    if (!imageSize || !stageRef.current) return
    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = { pointerX: event.clientX, pointerY: event.clientY, ...offset }
    setDragging(true)
  }

  const handlePointerMove = (event) => {
    if (!dragRef.current || !stageRef.current || !imageSize) return
    const stage = stageRef.current.getBoundingClientRect()
    const baseScale = Math.max(stage.width / imageSize.width, stage.height / imageSize.height)
    const scale = baseScale * zoom
    setOffset({
      x: limitOffset(dragRef.current.x + event.clientX - dragRef.current.pointerX, imageSize.width * scale, stage.width),
      y: limitOffset(dragRef.current.y + event.clientY - dragRef.current.pointerY, imageSize.height * scale, stage.height),
    })
  }

  const finishDragging = () => {
    dragRef.current = null
    setDragging(false)
  }

  const removePhoto = async () => {
    if (!imageUrl) return
    if (!userId) {
      setError('Please sign in to update your profile photo.')
      return
    }
    setRemoving(true)
    setError('')
    try {
      const response = await fetch('/info/api/upload', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bucket: 'profile-media', url: imageUrl }),
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Unable to remove your profile photo.')
      }
      onUploadComplete(null)
    } catch (removeError) {
      console.error('Profile photo removal failed:', removeError)
      const message = removeError?.message || 'Unable to remove your profile photo.'
      setError(message)
      onUploadError?.(message)
    } finally {
      setRemoving(false)
    }
  }

  const updateZoom = (value) => {
    const nextZoom = Math.min(MAX_ZOOM, Math.max(1, Number(value)))
    if (!imageSize || !stageRef.current) {
      setZoom(nextZoom)
      return
    }
    const stage = stageRef.current.getBoundingClientRect()
    const scale = Math.max(stage.width / imageSize.width, stage.height / imageSize.height) * nextZoom
    setZoom(nextZoom)
    setOffset((current) => ({
      x: limitOffset(current.x, imageSize.width * scale, stage.width),
      y: limitOffset(current.y, imageSize.height * scale, stage.height),
    }))
  }

  const uploadCrop = async () => {
    const image = imageRef.current
    const stage = stageRef.current
    if (!userId) {
      setError('Please sign in to update your profile photo.')
      return
    }
    if (!image || !stage || !imageSize) return

    setUploading(true)
    setError('')
    try {
      const bounds = stage.getBoundingClientRect()
      const baseScale = Math.max(bounds.width / imageSize.width, bounds.height / imageSize.height)
      const scale = baseScale * zoom
      const renderedWidth = imageSize.width * scale
      const renderedHeight = imageSize.height * scale
      const sourceX = ((renderedWidth - bounds.width) / 2 - offset.x) / scale
      const sourceY = ((renderedHeight - bounds.height) / 2 - offset.y) / scale
      const sourceSize = bounds.width / scale
      const canvas = document.createElement('canvas')
      canvas.width = OUTPUT_SIZE
      canvas.height = OUTPUT_SIZE
      const context = canvas.getContext('2d')
      if (!context) throw new Error('Your browser could not prepare the cropped image.')
      context.drawImage(image, sourceX, sourceY, sourceSize, sourceSize, 0, 0, OUTPUT_SIZE, OUTPUT_SIZE)

      const blob = await new Promise((resolve, reject) => {
        canvas.toBlob((result) => {
          if (result) resolve(result)
          else reject(new Error('Unable to create the cropped image. Please try again.'))
        }, 'image/jpeg', 0.9)
      })
      const file = new File([blob], 'profile-photo.jpg', { type: 'image/jpeg' })
      const formData = new FormData()
      formData.append('file', file)
      formData.append('bucket', 'profile-media')
      formData.append('folder', `users/${userId}`)

      const response = await fetch('/info/api/upload', { method: 'POST', body: formData })
      const result = await response.json().catch(() => ({}))
      if (!response.ok || !result.success || !result.url) {
        throw new Error(result.error || 'Unable to upload your cropped profile photo.')
      }

      onUploadComplete(result.url)
      setSelectedImage(null)
      setImageSize(null)
      setStageSize(null)
    } catch (uploadError) {
      console.error('Profile photo crop failed:', uploadError)
      const message = uploadError?.message || 'Unable to upload your cropped profile photo.'
      setError(message)
      onUploadError?.(message)
    } finally {
      setUploading(false)
    }
  }

  const closeCropper = () => {
    if (uploading) return
    setSelectedImage(null)
    setImageSize(null)
    setStageSize(null)
    setError('')
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-full border border-slate-200 bg-white">
          {imageUrl
            ? <Image src={imageUrl} alt="Current profile photo" width={80} height={80} unoptimized className="h-full w-full object-cover" />
            : <ImagePlus className="h-7 w-7 text-slate-400" aria-hidden="true" />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-slate-700">{imageUrl ? 'Profile photo ready' : 'Add a profile photo'}</p>
          <p className="mt-1 text-xs leading-5 text-slate-500">Choose a photo, then drag and zoom to frame your crop.</p>
          <button type="button" onClick={() => inputRef.current?.click()} disabled={!userId || removing || uploading} className="mt-2 inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 transition hover:border-sky-300 hover:bg-sky-50 hover:text-sky-700 disabled:opacity-50">
            <Upload className="h-4 w-4" aria-hidden="true" />
            {imageUrl ? 'Change photo' : 'Choose photo'}
          </button>
          {imageUrl && <button type="button" onClick={() => void removePhoto()} disabled={!userId || removing || uploading} className="ml-2 inline-flex min-h-10 items-center gap-1.5 rounded-xl px-2 text-xs font-bold text-rose-600 hover:bg-rose-50 disabled:opacity-50">
            {removing ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Trash2 className="h-4 w-4" aria-hidden="true" />}
            Remove
          </button>}
        </div>
      </div>
      <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={selectImage} className="sr-only" aria-label="Choose profile photo" />
      {error && <p role="alert" className="text-xs font-semibold text-rose-600">{error}</p>}

      {selectedImage && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/65 p-4" role="dialog" aria-modal="true" aria-labelledby="profile-photo-crop-title">
          <section className="w-full max-w-md rounded-3xl bg-white p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 id="profile-photo-crop-title" className="text-lg font-black text-slate-900">Crop profile photo</h2>
                <p className="mt-1 text-sm text-slate-500">Drag the image to position it inside the circle.</p>
              </div>
              <button type="button" onClick={closeCropper} disabled={uploading} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200 disabled:opacity-50" aria-label="Cancel crop">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div
              ref={stageRef}
              className={`relative mx-auto mt-5 aspect-square w-full max-w-[280px] touch-none overflow-hidden rounded-full bg-slate-100 ${dragging ? 'cursor-grabbing' : 'cursor-grab'}`}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={finishDragging}
              onPointerCancel={finishDragging}
              aria-label="Drag to adjust the photo crop"
            >
              <Image
                ref={imageRef}
                src={selectedImage.previewUrl}
                alt="Photo crop preview"
                width={imageSize?.width || OUTPUT_SIZE}
                height={imageSize?.height || OUTPUT_SIZE}
                unoptimized
                draggable="false"
                onLoad={(event) => {
                  setImageSize({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })
                  const bounds = stageRef.current?.getBoundingClientRect()
                  if (bounds) setStageSize({ width: bounds.width, height: bounds.height })
                }}
                onError={() => setError('Unable to read the selected image. Please choose another photo.')}
                className="pointer-events-none absolute left-1/2 top-1/2 max-w-none select-none"
                style={imageSize && stageSize ? (() => {
                  const scale = Math.max(stageSize.width / imageSize.width, stageSize.height / imageSize.height) * zoom
                  return {
                    width: imageSize.width * scale,
                    height: imageSize.height * scale,
                    transform: `translate(-50%, -50%) translate(${offset.x}px, ${offset.y}px)`,
                  }
                })() : { visibility: 'hidden' }}
              />
              {!imageSize && <LoaderCircle className="absolute left-1/2 top-1/2 h-6 w-6 -translate-x-1/2 -translate-y-1/2 animate-spin text-slate-500" aria-label="Loading photo" />}
            </div>

            <div className="mt-5">
              <label htmlFor="profile-photo-zoom" className="flex items-center justify-between text-xs font-semibold text-slate-600">
                <span className="flex items-center gap-2"><Move className="h-4 w-4" aria-hidden="true" /> Zoom</span>
                <span className="flex items-center gap-2">
                  <button type="button" onClick={() => updateZoom(zoom - 0.25)} disabled={zoom <= 1} className="flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 text-base leading-none hover:bg-slate-50 disabled:opacity-40" aria-label="Zoom out">−</button>
                  <span className="min-w-10 text-center tabular-nums">{Math.round(zoom * 100)}%</span>
                  <button type="button" onClick={() => updateZoom(zoom + 0.25)} disabled={zoom >= MAX_ZOOM} className="flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 text-base leading-none hover:bg-slate-50 disabled:opacity-40" aria-label="Zoom in">+</button>
                </span>
              </label>
              <input id="profile-photo-zoom" type="range" min="1" max={MAX_ZOOM} step="0.01" value={zoom} onChange={(event) => updateZoom(event.target.value)} className="mt-2 w-full accent-sky-600" />
              <button type="button" onClick={() => { setZoom(1); setOffset({ x: 0, y: 0 }) }} className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-sky-700">
                <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" /> Reset crop
              </button>
            </div>
            {error && <p role="alert" className="mt-3 text-xs font-semibold text-rose-600">{error}</p>}

            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={closeCropper} disabled={uploading} className="min-h-11 rounded-xl border border-slate-200 px-4 text-sm font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50">Cancel</button>
              <button type="button" onClick={() => void uploadCrop()} disabled={!userId || !imageSize || uploading} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-sky-600 px-4 text-sm font-bold text-white hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-50">
                {uploading && <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />}
                {uploading ? 'Uploading…' : 'Use photo'}
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  )
}
