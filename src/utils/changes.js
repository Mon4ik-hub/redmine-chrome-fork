import Utils from '@/utils'

// Issue details (with journals) cached for the current popup session.
// The cache key includes "updated on" so an updated issue is fetched again.
const detailCache = new Map()
let nameMaps = null

// "include=journals" returns EVERY journal of an issue — on production
// servers well over a hundred per task — so re-fetching them on every popup
// open kept the unread counters spinning for a long time. A compact copy of
// each issue is therefore kept in chrome.storage.local and reused while its
// "updated_on" stamp is unchanged. Long texts are capped so the cache (with
// the unlimitedStorage permission, plus a per-issue byte budget) stays sane.
// The cache lives in chrome.storage.local as ONE KEY PER ISSUE
// ("journal_cache/<id>", entry capped to the budget). It used to be a single
// "journal_cache" key holding every cached issue in one JSON value (~32 MB in
// practice): every popup open read and parsed the whole thing and every flush
// rewrote it. "jc_index" maps id → updated_on so eviction can enumerate the
// stored keys without reading them; "jc_migrated" marks the one-time move off
// the legacy key
const LEGACY_JOURNAL_CACHE_KEY = 'journal_cache'
const JOURNAL_KEY_PREFIX = 'journal_cache/'
const JOURNAL_INDEX_KEY = 'jc_index'
const JOURNAL_MIGRATED_KEY = 'jc_migrated'
const MAX_CACHED_ISSUES = 40
const NOTES_CAP = 10000
const DESCRIPTION_CAP = 50000
// Long-text custom fields (and description edits) ride inside journal
// details as FULL old/new values — a monster task carried megabytes there
// while the byte budget saw only short "id → name" lines. Cap the stored
// values, and charge the estimate for the capped length
const DETAIL_VALUE_CAP = 1000
// One monster task can carry journals measured in megabytes; keeping them
// all would bloat every cache flush. The newest journals matter (tooltip +
// notifications since lastRead), so the budget drops the OLDEST ones
const JOURNAL_BUDGET = 512 * 1024

const capText = (text, limit) => {
  if (typeof text === 'string' && text.length > limit) {
    return text.slice(0, limit)
  }
  return text
}

const capDetailValue = value => {
  const capped = capText(value, DETAIL_VALUE_CAP)

  return capped === value ? value : `${capped}…`
}

const capDetails = details => (details || []).map(detail => ({
  ...detail,
  old_value: capDetailValue(detail?.old_value),
  new_value: capDetailValue(detail?.new_value)
}))

const valueSize = value => typeof value === 'string' ?
  Math.min(value.length, DETAIL_VALUE_CAP) : 8

const journalSize = journal =>
  Math.min(String(journal.notes || '').length, NOTES_CAP) +
  (journal.details || []).reduce((sum, detail) =>
    sum + valueSize(detail?.old_value) + valueSize(detail?.new_value) + 64, 0) +
  256

// Compact copy of a journal, capped to the budget from the newest entry
// backwards; at least the newest journal always survives
const capJournals = journals => {
  const kept = []
  let used = 0

  for (let i = journals.length - 1; i >= 0; i--) {
    const journal = journals[i]

    if (used + journalSize(journal) > JOURNAL_BUDGET && kept.length) {
      break
    }
    used += journalSize(journal)
    kept.unshift({
      user: journal.user ? { name: journal.user.name } : undefined,
      created_on: journal.created_on,
      notes: capText(journal.notes, NOTES_CAP),
      details: capDetails(journal.details)
    })
  }
  return kept
}

const toCacheEntry = issueData => ({
  updated_on: issueData.updated_on,
  issue: {
    id: issueData.id,
    updated_on: issueData.updated_on,
    created_on: issueData.created_on,
    author: issueData.author,
    assigned_to: issueData.assigned_to,
    project: issueData.project,
    custom_fields: issueData.custom_fields,
    description: capText(issueData.description, DESCRIPTION_CAP),
    journals: capJournals(issueData.journals || [])
  }
})

// In-session memory of the per-issue cache; a null entry is a known miss, so
// a cache-less issue costs one storage read per session, not per access.
// Writes are batched with a short delay, so prefetching a page of issues
// results in one storage.set
const journalCache = new Map()
// id → updated_on for every stored per-issue key; drives the LRU eviction
// and survives context restarts
const journalIndex = new Map()
const dirtyJournals = new Set()
let journalFlushTimer = null

const journalIndexPromise = Utils.getStorage(JOURNAL_INDEX_KEY)
  .catch(() => null)
  .then(stored => {
    for (const [id, updatedOn] of Object.entries(stored || {})) {
      journalIndex.set(Number(id), updatedOn)
    }
  })

// chrome.storage.local.set accepts several keys in one atomic call; values
// follow the extension convention of JSON strings
const setStorageRaw = async map => {
  if (chrome?.storage?.local) {
    await chrome.storage.local.set(map)
    return
  }
  for (const [key, value] of Object.entries(map)) {
    localStorage[key] = value
  }
}

// Rendered "last change" stubs for the instant hover tooltip, kept apart
// from journal_cache on purpose: the tooltip needs hundreds of tiny stubs
// (one per ever-seen issue, ~hundreds of bytes each) while the counters
// need few but full journals. An entry is { updated_on, lastChange } with
// lastChange already rendered ({ user, time, lines }) — ready to show with
// no name maps and no requests; when rendering was impossible (journal
// eviction in the background, where there is no i18n), the raw last
// journal is stored instead and the popup renders it lazily on hover
const TOOLTIP_CACHE_KEY = 'tooltip_cache'
const MAX_TOOLTIP_ENTRIES = 300

const tooltipCache = new Map()
const tooltipCachePromise = new Promise(resolve => {
  Utils.getStorage(TOOLTIP_CACHE_KEY)
    .catch(() => null)
    .then(stored => {
      for (const [id, entry] of Object.entries(stored || {})) {
        if (entry?.updated_on && (entry.lastChange || entry.journal)) {
          tooltipCache.set(Number(id), entry)
        }
      }
      resolve()
    })
})
let tooltipCacheFlushTimer = null

const flushTooltipCache = async () => {
  clearTimeout(tooltipCacheFlushTimer)
  tooltipCacheFlushTimer = null

  if (tooltipCache.size > MAX_TOOLTIP_ENTRIES) {
    const byAge = [...tooltipCache.entries()]
      .sort(([, a], [, b]) => String(b.updated_on).localeCompare(String(a.updated_on)))

    for (const [id] of byAge.slice(MAX_TOOLTIP_ENTRIES)) {
      tooltipCache.delete(id)
    }
  }

  try {
    await Utils.setStorage(TOOLTIP_CACHE_KEY, Object.fromEntries(tooltipCache))
  } catch {
    // Losing the warm tooltips only costs the instant hover
  }
}

const rememberTooltip = (issueId, entry) => {
  tooltipCache.set(issueId, entry)

  if (!tooltipCacheFlushTimer) {
    tooltipCacheFlushTimer = setTimeout(flushTooltipCache, 500)
  }
}

export const getTooltipEntry = async issueId => {
  await tooltipCachePromise
  return tooltipCache.get(Number(issueId))
}

// Hoisted: the debounced scheduler above references it
async function flushJournalCache () {
  clearTimeout(journalFlushTimer)
  journalFlushTimer = null
  await journalIndexPromise

  // Evict beyond the cap by updated_on, newest first; an evicted journal
  // still deserves an instant tooltip: when its data is in memory, a raw
  // copy of the last journal is kept for the popup to render lazily
  // (rendering here is impossible — no i18n in this context)
  const removals = []

  if (journalIndex.size > MAX_CACHED_ISSUES) {
    const byAge = [...journalIndex.entries()]
      .sort(([, a], [, b]) => String(b).localeCompare(String(a)))

    for (const [id] of byAge.slice(MAX_CACHED_ISSUES)) {
      const journals = journalCache.get(id)?.issue?.journals || []
      const lastJournal = journals[journals.length - 1]

      if (lastJournal) {
        rememberTooltip(id, { updated_on: journalIndex.get(id), journal: lastJournal })
      }
      journalCache.delete(id)
      journalIndex.delete(id)
      dirtyJournals.delete(id)
      removals.push(JOURNAL_KEY_PREFIX + id)
    }
  }

  const writes = {}

  for (const id of dirtyJournals) {
    const entry = journalCache.get(id)

    if (entry) {
      writes[JOURNAL_KEY_PREFIX + id] = JSON.stringify(entry)
    }
  }
  dirtyJournals.clear()

  try {
    if (Object.keys(writes).length) {
      await setStorageRaw(writes)
    }
    // The index is tiny; persist it on every flush so the stored set stays
    // enumerable after a context restart
    await Utils.setStorage(JOURNAL_INDEX_KEY, Object.fromEntries(journalIndex))
    if (removals.length) {
      await Utils.removeStorage(removals)
    }
  } catch {
    // A full quota or a missing storage area only costs the speedup
  }
}

const scheduleJournalFlush = () => {
  if (!journalFlushTimer) {
    journalFlushTimer = setTimeout(() => {
      journalFlushTimer = null
      flushJournalCache()
    }, 500)
  }
}

// Read one issue's cached journal. Bloat is detected by the "size" field
// written at remember time — no re-serialization of the entry here
const getCachedIssue = async id => {
  if (journalCache.has(id)) {
    return journalCache.get(id)
  }
  const entry = await Utils.getStorage(JOURNAL_KEY_PREFIX + id)

  if (entry?.updated_on && entry.issue && entry.size <= JOURNAL_BUDGET * 2) {
    journalCache.set(id, entry)
    if (!journalIndex.has(id)) {
      journalIndex.set(id, entry.updated_on)
      scheduleJournalFlush()
    }
    return entry
  }
  journalCache.set(id, null)
  return null
}

const rememberIssue = issueData => {
  const entry = toCacheEntry(issueData)

  // Pre-computed size, so the read-time bloat check never re-serializes
  entry.size = JSON.stringify(entry).length
  journalCache.set(issueData.id, entry)
  journalIndex.set(issueData.id, issueData.updated_on)
  dirtyJournals.add(issueData.id)
  scheduleJournalFlush()
}

// One-time move off the legacy single-key cache: entries within the budget
// become per-issue keys, bloated legacy ones are dropped (the next access
// re-fetches them already capped), the old key is removed last. Guarded by
// a marker key, so it is idempotent whichever context (background, popup)
// runs it first; the in-memory index is filled too, so a concurrent flush
// cannot lose the migrated ids
export const migrateLegacyJournalCache = async () => {
  try {
    if (await Utils.getStorage(JOURNAL_MIGRATED_KEY)) {
      return
    }
    const stored = await Utils.getStorage(LEGACY_JOURNAL_CACHE_KEY)
    const writes = {}
    const index = {}

    for (const [id, entry] of Object.entries(stored || {})) {
      if (!entry?.updated_on || !entry.issue) {
        continue
      }
      const sized = { ...entry, size: JSON.stringify(entry).length }

      if (sized.size > JOURNAL_BUDGET) {
        continue
      }
      writes[JOURNAL_KEY_PREFIX + id] = JSON.stringify(sized)
      index[id] = entry.updated_on
    }

    let ids = Object.keys(index)

    if (ids.length > MAX_CACHED_ISSUES) {
      ids = ids.sort((a, b) => String(index[b]).localeCompare(String(index[a])))
      for (const id of ids.slice(MAX_CACHED_ISSUES)) {
        delete writes[JOURNAL_KEY_PREFIX + id]
        delete index[id]
      }
    }

    await journalIndexPromise
    if (Object.keys(writes).length) {
      await setStorageRaw(writes)
    }
    for (const [id, updatedOn] of Object.entries(index)) {
      journalIndex.set(Number(id), updatedOn)
    }
    scheduleJournalFlush()
    if (stored) {
      await Utils.removeStorage(LEGACY_JOURNAL_CACHE_KEY)
    }
    await Utils.setStorage(JOURNAL_MIGRATED_KEY, 1)
  } catch (error) {
    console.error('Legacy journal cache migration failed:', error)
  }
}

// Persist both caches right away: in the service worker a pending debounce
// may never fire, because the worker can die before it runs
export const flushCaches = async () => {
  await flushJournalCache()
  await flushTooltipCache()
}

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

  // Reuse the persistent copy while the issue has not been updated
  const entry = await getCachedIssue(issue.id)

  if (entry && entry.updated_on === issue.updated_on) {
    detailCache.set(cacheKey, entry.issue)
    return entry.issue
  }

  const data = await Utils.getAPI(options, `issues/${issue.id}`, { include: 'journals' })
  const result = data.issue || data

  detailCache.set(cacheKey, result)
  rememberIssue(result)
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

// Same lookup for journal detail names of other properties (relation types)
const propLabel = (prefix, name, t) => {
  const key = `${prefix}${name}`
  const label = t(key)

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

// Relations in journal details reference the other issue by bare id; its
// subject is fetched (and cached) so "copied_to 31" can become a readable line
const issueTitleCache = new Map()

const getIssueTitle = (options, issueId) => {
  if (!issueTitleCache.has(issueId)) {
    const load = Utils.getAPI(options, `issues/${issueId}`)
      .then(res => (res.issue || res).subject)
      .catch(() => undefined)

    issueTitleCache.set(issueId, load)
  }
  return issueTitleCache.get(issueId)
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
    issues: {},
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
  const relationIds = new Set()

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
      if (detail.property === 'relation') {
        for (const value of [detail.old_value, detail.new_value]) {
          if (value) {
            relationIds.add(value)
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
  for (const id of relationIds) {
    jobs.push(getIssueTitle(options, id).then(title => {
      if (title) {
        maps.issues[id] = title
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
    // The value is the other issue's id; the line reads like Redmine's own
    // history ("Скопировано в: #31 Собрать программу онбординга")
    const ref = newValue || oldValue
    const title = maps.issues?.[ref]

    return {
      label: propLabel('rel_', name, t),
      value: ref ? title ? `#${ref} ${title}` : `#${ref}` : ''
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
  let change

  if (!journal) {
    change = {
      user: issueData.author?.name || '',
      time: issueData.created_on,
      lines: [{ type: 'info', text: t('issue_created') }]
    }
  } else {
    const maps = await getContextMaps(options, issueData, [journal])

    change = journalToNotification(journal, options, maps, t)
  }

  // The rendered change doubles as the tooltip_cache stub, so the next
  // hover shows it instantly; old cached entries have no id — skip those
  if (issueData.id !== undefined) {
    rememberTooltip(issueData.id, { updated_on: issueData.updated_on, lastChange: change })
  }
  return change
}

// A raw last journal saved by the cache eviction (eviction runs where there
// is no i18n): render it with what is available locally — statuses and
// trackers from the saved options; other attributes degrade to raw ids
export const renderRawLastChange = (journal, options, t) => {
  const maps = {
    status: toNameMap(options.statusList),
    tracker: toNameMap(options.trackerList),
    users: {},
    versions: {},
    categories: {},
    projects: {},
    issues: {},
    cf: {}
  }

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
  const journals = detail.journals || []
  const relevant = journals
    .filter(journal => new Date(journal.created_on).getTime() > sinceMs)
  // The maps must also cover the newest journal overall (it feeds the
  // tooltip stub below) even when it is older than the cutoff
  const lastJournal = journals[journals.length - 1]
  const maps = await getContextMaps(options, detail,
    lastJournal && !relevant.includes(lastJournal) ? [...relevant, lastJournal] : relevant)
  const items = relevant
    .map(journal => journalToNotification(journal, options, maps, t))

  // Every full render leaves a ready-made stub for the instant tooltip
  if (detail.id !== undefined) {
    const lastChange = lastJournal ?
      journalToNotification(lastJournal, options, maps, t) :
      {
        user: detail.author?.name || '',
        time: detail.created_on,
        lines: [{ type: 'info', text: t('issue_created') }]
      }

    rememberTooltip(detail.id, { updated_on: detail.updated_on, lastChange })
  }

  if (items.length > 0) {
    const limit = options.notifications_limit ?? 0

    return {
      items: limit > 0 ? items.slice(Math.max(0, items.length - limit)) : items,
      total: items.length
    }
  }

  // Nothing matches the cutoff: an issue with no journal at all was just
  // created; an older one (updated_on moved without entries, e.g. a
  // subtask changed) gets the generic "updated" line — the background
  // auto-reads it within a cycle, so this stub is rarely seen
  if (!lastJournal) {
    return {
      items: [{
        user: detail.author?.name || '',
        time: detail.created_on,
        lines: [{ type: 'info', text: t('issue_created') }]
      }],
      total: 1
    }
  }

  return {
    items: [{
      user: lastJournal.user?.name || detail.author?.name || '',
      time: detail.updated_on,
      lines: [{ type: 'info', text: t('issue_updated') }]
    }],
    total: 1
  }
}
