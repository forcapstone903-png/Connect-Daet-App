'use client'

import { forwardRef, useImperativeHandle, useRef, useState } from 'react'
import { ImagePlus } from 'lucide-react'
import { compressImage } from '@/lib/compressImage'

const MultiMediaUpload = forwardRef(function MultiMediaUpload({
  value = [],
  onChange,
  bucket = 'post-media',
  folder = 'posts',
  maxFiles = 10,
  maxSizeMB = 20,
  imageOnly = false,
  onUploadStateChange,
  onUploadProgress,
  onInsert,
}, ref) {
  const inputRef = useRef(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [progress, setProgress] = useState(0)

  const uploadFile = (formData, fileProgress) => new Promise((resolve, reject) => {
    const request = new XMLHttpRequest()
    request.open('POST', '/info/api/upload')
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) fileProgress(event.loaded / event.total)
    }
    request.onload = () => {
      let result
      try {
        result = JSON.parse(request.responseText)
      } catch {
        reject(new Error(request.responseText || `Unable to upload file (${request.status}).`))
        return
      }
      if (request.status < 200 || request.status >= 300 || !result.success) {
        reject(new Error(result.error || `Unable to upload file (${request.status}).`))
        return
      }
      resolve(result)
    }
    request.onerror = () => reject(new Error('Network error while uploading file.'))
    request.onabort = () => reject(new Error('File upload was cancelled.'))
    request.send(formData)
  })

  const uploadFiles = async (files) => {
    const selectedFiles = Array.from(files).slice(0, maxFiles - value.length)
    if (!selectedFiles.length) return

    setUploading(true)
    onUploadStateChange?.(true)
    setError('')
    const uploaded = []
    let completed = 0

    try {
      for (const file of selectedFiles) {
        if (imageOnly ? !file.type.startsWith('image/') : (!file.type.startsWith('image/') && !file.type.startsWith('video/'))) {
          throw new Error(imageOnly ? 'Please select only images.' : 'Please select only images or videos.')
        }
        const uploadFileToSend = file.type.startsWith('image/') && window.matchMedia('(pointer: coarse), (max-width: 767px)').matches
          ? await compressImage(file)
          : file
        if (uploadFileToSend.size > maxSizeMB * 1024 * 1024) throw new Error(`${file.name} is too large. Choose a file under ${maxSizeMB}MB.`)

        const formData = new FormData()
        formData.append('file', uploadFileToSend, uploadFileToSend.name)
        formData.append('bucket', bucket)
        formData.append('folder', folder)
        const result = await uploadFile(formData, (fileProgress) => {
          const nextProgress = Math.min(99, Math.round(((completed + fileProgress) / selectedFiles.length) * 100))
          setProgress(nextProgress)
          onUploadProgress?.(nextProgress)
        })
        uploaded.push({ url: result.url, type: file.type.startsWith('video/') ? 'video' : 'image', name: file.name })
        completed += 1
        const nextProgress = Math.round((completed / selectedFiles.length) * 100)
        setProgress(nextProgress)
        onUploadProgress?.(nextProgress)
      }
      onChange([...value, ...uploaded])
      return uploaded
    } catch (uploadError) {
      setError(uploadError.message)
      return []
    } finally {
      setUploading(false)
      onUploadStateChange?.(false)
      window.setTimeout(() => {
        setProgress(0)
        onUploadProgress?.(0)
      }, 700)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  const removeFile = (index) => onChange(value.filter((_, fileIndex) => fileIndex !== index))

  useImperativeHandle(ref, () => ({
    uploadFiles,
    openPicker: () => inputRef.current?.click(),
  }))

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => inputRef.current?.click()} disabled={uploading || value.length >= maxFiles} className="rounded-lg bg-sky-50 px-3 py-2 text-sm font-bold text-sky-700 hover:bg-sky-100 disabled:opacity-50">
          {uploading ? `Uploading ${progress}%` : 'Add photos or videos'}
        </button>
        <span className="text-xs text-slate-500">{value.length}/{maxFiles} selected</span>
      </div>
      {uploading && (
        <div className="h-1.5 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}>
          <div className="h-full rounded-full bg-blue-600 transition-[width]" style={{ width: `${progress}%` }} />
        </div>
      )}
      <input ref={inputRef} type="file" multiple accept={imageOnly ? 'image/*' : 'image/*,video/*'} onChange={(event) => uploadFiles(event.target.files)} className="hidden" />
      {error && <p className="text-xs font-semibold text-red-600">{error}</p>}
      {value.length > 0 && <div className={`grid grid-cols-2 gap-2 sm:grid-cols-3 ${onInsert ? 'content-studio-media-grid' : ''}`}>{value.map((media, index) => <div key={`${media.url}-${index}`} className={`relative overflow-hidden rounded-xl border border-slate-200 bg-slate-50 ${onInsert ? 'content-studio-media-item' : ''}`}>{media.type === 'video' ? <video src={media.url} controls className="h-28 w-full object-cover" /> : <img src={media.url} alt={media.name || 'Selected media'} className="h-28 w-full object-cover" />}{onInsert && media.type === 'image' && <button type="button" onPointerDown={(event) => event.preventDefault()} onMouseDown={(event) => event.preventDefault()} onClick={() => onInsert(media)} className="content-studio-media-insert"><ImagePlus className="h-3.5 w-3.5" aria-hidden="true" />Insert into story</button>}<button type="button" onPointerDown={(event) => event.preventDefault()} onMouseDown={(event) => event.preventDefault()} onClick={() => removeFile(index)} aria-label={`Remove ${media.name || 'media'}`} className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-red-600 text-sm text-white">x</button></div>)}</div>}
    </div>
  )
  })

export default MultiMediaUpload
