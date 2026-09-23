import Utils from '@/utils'

// Issue details (with journals) cached for the current popup session.
// The cache key includes "updated on" so an updated issue is fetched again.
const detailCache = new Map()
let nameMaps = null

// Truncate the comment preview; limit 0 (configured as "full") keeps the text
const truncate = (text, limit) => {
  if (!limit) {
    return text
  }
  return text.length > limit ? `${text.slice(0, limit)}…` : text
}

const toNameMap = list => {
  const map = {}

  for (const item of list || []) {
    map[item.value] = item.text
  }
  return map
}

export const getIssueDetail = async (options, issue) => {
  const cacheKey = `${issue.id}:${issue.updated_on || ''}`

  if (detailCache.has(cacheKey)) {
    return detailCache.get(cacheKey)
  }

  const data = await Utils.getAPI(options, `issues/${issue.id}`, { include: 'journals' })
  const result = data.issue || data

  detailCache.set(cacheKey, result)
  return result
}

// "id → name" maps for statuses and trackers, used to render readable
// change lines like "Статус: Новый → В работе". Taken from the saved
// options; for options saved before the lists were stored, fetched once.
const getNameMaps = async options => {
  if (nameMaps) {
    return nameMaps
  }
  if (options.statusList && options.trackerList) {
    nameMaps = {
      status: toNameMap(options.statusList),
      tracker: toNameMap(options.trackerList)
    }
    return nameMaps
  }

  const [statuses, trackers] = await Promise.all([
    Utils.getAPI(options, 'issue_statuses').catch(() => []),
    Utils.getAPI(options, 'trackers').catch(() => [])
  ])

  nameMaps = {
    status: toNameMap(statuses.map(it => ({ value: it.id, text: it.name }))),
    tracker: toNameMap(trackers.map(it => ({ value: it.id, text: it.name })))
  }
  return nameMaps
}

const attrLabel = (name, t) => {
  const key = `attr_${name}`
  const label = t(key)

  // vue-i18n returns the key itself when the translation is missing
  return label === key ? name : label
}

const formatValue = (name, value, maps) => {
  if (value === undefined || value === null || value === '') {
    return ''
  }

  const mapKey = { status_id: 'status', tracker_id: 'tracker' }[name]

  if (mapKey && maps[mapKey][value] !== undefined) {
    return maps[mapKey][value]
  }
  if (name === 'done_ratio') {
    return `${value}%`
  }
  return String(value)
}

// One "detail" of a journal entry as { label, value }: the label
// ("Комментарий", "Статус"…) is rendered muted in the panel, the value keeps
// the readable change ("Новая → В работе")
const describeDetail = (detail, maps, t) => {
  const { property, name, old_value: oldValue, new_value: newValue } = detail

  if (property === 'attachment') {
    return { label: t('attachment_added'), value: newValue || name }
  }
  if (property === 'relation') {
    return {
      label: t('relation_changed'),
      value: `${name} ${oldValue || ''} → ${newValue || ''}`.replace(/\s+/g, ' ').trim()
    }
  }

  const label = property === 'cf' ? `${t('custom_field')} ${name}` : attrLabel(name, t)
  const oldText = formatValue(name, oldValue, maps)
  const newText = formatValue(name, newValue, maps)

  return { label, value: oldText && newText ? `${oldText} → ${newText}` : newText || oldText }
}

// One journal entry rendered as a notification: author, time and the
// described lines. Every line is { type, label?, value?, text }: the panel
// renders "label" muted before "value", while "text" (`${label}: ${value}`)
// keeps the plain single-string form used by the hover tooltip
const journalToNotification = (journal, options, maps, t) => {
  const lines = []

  if (journal.notes) {
    const notes = String(journal.notes).replace(/\s+/g, ' ').trim()
    const limit = options.tooltip_limit ?? 200
    const label = t('comment')
    const value = truncate(notes, limit)

    lines.push({ type: 'comment', label, value, text: `${label}: ${value}` })
  }
  for (const detail of journal.details || []) {
    const { label, value } = describeDetail(detail, maps, t)

    lines.push({ type: 'attr', label, value, text: `${label}: ${value}` })
  }
  return {
    user: journal.user?.name || '',
    time: journal.created_on,
    lines
  }
}

export const describeLastChange = async (issueData, options, t) => {
  const journals = issueData.journals || []
  const journal = journals[journals.length - 1]

  if (!journal) {
    return {
      user: issueData.author?.name || '',
      time: issueData.created_on,
      lines: [{ type: 'info', text: t('issue_created') }]
    }
  }

  const maps = await getNameMaps(options)

  return journalToNotification(journal, options, maps, t)
}

// Change notifications of one issue since "sinceMs", oldest first
// (chronological, like a comment thread read top-down), capped to the
// newest options.notifications_limit (0 = all). The full count is returned
// as "total", so the row badge keeps showing the exact number of unread
// changes even when the panel shows only the newest ones. When the list is
// empty (the issue is unread but nothing matches, e.g. updated_on
// was bumped by a subtask) a single fallback notification is returned,
// so an unread issue always shows at least one.
export const getIssueNotifications = async (options, issue, sinceMs, t) => {
  const detail = await getIssueDetail(options, issue)
  const maps = await getNameMaps(options)
  const items = (detail.journals || [])
    .filter(journal => new Date(journal.created_on).getTime() > sinceMs)
    .map(journal => journalToNotification(journal, options, maps, t))

  if (items.length > 0) {
    const limit = options.notifications_limit ?? 0

    return {
      items: limit > 0 ? items.slice(Math.max(0, items.length - limit)) : items,
      total: items.length
    }
  }

  const journals = detail.journals || []

  return {
    items: [{
      user: journals[journals.length - 1]?.user?.name || detail.author?.name || '',
      time: detail.updated_on,
      lines: [{ type: 'info', text: t('issue_updated') }]
    }],
    total: 1
  }
}
