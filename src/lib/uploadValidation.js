// Server-side upload checks. The browser-declared MIME type is only trusted
// when the file's first bytes match that format, so a script or HTML page
// cannot be stored under an image/video type. Object names are rebuilt from a
// safe character set with an extension that matches the verified type.

const EXTENSIONS = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'video/webm': 'webm',
}

const startsWith = (bytes, signature, offset = 0) => signature.every((value, index) => bytes[offset + index] === value)
const ascii = (text) => [...text].map((character) => character.charCodeAt(0))

const SIGNATURES = {
  'image/jpeg': (b) => startsWith(b, [0xff, 0xd8, 0xff]),
  'image/png': (b) => startsWith(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  'image/gif': (b) => startsWith(b, ascii('GIF87a')) || startsWith(b, ascii('GIF89a')),
  'image/webp': (b) => startsWith(b, ascii('RIFF')) && startsWith(b, ascii('WEBP'), 8),
  'video/mp4': (b) => startsWith(b, ascii('ftyp'), 4),
  'video/quicktime': (b) => startsWith(b, ascii('ftyp'), 4) || startsWith(b, ascii('moov'), 4) || startsWith(b, ascii('wide'), 4),
  'video/webm': (b) => startsWith(b, [0x1a, 0x45, 0xdf, 0xa3]),
}

export function fileMatchesDeclaredType(buffer, declaredType) {
  const check = SIGNATURES[declaredType]
  if (!check) return false
  return check(new Uint8Array(buffer.slice(0, 16)))
}

export function safeObjectName(originalName, mimeType) {
  const extension = EXTENSIONS[mimeType] || 'bin'
  const base = String(originalName || 'file')
    .replace(/\.[^.]*$/, '')
    .normalize('NFKD')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'file'
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${base}.${extension}`
}
