// ── Sign-in handling for every API call ──────────────────────────────────────
// Wraps window.fetch: when the server answers 401 { error: 'login-required' },
// ask the sign-in dialog (LoginModal) and retry the request once signed in.
// Components keep calling fetch as usual.

let pending = null   // shared promise while the dialog is open

function requestLogin() {
  pending ??= new Promise(resolve => {
    window.dispatchEvent(new CustomEvent('burrow:login', { detail: { resolve } }))
  }).finally(() => { pending = null })
  return pending   // resolves true when signed in, false if cancelled
}

export function installAuthFetch() {
  const original = window.fetch.bind(window)
  window.fetch = async (input, init) => {
    const res = await original(input, init)
    if (res.status !== 401 || !String(input?.url ?? input).includes('/api/')) return res
    const body = await res.clone().json().catch(() => null)
    if (body?.error !== 'login-required') return res
    return (await requestLogin()) ? original(input, init) : res
  }
}
