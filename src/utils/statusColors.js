import Utils from '@/utils'

// Status badge colors. Well-known statuses get a fixed semantic color.
// Everything else — including custom statuses — gets a stable color picked
// by hashing the normalized name, so the same custom status always looks
// the same. Statuses the Redmine reports as closed (is_closed flag) are
// muted gray: even a custom "Duplicate" or "Not actual" should not look
// like it needs attention.

const KNOWN_STATUS_COLORS = {
  new: '#0d6efd',
  новая: '#0d6efd',
  новый: '#0d6efd',
  'in progress': '#6f42c1',
  'в работе': '#6f42c1',
  feedback: '#fd7e14',
  'обратная связь': '#fd7e14',
  resolved: '#198754',
  решена: '#198754',
  closed: '#6c757d',
  закрыта: '#6c757d',
  закрыт: '#6c757d',
  rejected: '#dc3545',
  отклонена: '#dc3545',
  отклонен: '#dc3545'
}

const CLOSED_STATUS_COLOR = '#6c757d'

// Dark enough for white badge text and distinct from each other and from
// the priority badge colors
const CUSTOM_STATUS_PALETTE = [
  '#0b7285',
  '#1864ab',
  '#364fc7',
  '#5f3dc4',
  '#862e9c',
  '#c2255c',
  '#a61e4d',
  '#2b8a3e',
  '#087f5b',
  '#c2410c'
]

const normalizeStatusName = name => String(name || '').trim().toLowerCase().replace(/\s+/g, ' ')

// djb2: stable across sessions, no dependency
const hashString = text => {
  let hash = 5381

  for (let i = 0; i < text.length; i++) {
    hash = hash * 33 + text.charCodeAt(i) >>> 0
  }
  return hash
}

export const statusColor = (name, isClosed = false) => {
  const key = normalizeStatusName(name)

  if (KNOWN_STATUS_COLORS[key]) {
    return KNOWN_STATUS_COLORS[key]
  }
  if (isClosed) {
    return CLOSED_STATUS_COLOR
  }
  return CUSTOM_STATUS_PALETTE[hashString(key) % CUSTOM_STATUS_PALETTE.length]
}

// Accent colors of the left tracker marker on each list row. Well-known
// trackers get a fixed semantic color (Fluent red/green/blue as in the
// design mockups), custom trackers get a stable hashed color, the same
// way custom statuses do
const KNOWN_TRACKER_COLORS = {
  bug: '#d13438',
  ошибка: '#d13438',
  defect: '#d13438',
  дефект: '#d13438',
  feature: '#107c10',
  улучшение: '#107c10',
  support: '#0078d4',
  поддержка: '#0078d4',
  task: '#797775',
  задача: '#797775'
}

export const trackerColor = name => {
  const key = normalizeStatusName(name)

  return KNOWN_TRACKER_COLORS[key] ||
    CUSTOM_STATUS_PALETTE[hashString(key) % CUSTOM_STATUS_PALETTE.length]
}

let closedStatusIdsPromise = null

// Ids of the statuses this Redmine marks as closed. The saved options
// already carry the full status list with the is_closed flags (same source
// as the popup's name maps); fetching is only the fallback for options
// saved before the list was stored. Cached once per popup session, so all
// badges share one lookup
export const getClosedStatusIds = options => {
  if (!closedStatusIdsPromise) {
    if (Array.isArray(options.statusList) && options.statusList.length) {
      closedStatusIdsPromise = Promise.resolve(new Set(options.statusList
        .filter(it => it?.isClosed)
        .map(it => it.value)))
    } else {
      closedStatusIdsPromise = Utils.getAPI(options, 'issue_statuses')
        .then(statuses => new Set((statuses || [])
          .filter(status => status.is_closed)
          .map(status => status.id)))
        .catch(error => {
          console.error('Failed to load issue statuses:', error)
          return new Set()
        })
    }
  }
  return closedStatusIdsPromise
}
