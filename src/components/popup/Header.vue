<template>
  <div
    v-if="roles.length > 1"
    class="fluent-pivot"
    role="tablist"
  >
    <div
      v-for="(role, index) in roles"
      :key="role"
      class="pivot-item"
      :class="{ active: index === roleIndex }"
      role="tab"
      :aria-selected="index === roleIndex"
      :tabindex="index === roleIndex ? 0 : -1"
      @click="emit('role-change', index)"
      @keydown.enter.prevent="emit('role-change', index)"
    >
      {{ t(`roles_${role}`) }} ({{ getRoleIssueCount(role) }})
      <span
        v-if="getRoleUnreadCount(role) > 0"
        class="pivot-badge"
      >{{ getRoleUnreadCount(role) }}</span>
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
  }
})

const emit = defineEmits(['role-change'])

const getRoleIssueCount = role => props.data[role]?.issues?.length || 0

const getRoleUnreadCount = role => props.data[role]?.unreadList?.length || 0
</script>

<style lang="scss" scoped>
/* Fluent Pivot navigation: light gray strip, the selected tab is blue
   with a 2px underline, as in the Windows 11 flyout mockups */
.fluent-pivot {
  display: flex;
  background-color: #fafafb;
  border-bottom: 1px solid #eaeaea;
  padding: 0 12px;
}

.pivot-item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 12px 16px;
  font-size: 14px;
  font-weight: 400;
  color: #323130;
  cursor: pointer;
  position: relative;
  user-select: none;
  transition: background-color 0.1s ease, color 0.1s ease;

  &:hover {
    color: #201f1e;
    background-color: #f3f2f1;
  }

  &.active {
    font-weight: 600;
    color: #0078d4;

    &::after {
      content: "";
      position: absolute;
      bottom: 0;
      left: 16px;
      right: 16px;
      height: 2px;
      background-color: #0078d4;
      border-radius: 1px;
    }
  }
}

.pivot-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  font-size: 11px;
  font-weight: 600;
  color: #fff;
  background-color: #0078d4;
  border-radius: 9px;
}
</style>
