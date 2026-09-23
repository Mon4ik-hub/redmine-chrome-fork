<template>
  <div class="fluent-popup">
    <Header
      :roles="roles"
      :role-index="roleIndex"
      :data="pivotData"
      folders-tab
      :folders-active="activeTab === 'folders'"
      :folders-task-count="folderIssues.length"
      :folders-unread="foldersUnread"
      @role-change="handleRoleChange"
      @folders-activate="handleFoldersTab"
    />

    <template v-if="activeTab === 'issues'">
      <Sort
        :order="order"
        :unread-count="unreadCount"
        @order-change="setOrder"
        @mark-all-read="markAllRead"
        @filter-change="handleFilterChange"
      />

      <List
        :sorted-issues="filteredIssues"
        :current-data="currentData"
        @select-issue="showIssue"
        @mark-issue-read="markIssueRead"
      />
    </template>

    <Folders
      v-else
      :folders-data="foldersData"
      :all-issues="allIssues"
      :merged-data="mergedData"
      @select-issue="showIssue"
      @mark-issue-read="markIssueRead"
    />
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import Utils from '@/utils'
import { emptyFoldersData, getFoldersData } from '@/utils/folders'
import Header from '@/components/popup/Header.vue'
import Sort from '@/components/popup/Sort.vue'
import List from '@/components/popup/List.vue'
import Folders from '@/components/popup/Folders.vue'

const emit = defineEmits(['select-issue'])

const roles = ref([])
const roleIndex = ref(0)
const order = ref('default')
const data = ref({})
const filterQuery = ref('')
const foldersData = ref(emptyFoldersData())
const activeTab = ref('issues')

const currentRole = computed(() => roles.value[roleIndex.value])
const currentData = computed(() => data.value[currentRole.value] ||
  { issues: [], unreadList: [], readList: [] })
const isUnread = issue => {
  if (!currentData.value?.unreadList) {
    return false
  }
  return currentData.value.unreadList.includes(Utils.getUUID(issue))
}
const sortedIssues = computed(() => {
  if (!currentData.value?.issues) {
    return []
  }

  const getValueByString = (obj, path) => {
    if (!obj || !path) {
      return ''
    }
    return path.split('.').reduce((o, p) => (o || {})[p], obj)
  }
  // Create a reusable descending comparator function
  const compareDesc = (field, defaultValue) => (a, b) => {
    const aVal = getValueByString(a, field) || defaultValue
    const bVal = getValueByString(b, field) || defaultValue

    return aVal < bVal ? 1 : aVal > bVal ? -1 : 0
  }
  const issues = [...currentData.value.issues]

  if (order.value === 'default') {
    const unread = []
    const read = []

    issues.forEach(issue => {
      if (isUnread(issue)) {
        unread.push(issue)
      } else {
        read.push(issue)
      }
    })

    // Sort unread issues by priority
    unread.sort(compareDesc('priority.id', 0))
    // Sort read issues by priority
    read.sort(compareDesc('priority.id', 0))
    return [...unread, ...read]
  }
  // Sort by specified field
  issues.sort(compareDesc(order.value))

  return issues
})
const unreadCount = computed(() => currentData.value?.unreadList?.length || 0)

const handleFilterChange = query => {
  filterQuery.value = query.toLowerCase()
}

const filteredIssues = computed(() => {
  // Tasks moved into a folder live only in their folder
  const assignments = foldersData.value.assignments || {}
  let issues = sortedIssues.value.filter(issue => !assignments[issue.id])

  if (filterQuery.value) {
    issues = issues.filter(issue => issue.subject.toLowerCase().includes(filterQuery.value))
  }
  return issues
})

// Every issue across all roles (each issue belongs to exactly one role
// thanks to Utils.filterIssues), for the folders view
const allIssues = computed(() => {
  const seen = new Set()
  const issues = []

  for (const role of roles.value) {
    for (const issue of data.value[role]?.issues || []) {
      if (!seen.has(issue.id)) {
        seen.add(issue.id)
        issues.push(issue)
      }
    }
  }
  return issues
})

// Read state merged across roles, so a task inside a folder keeps its
// unread/read status whichever role it arrived through
const mergedData = computed(() => {
  const unreadList = []
  const readAt = {}

  for (const role of roles.value) {
    const roleData = data.value[role] || {}

    unreadList.push(...roleData.unreadList || [])
    Object.assign(readAt, roleData.readAt || {})
  }
  return { issues: [], unreadList, readList: [], readAt, lastRead: 0 }
})

const folderIssues = computed(() =>
  allIssues.value.filter(issue => foldersData.value.assignments?.[issue.id]))

const foldersUnread = computed(() => {
  const unreadSet = new Set(mergedData.value.unreadList)

  return folderIssues.value.filter(issue => unreadSet.has(Utils.getUUID(issue))).length
})

// Pivot counts mirror what each role tab actually shows: tasks moved into
// folders are listed under "Папки" only
const pivotData = computed(() => {
  const assignments = foldersData.value.assignments || {}
  const result = {}

  for (const [role, roleData] of Object.entries(data.value)) {
    if (!roleData?.issues) {
      result[role] = roleData
      continue
    }
    const hiddenUuids = new Set(roleData.issues
      .filter(issue => assignments[issue.id])
      .map(issue => Utils.getUUID(issue)))

    result[role] = {
      ...roleData,
      issues: roleData.issues.filter(issue => !assignments[issue.id]),
      unreadList: (roleData.unreadList || [])
        .filter(uuid => !hiddenUuids.has(uuid))
    }
  }
  return result
})

const saveSettings = async () => {
  const settings = {
    role_index: roleIndex.value,
    order: order.value,
    tab: activeTab.value
  }

  await Utils.setStorage('popup_settings', settings)
}

const handleRoleChange = async index => {
  roleIndex.value = index
  activeTab.value = 'issues'
  await saveSettings()
}

const handleFoldersTab = async () => {
  activeTab.value = 'folders'
  await saveSettings()
}

const setOrder = async newOrder => {
  order.value = newOrder
  await saveSettings()
}

// Calculate total unread count across all roles
const calculateTotalUnread = () => {
  let total = 0

  for (const role of roles.value) {
    if (data.value[role]?.unreadList) {
      total += data.value[role].unreadList.length
    }
  }
  return total
}

const saveData = async () => {
  await Utils.setStorage('data', data.value)
  // Update badge text with total unread count
  const totalUnread = calculateTotalUnread()

  Utils.setBadgeText(totalUnread > 0 ? `${totalUnread}` : '')
}

const markAllRead = async () => {
  const curData = data.value[currentRole.value]

  curData.unreadList = []
  curData.readList = []
  curData.lastRead = Date.now()
  // Everything up to this moment is seen, per-issue markers are not needed
  curData.readAt = {}
  await saveSettings()
  await saveData()
}

const markIssueRead = async issue => {
  // The issue may live in any role (especially inside folders), so find
  // the role it actually belongs to instead of using the selected one
  const uuid = Utils.getUUID(issue)

  for (const role of roles.value) {
    const curData = data.value[role]

    if (!curData?.unreadList) {
      continue
    }

    const index = curData.unreadList.indexOf(uuid)

    if (index !== -1) {
      curData.unreadList.splice(index, 1)
      if (!curData.readList) {
        curData.readList = []
      }
      curData.readList.push(uuid)
      // Remember when this issue was last seen so the grouped view can
      // count only the changes added after that
      if (!curData.readAt) {
        curData.readAt = {}
      }
      curData.readAt[issue.id] = Date.now()
      await saveData()
      return
    }
  }
}

const showIssue = async (issue, index) => {
  emit('select-issue', issue, index)
}

const loadSettings = async () => {
  const popupSettings = await Utils.getStorage('popup_settings') || {}
  const options = await Utils.getStorage('options') || {}

  roles.value = options.issues || ['assigned_to_id']
  roleIndex.value = popupSettings.role_index || 0
  order.value = popupSettings.order || 'default'
  activeTab.value = popupSettings.tab === 'folders' ? 'folders' : 'issues'
  data.value = await Utils.getStorage('data') || {}
  foldersData.value = await getFoldersData()
}

const fixBadgeError = async () => {
  const badgeText = await Utils.getBadgeText()

  // Fix background request error display x
  if (
    badgeText === 'x' &&
    Object.values(data.value).some(it => it.issues.length > 0)
  ) {
    // Clear error badge and update with actual count
    const totalUnread = calculateTotalUnread()

    Utils.setBadgeText(totalUnread > 0 ? `${totalUnread}` : '')
  }
}

onMounted(async () => {
  await loadSettings()
  await fixBadgeError()

  // Listen for storage changes
  chrome.storage?.onChanged?.addListener(changes => {
    if (changes.data) {
      const newData = JSON.parse(changes.data.newValue || '{}')

      data.value = newData
    } else if (changes.options) {
      const newSettings = JSON.parse(changes.options.newValue || '{}')

      if (newSettings.data) {
        data.value = newSettings.data
      }
    } else if (changes.folders) {
      // Moves made from the browser context menu land here instantly
      foldersData.value = JSON.parse(changes.folders.newValue || '{}') ||
        emptyFoldersData()
    }
  })
})
</script>

<style lang="scss" scoped>
/* Fluent flyout card: white surface with the characteristic 8px corner
   radius, sitting on the neutral gray background of the popup. A flex
   column capped at the viewport height (minus the 8px padding of
   .popup-container on each side), so the pivot tabs and the command bar
   stay pinned while the list below scrolls inside the card */
.fluent-popup {
  display: flex;
  flex-direction: column;
  max-height: calc(100vh - 16px);
  background-color: #ffffff;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  box-shadow: 0 8px 16px rgba(0, 0, 0, 0.14);
  overflow: hidden;
}
</style>
