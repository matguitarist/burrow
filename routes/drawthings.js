import { writeFileSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, join } from 'node:path'
import { uid, readJSON, IMAGES_DIR } from './lib.js'
import { getService, serviceBase } from './services.js'


// Draw Things has no API to list installed LoRAs, but the app itself tracks what
// you've downloaded in this file inside its own sandboxed container — same machine,
// so we can just read it.
const LORAS_CONFIG_PATH = join(homedir(), 'Library/Containers/com.liuliu.draw-things/Data/Documents/Models/custom_lora.json')

// Draw Things' API only binds to loopback, so when it runs on the same Mac as the
// dashboard its service entry sets the server URL override to http://127.0.0.1:<port>
// (the LAN address is only needed for browser-facing links).
function drawThingsBase() {
  return serviceBase(getService('drawthings')) || 'http://127.0.0.1:7860'
}

// Live status for the Settings panel — whether Draw Things is reachable, which
// checkpoint it's currently using, and which LoRAs are available to pick from.
export async function getDrawThingsStatus() {
  let online = false, model = null
  try {
    const res = await fetch(`${drawThingsBase()}/`, { signal: AbortSignal.timeout(3000) })
    if (res.ok) { online = true; model = (await res.json()).model || null }
  } catch {}

  let loras = []
  try {
    loras = JSON.parse(readFileSync(LORAS_CONFIG_PATH, 'utf8'))
      .map(l => ({ name: l.name, file: l.file }))
  } catch {}

  return { online, model, loras }
}

// Generates an image via Draw Things' built-in HTTP API (Automatic1111-compatible
// /sdapi/v1/txt2img). Width/height/steps/model are intentionally omitted from the
// request so it uses whatever the user currently has configured in the app. A LoRA
// is applied on top if one is enabled in Settings → Draw Things.
export async function generateImage(prompt, negativePrompt = '') {
  const body = { prompt, negative_prompt: negativePrompt, seed: -1 }

  const loraSettings = readJSON('drawthings-settings.json', {})
  if (loraSettings.loraEnabled && loraSettings.loraFile) {
    body.loras = [{ file: loraSettings.loraFile, weight: loraSettings.loraWeight ?? 1.0 }]
  }

  const res = await fetch(`${drawThingsBase()}/sdapi/v1/txt2img`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
    signal:  AbortSignal.timeout(180_000),  // LoRAs add real overhead on top of base generation time
  })
  if (!res.ok) throw new Error(`Draw Things returned HTTP ${res.status}`)
  const data = await res.json()
  const b64  = data.images?.[0]
  if (!b64) throw new Error('Draw Things returned no image')

  const filename = `${uid()}.png`
  writeFileSync(`${IMAGES_DIR}/${filename}`, Buffer.from(b64, 'base64'))
  return `/api/images/${filename}`
}

// Reads a previously generated image back off disk as a data: URL, so it can be
// re-embedded in a follow-up chat request (vision input) when the user asks about
// an image from earlier in the conversation. basename() guards against a crafted
// `url` walking outside the images dir.
export function imageDataUrl(url) {
  const filename = basename(url)
  const buf = readFileSync(`${IMAGES_DIR}/${filename}`)
  return `data:image/png;base64,${buf.toString('base64')}`
}
