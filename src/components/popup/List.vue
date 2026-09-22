<template>
  <div class="issues-list">
    <Toast
      ref="toast"
      :message="t('copy_success')"
    />
    <div
      v-for="(issue, index) in sortedIssues"
      :key="issue.id + issue.updated_on"
      class="list-group-item"
      :class="{ 'fw-bold': isUnread(issue) }"
      @click="markIssueRead(issue)"
      @mouseenter="onRowEnter(issue, $event)"
      @mouseleave="onRowLeave"
    >
      <div class="d-flex justify-content-between align-items-center">
        <div>
          <span :class="`badge bg-${issue.priority.name.toLowerCase()}`">
            {{ issue.priority.name }}
          </span>
          <StatusBadge
            :status="issue.status"
            :options="options"
            class="ms-2"
          />
        </div>
        <div class="d-flex align-items-center">
          <span
            v-if="isGrouped && isUnread(issue) && notifState[issue.id] && notifState[issue.id].status !== 'error'"
            class="notif-count"
            :title="t('expand_notifications')"
          >
            <template v-if="notifState[issue.id].status === 'ready'">
              {{ notifState[issue.id].items.length }}
            </template>
            <i
              v-else
              class="fas fa-circle-notch fa-spin"
            />
          </span>
          <div class="text-end small">
            {{ issue.project.name }}
            ({{ formatTime(issue.updated_on) }})
          </div>
        </div>
      </div>
      <div class="mt-2 d-flex align-items-center gap-2">
        <button
          v-if="isGrouped && isUnread(issue)"
          class="btn btn-sm btn-link p-0 expand-btn"
          :title="t('expand_notifications')"
          @click.stop="toggleExpand(issue)"
        >
          <i :class="expanded[issue.id] ? 'fas fa-chevron-down' : 'fas fa-chevron-right'" />
        </button>
        <button
          class="btn btn-sm btn-link p-0 copy-btn"
          :title="t('copy_issue_id')"
          @click.stop="handleCopyIssueId(issue.id, $event)"
        >
          <i class="fas fa-copy" />
        </button>
        <button
          class="btn btn-sm btn-link p-0 open-btn"
          title="Open in new tab"
          @click.stop="openIssueInNewTab(issue)"
        >
          <i class="fa-solid fa-arrow-up-right-from-square" />
        </button>
        <a
          href="#"
          target="_blank"
          class="issue-link text-decoration-none"
          @click.prevent.stop="selectIssue(issue, index)"
        >
          <span
            v-if="isUnread(issue)"
            class="unread-indicator"
          />
          {{ issue.tracker.name }} #{{ issue.id }}: {{ issue.subject }}
        </a>
      </div>

      <div
        v-if="isGrouped && isUnread(issue) && expanded[issue.id]"
        class="notification-group"
      >
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
            <i class="fas fa-user" /> {{ item.user }} · {{ formatTime(item.time) }}
          </div>
          <div
            v-for="(line, lineIndex) in item.lines"
            :key="lineIndex"
            class="notification-line"
          >
            {{ line }}
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
          {{ t('last_change') }}: {{ tooltip.change.user }} · {{ formatTime(tooltip.change.time) }}
        </div>
        <div
          v-for="(line, index) in tooltip.change.lines"
          :key="index"
          class="change-tooltip-line"
        >
          {{ line }}
        </div>
      </template>
    </div>

    <div
      v-if="currentData?.error"
      class="text-center p-4"
    >
      <a
        href="options.html"
        target="_blank"
        class="btn btn-danger"
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
import { describeLastChange, getIssueDetail, getIssueNotifications } from '@/utils/changes'
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

const MAX_INITIAL_LOAD = 30
const LOAD_CONCURRENCY = 4

// The moment the user last saw the issue: its own read timestamp or the
// role-wide "mark all read" moment, whichever is newer
const cutoffFor = issue => {
  const d = props.currentData

  return Math.max(d?.lastRead || 0, d?.readAt?.[issue.id] || 0)
}

const loadIssueNotifications = async issue => {
  if (notifState.value[issue.id]) {
    return
  }
  notifState.value[issue.id] = { status: 'loading', items: [] }
  try {
    const items = await getIssueNotifications(options.value, issue, cutoffFor(issue), t)

    notifState.value[issue.id] = { status: 'ready', items }
  } catch (error) {
    console.error('Failed to load issue notifications:', error)
    notifState.value[issue.id] = { status: 'error', items: [] }
  }
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

watch(() => [isGrouped.value, unreadSignature.value], ([grouped]) => {
  if (grouped) {
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

const showTooltip = async (issue, row) => {
  const rect = row.getBoundingClientRect()

  tooltip.value = {
    visible: true,
    loading: true,
    top: rect.bottom + 6,
    left: rect.left,
    width: rect.width,
    change: null
  }
  try {
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

const openIssueInNewTab = issue => {
  const baseUrl = options.value.url?.endsWith('/') ?
    options.value.url.slice(0, -1) :
    options.value.url

  window.open(`${baseUrl}/issues/${issue.id}`, '_blank')
}

onMounted(async () => {
  options.value = await Utils.getStorage('options') || {}
  // The tooltip is fixed to the viewport, so it must not stay in place
  // while the list is being scrolled
  window.addEventListener('scroll', hideTooltip, true)
})

onBeforeUnmount(() => {
  window.removeEventListener('scroll', hideTooltip, true)
  hideTooltip()
})
</script>

<style lang="scss" scoped>
.list-group-item {
  padding: 8px 0;
  border-bottom: 1px solid var(--bs-border-color);
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 4px;

  &:hover {
    background-color: #f8f9fa;
  }

  &:last-child {
    border-bottom: none;
  }
}

.issue-link {
  display: inline-flex;
  align-items: center;

  .unread-indicator {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background-color: var(--bs-primary);
    margin-right: 8px;
    flex-shrink: 0;
    margin-top: 1px; /* 微调指示器垂直位置 */
  }
}

.copy-btn,
.open-btn,
.expand-btn {
  width: 18px;
  height: 18px;
  font-size: 12px;
  color: #6c757d; /* 灰色文本 */

  &:hover {
    color: #495057; /* 鼠标悬停加深颜色 */
  }

  i {
    font-size: 12px;
  }
}

.notif-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 20px;
  height: 20px;
  margin-right: 8px;
  padding: 0 6px;
  font-size: 12px;
  font-weight: 600;
  color: #fff;
  background-color: var(--bs-primary);
  border-radius: 10px;
}

.notification-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 6px 4px 2px 26px;
  border-top: 1px dashed var(--bs-border-color);
}

.notification-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.notification-meta {
  font-size: 12px;
  color: #6c757d;
}

.notification-line {
  font-size: 12px;
  word-break: break-word;
}

.gap-2 {
  gap: 6px !important;
}

.badge {
  &.bg-immediate {
    background: BlueViolet;
  }

  &.bg-urgent {
    background: #d9534f;
  }

  &.bg-high {
    background: #d1761f;
  }

  &.bg-normal {
    background-color: #f0ad4e;
  }

  &.bg-low {
    background: #aed2e8;
  }
}

.change-tooltip {
  position: fixed;
  z-index: 1000;
  max-height: min(420px, calc(100vh - 24px));
  overflow-y: auto;
  padding: 8px 10px;
  background: #fff;
  border: 1px solid var(--bs-border-color);
  border-radius: 6px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.change-tooltip-header {
  margin-bottom: 4px;
  font-size: 12px;
  color: #6c757d;
}

.change-tooltip-line {
  font-size: 12px;
  word-break: break-word;
}
</style>
