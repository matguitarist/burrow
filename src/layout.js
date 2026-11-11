import { Home, Server, HardDrive, Tv, Gamepad2, Newspaper, Activity } from 'lucide-react'

// ── Tabs and Home widgets ─────────────────────────────────────────────────────
// Order, visibility and Home widgets are saved in settings.layout (server-side,
// so every device shows the same layout).

export const TABS = [
  { id: 'home',     label: 'Home',     Icon: Home },
  { id: 'servers',  label: 'Servers',  Icon: Server },
  { id: 'storage',  label: 'Storage',  Icon: HardDrive },
  { id: 'media',    label: 'Media',    Icon: Tv },
  { id: 'games',    label: 'Games',    Icon: Gamepad2 },
  { id: 'news',     label: 'News',     Icon: Newspaper },
  { id: 'services', label: 'Services', Icon: Activity },
]

export const WIDGETS = [
  { id: 'health',      label: 'Service health' },
  { id: 'machines',    label: 'Machines' },
  { id: 'nowplaying',  label: 'Now playing' },
  { id: 'downloads',   label: 'Downloads' },
  { id: 'upcoming',    label: 'Upcoming (agenda + releases)' },
  { id: 'requests',    label: 'Seerr requests' },
  { id: 'recent',      label: 'Recently added (Plex)' },
  { id: 'ondeck',      label: 'Continue watching (Plex)' },
  { id: 'watchstats',  label: 'Watch stats (Tautulli)' },
  { id: 'deals',       label: 'Games on sale' },
  { id: 'incidents',   label: 'Recent incidents' },
  { id: 'news',        label: 'News' },
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
