// ── Service template catalog ─────────────────────────────────────────────────
// A template describes a *kind* of service (Plex, Radarr, …): its default port,
// which credentials it needs, and how to health-check it. A service *instance*
// (data/services.json) picks a template and fills in where it lives + its keys.
//
// `integration: true` means the dashboard has widgets that talk to this service's
// API (now playing, queues, chat tools…). Everything else is link + health only.
//
// Field kinds: apiKey / user / pass / extra (template-specific, e.g. steamId).

const F = {
  apiKey: (label = 'API Key', hint) => ({ key: 'apiKey', label, secret: true, hint }),
  user:   (hint) => ({ key: 'user', label: 'Username', hint }),
  pass:   (hint) => ({ key: 'pass', label: 'Password', secret: true, hint }),
}

export const CATEGORIES = ['Media', 'Downloads', 'AI', 'Monitoring', 'Infrastructure', 'Home', 'Productivity', 'Notifications', 'Accounts', 'Other']

export const SERVICE_TEMPLATES = [
  // ── Integrations (power dashboard widgets) ──────────────────────────────────
  { id: 'plex',        name: 'Plex',        category: 'Media',     color: '#e5a00d', port: 32400, webPath: '/web', integration: true,
    fields: [F.apiKey('Token', 'Plex Web → any item → Get Info → View XML → X-Plex-Token in the URL')],
    test: { path: '/identity', query: 'X-Plex-Token' } },
  { id: 'tautulli',    name: 'Tautulli',    category: 'Media',     color: '#dba32a', port: 8181, integration: true,
    fields: [F.apiKey('API Key', 'Settings → Web Interface → API Key')],
    test: { path: '/api/v2?cmd=arnold', query: 'apikey' } },
  { id: 'seerr',       name: 'Seerr',       category: 'Media',     color: '#2dd4bf', port: 5055, integration: true,
    description: 'Overseerr / Jellyseerr',
    fields: [F.apiKey('API Key', 'Settings → General → API Key')],
    test: { path: '/api/v1/settings/main', header: 'X-Api-Key' } },
  { id: 'radarr',      name: 'Radarr',      category: 'Media',     color: '#a78bfa', port: 7878, integration: true,
    fields: [F.apiKey('API Key', 'Settings → General → Security → API Key')],
    test: { path: '/api/v3/system/status', header: 'X-Api-Key' } },
  { id: 'sonarr',      name: 'Sonarr',      category: 'Media',     color: '#38bdf8', port: 8989, integration: true,
    fields: [F.apiKey('API Key', 'Settings → General → Security → API Key')],
    test: { path: '/api/v3/system/status', header: 'X-Api-Key' } },
  { id: 'qbittorrent', name: 'qBittorrent', category: 'Downloads', color: '#6cb4e4', port: 8080, integration: true,
    fields: [F.user('Leave blank if Web UI auth is disabled'), F.pass()] },
  { id: 'ollama',      name: 'Ollama',      category: 'AI',        color: '#34d399', port: 11434, integration: true,
    description: 'Fallback chat backend when no OpenAI-compatible server answers',
    fields: [], test: { path: '/api/tags' } },
  { id: 'omlx',        name: 'oMLX',        category: 'AI',        color: '#10b981', port: 4040, webPath: '/admin/dashboard', apiPath: '/v1', integration: true, ai: 'openai',
    fields: [F.apiKey('API Key')], test: { path: '/v1/models', bearer: true } },
  { id: 'openai',      name: 'OpenAI-compatible', category: 'AI',  color: '#22c55e', port: 1234, apiPath: '/v1', integration: true, ai: 'openai',
    description: 'LM Studio, vLLM, llama.cpp server, LocalAI…',
    fields: [F.apiKey('API Key', 'Leave blank if the server has no auth')], test: { path: '/v1/models', bearer: true } },
  { id: 'drawthings',  name: 'Draw Things', category: 'AI',        color: '#f472b6', port: 7860, integration: true,
    description: 'Image generation for the chat assistant', fields: [] },
  { id: 'gotify',      name: 'Gotify',      category: 'Notifications', color: '#60a5fa', port: 80, integration: true,
    fields: [F.apiKey('Client Token', 'Gotify → Clients → create a client token (used to read messages)')],
    test: { path: '/current/user', header: 'X-Gotify-Key' } },
  { id: 'unraid',      name: 'Unraid',      category: 'Infrastructure', color: '#ff6b35', port: 80, integration: true,
    description: 'Falls back to the Glances port when the web UI only answers on HTTPS', fields: [] },
  { id: 'steam',       name: 'Steam',       category: 'Accounts',  color: '#66c0f4', cloud: true, integration: true,
    description: 'Imports your wishlist into the Games tab',
    fields: [
      { key: 'steamId', label: 'Steam64 ID', hint: 'Set Game Details to Public in Steam → Privacy Settings' },
      F.apiKey('Web API Key', 'steamcommunity.com/dev/apikey'),
    ] },

  // ── Popular self-hosted apps (link + health check) ──────────────────────────
  { id: 'jellyfin',     name: 'Jellyfin',      category: 'Media',     color: '#aa5cc3', port: 8096 },
  { id: 'emby',         name: 'Emby',          category: 'Media',     color: '#52b54b', port: 8096 },
  { id: 'lidarr',       name: 'Lidarr',        category: 'Media',     color: '#22c55e', port: 8686 },
  { id: 'readarr',      name: 'Readarr',       category: 'Media',     color: '#ef4444', port: 8787 },
  { id: 'bazarr',       name: 'Bazarr',        category: 'Media',     color: '#94a3b8', port: 6767 },
  { id: 'jellyseerr',   name: 'Jellyseerr',    category: 'Media',     color: '#7c3aed', port: 5055 },
  { id: 'audiobookshelf', name: 'Audiobookshelf', category: 'Media',  color: '#f59e0b', port: 13378 },
  { id: 'navidrome',    name: 'Navidrome',     category: 'Media',     color: '#3b82f6', port: 4533 },
  { id: 'kavita',       name: 'Kavita',        category: 'Media',     color: '#06b6d4', port: 5000 },
  { id: 'komga',        name: 'Komga',         category: 'Media',     color: '#005ed3', port: 25600 },
  { id: 'calibreweb',   name: 'Calibre-Web',   category: 'Media',     color: '#45b29d', port: 8083 },
  { id: 'immich',       name: 'Immich',        category: 'Media',     color: '#4250af', port: 2283 },
  { id: 'tdarr',        name: 'Tdarr',         category: 'Media',     color: '#f97316', port: 8265 },
  { id: 'prowlarr',     name: 'Prowlarr',      category: 'Downloads', color: '#f59e0b', port: 9696 },
  { id: 'jackett',      name: 'Jackett',       category: 'Downloads', color: '#c2410c', port: 9117 },
  { id: 'sabnzbd',      name: 'SABnzbd',       category: 'Downloads', color: '#facc15', port: 8080 },
  { id: 'nzbget',       name: 'NZBGet',        category: 'Downloads', color: '#16a34a', port: 6789 },
  { id: 'transmission', name: 'Transmission',  category: 'Downloads', color: '#dc2626', port: 9091, webPath: '/transmission/web/' },
  { id: 'deluge',       name: 'Deluge',        category: 'Downloads', color: '#4f86c6', port: 8112 },
  { id: 'openwebui',    name: 'Open WebUI',    category: 'AI',        color: '#e2e8f0', port: 3000 },
  { id: 'sillytavern',  name: 'SillyTavern',   category: 'AI',        color: '#c084fc', port: 8000 },
  { id: 'comfyui',      name: 'ComfyUI',       category: 'AI',        color: '#fbbf24', port: 8188 },
  { id: 'uptimekuma',   name: 'Uptime Kuma',   category: 'Monitoring', color: '#5cdd8b', port: 3001 },
  { id: 'grafana',      name: 'Grafana',       category: 'Monitoring', color: '#f46800', port: 3000 },
  { id: 'dozzle',       name: 'Dozzle',        category: 'Monitoring', color: '#4ade80', port: 8080 },
  { id: 'netdata',      name: 'Netdata',       category: 'Monitoring', color: '#00ab44', port: 19999 },
  { id: 'scrutiny',     name: 'Scrutiny',      category: 'Monitoring', color: '#5b8def', port: 8080 },
  { id: 'portainer',    name: 'Portainer',     category: 'Infrastructure', color: '#13bef9', port: 9443, https: true },
  { id: 'proxmox',      name: 'Proxmox VE',    category: 'Infrastructure', color: '#e57000', port: 8006, https: true },
  { id: 'truenas',      name: 'TrueNAS',       category: 'Infrastructure', color: '#0095d5', port: 80 },
  { id: 'synology',     name: 'Synology DSM',  category: 'Infrastructure', color: '#b5b5b6', port: 5000 },
  { id: 'pihole',       name: 'Pi-hole',       category: 'Infrastructure', color: '#96060c', port: 80, webPath: '/admin' },
  { id: 'adguard',      name: 'AdGuard Home',  category: 'Infrastructure', color: '#68bc71', port: 3000 },
  { id: 'npm',          name: 'Nginx Proxy Manager', category: 'Infrastructure', color: '#f15833', port: 81 },
  { id: 'traefik',      name: 'Traefik',       category: 'Infrastructure', color: '#24a1c1', port: 8080, webPath: '/dashboard/' },
  { id: 'syncthing',    name: 'Syncthing',     category: 'Infrastructure', color: '#0891d1', port: 8384 },
  { id: 'homeassistant', name: 'Home Assistant', category: 'Home',    color: '#41bdf5', port: 8123 },
  { id: 'homebridge',   name: 'Homebridge',    category: 'Home',      color: '#8b5cf6', port: 8581 },
  { id: 'nodered',      name: 'Node-RED',      category: 'Home',      color: '#8f0000', port: 1880 },
  { id: 'frigate',      name: 'Frigate',       category: 'Home',      color: '#3b82f6', port: 5000 },
  { id: 'nextcloud',    name: 'Nextcloud',     category: 'Productivity', color: '#0082c9', port: 80 },
  { id: 'paperless',    name: 'Paperless-ngx', category: 'Productivity', color: '#17541f', port: 8000 },
  { id: 'vaultwarden',  name: 'Vaultwarden',   category: 'Productivity', color: '#175ddc', port: 80 },
  { id: 'gitea',        name: 'Gitea',         category: 'Productivity', color: '#609926', port: 3000 },
  { id: 'codeserver',   name: 'code-server',   category: 'Productivity', color: '#007acc', port: 8443 },
  { id: 'ntfy',         name: 'ntfy',          category: 'Notifications', color: '#338574', port: 80 },

  // ── Anything else ───────────────────────────────────────────────────────────
  { id: 'custom',       name: 'Custom',        category: 'Other',     color: '#94a3b8', port: 80,
    description: 'Any web service — link + health check' },
]

export function getTemplate(id) {
  return SERVICE_TEMPLATES.find(t => t.id === id) || SERVICE_TEMPLATES.find(t => t.id === 'custom')
}
