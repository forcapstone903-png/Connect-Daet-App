export function validateFaqPayload(body) {
  const question = typeof body?.question === 'string' ? body.question.trim() : ''
  const answer = typeof body?.answer === 'string' ? body.answer.trim() : ''
  const sortOrder = body?.sort_order
  const isPublished = body?.is_published

  if (!question || question.length > 240) {
    return { ok: false, message: 'Questions must be 1 to 240 characters.' }
  }
  if (!answer || answer.length > 5000) {
    return { ok: false, message: 'Answers must be 1 to 5,000 characters.' }
  }
  if (!Number.isInteger(sortOrder) || sortOrder < 0 || sortOrder > 1000000) {
    return { ok: false, message: 'Display order must be a whole number from 0 to 1,000,000.' }
  }
  if (typeof isPublished !== 'boolean') {
    return { ok: false, message: 'Choose whether this FAQ is published.' }
  }

  return {
    ok: true,
    value: {
      question,
      answer,
      sort_order: sortOrder,
      is_published: isPublished,
    },
  }
}
