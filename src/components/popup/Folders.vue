<template>
  <div class="folders-view">
    <!-- Compact creation row at the top of the tab -->
    <div class="folder-create-row">
      <i class="fas fa-folder-plus folder-create-icon" />
      <input
        ref="nameInput"
        v-model="newFolderName"
        class="folder-create-input"
        type="text"
        :placeholder="t('folder_name_placeholder')"
        maxlength="60"
        @keyup.enter="createFolder"
      >
      <button
        class="fluent-accent-btn"
        :disabled="!newFolderName.trim()"
        @click="createFolder"
      >
        <i class="fas fa-plus" /> {{ t('create_folder') }}
      </button>
    </div>

    <div
      v-for="folder in foldersData.list"
      :key="folder.id"
      class="folder-container"
      :class="{ expanded: openFolders[folder.id] }"
    >
      <div
        class="folder-header"
        @click="toggleFolder(folder.id)"
      >
        <i class="fas fa-chevron-right folder-chevron" />
        <i class="fas fa-folder folder-icon" />
        <span class="folder-name">{{ folder.name }}</span>
        <span class="folder-count">{{ folderIssuesMap[folder.id]?.length || 0 }}</span>
        <span
          v-if="folderUnreadCount(folder.id) > 0"
          class="folder-unread-badge"
        >{{ folderUnreadCount(folder.id) }}</span>
        <button
          class="folder-delete-btn"
          :title="t('delete_folder')"
          @click.stop="removeFolder(folder.id)"
        >
          <i class="fas fa-trash-can" />
        </button>
      </div>

      <!-- Folder body uses the same 0fr → 1fr grid animation as the task
           details panel, so the folder opens smoothly and then keeps growing
           ("double expander") while a task inside expands its history -->
      <div class="folder-body">
        <div class="folder-body-inner">
          <List
            v-if="folderIssuesMap[folder.id]?.length"
            :sorted-issues="folderIssuesMap[folder.id]"
            :current-data="mergedData"
            @select-issue="(issue, index) => emit('select-issue', issue, index)"
            @mark-issue-read="issue => emit('mark-issue-read', issue)"
          />
          <div
            v-else
            class="folder-empty"
          >
            {{ t('folder_empty') }}
          </div>
        </div>
      </div>
    </div>

    <div
      v-if="!foldersData.list.length"
      class="folders-empty"
    >
      <i class="fas fa-folder-open" />
      {{ t('no_folders') }}
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import Utils from '@/utils'
import List from '@/components/popup/List.vue'
import {
  createFolder as createFolderRecord,
  deleteFolder as deleteFolderRecord
} from '@/utils/folders'

const { t } = useI18n()

const props = defineProps({
  foldersData: {
    type: Object,
    required: true
  },
  // Issues from every role, so a folder shows its tasks regardless of the
  // role tab they belong to
  allIssues: {
    type: Array,
    default: () => []
  },
  // Read state merged across roles: List.vue decides unread/read from it
  mergedData: {
    type: Object,
    required: true
  }
})

const emit = defineEmits(['select-issue', 'mark-issue-read'])

const nameInput = ref(null)
const newFolderName = ref('')
const openFolders = ref({})

const isUnread = issue => props.mergedData.unreadList.includes(Utils.getUUID(issue))

const folderIssuesMap = computed(() => {
  const map = {}
  const assignments = props.foldersData.assignments || {}

  for (const issue of props.allIssues) {
    const folderId = assignments[issue.id]

    if (!folderId) {
      continue
    }
    if (!map[folderId]) {
      map[folderId] = []
    }
    map[folderId].push(issue)
  }

  // Unread tasks first, then the most recently updated
  for (const issues of Object.values(map)) {
    issues.sort((a, b) => {
      const aUnread = isUnread(a)
      const bUnread = isUnread(b)

      if (aUnread !== bUnread) {
        return aUnread ? -1 : 1
      }
      return a.updated_on < b.updated_on ? 1 : -1
    })
  }
  return map
})

const folderUnreadCount = folderId =>
  (folderIssuesMap.value[folderId] || []).filter(isUnread).length

const toggleFolder = folderId => {
  openFolders.value[folderId] = !openFolders.value[folderId]
}

const createFolder = async () => {
  const folder = await createFolderRecord(newFolderName.value)

  if (folder) {
    // Open the new folder right away so the user sees where tasks go
    openFolders.value[folder.id] = true
  }
  newFolderName.value = ''
  nameInput.value?.focus()
}

const removeFolder = async folderId => {
  // Deleting only drops the folder itself; its tasks return to the general
  // list because their assignments are cleaned up in utils/folders.js
  await deleteFolderRecord(folderId)
}
</script>

<style lang="scss" scoped>
/* Fluent folder management view: creation row on top, folders as grouped
   collapsible sections reusing the task list inside */
.folders-view {
  background-color: #fff;
}

.folder-create-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-bottom: 1px solid #f3f2f1;
}

.folder-create-icon {
  font-size: 14px;
  color: #0078d4;
  flex-shrink: 0;
}

.folder-create-input {
  flex: 1;
  min-width: 0;
  padding: 5px 10px;
  font-size: 13px;
  font-family: inherit;
  color: #201f1e;
  background-color: #fff;
  border: 1px solid #d1d1d1;
  border-bottom-color: #8a8886;
  border-radius: 4px;
  outline: none;
  transition: border-color 0.1s ease;

  &::placeholder {
    color: #797775;
  }

  &:hover {
    border-color: #8a8886;
  }

  &:focus {
    border-color: #0078d4;
    border-bottom-color: #0078d4;
    box-shadow: 0 1px 0 0 #0078d4 inset;
  }
}

/* Fluent accent button: the primary blue action of the view */
.fluent-accent-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 14px;
  font-size: 13px;
  font-family: inherit;
  color: #fff;
  background-color: #0078d4;
  border: 1px solid transparent;
  border-bottom-color: #005a9e;
  border-radius: 4px;
  cursor: pointer;
  flex-shrink: 0;
  transition: background-color 0.1s ease;

  &:hover:not(:disabled) {
    background-color: #106ebe;
  }

  &:active:not(:disabled) {
    background-color: #005a9e;
  }

  &:disabled {
    opacity: 0.4;
    cursor: default;
  }
}

.folder-container {
  border-bottom: 1px solid #f3f2f1;

  &:last-child {
    border-bottom: none;
  }
}

.folder-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  cursor: pointer;
  user-select: none;
  transition: background-color 0.1s ease;

  &:hover {
    background-color: #f3f2f1;

    .folder-delete-btn {
      opacity: 1;
    }
  }
}

.folder-chevron {
  width: 16px;
  height: 16px;
  font-size: 14px;
  color: #605e5c;
  flex-shrink: 0;
  transition: transform 0.2s cubic-bezier(0.1, 0.9, 0.2, 1);
}

.folder-container.expanded .folder-chevron {
  transform: rotate(90deg);
  color: #0078d4;
}

.folder-icon {
  font-size: 14px;
  color: #0078d4;
  flex-shrink: 0;
}

.folder-name {
  flex: 1;
  min-width: 0;
  font-size: 14px;
  font-weight: 600;
  color: #201f1e;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.folder-count {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  font-size: 11px;
  font-weight: 600;
  line-height: 18px;
  color: #605e5c;
  background-color: #f3f2f1;
  border-radius: 4px;
  flex-shrink: 0;
}

.folder-unread-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 20px;
  height: 20px;
  padding: 0 6px;
  font-size: 11px;
  font-weight: 600;
  color: #fff;
  background-color: #0078d4;
  border-radius: 10px;
  flex-shrink: 0;
}

.folder-delete-btn {
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
  opacity: 0;
  flex-shrink: 0;
  transition: opacity 0.1s ease, background-color 0.1s ease, color 0.1s ease;

  &:hover {
    color: #c42b1c;
    background-color: #fde7e9;
  }

  &:focus-visible {
    opacity: 1;
  }
}

/* Collapsible folder body: animated with a 0fr → 1fr grid row exactly like
   the task details panel. Inside, tasks reuse List.vue with their own
   expandable history, so the folder smoothly grows deeper with it */
.folder-body {
  display: grid;
  grid-template-rows: 0fr;
  background-color: #fafafb;
  transition: grid-template-rows 0.25s cubic-bezier(0.1, 0.9, 0.2, 1);
}

.folder-container.expanded .folder-body {
  grid-template-rows: 1fr;
  border-top: 1px solid #f3f2f1;
}

.folder-body-inner {
  overflow: hidden;
  min-height: 0;
}

.folder-body-inner :deep(.issues-list) {
  padding-left: 12px;
}

.folder-empty {
  padding: 12px 16px 12px 44px;
  font-size: 12px;
  color: #797775;
}

.folders-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 32px 16px;
  font-size: 13px;
  color: #797775;
}
</style>
