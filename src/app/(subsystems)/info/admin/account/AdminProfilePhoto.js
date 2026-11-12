'use client'

import { useId, useState } from 'react'
import Image from 'next/image'
import { Camera, ImagePlus, Trash2 } from 'lucide-react'

const ACCEPTED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
const MAX_AVATAR_SIZE = 5 * 1024 * 1024

export default function AdminProfilePhoto({
  userId,
  value,
  name = 'Administrator',
  onChange,
  onError,
  onUploadStateChange,
  disabled = false,
  compact = false,
}) {
  const inputId = useId()
  const [uploading, setUploading] = useState(false)

  const uploadPhoto = async (event) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    if (!ACCEPTED_IMAGE_TYPES.has(file.type)) {
      onError('Choose a JPEG, PNG, WebP, or GIF image.')
      return
    }
    if (file.size > MAX_AVATAR_SIZE) {
      onError('Profile pictures must be 5 MB or smaller.')
      return
    }
    if (!userId) {
      onError('Your account could not be identified. Refresh and try again.')
      return
    }

    setUploading(true)
    onUploadStateChange?.(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('bucket', 'profile-media')
      formData.append('folder', `users/${userId}`)

      const response = await fetch('/info/api/upload', { method: 'POST', body: formData })
      const text = await response.text()
      let result
      try {
        result = text ? JSON.parse(text) : {}
      } catch {
        throw new Error(`The server returned an invalid response (${response.status}).`)
      }

      if (!response.ok || !result.success || !result.url) {
        throw new Error(result.error || `Unable to upload your profile picture (${response.status}).`)
      }
      onChange(result.url)
    } catch (error) {
      onError(error.message || 'Unable to upload your profile picture.')
    } finally {
      setUploading(false)
      onUploadStateChange?.(false)
    }
  }

  return (
    <div className={`flex min-w-0 items-center ${compact ? 'gap-4' : 'gap-5'}`}>
      <div className={`relative shrink-0 overflow-hidden rounded-full bg-blue-600 text-white ring-4 ring-blue-50 ${compact ? 'h-16 w-16' : 'h-24 w-24'}`}>
        {value ? (
          <Image
            src={value}
            alt="Administrator profile"
            fill
            sizes={compact ? '64px' : '96px'}
            unoptimized
            className="object-cover"
          />
        ) : (
          <span className={`flex h-full w-full items-center justify-center font-bold ${compact ? 'text-xl' : 'text-3xl'}`} aria-hidden="true">
            {name.trim().charAt(0).toUpperCase() || 'A'}
          </span>
        )}
      </div>

      <div className="min-w-0">
        <p className="text-sm font-semibold text-slate-900">Profile picture</p>
        <p className="mt-1 text-xs leading-5 text-slate-500">JPEG, PNG, WebP, or GIF · up to 5 MB</p>
        <p className="mt-1 text-xs text-slate-500">Save your profile to apply this photo to your account.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <label
            htmlFor={inputId}
            className={`inline-flex min-h-9 cursor-pointer items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-blue-700 focus-within:ring-2 focus-within:ring-blue-600 focus-within:ring-offset-2 ${
              disabled || uploading ? 'pointer-events-none opacity-60' : ''
            }`}
          >
            {uploading ? <ImagePlus className="h-4 w-4 animate-pulse" aria-hidden="true" /> : <Camera className="h-4 w-4" aria-hidden="true" />}
            {uploading ? 'Uploading…' : value ? 'Change photo' : 'Upload photo'}
          </label>
          <input
            id={inputId}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            className="sr-only"
            onChange={uploadPhoto}
            disabled={disabled || uploading}
            aria-label="Upload administrator profile picture"
          />
          {value && (
            <button
              type="button"
              onClick={() => onChange('')}
              disabled={disabled || uploading}
              className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 transition hover:border-red-200 hover:bg-red-50 hover:text-red-700 disabled:opacity-50"
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
              Remove
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
