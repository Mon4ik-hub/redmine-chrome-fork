<template>
  <div
    v-if="roles.length > 1 || foldersTab"
    class="fluent-pivot"
    role="tablist"
  >
    <div
      v-for="(role, index) in roles"
      :key="role"
      class="pivot-item"
      :class="{ active: !foldersActive && index === roleIndex }"
      role="tab"
      :aria-selected="!foldersActive && index === roleIndex"
      :tabindex="!foldersActive && index === roleIndex ? 0 : -1"
      @click="emit('role-change', index)"
      @keydown.enter.prevent="emit('role-change', index)"
    >
      <span>{{ t(`roles_${role}`) }}</span>
      <div
        v-if="getRoleIssueCount(role) > 0"
        class="pivot-badge"
        :class="{ neutral: getRoleUnreadCount(role) === 0 }"
      >
        {{ getRoleUnreadCount(role) > 0 ? getRoleUnreadCount(role) : getRoleIssueCount(role) }}
      </div>
    </div>
    <div
      v-if="foldersTab"
      class="pivot-item"
      :class="{ active: foldersActive }"
      role="tab"
      :aria-selected="foldersActive"
      :tabindex="foldersActive ? 0 : -1"
      @click="emit('folders-activate')"
      @keydown.enter.prevent="emit('folders-activate')"
    >
      <i class="pivot-icon far fa-folder" />
      <span>{{ t('folders') }}</span>
      <div
        v-if="foldersTaskCount > 0"
        class="pivot-badge"
        :class="{ neutral: foldersUnread === 0 }"
      >
        {{ foldersUnread > 0 ? foldersUnread : foldersTaskCount }}
      </div>
    </div>
  </div>
</template>

<script setup>
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

const props = defineProps({
  roles: {
    type: Array,
    required: true
  },
  roleIndex: {
    type: Number,
    required: true
  },
  data: {
    type: Object,
    required: true
  },
  foldersTab: {
    type: Boolean,
    default: false
  },
  foldersActive: {
    type: Boolean,
    default: false
  },
  // Tasks placed into folders (badge on the "Папки" tab)
  foldersTaskCount: {
    type: Number,
    default: 0
  },
  foldersUnread: {
    type: Number,
    default: 0
  }
})

const emit = defineEmits(['role-change', 'folders-activate'])

const getRoleIssueCount = role => props.data[role]?.issues?.length || 0

const getRoleUnreadCount = role => props.data[role]?.unreadList?.length || 0
</script>

<style lang="scss" scoped>
/* Fluent Pivot per the user's tabs.html mockup: compact 13px tabs on a
   white strip, count shown as a single badge — blue when the tab has
   unread items, neutral gray otherwise (no "garland" of blue badges).
   The active tab is near-black + 600 weight with a thin blue underline */
.fluent-pivot {
  display: flex;
  gap: 2px;
  padding: 0 4px;
  background-color: #ffffff;
  border-bottom: 1px solid #f3f2f1;
}

.pivot-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 12px 10px;
  font-size: 13px;
  font-weight: 400;
  color: #605e5c;
  cursor: pointer;
  position: relative;
  user-select: none;
  border-radius: 4px;
  transition: color 0.1s ease, background-color 0.1s ease;

  &:hover {
    color: #201f1e;
    background-color: #f3f2f1;

    .pivot-icon {
      color: #201f1e;
    }

    .pivot-badge.neutral {
      background-color: #edebe9;
      color: #201f1e;
    }
  }

  &.active {
    font-weight: 600;
    color: #201f1e;
    background-color: transparent;

    .pivot-icon {
      color: #0078d4;
    }

    &::after {
      content: "";
      position: absolute;
      bottom: 0;
      left: 10px;
      right: 10px;
      height: 2px;
      background-color: #0078d4;
      border-radius: 1px;
    }
  }
}

.pivot-icon {
  font-size: 14px;
  color: #605e5c;
}

.pivot-badge {
  display: flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  min-width: 18px;
  height: 18px;
  padding: 0 4px;
  font-size: 11px;
  font-weight: 600;
  color: #ffffff;
  background-color: #0078d4;
  border-radius: 10px;
  flex-shrink: 0;

  &.neutral {
    background-color: #f3f2f1;
    color: #605e5c;
  }
}
</style>
