<template>
  <div class="issues-list">
    <Toast
      ref="toast"
      :message="t('copy_success')"
    />
    <div
      v-for="(issue, index) in sortedIssues"
      :key="issue.id + issue.updated_on"
      class="fluent-task-container"
      :class="{
        expanded: isGrouped && isUnread(issue) && expanded[issue.id],
        'is-unread': isUnread(issue)
      }"
      :style="{ '--task-accent': trackerColor(issue.tracker.name) }"
      @click="markIssueRead(issue)"
      @mouseenter="onRowEnter(issue, $event)"
      @mouseleave="onRowLeave"
    >
      <div class="fluent-task-row">
        <i
          class="fluent-chevron fas fa-chevron-right"
          :class="{ invisible: !(isGrouped && isUnread(issue)) }"
          :title="isGrouped && isUnread(issue) ? t('expand_notifications') : undefined"
          @click.stop="toggleExpand(issue)"
        />
        <div
          class="fluent-left-accent"
          :title="issue.tracker.name"
        />
        <div class="fluent-content">
          <div class="fluent-title-block">
            <a
              :href="issueUrl(issue)"
              class="fluent-id"
              @click.prevent.stop="selectIssue(issue, index)"
            >#{{ issue.id }}</a>
            <span class="fluent-subject">{{ issue.subject }}</span>
          </div>
          <div class="fluent-meta-block">
            <StatusBadge
              :status="issue.status"
              :options="options"
            />
            <span :class="`fluent-priority prio-${issue.priority.name.toLowerCase()}`">
              {{ issue.priority.name }}
            </span>
            <span class="fluent-time">{{ issue.project.name }} · {{ formatTime(issue.updated_on) }}</span>
          </div>
        </div>
        <div class="fluent-actions">
          <button
            class="fluent-action-btn"
            :title="t('copy_issue_id')"
            @click.stop="handleCopyIssueId(issue.id, $event)"
          >
            <i class="fas fa-copy" />
          </button>
          <button
            class="fluent-action-btn"
            :title="t('move_to_folder')"
            @click.stop="openFolderMenu(issue, $event)"
          >
            <i class="fas fa-folder-plus" />
          </button>
          <button
            class="fluent-action-btn"
            title="Open in new tab"
            @click.stop="openIssueInNewTab(issue)"
          >
            <i class="fa-solid fa-arrow-up-right-from-square" />
          </button>
        </div>
        <div
          v-if="isGrouped && isUnread(issue) && notifState[issue.id] && notifState[issue.id].status !== 'error'"
          class="unread-count-badge"
          :title="t('expand_notifications')"
          @click.stop="toggleExpand(issue)"
        >
          <template v-if="notifState[issue.id].status === 'ready'">
            {{ notifState[issue.id].total ?? notifState[issue.id].items.length }}
          </template>
          <i
            v-else
            class="fas fa-circle-notch fa-spin"
          />
        </div>
      </div>

      <div
        v-if="isGrouped && isUnread(issue)"
        class="fluent-details-panel"
      >
        <div class="fluent-details-inner">
          <div class="fluent-details-content">
            <div
              v-if="notifState[issue.id]?.status === 'loading'"
              class="notification-meta"
            >
              <i class="fas fa-circle-notch fa-spin" /> {{ t('loading_change') }}
            </div>
            <div
              v-for="(item, notifIndex) in notifState[issue.id]?.items"
              :key="notifIndex"
              class="notification-item"
            >
              <div class="notification-meta">
                <i class="fas fa-user" />
                <span class="notification-author">{{ item.user }}</span>
                <span>• {{ formatTime(item.time) }}</span>
              </div>
              <div
                v-for="(line, lineIndex) in item.lines"
                :key="lineIndex"
                class="notification-line"
                :class="{
                  'is-comment': line.type === 'comment',
                  'is-system': line.type !== 'comment'
                }"
              >
                <template v-if="line.label !== undefined">
                  <span class="item-label">{{ line.label }}:</span> {{ line.value }}
                </template>
                <template v-else>
                  {{ line.text }}
                </template>
              </div>
            </div>
            <div
              v-if="hiddenCount(notifState[issue.id]) > 0"
              class="notification-more"
            >
              {{ t('more_changes', {
                shown: notifState[issue.id]?.items.length,
                total: notifState[issue.id]?.total
              }) }}
            </div>
          </div>
        </div>
      </div>
    </div>

    <div
      v-if="tooltip.visible"
      ref="tooltipEl"
      class="change-tooltip"
      :style="tooltipStyle"
      @mouseenter="onTooltipEnter"
      @mouseleave="onTooltipLeave"
    >
      <div
        v-if="tooltip.loading"
        class="change-tooltip-line"
      >
        <i class="fas fa-circle-notch fa-spin" /> {{ t('loading_change') }}
      </div>
      <template v-else-if="tooltip.change">
        <div class="change-tooltip-header">
          <i class="fas fa-clock-rotate-left" />
          <span>{{ t('last_change') }}: <strong>{{ tooltip.change.user }}</strong> • {{ formatTime(tooltip.change.time) }}</span>
        </div>
        <div class="change-tooltip-body">
          <div
            v-for="(line, index) in tooltipTextLines"
            :key="index"
            class="change-tooltip-line"
          >
            {{ line.text }}
          </div>
          <div
            v-if="tooltipChips.length"
            class="change-tooltip-chips"
          >
            <span
              v-for="(chip, index) in tooltipChips"
              :key="index"
              class="change-tooltip-chip"
            >
              {{ chip.text }}
            </span>
          </div>
        </div>
      </template>
    </div>

    <!-- "Move to folder" flyout anchored to the folder icon of a row.
         Rendered with "position: fixed" like the tooltip, so it never
         stretches the popup layout -->
    <div
      v-if="folderMenu.visible"
      ref="folderMenuEl"
      class="folder-flyout"
      :style="folderMenuStyle"
    >
      <button
        v-if="folderMenu.currentFolderId"
        class="folder-flyout-item is-remove"
        @click="onRemoveFromFolder"
      >
        <i class="fas fa-xmark" /> {{ t('remove_from_folder') }}
      </button>
      <button
        v-for="folder in folderMenu.folders"
        :key="folder.id"
        class="folder-flyout-item"
        :class="{ 'is-current': folder.id === folderMenu.currentFolderId }"
        @click="onMoveToFolder(folder.id)"
      >
        <i class="fas fa-folder" />
        <span class="folder-flyout-name">{{ folder.name }}</span>
        <i
          v-if="folder.id === folderMenu.currentFolderId"
          class="fas fa-check"
        />
      </button>
      <div
        v-if="!folderMenu.folders.length"
        class="folder-flyout-empty"
      >
        {{ t('no_folders_short') }}
      </div>
    </div>

    <div
      v-if="currentData?.error"
      class="error-block"
    >
      <a
        href="options.html"
        target="_blank"
        class="fluent-danger-btn"
      >
        {{ t('settings_error') }}
      </a>
    </div>
  </div>
</template>

<script setup>
import { useI18n } from 'vue-i18n'
import Utils from '@/utils'
import StatusBadge from '@/components/popup/StatusBadge.vue'
import { trackerColor } from '@/utils/statusColors'
import { describeLastChange, getIssueDetail, getIssueNotifications, getTooltipEntry, renderRawLastChange } from '@/utils/changes'
import {
  getFoldersData,
  moveIssueToFolder,
  removeIssueFromFolder
} from '@/utils/folders'
import dayjs from 'dayjs'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

const { t } = useI18n()

const toast = ref()
const options = ref({})

const props = defineProps({
  sortedIssues: {
    type: Array,
    required: true
  },
  currentData: {
    type: Object,
    default: () => ({})
  }
})

const emit = defineEmits(['select-issue', 'mark-issue-read'])

// 创建响应式的 isUnread 函数
const isUnread = computed(() => issue => props.currentData.unreadList.includes(Utils.getUUID(issue)))

const formatTime = dateString => dayjs(dateString).fromNow()

// Grouped notifications mode (enabled in the options): every unread issue
// shows the number of its changes since it was last seen and can be
// expanded into the list of those changes, newest first
const isGrouped = computed(() => options.value.group_notifications === true)

const notifState = ref({})
const expanded = ref({})

// Options are loaded in onMounted; notification requests must not start
// with an empty options object before that — it once defeated the
// notifications_limit option on first popup open
const optionsReady = ref(false)
let resolveOptionsReady
const optionsReadyPromise = new Promise(resolve => {
  resolveOptionsReady = resolve
})

const MAX_INITIAL_LOAD = 30
const LOAD_CONCURRENCY = 4

// The moment the user last saw the issue: its own read timestamp or the
// role-wide "mark all read" moment, whichever is newer
const cutoffFor = issue => {
  const d = props.currentData

  return Math.max(d?.lastRead || 0, d?.readAt?.[issue.id] || 0)
}

const loadIssueNotifications = async issue => {
  // Expanding a row can happen before onMounted finishes; wait for the
  // options instead of requesting with the defaults
  if (!optionsReady.value) {
    await optionsReadyPromise
  }

  const existing = notifState.value[issue.id]

  // A load for the same version of the issue is already done or running
  if (existing && existing.updatedOn === issue.updated_on &&
      (existing.status === 'ready' || existing.status === 'loading')) {
    return
  }

  // The spinner shows only when nothing is known about the issue yet; a
  // refetch of an updated one keeps the previous numbers visible until the
  // fresh list arrives
  if (!existing || existing.status !== 'ready') {
    notifState.value[issue.id] = { status: 'loading', items: [], updatedOn: issue.updated_on }
  }
  try {
    const { items, total } = await getIssueNotifications(options.value, issue, cutoffFor(issue), t)

    notifState.value[issue.id] = { status: 'ready', items, total, updatedOn: issue.updated_on }
  } catch (error) {
    console.error('Failed to load issue notifications:', error)
    // Keep the stale data on a refetch failure; only a first-time load fails visibly
    if (!existing || existing.status !== 'ready') {
      notifState.value[issue.id] = { status: 'error', items: [], updatedOn: issue.updated_on }
    }
  }
}

// How many unread changes stay hidden because of the notifications_limit
// option (the row badge still counts them all)
const hiddenCount = state => {
  if (state?.status !== 'ready') {
    return 0
  }
  return (state.total ?? state.items.length) - state.items.length
}

// Prefetch the counts for unread issues, a few requests at a time; the
// rest are loaded on demand when the issue is expanded
const loadUnreadNotifications = async () => {
  const unread = props.sortedIssues
    .filter(issue => isUnread.value(issue))
    .slice(0, MAX_INITIAL_LOAD)

  let cursor = 0
  const worker = async () => {
    while (cursor < unread.length) {
      await loadIssueNotifications(unread[cursor++])
    }
  }

  await Promise.all(Array.from({ length: Math.min(LOAD_CONCURRENCY, unread.length) }, worker))
}

const unreadSignature = computed(() => props.sortedIssues
  .filter(issue => isUnread.value(issue))
  .map(issue => `${issue.id}:${issue.updated_on}:${cutoffFor(issue)}`)
  .join('|'))

watch(() => [isGrouped.value, optionsReady.value ? unreadSignature.value : ''], ([grouped]) => {
  if (grouped && optionsReady.value) {
    loadUnreadNotifications()
  }
}, { immediate: true })

// Hover tooltip with the last change of an issue (comment, status change,
// etc), loaded on demand from utils/changes.js and cached per popup session.
// Rendered with "position: fixed" so it never stretches the popup layout
// (an absolutely positioned tooltip below the last rows used to enlarge
// the scroll height and make the page jump)
const HOVER_DELAY = 400
const HIDE_DELAY = 150

const tooltip = ref({ visible: false, loading: false, top: 0, left: 0, width: 0, change: null })
const tooltipEl = ref(null)
let hoverTimer = null
let hideTimer = null
let hoveredIssue = null

const tooltipStyle = computed(() => ({
  top: `${tooltip.value.top}px`,
  left: `${tooltip.value.left}px`,
  width: `${tooltip.value.width}px`
}))

// Comment/info lines are shown as body text; attribute changes
// (status, tracker…) become chips at the bottom of the tooltip
const tooltipTextLines = computed(() =>
  (tooltip.value.change?.lines || []).filter(line => line.type !== 'attr'))
const tooltipChips = computed(() =>
  (tooltip.value.change?.lines || []).filter(line => line.type === 'attr'))

const hideTooltip = () => {
  clearTimeout(hoverTimer)
  clearTimeout(hideTimer)
  hoveredIssue = null
  tooltip.value = { visible: false, loading: false, top: 0, left: 0, width: 0, change: null }
}

// Keep the tooltip inside the popup viewport: prefer below the row,
// flip above when it does not fit
const positionTooltip = row => {
  const el = tooltipEl.value

  if (!el) {
    return
  }

  const rect = row.getBoundingClientRect()
  const height = el.offsetHeight
  const fitsBelow = rect.bottom + 6 + height <= window.innerHeight - 8
  const top = fitsBelow ? rect.bottom + 6 : Math.max(8, rect.top - height - 6)

  tooltip.value.top = top
}

// The tooltip is inset from both edges of the row, like the floating
// card in the Fluent mockup (left: 16px; right: 16px)
const TOOLTIP_INSET = 16

const showTooltip = async (issue, row) => {
  const rect = row.getBoundingClientRect()

  tooltip.value = {
    visible: true,
    loading: true,
    top: rect.bottom + 6,
    left: rect.left + TOOLTIP_INSET,
    width: rect.width - TOOLTIP_INSET * 2,
    change: null
  }
  try {
    // A stub rendered earlier (any full journal render, in this or a
    // previous popup session) shows instantly, with no name maps and no
    // requests; a raw stub from a background cache eviction renders lazily
    const cached = await getTooltipEntry(issue.id)

    if (hoveredIssue !== issue) {
      return
    }
    if (cached && cached.updated_on === issue.updated_on) {
      tooltip.value.change = cached.lastChange ||
        renderRawLastChange(cached.journal, options.value, t)
      tooltip.value.loading = false
      await nextTick()
      positionTooltip(row)
      return
    }

    // Cold path: fetch (or take from journal_cache) and render; this also
    // refills both caches for the next time
    const detail = await getIssueDetail(options.value, issue)

    if (hoveredIssue !== issue) {
      return
    }
    tooltip.value.change = await describeLastChange(detail, options.value, t)
    tooltip.value.loading = false
    await nextTick()
    positionTooltip(row)
  } catch (error) {
    console.error('Failed to load last change:', error)
    hideTooltip()
  }
}

const toggleExpand = async issue => {
  expanded.value[issue.id] = !expanded.value[issue.id]
  if (expanded.value[issue.id]) {
    // The expanded list already shows the last change in full
    hideTooltip()
    await loadIssueNotifications(issue)
  }
}

const onRowEnter = (issue, event) => {
  // The expanded notifications already include the last change
  if (expanded.value[issue.id]) {
    return
  }
  clearTimeout(hoverTimer)
  clearTimeout(hideTimer)
  hoveredIssue = issue
  const row = event.currentTarget

  hoverTimer = setTimeout(() => showTooltip(issue, row), HOVER_DELAY)
}

const onRowLeave = () => {
  clearTimeout(hoverTimer)
  // Give the mouse a moment to move from the row into the tooltip
  hideTimer = setTimeout(() => hideTooltip(), HIDE_DELAY)
}

const onTooltipEnter = () => {
  clearTimeout(hideTimer)
}

const onTooltipLeave = () => hideTooltip()

// "Move to folder" flyout: one shared instance anchored to the folder icon
// of a row. The task is bound by its eternal id, so moving it once routes
// all its future notifications into the folder
const folderMenuEl = ref(null)
let folderMenuOpener = null
const emptyFolderMenu = () => ({
  visible: false,
  top: 0,
  left: 0,
  issue: null,
  folders: [],
  currentFolderId: null
})
const folderMenu = ref(emptyFolderMenu())

const folderMenuStyle = computed(() => ({
  top: `${folderMenu.value.top}px`,
  left: `${folderMenu.value.left}px`
}))

// Listeners for an open flyout are tied to an AbortController signal, so
// closing is a single abort() with no reference cycle between handlers
let folderMenuController = null

const closeFolderMenu = () => {
  folderMenuController?.abort()
  folderMenuController = null
  folderMenuOpener = null
  folderMenu.value = emptyFolderMenu()
}

const openFolderMenu = async (issue, event) => {
  // The opener button is skipped by the outside-click guard, so a second
  // click on it toggles the flyout closed
  if (folderMenu.value.visible && folderMenu.value.issue?.id === issue.id) {
    closeFolderMenu()
    return
  }

  hideTooltip()

  const button = event.currentTarget
  const data = await getFoldersData()
  const rect = button.getBoundingClientRect()

  closeFolderMenu()
  folderMenu.value = {
    visible: true,
    top: rect.bottom + 4,
    left: rect.left,
    issue,
    folders: data.list,
    currentFolderId: data.assignments[issue.id] || null
  }
  folderMenuOpener = button

  folderMenuController = new AbortController()
  const { signal } = folderMenuController

  document.addEventListener('click', event => {
    if (folderMenuEl.value?.contains(event.target) || event.target === folderMenuOpener) {
      return
    }
    closeFolderMenu()
  }, { capture: true, signal })
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      closeFolderMenu()
    }
  }, { signal })

  await nextTick()
  // The button sits near the row's right edge, so align the flyout's right
  // edge with it and clamp to the viewport; flip above when it does not
  // fit below
  const el = folderMenuEl.value

  if (el) {
    const height = el.offsetHeight
    const fitsBelow = rect.bottom + 4 + height <= window.innerHeight - 8

    folderMenu.value.top = fitsBelow ?
      rect.bottom + 4 :
      Math.max(8, rect.top - height - 4)
    folderMenu.value.left = Math.max(8, rect.right - el.offsetWidth)
  }
}

const onMoveToFolder = async folderId => {
  const issue = folderMenu.value.issue

  closeFolderMenu()
  if (issue) {
    await moveIssueToFolder(issue.id, folderId)
  }
}

const onRemoveFromFolder = async () => {
  const issue = folderMenu.value.issue

  closeFolderMenu()
  if (issue) {
    await removeIssueFromFolder(issue.id)
  }
}

const handleCopyIssueId = async (issueId, event) => {
  await Utils.copyIssueId(issueId)
  toast.value.show(event)
}

const markIssueRead = issue => {
  if (isUnread.value(issue)) {
    emit('mark-issue-read', issue)
  }
}

const selectIssue = (issue, index) => {
  markIssueRead(issue)
  nextTick(() => {
    emit('select-issue', issue, index)
  })
}

// Real issue URL on the row link: right-clicking it opens the browser
// context menu with the "Move to folder" item, which parses the eternal
// issue id from this URL
const issueUrl = issue => {
  const baseUrl = options.value.url?.endsWith('/') ?
    options.value.url.slice(0, -1) :
    options.value.url

  return `${baseUrl}/issues/${issue.id}`
}

const openIssueInNewTab = issue => {
  window.open(issueUrl(issue), '_blank')
}

// The tooltip and the folder flyout are fixed to the viewport, so they
// must not stay in place while the list is being scrolled
const onViewportScroll = () => {
  hideTooltip()
  closeFolderMenu()
}

onMounted(async () => {
  options.value = await Utils.getStorage('options') || {}
  optionsReady.value = true
  resolveOptionsReady()
  window.addEventListener('scroll', onViewportScroll, true)
})

onBeforeUnmount(() => {
  window.removeEventListener('scroll', onViewportScroll, true)
  hideTooltip()
  closeFolderMenu()
})
</script>

<style lang="scss" scoped>
/* The list is the scroll container of the popup: the pivot tabs and the
   command bar above stay pinned while tasks scroll under them (a nested
   .issues-list inside a folder body is content-sized, so these rules
   simply do nothing there) */
.issues-list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  /* Repeat the card's bottom corners: the card itself no longer clips its
     children (see .fluent-popup in Issues.vue), so scrolled rows would
     paint square corners over the rounded border */
  border-radius: 0 0 7px 7px;
  scrollbar-width: thin;
  scrollbar-color: #c8c6c4 transparent;
}

/* Fluent task rows: a colored tracker accent on the left, the id in blue,
   meta as soft badges, actions revealed on hover; the row lives in a
   container together with its expandable details panel */
.fluent-task-container {
  border-bottom: 1px solid #f3f2f1;
  cursor: pointer;

  &:last-child {
    border-bottom: none;
  }
}

.fluent-task-row {
  display: flex;
  align-items: flex-start;
  padding: 12px 16px;
  transition: background-color 0.1s ease;
}

.fluent-task-container:hover .fluent-task-row {
  background-color: #f3f2f1;
}

/* Chevron and the tracker accent share the same 16px slot height and
   top offset, so both sit on one line at a fixed distance from the id;
   the slot is always reserved (visibility) so read rows keep the same
   left edge as expandable ones */
.fluent-chevron {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  margin: 3px 8px 0 0;
  font-size: 14px;
  color: #605e5c;
  flex-shrink: 0;
  cursor: pointer;
  transition: transform 0.2s cubic-bezier(0.1, 0.9, 0.2, 1);

  &.invisible {
    visibility: hidden;
    cursor: default;
  }
}

.fluent-task-container.expanded .fluent-chevron {
  transform: rotate(90deg);
  color: #0078d4;
}

.fluent-left-accent {
  width: 3px;
  height: 16px;
  margin: 3px 12px 0 0;
  background-color: var(--task-accent, #0078d4);
  border-radius: 2px;
  flex-shrink: 0;
}

.fluent-content {
  flex: 1;
  min-width: 0;
}

.fluent-title-block {
  margin-bottom: 6px;
  font-size: 14px;
  line-height: 1.4;
}

.fluent-id {
  margin-right: 6px;
  font-weight: 600;
  color: #0078d4;
  text-decoration: none;

  &:hover {
    text-decoration: underline;
  }
}

.fluent-subject {
  color: #605e5c;
}

.fluent-task-container.is-unread .fluent-subject {
  font-weight: 600;
  color: #201f1e;
}

.fluent-meta-block {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

@mixin soft-priority($color) {
  color: color-mix(in srgb, $color 58%, #201f1e);
  background-color: color-mix(in srgb, $color 14%, #ffffff);
}

.fluent-priority {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  font-size: 11px;
  font-weight: 600;
  line-height: 18px;
  border-radius: 4px;
  color: #605e5c;
  background-color: #f3f2f1;

  &.prio-immediate,
  &.prio-немедленный {
    @include soft-priority(#8a2be2);
  }

  &.prio-urgent,
  &.prio-срочный {
    @include soft-priority(#d9534f);
  }

  &.prio-high,
  &.prio-высокий {
    @include soft-priority(#d1761f);
  }

  &.prio-normal,
  &.prio-нормальный {
    @include soft-priority(#f0ad4e);
  }

  &.prio-low,
  &.prio-низкий {
    @include soft-priority(#6264a7);
  }
}

.fluent-time {
  font-size: 12px;
  color: #797775;
}

.fluent-actions {
  display: flex;
  gap: 4px;
  margin-left: 8px;
  opacity: 0;
  transition: opacity 0.1s ease;
}

.fluent-task-container:hover .fluent-actions,
.fluent-actions:focus-within {
  opacity: 1;
}

.fluent-action-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  font-size: 12px;
  color: #605e5c;
  background-color: transparent;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  transition: background-color 0.1s ease, color 0.1s ease;

  &:hover {
    color: #201f1e;
    background-color: #edebe9;
  }
}

.unread-count-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 20px;
  height: 20px;
  margin-left: 4px;
  padding: 0 6px;
  font-size: 11px;
  font-weight: 600;
  color: #fff;
  background-color: #0078d4;
  border-radius: 10px;
  flex-shrink: 0;
  cursor: pointer;
  transition: background-color 0.1s ease;

  &:hover {
    background-color: #106ebe;
  }
}

/* Expandable details panel: animated with a 0fr → 1fr grid row so it
   slides open without measuring heights in JS */
.fluent-details-panel {
  display: grid;
  grid-template-rows: 0fr;
  background-color: #fafafb;
  transition: grid-template-rows 0.25s cubic-bezier(0.1, 0.9, 0.2, 1);
}

.fluent-task-container.expanded .fluent-details-panel {
  grid-template-rows: 1fr;
  border-top: 1px solid #f3f2f1;
}

.fluent-details-inner {
  overflow: hidden;
  min-height: 0;
}

.fluent-details-content {
  padding: 12px 16px 16px 55px;
  font-size: 12px;
  line-height: 1.5;
  color: #323130;
}

/* One journal entry as an activity block: a 2px accent line on the left in
   the task accent color, the author line above the change lines */
.notification-item {
  display: flex;
  flex-direction: column;
  gap: 3px;
  margin-bottom: 10px;
  padding-left: 12px;
  border-left: 2px solid var(--task-accent, #0078d4);

  &:last-child {
    margin-bottom: 0;
  }
}

.notification-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: #797775;
}

.notification-author {
  font-weight: 600;
  color: #323130;
}

.notification-line {
  font-size: 12px;
  word-break: break-word;
}

/* Attribute changes and fallback lines stay muted, the label one step
   lighter than the value */
.notification-line.is-system {
  color: #605e5c;
}

.item-label {
  color: #797775;
}

/* Text comments are highlighted: accent-colored left border, a faint
   neutral background, dark text, rounded on the side away from the border */
.notification-line.is-comment {
  margin: 2px 0;
  padding: 4px 6px;
  color: #201f1e;
  background-color: rgba(0, 0, 0, 0.03);
  border-left: 3px solid var(--task-accent, #0078d4);
  border-radius: 0 3px 3px 0;
}

/* Footer of the panel when notifications_limit trims the list: how many
   older changes exist beyond the displayed newest ones */
.notification-more {
  margin-top: 8px;
  font-size: 12px;
  color: #797775;
}

/* Floating "last change" tooltip: no heavy border — a hairline outline and
   a two-layer Fluent shadow, fading in with a slight downward slide */
.change-tooltip {
  position: fixed;
  z-index: 1000;
  max-height: min(420px, calc(100vh - 24px));
  overflow-y: auto;
  padding: 12px 16px;
  background: #fff;
  border: 1px solid #f3f2f1;
  border-radius: 8px;
  box-shadow: 0 8px 16px rgba(0, 0, 0, 0.18), 0 2px 4px rgba(0, 0, 0, 0.08);
  animation: change-tooltip-in 0.15s ease;
}

@keyframes change-tooltip-in {
  from {
    opacity: 0;
    transform: translateY(-4px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.change-tooltip-header {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 6px;
  font-size: 12px;
  color: #797775;

  .fas {
    font-size: 14px;
  }

  strong {
    font-weight: 600;
  }
}

.change-tooltip-body {
  font-size: 13px;
  line-height: 1.5;
  color: #201f1e;
}

.change-tooltip-line {
  font-size: 13px;
  line-height: 1.5;
  color: #201f1e;
  word-break: break-word;
}

.change-tooltip-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 4px;
}

.change-tooltip-chip {
  display: inline-block;
  padding: 2px 6px;
  font-size: 12px;
  color: #605e5c;
  background-color: #f3f2f1;
  border-radius: 4px;
}

/* "Move to folder" flyout: same Fluent flyout as the sort menu */
.folder-flyout {
  position: fixed;
  z-index: 1001;
  min-width: 200px;
  max-width: 280px;
  max-height: min(320px, calc(100vh - 24px));
  overflow-y: auto;
  padding: 4px;
  background: #fff;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  box-shadow: 0 8px 16px rgba(0, 0, 0, 0.14);
}

.folder-flyout-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 6px 10px;
  font-size: 13px;
  font-family: inherit;
  color: #201f1e;
  text-align: left;
  background-color: transparent;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  transition: background-color 0.1s ease;

  &:hover {
    background-color: #f3f2f1;
  }

  &.is-current {
    font-weight: 600;
    color: #005a9e;
    background-color: #e5f1fb;
  }

  &.is-remove {
    color: #c42b1c;
    border-bottom: 1px solid #f3f2f1;
    border-radius: 4px 4px 0 0;

    &:hover {
      color: #d13438;
      background-color: #fde7e9;
    }
  }

  .fas {
    flex-shrink: 0;
    font-size: 12px;
  }
}

.folder-flyout-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.folder-flyout-empty {
  padding: 8px 10px;
  font-size: 12px;
  color: #797775;
}

.error-block {
  padding: 24px 16px;
  text-align: center;
}

.fluent-danger-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 16px;
  font-size: 13px;
  color: #fff;
  background-color: #c42b1c;
  border-radius: 4px;
  text-decoration: none;
  transition: background-color 0.1s ease;

  &:hover {
    background-color: #d13438;
    color: #fff;
  }
}
</style>
