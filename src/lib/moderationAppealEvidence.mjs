const EVIDENCE_BUCKET = 'moderation-appeal-evidence'
const MAX_FILES_PER_APPEAL = 3
const SIGNED_URL_TTL_SECONDS = 600
const SIGNING_BATCH_SIZE = 100

export async function signModerationAppealEvidence(client, appeals) {
  const paths = [...new Set((appeals || []).flatMap((appeal) => (
    Array.isArray(appeal.evidence_paths)
      ? appeal.evidence_paths.slice(0, MAX_FILES_PER_APPEAL).filter((path) => typeof path === 'string' && path)
      : []
  )))]
  const signedByPath = new Map()

  for (let offset = 0; offset < paths.length; offset += SIGNING_BATCH_SIZE) {
    const batch = paths.slice(offset, offset + SIGNING_BATCH_SIZE)
    const { data, error } = await client.storage
      .from(EVIDENCE_BUCKET)
      .createSignedUrls(batch, SIGNED_URL_TTL_SECONDS)
    if (error) {
      console.error('Appeal evidence URL signing failed:', { code: error.code || null })
      batch.forEach((path) => signedByPath.set(path, null))
      continue
    }

    for (const result of data || []) {
      if (result.path) {
        if (result.error || !result.signedUrl) {
          console.error('Appeal evidence URL signing failed for an object.')
        }
        signedByPath.set(result.path, result.error ? null : result.signedUrl || null)
      }
    }
    batch.forEach((path) => {
      if (!signedByPath.has(path)) signedByPath.set(path, null)
    })
  }

  return (appeals || []).map((appeal) => {
    const { evidence_paths: evidencePaths, ...publicAppeal } = appeal
    return {
      ...publicAppeal,
      evidence: (Array.isArray(evidencePaths) ? evidencePaths : [])
        .slice(0, MAX_FILES_PER_APPEAL)
        .filter((path) => typeof path === 'string' && path)
        .map((path) => ({
          name: path.split('/').pop() || 'Evidence file',
          url: signedByPath.get(path) || null,
        })),
    }
  })
}
