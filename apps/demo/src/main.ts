import { afmInit, afmTrackPageView } from '@ai-frontend-monitor/sdk'

const ENDPOINT = 'http://127.0.0.1:3001/ingest'

afmInit({
  projectId: 'demo',
  env: 'production',
  token: 'afm-demo-token',
  endpoint: ENDPOINT,
  // autoTrack defaults to true → PV + FCP/LCP auto-report
})

const app = document.querySelector<HTMLDivElement>('#app')
if (!app) {
  throw new Error('#app missing')
}

app.innerHTML = `
  <main style="font-family: system-ui, sans-serif; max-width: 40rem; margin: 2rem auto; padding: 0 1rem; line-height: 1.5;">
    <h1>AFM Demo</h1>
    <p id="status">SDK afmInit() ran (projectId=demo, env=production). PV + Web Vitals auto-track is on.</p>
    <p style="color:#555;font-size:0.9rem;">
      Gateway: <code>${ENDPOINT}</code><br />
      Open Console Overview with project <code>demo</code> / env <code>production</code> after gateway+worker are up.
    </p>
    <div style="display:flex; gap:0.75rem; flex-wrap:wrap; margin-top:1rem;">
      <button id="pv" type="button">Report another PV</button>
      <button id="nav" type="button">Push hash route (auto PV)</button>
    </div>
    <pre id="log" style="margin-top:1.25rem; background:#f4f4f5; padding:0.75rem; border-radius:6px; font-size:0.8rem; white-space:pre-wrap;"></pre>
  </main>
`

const statusEl = document.querySelector<HTMLParagraphElement>('#status')!
const logEl = document.querySelector<HTMLPreElement>('#log')!

function log(line: string) {
  const stamp = new Date().toLocaleTimeString('zh-CN', { hour12: false })
  logEl.textContent = `[${stamp}] ${line}\n` + logEl.textContent
}

log('afmInit complete — waiting for auto PV / FCP / LCP')

document.querySelector('#pv')!.addEventListener('click', () => {
  void afmTrackPageView()
    .then(() => {
      log('afmTrackPageView() sent')
      statusEl.textContent = 'Manual PV sent via afmTrackPageView().'
    })
    .catch((err: unknown) => {
      log(`afmTrackPageView failed: ${String(err)}`)
      statusEl.textContent = 'Manual PV failed — is gateway on :3001?'
    })
})

document.querySelector('#nav')!.addEventListener('click', () => {
  const next = `#/demo-${Date.now().toString(36)}`
  location.hash = next
  log(`navigated to ${next} (auto PV if route changed)`)
  statusEl.textContent = `Hash route → ${next}. Auto page-view should fire.`
})

console.info(
  '[afm-demo] Open http://127.0.0.1:5174/ — SDK posts to',
  ENDPOINT,
  '(token afm-demo-token, env production)',
)
