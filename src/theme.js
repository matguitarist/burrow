// Appearance: 'system' follows macOS light/dark, 'light' and 'dark' force one.
// Saved per browser; index.html applies it before first paint (no flash).
const KEY = 'appearance'

export function getAppearance() {
  try { return localStorage.getItem(KEY) || 'system' } catch { return 'system' }
}

export function setAppearance(value) {
  try { value === 'system' ? localStorage.removeItem(KEY) : localStorage.setItem(KEY, value) } catch {}
  applyAppearance(value)
}

export function applyAppearance(value = getAppearance()) {
  const root = document.documentElement
  if (value === 'light' || value === 'dark') root.dataset.theme = value
  else delete root.dataset.theme
}
