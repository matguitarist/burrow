import { ymd, getSettings } from './lib.js'

// ── Public holiday calendars ─────────────────────────────────────────────────
// Picked in Settings → General → Region (region.holidays). Empty = no holidays.

function easterDate(y) {
  const a = y%19, b = Math.floor(y/100), c = y%100
  const d = Math.floor(b/4), e = b%4, f = Math.floor((b+8)/25)
  const g = Math.floor((b-f+1)/3), h = (19*a+b-d-g+15)%30
  const i = Math.floor(c/4), k = c%4, l = (32+2*e+2*i-h-k)%7
  const m = Math.floor((a+11*h+22*l)/451)
  const mo = Math.floor((h+l-7*m+114)/31)
  const dy = ((h+l-7*m+114)%31)+1
  return new Date(y, mo-1, dy)
}
const shift = (d, days) => { const r = new Date(d); r.setDate(r.getDate()+days); return r }

// nth (1-based) weekday of a month; weekday 0 = Sunday
function nthWeekday(y, month, weekday, nth) {
  const d = new Date(y, month, 1)
  while (d.getDay() !== weekday) d.setDate(d.getDate()+1)
  d.setDate(d.getDate() + 7*(nth-1))
  return d
}
function lastWeekday(y, month, weekday) {
  const d = new Date(y, month+1, 0)
  while (d.getDay() !== weekday) d.setDate(d.getDate()-1)
  return d
}
// Monday preceding May 25 — Victoria Day / Journée nationale des patriotes
function mondayBeforeMay25(y) {
  const d = new Date(y, 4, 24)
  while (d.getDay() !== 1) d.setDate(d.getDate()-1)
  return d
}

const CALENDARS = {
  'ca-qc': { name: 'Québec (Canada)', flag: '🍁', days: y => {
    const e = easterDate(y)
    return [
      ['jan1', "Jour de l'An",       new Date(y,0,1)],
      ['gfri', 'Vendredi saint',      shift(e,-2)],
      ['emon', 'Lundi de Pâques',     shift(e,1)],
      ['pat',  'Fête des Patriotes',  mondayBeforeMay25(y)],
      ['sjb',  'Saint-Jean-Baptiste', new Date(y,5,24)],
      ['can',  'Fête du Canada',      new Date(y,6,1)],
      ['lab',  'Fête du travail',     nthWeekday(y,8,1,1)],
      ['thx',  'Action de grâce',     nthWeekday(y,9,1,2)],
      ['xmas', 'Noël',                new Date(y,11,25)],
      ['box',  'Lendemain de Noël',   new Date(y,11,26)],
    ]
  } },
  'ca': { name: 'Canada', flag: '🍁', days: y => {
    const e = easterDate(y)
    return [
      ['jan1', "New Year's Day",  new Date(y,0,1)],
      ['gfri', 'Good Friday',     shift(e,-2)],
      ['vic',  'Victoria Day',    mondayBeforeMay25(y)],
      ['can',  'Canada Day',      new Date(y,6,1)],
      ['lab',  'Labour Day',      nthWeekday(y,8,1,1)],
      ['ntdr', 'National Day for Truth and Reconciliation', new Date(y,8,30)],
      ['thx',  'Thanksgiving',    nthWeekday(y,9,1,2)],
      ['rem',  'Remembrance Day', new Date(y,10,11)],
      ['xmas', 'Christmas Day',   new Date(y,11,25)],
      ['box',  'Boxing Day',      new Date(y,11,26)],
    ]
  } },
  'us': { name: 'United States', flag: '🇺🇸', days: y => [
    ['jan1', "New Year's Day",             new Date(y,0,1)],
    ['mlk',  'Martin Luther King Jr. Day', nthWeekday(y,0,1,3)],
    ['pres', "Presidents' Day",            nthWeekday(y,1,1,3)],
    ['mem',  'Memorial Day',               lastWeekday(y,4,1)],
    ['jun',  'Juneteenth',                 new Date(y,5,19)],
    ['ind',  'Independence Day',           new Date(y,6,4)],
    ['lab',  'Labor Day',                  nthWeekday(y,8,1,1)],
    ['col',  'Columbus Day',               nthWeekday(y,9,1,2)],
    ['vet',  'Veterans Day',               new Date(y,10,11)],
    ['thx',  'Thanksgiving',               nthWeekday(y,10,4,4)],
    ['xmas', 'Christmas Day',              new Date(y,11,25)],
  ] },
  'uk': { name: 'United Kingdom (England & Wales)', flag: '🇬🇧', days: y => {
    const e = easterDate(y)
    return [
      ['jan1', "New Year's Day",      new Date(y,0,1)],
      ['gfri', 'Good Friday',         shift(e,-2)],
      ['emon', 'Easter Monday',       shift(e,1)],
      ['may',  'Early May Bank Holiday', nthWeekday(y,4,1,1)],
      ['spr',  'Spring Bank Holiday', lastWeekday(y,4,1)],
      ['sum',  'Summer Bank Holiday', lastWeekday(y,7,1)],
      ['xmas', 'Christmas Day',       new Date(y,11,25)],
      ['box',  'Boxing Day',          new Date(y,11,26)],
    ]
  } },
  'fr': { name: 'France', flag: '🇫🇷', days: y => {
    const e = easterDate(y)
    return [
      ['jan1', "Jour de l'An",      new Date(y,0,1)],
      ['emon', 'Lundi de Pâques',   shift(e,1)],
      ['may1', 'Fête du Travail',   new Date(y,4,1)],
      ['may8', 'Victoire 1945',     new Date(y,4,8)],
      ['asc',  'Ascension',         shift(e,39)],
      ['pent', 'Lundi de Pentecôte', shift(e,50)],
      ['jul14','Fête nationale',    new Date(y,6,14)],
      ['aug15','Assomption',        new Date(y,7,15)],
      ['nov1', 'Toussaint',         new Date(y,10,1)],
      ['nov11','Armistice',         new Date(y,10,11)],
      ['xmas', 'Noël',              new Date(y,11,25)],
    ]
  } },
}

export const HOLIDAY_CALENDARS = Object.entries(CALENDARS).map(([id, c]) => ({ id, name: c.name }))

// Holidays for the configured calendar across `years` years starting at `from`
export function holidays(from, years = 1) {
  const cal = CALENDARS[getSettings().region.holidays]
  if (!cal) return []
  const out = []
  for (let y = from; y < from + years; y++) {
    for (const [key, title, date] of cal.days(y)) {
      out.push({ id: `h-${y}-${key}`, title, date: ymd(date), type: 'holiday', flag: cal.flag })
    }
  }
  return out
}
