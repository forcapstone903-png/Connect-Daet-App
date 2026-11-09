import sanitizeHtml from 'sanitize-html'

export function sanitizeRichText(value) {
  return sanitizeHtml(String(value || ''), {
    allowedTags: [
      'p',
      'h1',
      'h2',
      'blockquote',
      'ul',
      'ol',
      'li',
      'a',
      'strong',
      'em',
      'u',
      'br',
      'figure',
      'figcaption',
      'img',
      'hr',
    ],
    allowedAttributes: {
      a: ['href', 'target', 'rel'],
      img: ['src', 'alt'],
    },
    allowedSchemes: ['http', 'https', 'mailto'],
    allowedSchemesByTag: {
      img: ['http', 'https'],
    },
    transformTags: {
      a: sanitizeHtml.simpleTransform('a', { target: '_blank', rel: 'noopener noreferrer' }),
      b: 'strong',
      i: 'em',
      div: 'p',
    },
  })
}
