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
          :style="{ backgroundColor: trackerColor(issue.tracker.name) }"
          :title="issue.tracker.name"
        />
        <div class="fluent-content">
          <div class="fluent-title-block">
            <a
              href="#"
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
            {{ notifState[issue.id].items.length }}
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

.notification-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin-bottom: 8px;

  &:last-child {
    margin-bottom: 0;
  }
}

.notification-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: #605e5c;
}

.notification-line {
  font-size: 12px;
  word-break: break-word;
}

.change-tooltip {
  position: fixed;
  z-index: 1000;
  max-height: min(420px, calc(100vh - 24px));
  overflow-y: auto;
  padding: 10px 12px;
  background: #fff;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  box-shadow: 0 8px 16px rgba(0, 0, 0, 0.14);
}

.change-tooltip-header {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 6px;
  font-size: 12px;
  color: #605e5c;
}

.change-tooltip-line {
  font-size: 12px;
  color: #323130;
  word-break: break-word;
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
