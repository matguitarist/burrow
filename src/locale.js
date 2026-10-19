// Display locale for dates/times — set from Settings → General → Region.
// undefined lets the browser pick its own, which is the right default.
let current

export function setLocale(locale) { current = locale || undefined }
export function loc() { return current }

const cap = s => s.charAt(0).toUpperCase() + s.slice(1)

// "January"… in the active locale
export function monthName(month) {
  return cap(new Date(2000, month, 1).toLocaleDateString(current, { month: 'long' }))
}

// Single-letter weekday headers, Sunday first
export function weekdayInitials() {
  return Array.from({ length: 7 }, (_, i) =>
    cap(new Date(2000, 0, 2 + i).toLocaleDateString(current, { weekday: 'narrow' })))
}
