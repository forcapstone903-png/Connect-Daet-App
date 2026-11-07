'use client'

import { useRef, useState } from 'react'

export default function MultiMediaUpload({ value = [], onChange, bucket = 'post-media', folder = 'posts', maxFiles = 10, maxSizeMB = 20 }) {
  const inputRef = useRef(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')

  const uploadFiles = async (files) => {
    const selectedFiles = Array.from(files).slice(0, maxFiles - value.length)
    if (!selectedFiles.length) return

    setUploading(true)
    setError('')
    const uploaded = []

    try {
      for (const file of selectedFiles) {
        if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) throw new Error('Please select only images or videos.')
        if (file.size > maxSizeMB * 1024 * 1024) throw new Error(`${file.name} exceeds the ${maxSizeMB}MB limit.`)

        const formData = new FormData()
        formData.append('file', file)
        formData.append('bucket', bucket)
        formData.append('folder', folder)
        const response = await fetch('/api/upload', { method: 'POST', body: formData })
        const result = await response.json()
        if (!response.ok || !result.success) throw new Error(result.error || `Unable to upload ${file.name}.`)
        uploaded.push({ url: result.url, type: file.type.startsWith('video/') ? 'video' : 'image', name: file.name })
      }
      onChange([...value, ...uploaded])
    } catch (uploadError) {
      setError(uploadError.message)
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  const removeFile = (index) => onChange(value.filter((_, fileIndex) => fileIndex !== index))

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => inputRef.current?.click()} disabled={uploading || value.length >= maxFiles} className="rounded-lg bg-sky-50 px-3 py-2 text-sm font-bold text-sky-700 hover:bg-sky-100 disabled:opacity-50">
          {uploading ? 'Uploading...' : 'Add photos or videos'}
        </button>
        <span className="text-xs text-slate-500">{value.length}/{maxFiles} selected</span>
      </div>
      <input ref={inputRef} type="file" multiple accept="image/*,video/mp4,video/quicktime,video/webm" onChange={(event) => uploadFiles(event.target.files)} className="hidden" />
      {error && <p className="text-xs font-semibold text-red-600">{error}</p>}
      {value.length > 0 && <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{value.map((media, index) => <div key={`${media.url}-${index}`} className="relative overflow-hidden rounded-xl border border-slate-200 bg-slate-50">{media.type === 'video' ? <video src={media.url} controls className="h-28 w-full object-cover" /> : <img src={media.url} alt={media.name || 'Selected media'} className="h-28 w-full object-cover" />}<button type="button" onClick={() => removeFile(index)} aria-label={`Remove ${media.name || 'media'}`} className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-red-600 text-sm text-white">x</button></div>)}</div>}
    </div>
  )
}
