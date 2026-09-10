'use client'

export default function SafeEmbed({ src, title, className = '', allowFullScreen = false }) {
  return (
    <iframe
      src={src}
      title={title}
      loading="lazy"
      allow={allowFullScreen ? 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share' : 'fullscreen'}
      referrerPolicy="strict-origin-when-cross-origin"
      sandbox="allow-scripts allow-same-origin allow-presentation"
      className={className}
      style={{ border: 0 }}
    />
  )
}
