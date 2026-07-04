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

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Upload failed');
      }

      const data = await response.json();

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

  const removeMedia = () => {
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
          className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-full text-sm font-medium transition-colors disabled:opacity-50 flex items-center gap-2"
        >
          {uploading ? (
            <>
              <div className="animate-spin rounded-full h-4 w-4 border-2 border-gray-600 border-t-transparent"></div>
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
        {mediaPreview && (
          <button
            type="button"
            onClick={removeMedia}
            className="px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-600 rounded-full text-sm font-medium transition-colors"
          >
            Remove
          </button>
        )}
      </div>
      
      {mediaPreview && (
        <div className="mt-2">
          <div className="relative inline-block">
            {mediaTypeDetected === 'video' ? (
              <video
                src={mediaPreview}
                className="w-40 h-32 object-cover rounded-2xl border border-gray-200 shadow-sm"
                controls
                preload="metadata"
              />
            ) : (
              <img
                src={mediaPreview}
                alt="Upload preview"
                className="w-32 h-32 object-cover rounded-2xl border border-gray-200 shadow-sm"
              />
            )}
            <button
              type="button"
              onClick={removeMedia}
              className="absolute -top-2 -right-2 bg-red-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs hover:bg-red-700"
            >
              ×
            </button>
          </div>
        </div>
      )}
      
      <p className="text-xs text-gray-400">
        {mediaType === 'video' 
          ? 'Supports MP4, MOV, WebM (max 20MB, max 30 seconds)' 
          : mediaType === 'image'
          ? 'Supports JPEG, PNG, WebP, GIF (max 5MB)'
          : 'Supports images (JPEG, PNG, WebP, GIF up to 5MB) and videos (MP4, MOV, WebM up to 20MB, max 30s)'}
      </p>
    </div>
  );
}