// Browser smoke checks: real routes without auth bypass, then synthetic responsive fixtures.
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const assert = require('node:assert/strict')
const { spawn } = require('node:child_process')
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function main() {
  const root = path.resolve(__dirname, '..')
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'user-ui-'))
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
    ws.onmessage = ({ data }) => {
      const message = JSON.parse(data)
      const request = pending.get(message.id)
      if (request) { pending.delete(message.id); if (message.error) request.reject(message.error); else request.resolve(message.result) }
    }
    const send = (method, params = {}) => new Promise((resolve, reject) => {
      pending.set(++id, { resolve, reject })
      ws.send(JSON.stringify({ id, method, params }))
    })
    const evaluate = async (expression) => {
      const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
      if (result.exceptionDetails) throw Error(JSON.stringify(result.exceptionDetails))
      return result.result.value
    }
    await send('Page.enable')
    await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true })
    for (const page of ['messaging', 'notifications', 'blogs', 'events', 'announcements', 'forums']) {
      await send('Page.navigate', { url: `${process.env.TEST_BASE_URL || 'http://localhost:3000'}/user/${page}` })
      await delay(3500)
      console.log('Live route:', page, await evaluate('({url:location.href,title:document.querySelector("h1")?.textContent,overflow:document.documentElement.scrollWidth>innerWidth})'))
    }
    const globalPath = path.join(root, 'src/app/globals.css')
    const result = await require('postcss')([require('@tailwindcss/postcss')({ base: root })]).process(fs.readFileSync(globalPath, 'utf8'), { from: globalPath })
    const css = result.css + fs.readFileSync(path.join(root, 'src/app/user/user-sections.css'), 'utf8')
    const html = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><main class="usr-section-page usr-stories min-h-screen"><div class="usr-section-container mx-auto max-w-6xl px-3"><header class="usr-section-heading usr-card usr-enter"><a href="#" class="usr-section-back">← Community dashboard</a><div class="usr-section-heading-row"><div class="min-w-0 flex-1"><p class="usr-section-eyebrow">Through a local lens</p><h1 class="usr-section-title">Community stories <span class="usr-wave">✍️</span></h1><p class="usr-section-description">Discover hidden gems, local favorites, and stories worth sharing from around Daet.</p></div><div class="usr-section-heading-actions"><button class="usr-section-primary">Write a story</button></div></div></header><div class="usr-content-grid">${[1, 2, 3].map((n) => `<article class="usr-card usr-content-card p-5"><h2>Community story ${n}</h2><p>${'LongUnbrokenCommunityName'.repeat(8)}</p><button class="usr-section-secondary">Read story</button></article>`).join('')}</div></div></main>`
    const fixture = path.join(temp, 'sections.html')
    fs.writeFileSync(fixture, html)
    await send('Page.navigate', { url: require('node:url').pathToFileURL(fixture).href })
    await delay(500)
    for (const width of [320, 390, 768, 1024, 1440]) {
      await send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: false })
      await delay(100)
      const metrics = await evaluate(`({overflow:document.documentElement.scrollWidth>innerWidth,columns:getComputedStyle(document.querySelector('.usr-content-grid')).gridTemplateColumns.split(' ').length,touchHeight:document.querySelector('.usr-section-primary').getBoundingClientRect().height})`)
      assert.equal(metrics.overflow, false, `No overflow at ${width}`)
      assert.equal(metrics.columns, width < 768 ? 1 : 2)
      assert.ok(metrics.touchHeight >= 44)
      console.log('Synthetic layout:', width, metrics)
    }
    await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] })
    assert.ok(Number.parseFloat(await evaluate(`getComputedStyle(document.querySelector('.usr-wave')).animationDuration`)) < .001)
    console.log('Responsive fixtures and reduced-motion check passed. Live authenticated content requires a test account.')
  } finally { ws?.close(); browser.kill() }
}
main().catch((error) => { console.error(error); process.exitCode = 1 })
