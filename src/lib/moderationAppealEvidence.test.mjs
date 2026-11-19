import assert from 'node:assert/strict'
import test from 'node:test'
import { signModerationAppealEvidence } from './moderationAppealEvidence.mjs'

test('appeal evidence is batch-signed without exposing private storage paths', async () => {
  const calls = []
  const client = {
    storage: {
      from(bucket) {
        assert.equal(bucket, 'moderation-appeal-evidence')
        return {
          async createSignedUrls(paths, expiresIn) {
            calls.push({ paths, expiresIn })
            return {
              data: paths.map((path) => ({
                path,
                signedUrl: `https://storage.example/signed/${encodeURIComponent(path)}`,
                error: null,
              })),
              error: null,
            }
          },
        }
      },
    },
  }
  const appeals = [
    { id: 'appeal-1', evidence_paths: ['user-1/appeal-1/file-a.jpg', 'user-1/appeal-1/file-b.png'] },
    { id: 'appeal-2', evidence_paths: ['user-2/appeal-2/file-c.mp4'] },
  ]

  const result = await signModerationAppealEvidence(client, appeals)

  assert.equal(calls.length, 1)
  assert.equal(calls[0].expiresIn, 600)
  assert.equal(calls[0].paths.length, 3)
  assert.equal(result[0].evidence[0].name, 'file-a.jpg')
  assert.match(result[1].evidence[0].url, /file-c/)
  assert.equal(Object.hasOwn(result[0], 'evidence_paths'), false)
})

test('appeal evidence signing is limited to the supported file count', async () => {
  let signedPaths = []
  const client = {
    storage: {
      from() {
        return {
          async createSignedUrls(paths) {
            signedPaths = paths
            return { data: paths.map((path) => ({ path, signedUrl: `https://storage.example/${path}`, error: null })), error: null }
          },
        }
      },
    },
  }

  const result = await signModerationAppealEvidence(client, [{
    evidence_paths: ['a/1/1.png', 'a/1/2.png', 'a/1/3.png', 'a/1/4.png'],
  }])

  assert.equal(signedPaths.length, 3)
  assert.equal(result[0].evidence.length, 3)
})
