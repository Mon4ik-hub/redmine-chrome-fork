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

// Same, for API lists that come as { id, name } (versions, categories, …)
const toIdNameMap = list => {
  const map = {}

  for (const item of list || []) {
    if (item && item.id !== undefined && item.name) {
      map[item.id] = item.name
    }
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

// Priorities are global; a lazy id → name map fetched once per popup session
let priorityMap = null

const getPriorityMap = async options => {
  if (!priorityMap) {
    const res = await Utils.getAPI(options, 'enumerations/issue_priorities').catch(() => {})

    priorityMap = toIdNameMap(res.issue_priorities)
  }
  return priorityMap
}

// The API reports assignee / version / category changes as raw ids. Assignees
// must be project members, so the project's memberships give their names
// (works for non-admins, unlike /users). Groups may also be assignees —
// memberships return them in the "group" node.
const fetchMemberships = async (options, projectId) => {
  const users = {}

  for (let offset = 0; offset < 500; offset += 100) {
    const res = await Utils.getAPI(options, `projects/${projectId}/memberships`, { limit: 100, offset }).catch(() => null)
    const chunk = res?.memberships || []

    for (const member of chunk) {
      const principal = member.user || member.group

      if (principal?.id !== undefined && principal.name) {
        users[principal.id] = principal.name
      }
    }
    if (chunk.length < 100) {
      break
    }
  }
  return users
}

// Per-project id → name maps, loaded once per popup session. The promise is
// cached, so concurrent issues on the same project share one request.
const projectMaps = new Map()

const getProjectMaps = (options, projectId) => {
  if (!projectMaps.has(projectId)) {
    const load = Promise.all([
      fetchMemberships(options, projectId),
      Utils.getAPI(options, `projects/${projectId}/versions`).catch(() => {}),
      Utils.getAPI(options, `projects/${projectId}/issue_categories`).catch(() => {})
    ]).then(([users, versions, categories]) => ({
      users,
      versions: toIdNameMap(versions.versions),
      categories: toIdNameMap(categories.issue_categories)
    })).catch(() => ({ users: {}, versions: {}, categories: {} }))

    projectMaps.set(projectId, load)
  }
  return projectMaps.get(projectId)
}

// Renaming a project is rare: resolve the id with a single issue-scoped fetch
const projectNameCache = new Map()

const getProjectName = (options, projectId) => {
  if (!projectNameCache.has(projectId)) {
    const load = Utils.getAPI(options, `projects/${projectId}`)
      .then(res => res.project?.name)
      .catch(() => undefined)

    projectNameCache.set(projectId, load)
  }
  return projectNameCache.get(projectId)
}

// Custom field names ("cf_12" → "Модуль") are already on the issue itself
const toCfMap = issueData => {
  const map = {}

  for (const cf of issueData.custom_fields || []) {
    if (cf?.id !== undefined && cf.name) {
      map[cf.id] = cf.name
    }
  }
  return map
}

// id → name maps for the journals of one issue: the shared status/tracker
// maps plus lazy per-context maps for the attributes Redmine reports as raw
// ids. Only the kinds actually present in the journals are fetched.
const getContextMaps = async (options, issueData, journals) => {
  const base = await getNameMaps(options)
  const maps = {
    ...base,
    users: {},
    versions: {},
    categories: {},
    projects: {},
    cf: toCfMap(issueData)
  }

  if (issueData.assigned_to?.id !== undefined) {
    maps.users[issueData.assigned_to.id] = issueData.assigned_to.name
  }
  if (issueData.author?.id !== undefined) {
    maps.users[issueData.author.id] = issueData.author.name
  }

  const attrNames = new Set()
  const projectIds = new Set()

  for (const journal of journals || []) {
    for (const detail of journal.details || []) {
      attrNames.add(detail.name)
      if (detail.name === 'project_id') {
        for (const value of [detail.old_value, detail.new_value]) {
          if (value) {
            projectIds.add(value)
          }
        }
      }
    }
  }

  const jobs = []

  if (attrNames.has('priority_id')) {
    jobs.push(getPriorityMap(options).then(map => {
      maps.priority = map
    }))
  }
  if (attrNames.has('assigned_to_id') || attrNames.has('fixed_version_id') || attrNames.has('category_id')) {
    const projectId = issueData.project?.id

    if (projectId !== undefined) {
      jobs.push(getProjectMaps(options, projectId).then(project => {
        maps.users = { ...project.users, ...maps.users }
        maps.versions = project.versions
        maps.categories = project.categories
      }))
    }
  }
  for (const id of projectIds) {
    jobs.push(getProjectName(options, id).then(name => {
      if (name) {
        maps.projects[id] = name
      }
    }))
  }

  await Promise.all(jobs)
  return maps
}

const formatValue = (name, value, maps, t) => {
  if (value === undefined || value === null || value === '') {
    return ''
  }

  if (name === 'is_private') {
    return value === 'true' || value === true ? t('yes') : t('no')
  }
  if (name === 'done_ratio') {
    return `${value}%`
  }

  const mapKey = {
    status_id: 'status',
    tracker_id: 'tracker',
    priority_id: 'priority',
    assigned_to_id: 'users',
    fixed_version_id: 'versions',
    category_id: 'categories',
    project_id: 'projects'
  }[name]

  if (mapKey && maps[mapKey]?.[value] !== undefined) {
    return maps[mapKey][value]
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

  // Old and new descriptions are full texts — far too long for a line,
  // so the change is collapsed like in the Redmine UI
  if (property === 'attr' && name === 'description') {
    return { label: attrLabel(name, t), value: t('changed') }
  }

  const label = property === 'cf' ?
    maps.cf?.[name] || `${t('custom_field')} ${name}` :
    attrLabel(name, t)
  const oldText = formatValue(name, oldValue, maps, t)
  const newText = formatValue(name, newValue, maps, t)

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

  const maps = await getContextMaps(options, issueData, [journal])

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
  const relevant = (detail.journals || [])
    .filter(journal => new Date(journal.created_on).getTime() > sinceMs)
  const maps = await getContextMaps(options, detail, relevant)
  const items = relevant
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
