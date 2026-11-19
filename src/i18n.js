// English and French for the web UI.
// English is the source: t('Save') returns the French from src/i18n/fr/*.json
// when the UI is in French, the English otherwise. {name} placeholders are
// filled from vars. tools/l10n-check.py fails when a string has no French.
//
// Language: 'system' follows the browser (and so the Mac), or 'en' / 'fr'
// from Settings → General. Saved per browser; changing it reloads the page.

const KEY = 'language'
const fr = Object.assign({}, ...Object.values(import.meta.glob('./i18n/fr/*.json', { eager: true, import: 'default' })))

export function getLanguagePref() {
  try { return localStorage.getItem(KEY) || 'system' } catch { return 'system' }
}

function resolve(pref) {
  if (pref === 'en' || pref === 'fr') return pref
  const list = navigator.languages?.length ? navigator.languages : [navigator.language || 'en']
  return list.find(l => /^(en|fr)\b/i.test(l))?.slice(0, 2).toLowerCase() || 'en'
}

const current = resolve(getLanguagePref())
if (typeof document !== 'undefined') document.documentElement.lang = current

export function lang() { return current }

export function setLanguage(value) {
  try { value === 'system' ? localStorage.removeItem(KEY) : localStorage.setItem(KEY, value) } catch {}
  if (resolve(value) !== current) window.location.reload()
}

const fill = (s, vars) => vars ? s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : s

// t('Saved {count} files', { count: 3 })
export function t(english, vars) {
  return fill(current === 'fr' ? (fr[english] ?? english) : english, vars)
}

// tn(n, '{n} service', '{n} services'): French uses the singular for 0 and 1
export function tn(n, one, other, vars) {
  const singular = current === 'fr' ? Math.abs(n) < 2 : n === 1
  return t(singular ? one : other, { n, ...vars })
}
