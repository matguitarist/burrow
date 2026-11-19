import { Home, Server, HardDrive, Tv, Gamepad2, Newspaper, Activity } from 'lucide-react'
import { t } from './i18n.js'

// ── Tabs and Home widgets ─────────────────────────────────────────────────────
// Order, visibility and Home widgets are saved in settings.layout (server-side,
// so every device shows the same layout).

export const TABS = [
  { id: 'home',     label: t('Home'),     Icon: Home },
  { id: 'servers',  label: t('Servers'),  Icon: Server },
  { id: 'storage',  label: t('Storage'),  Icon: HardDrive },
  { id: 'media',    label: t('Media'),    Icon: Tv },
  { id: 'games',    label: t('Games'),    Icon: Gamepad2 },
  { id: 'news',     label: t('News'),     Icon: Newspaper },
  { id: 'services', label: t('Services'), Icon: Activity },
]

export const WIDGETS = [
  { id: 'health',      label: t('Service health') },
  { id: 'machines',    label: t('Machines') },
  { id: 'nowplaying',  label: t('Now playing') },
  { id: 'downloads',   label: t('Downloads') },
  { id: 'upcoming',    label: t('Upcoming (agenda + releases)') },
  { id: 'requests',    label: t('Seerr requests') },
  { id: 'recent',      label: t('Recently added (Plex)') },
  { id: 'ondeck',      label: t('Continue watching (Plex)') },
  { id: 'watchstats',  label: t('Watch stats (Tautulli)') },
  { id: 'deals',       label: t('Games on sale') },
  { id: 'incidents',   label: t('Recent incidents') },
  { id: 'news',        label: t('News') },
]

export const DEFAULT_HOME = ['health', 'nowplaying', 'downloads', 'upcoming']

// Tabs in saved order (unknown ids dropped, new tabs appended), with visibility
export function orderedTabs(layout = {}) {
  const order = [...(layout.order || []).filter(id => TABS.some(t => t.id === id))]
  for (const t of TABS) if (!order.includes(t.id)) order.push(t.id)
  const hidden = new Set(layout.hidden || [])
  return order.map(id => ({ ...TABS.find(t => t.id === id), hidden: hidden.has(id) }))
}

// Home widgets in order; the defaults until you pick your own
export function homeWidgets(layout = {}) {
  const ids = (layout.home || []).filter(id => WIDGETS.some(w => w.id === id))
  return ids.length ? ids : DEFAULT_HOME
}
