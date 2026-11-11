const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const repoRoot = path.resolve(__dirname, '../..')
const adminApiRoot = path.join(
  repoRoot,
  'src',
  'app',
  '(subsystems)',
  'info',
  'api',
  'admin'
)

let getAdminAuthorizationStatus

test('authorization policy distinguishes anonymous, regular, and administrator sessions', async () => {
  const policy = await import('./adminRolePolicy.mjs')
  getAdminAuthorizationStatus = policy.getAdminAuthorizationStatus

  assert.equal(getAdminAuthorizationStatus(null), 401)
  assert.equal(getAdminAuthorizationStatus({ role: 'admin' }), 401)
  assert.equal(getAdminAuthorizationStatus({ user_id: 'user-1', role: 'tourist' }), 403)
  assert.equal(getAdminAuthorizationStatus({ user_id: 'user-2', role: 'moderator' }), 403)
  assert.equal(getAdminAuthorizationStatus({ user_id: 'admin-1', role: 'admin' }), null)
  assert.equal(getAdminAuthorizationStatus({ user_id: 'admin-2', role: ' Administrator ' }), null)
})

test('every administrator API handler authorizes before parsing input or accessing data', () => {
  const routeFiles = []
  function collectRoutes(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const filePath = path.join(directory, entry.name)
      if (entry.isDirectory()) collectRoutes(filePath)
      else if (entry.name === 'route.js') routeFiles.push(filePath)
    }
  }
  collectRoutes(adminApiRoot)

  assert.ok(routeFiles.length > 0, 'expected administrator API route files')
  let handlerCount = 0
  for (const filePath of routeFiles) {
    const source = fs.readFileSync(filePath, 'utf8')
    const handlers = [...source.matchAll(
      /export\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s*\(|export\s+(?:const|let)\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s*=/g
    )]
    assert.ok(handlers.length > 0, `${filePath} exports no HTTP handlers`)

    for (let index = 0; index < handlers.length; index += 1) {
      handlerCount += 1
      const start = handlers[index].index
      const end = handlers[index + 1]?.index ?? source.length
      const body = source.slice(start, end)
      const guardIndex = body.indexOf('authorizeAdminApi(request)')
      const method = handlers[index][1] || handlers[index][2]
      assert.notEqual(guardIndex, -1, `${filePath} ${method} must use the shared admin guard`)
      assert.match(
        body.slice(guardIndex, guardIndex + 300),
        /if\s*\(\s*(?:authError|authorization\.response)\s*\)\s*return\s+(?:authError|authorization\.response)/,
        `${filePath} ${method} must return the guard response`
      )

      const protectedOperation = body.search(
        /request\.(?:json|formData|text)\s*\(|(?:getAdminClient|createClient)\s*\(|(?:adminSupabase|client)\s*\.\s*(?:from|rpc)\s*\(/
      )
      assert.ok(
        protectedOperation === -1 || guardIndex < protectedOperation,
        `${filePath} ${method} accesses input or data before authorization`
      )
    }
  }
  assert.ok(handlerCount > 0, 'expected administrator HTTP handlers')
})