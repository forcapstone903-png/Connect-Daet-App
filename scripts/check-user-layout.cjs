// Headless Edge smoke/layout checks. No credentials or authentication bypass.
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const assert = require('node:assert/strict')
const { spawn } = require('node:child_process')
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function main() {
  const root = path.resolve(__dirname, '..')
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'user-layout-'))
  const browser = spawn(process.env.EDGE_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', ['--headless', '--no-first-run', '--remote-debugging-port=0', `--user-data-dir=${temp}/profile`, 'about:blank'], { stdio: 'ignore' })
  let ws
  try {
    const portFile = path.join(temp, 'profile/DevToolsActivePort')
    for (let i = 0; i < 100 && !fs.existsSync(portFile); i++) await delay(100)
    const port = fs.readFileSync(portFile, 'utf8').split('\n')[0]
    const tabs = await (await fetch(`http://localhost:${port}/json/list`)).json()
    ws = new WebSocket(tabs.find((tab) => tab.type === 'page').webSocketDebuggerUrl)
    await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject })
    let id = 0
    const pending = new Map()
    let errors = []
    ws.onmessage = ({ data }) => {
      const message = JSON.parse(data)
      const request = pending.get(message.id)
      if (request) {
        pending.delete(message.id)
        clearTimeout(request.timer)
        if (message.error) request.reject(message.error)
        else request.resolve(message.result)
      }
      if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.text)
      if (message.method === 'Network.responseReceived' && message.params.response.status >= 400) errors.push(`${message.params.response.status} ${message.params.response.url}`)
    }
    const send = (method, params = {}) => new Promise((resolve, reject) => {
      const requestId = ++id
      const timer = setTimeout(() => { pending.delete(requestId); reject(Error(`Timed out: ${method}`)) }, 30000)
      pending.set(requestId, { resolve, reject, timer })
      ws.send(JSON.stringify({ id: requestId, method, params }))
    })
    const evaluate = async (expression) => {
      const response = await send('Runtime.evaluate', { expression, returnByValue: true })
      if (response.exceptionDetails) throw Error(JSON.stringify(response.exceptionDetails))
      return response.result.value
    }
    await send('Page.enable')
    await send('Runtime.enable')
    await send('Network.enable')
    for (const page of ['forums', 'messaging', 'notifications', 'blogs', 'events', 'announcements']) {
      errors = []
      await send('Page.navigate', { url: `${process.env.BASE_URL || 'http://localhost:3000'}/user/${page}` })
      await delay(4500)
      console.log('Route smoke:', JSON.stringify({ page, ...await evaluate('({url:location.href,title:document.title,heading:document.querySelector("h1")?.textContent})'), errors }))
    }
    const cssPath = path.join(root, 'src/app/globals.css')
    const compiled = await require('postcss')([require('@tailwindcss/postcss')({ base: root })]).process(fs.readFileSync(cssPath, 'utf8'), { from: cssPath })
    const css = compiled.css + fs.readFileSync(path.join(root, 'src/app/user/user-sections.css'), 'utf8')
    const header = '<header class="usr-section-heading usr-card"><a class="usr-section-back">← Community dashboard</a><div class="usr-section-heading-row"><div class="min-w-0 flex-1"><p class="usr-section-eyebrow">Your community</p><h1 class="usr-section-title">Community stories <span class="usr-wave">✍️</span></h1><p class="usr-section-description">Discover local favorites and stories worth sharing from around Daet.</p></div><div class="usr-section-heading-actions"><button class="usr-section-secondary">Archived</button><button class="usr-section-primary">Start a discussion</button></div></div></header>'
    const card = '<article class="usr-content-card rounded-2xl border bg-white p-5"><h2>A community story</h2><p>' + 'LongUnbrokenTitle'.repeat(15) + '</p></article>'
    await send('Page.navigate', { url: 'about:blank' })
    const frame = await send('Page.getFrameTree')
    await send('Page.setDocumentContent', { frameId: frame.frameTree.frame.id, html: `<!doctype html><meta name="viewport" content="width=device-width"><style>${css}</style><main class="usr-section-page"><div class="usr-section-container mx-auto max-w-6xl px-3">${header}<div class="usr-content-grid">${card}${card}</div></div></main>` })
    for (const width of [320, 390, 768, 1024, 1440]) {
      await send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: false })
      await delay(150)
      const metrics = await evaluate(`({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,columns:getComputedStyle(document.querySelector('.usr-content-grid')).gridTemplateColumns.split(' ').length,buttonHeight:document.querySelector('.usr-section-primary').getBoundingClientRect().height})`)
      assert.ok(metrics.scrollWidth <= width, `Overflow at ${width}: ${JSON.stringify(metrics)}`)
      assert.equal(metrics.columns, width < 768 ? 1 : 2)
      assert.ok(metrics.buttonHeight >= 44)
      console.log('Synthetic layout:', JSON.stringify(metrics))
    }
    await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] })
    assert.ok(parseFloat(await evaluate('getComputedStyle(document.querySelector(".usr-wave")).animationDuration')) < 0.001)
    console.log('Synthetic responsive and reduced-motion checks passed; authenticated interactions remain unverified.')
  } finally {
    if (ws) ws.close()
    browser.kill()
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1 })
