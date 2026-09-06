// components/MediaUpload.js
'use client';

import { useState, useRef } from 'react';

export default function MediaUpload({ 
  bucket, 
  folder, 
  onUploadComplete, 
  onUploadError,
  existingMediaUrl,
  mediaType = 'both',
  className = "",
  previewClassName = "w-32 h-32",
  buttonText = "Upload Media",
  maxSizeMB = 20,
  maxVideoDuration = 30,
  acceptTypes = "image/jpeg,image/png,image/webp,image/gif,video/mp4,video/quicktime,video/webm"
}) {
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [mediaPreview, setMediaPreview] = useState(existingMediaUrl || null);
  const [mediaTypeDetected, setMediaTypeDetected] = useState(null);
  const fileInputRef = useRef(null);

  const validateVideoDuration = (file) => {
    return new Promise((resolve, reject) => {
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.onloadedmetadata = () => {
        window.URL.revokeObjectURL(video.src);
        if (video.duration > maxVideoDuration) {
          reject(`Video duration (${Math.round(video.duration)}s) exceeds ${maxVideoDuration}s limit`);
        } else {
          resolve(true);
        }
      };
      video.onerror = () => reject('Unable to read video file');
      video.src = URL.createObjectURL(file);
    });
  };

  const uploadMedia = async (file) => {
    if (!file) return;

    const isImage = file.type.startsWith('image/');
    const isVideo = file.type.startsWith('video/');
    
    if (mediaType === 'image' && !isImage) {
      onUploadError?.('Please upload an image file (JPEG, PNG, WebP, GIF)');
      return;
    }
    if (mediaType === 'video' && !isVideo) {
      onUploadError?.('Please upload a video file (MP4, MOV, WebM)');
      return;
    }
    if (!isImage && !isVideo) {
      onUploadError?.('Invalid file type. Please upload an image or video.');
      return;
    }

    if (file.size > maxSizeMB * 1024 * 1024) {
      onUploadError?.(`File size exceeds ${maxSizeMB}MB limit.`);
      return;
    }

    if (isVideo) {
      try {
        await validateVideoDuration(file);
      } catch (err) {
        onUploadError?.(err);
        return;
      }
    }

    setUploading(true);
    setUploadProgress(0);

    try {
      // Simulate progress
      const progressInterval = setInterval(() => {
        setUploadProgress(prev => Math.min(prev + 10, 90));
      }, 200);

      // Upload via API route
      const formData = new FormData();
      formData.append('file', file);
      formData.append('bucket', bucket);
      formData.append('folder', folder);

      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData
      });

      clearInterval(progressInterval);

      const responseText = await response.text();
      let payload = {};

      try {
        payload = responseText ? JSON.parse(responseText) : {};
      } catch {
        payload = { error: responseText || `Upload failed (${response.status})` };
      }

      if (!response.ok) {
        throw new Error(payload.error || `Upload failed (${response.status})`);
      }

      const data = payload;

      if (data.success) {
        setMediaPreview(data.url);
        setMediaTypeDetected(isVideo ? 'video' : 'image');
        onUploadComplete?.(data.url, isVideo ? 'video' : 'image');
        setUploadProgress(100);
        
        setTimeout(() => setUploadProgress(0), 1000);
      } else {
        throw new Error(data.error || 'Upload failed');
      }
    } catch (error) {
      console.error('Upload error:', error);
      onUploadError?.(`Upload failed: ${error.message}`);
    } finally {
      setUploading(false);
    }
  };

  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (file) {
      uploadMedia(file);
    }
  };

  const removeMedia = async () => {
    const url = mediaPreview || existingMediaUrl
    if (url) {
      try {
        const response = await fetch('/api/upload', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ bucket, url }),
        })
        if (!response.ok) console.warn('Uploaded media could not be removed from storage.')
      } catch (error) {
        console.warn('Uploaded media removal failed:', error)
      }
    }

    setMediaPreview(null);
    setMediaTypeDetected(null);
    onUploadComplete?.(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className={`space-y-2 ${className}`}>
      <div className="flex items-center gap-3 flex-wrap">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="flex items-center gap-2 rounded-lg bg-sky-50 px-3 py-1.5 text-sm font-medium text-sky-700 transition-colors hover:bg-sky-100 disabled:opacity-50"
        >
          {uploading ? (
            <>
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-sky-600 border-t-transparent"></div>
              <span>Uploading {uploadProgress > 0 ? `${uploadProgress}%` : '...'}</span>
            </>
          ) : (
            <>
              <span>{mediaType === 'video' ? '🎥' : mediaType === 'image' ? '📷' : '📎'}</span>
              <span>{buttonText}</span>
            </>
          )}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept={acceptTypes}
          onChange={handleFileSelect}
          className="hidden"
        />
        {(existingMediaUrl || mediaPreview) && (
          <button
            type="button"
            onClick={removeMedia}
            className="rounded-lg bg-rose-50 px-3 py-1.5 text-sm font-medium text-rose-600 transition-colors hover:bg-rose-100"
          >
            Remove
          </button>
        )}
      </div>
      
      {(existingMediaUrl || mediaPreview) && (
        <div className="mt-2">
          <div className="relative inline-block">
            {mediaTypeDetected === 'video' ? (
              <video
                src={mediaPreview || existingMediaUrl}
                className={`${previewClassName} rounded-xl border border-slate-200 object-cover shadow-sm`}
                controls
                preload="metadata"
              />
            ) : (
              <img
                src={mediaPreview || existingMediaUrl}
                alt="Upload preview"
                className={`${previewClassName} rounded-xl border border-slate-200 object-cover shadow-sm`}
              />
            )}
            <button
              type="button"
              onClick={removeMedia}
              className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-rose-600 text-xs text-white hover:bg-rose-700"
            >
              ×
            </button>
          </div>
        </div>
      )}
      
      <p className="text-xs text-slate-400">
        {mediaType === 'video' 
          ? 'Supports MP4, MOV, WebM (max 20MB, max 30 seconds)' 
          : mediaType === 'image'
          ? 'Supports JPEG, PNG, WebP, GIF (max 5MB)'
          : 'Supports images (JPEG, PNG, WebP, GIF up to 5MB) and videos (MP4, MOV, WebM up to 20MB, max 30s)'}
      </p>
    </div>
  );
}
