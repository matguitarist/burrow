import { getService, serviceBase } from './services.js'

// ── Push notifications through Gotify ────────────────────────────────────────
// Gotify only accepts new messages with an *application* token; the client token
// on the same service is for reading messages. Throws when it can't send, so
// callers that care (automations) can log why.
export async function notify(title, message, priority = 5) {
  const g = getService('gotify')
  const url = serviceBase(g)
  if (!url) throw new Error('Gotify is not set up (Settings → Services)')
  if (!g.appToken) throw new Error('Add an App Token to Gotify in Settings → Services to send notifications')
  const r = await fetch(`${url}/message`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', 'X-Gotify-Key': g.appToken },
    body:    JSON.stringify({ title, message, priority }),
    signal:  AbortSignal.timeout(5000),
  })
  if (r.status === 401 || r.status === 403) throw new Error('Gotify rejected the App Token')
  if (!r.ok) throw new Error(`Gotify answered HTTP ${r.status}`)
}

// For alerts nobody waits on (sales): log instead of throwing
export async function notifyQuietly(title, message, priority) {
  try { await notify(title, message, priority) }
  catch (e) { console.error(`[notify] ${title}: ${e.message}`) }
}
