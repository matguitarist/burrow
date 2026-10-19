import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { Client as SshClient } from 'ssh2'
import { readJSON, writeJSON } from './lib.js'

// ── SSH to your devices ──────────────────────────────────────────────────────
// Auth: the auto-detected key in ~/.ssh first. If a device doesn't accept it,
// the UI asks for a password once; it's kept in data/ssh-passwords.json (same
// trust model as the service credentials in data/services.json) and cleared
// automatically the moment it stops working.

export function findSshKey() {
  for (const name of ['id_ed25519', 'id_rsa', 'id_ecdsa']) {
    const p = join(homedir(), '.ssh', name)
    if (existsSync(p)) {
      try { return readFileSync(p) } catch {}
    }
  }
  return null
}

const passwords = readJSON('ssh-passwords.json', {})
const savePasswords = () => writeJSON('ssh-passwords.json', passwords)

export function savedPassword(deviceId) { return passwords[deviceId] }

export function savePassword(deviceId, password) {
  passwords[deviceId] = password
  savePasswords()
}

function forgetPassword(deviceId) {
  if (passwords[deviceId]) { delete passwords[deviceId]; savePasswords() }
}

// Run one command on a device. Resolves to { code, stdout, stderr } or
// { authRequired: true } when neither the key nor a saved password works.
// `password` overrides the saved one (used to verify a newly entered password).
// `binary`: stdout comes back as a Buffer (e.g. a tar archive).
// `input`: Buffer/string written to the command's stdin (e.g. a restore).
export function sshExec(device, command, { password, timeout = 30_000, binary = false, input } = {}) {
  const pass = password ?? passwords[device.id]
  return new Promise(resolve => {
    const conn = new SshClient()
    let settled = false
    const finish = result => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      try { conn.end() } catch {}
      resolve(result)
    }
    const timer = setTimeout(() => finish({ code: -1, stdout: '', stderr: 'Timed out' }), timeout)

    conn.on('ready', () => {
      conn.exec(command, (err, stream) => {
        if (err) return finish({ code: -1, stdout: '', stderr: err.message })
        const out = []
        let stderr = ''
        stream.on('data', d => out.push(d))
        stream.stderr.on('data', d => { stderr += d.toString('utf8') })
        stream.on('close', code => {
          const buf = Buffer.concat(out)
          finish({ code: code ?? 0, stdout: binary ? buf : buf.toString('utf8'), stderr })
        })
        if (input != null) stream.end(input)
      })
    })
    conn.on('error', err => {
      if (err?.level === 'client-authentication') {
        if (!password) forgetPassword(device.id)  // a saved password stopped working
        return finish({ authRequired: true })
      }
      finish({ code: -1, stdout: '', stderr: err.message })
    })

    const key = !pass && findSshKey()
    conn.connect({
      host:         device.ip,
      port:         device.sshPort || 22,
      username:     device.sshUser || 'root',
      readyTimeout: 8_000,
      ...(pass ? { password: pass } : key ? { privateKey: key } : {}),
    })
  })
}
