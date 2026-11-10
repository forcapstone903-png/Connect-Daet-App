const test = require('node:test')
const assert = require('node:assert/strict')
const { getPostPreview, parsePostContent, isImageAttachment } = require('./postContent')

test('post previews summarize attachment URLs without exposing the long URLs', () => {
  const content = 'A short update. Attachments: https://example.com/photo-one.jpg https://example.com/photo-two.png'

  assert.equal(getPostPreview(content), 'A short update. · 2 attachments')
})

test('post detail parsing preserves full text and attachment destinations', () => {
  const content = 'A short update.\nAttachments: https://example.com/photo.jpg'

  assert.deepEqual(parsePostContent(content), {
    text: 'A short update.',
    attachments: ['https://example.com/photo.jpg'],
  })
})

test('post previews truncate long written content', () => {
  assert.equal(getPostPreview('word '.repeat(50), 20), 'word word word word…')
})

test('attachment previews only treat image file paths as images', () => {
  assert.equal(isImageAttachment('https://example.com/photo.jpg?width=900'), true)
  assert.equal(isImageAttachment('https://example.com/document.pdf'), false)
  assert.equal(isImageAttachment('javascript:alert(1)'), false)
})
