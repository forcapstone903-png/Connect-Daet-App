import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { validateFaqPayload } from './faqValidation.mjs'

test('FAQ validation trims text and accepts published or draft entries', () => {
  assert.deepEqual(validateFaqPayload({
    question: '  Where can I get directions?  ',
    answer: '  Open a place and choose Get directions.  ',
    sort_order: 20,
    is_published: false,
  }), {
    ok: true,
    value: {
      question: 'Where can I get directions?',
      answer: 'Open a place and choose Get directions.',
      sort_order: 20,
      is_published: false,
    },
  })
})

test('FAQ validation rejects empty, overlong, and invalid-order content', () => {
  const valid = { question: 'Question', answer: 'Answer', sort_order: 0, is_published: true }
  assert.equal(validateFaqPayload({ ...valid, question: '  ' }).ok, false)
  assert.equal(validateFaqPayload({ ...valid, question: 'q'.repeat(241) }).ok, false)
  assert.equal(validateFaqPayload({ ...valid, answer: 'a'.repeat(5001) }).ok, false)
  assert.equal(validateFaqPayload({ ...valid, sort_order: 1.5 }).ok, false)
  assert.equal(validateFaqPayload({ ...valid, is_published: 'true' }).ok, false)
})

test('FAQ migration seeds public content and denies direct client-table access', () => {
  const sql = readFileSync(new URL('../../supabase/migrations/111_staff_managed_faqs.sql', import.meta.url), 'utf8')
  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.info_faqs/)
  assert.match(sql, /ALTER TABLE public\.info_faqs ENABLE ROW LEVEL SECURITY/)
  assert.match(sql, /REVOKE ALL ON TABLE public\.info_faqs FROM anon, authenticated/)
  assert.match(sql, /GRANT ALL ON TABLE public\.info_faqs TO service_role/)
  assert.match(sql, /ON CONFLICT DO NOTHING/)
  assert.match(sql, /What should I do in an emergency\?/)
})
