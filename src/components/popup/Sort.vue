<template>
  <div class="fluent-commandbar pr">
    <button
      v-if="unreadCount > 0"
      class="fluent-btn"
      @click="markAllRead"
    >
      <i class="fas fa-check" /> {{ t('mark_all_read') }}
    </button>

    <div class="commandbar-actions">
      <!-- Filter button -->
      <button
        class="fluent-icon-btn"
        :class="{ active: isFilterOpen }"
        :title="t('filter_issues')"
        @click="toggleFilter"
      >
        <i class="fas fa-filter" />
      </button>

      <!-- Sort dropdown button -->
      <Dropdown
        is-link
        icon="fas fa-sort-amount-down"
        :toggle-icon="false"
        class="order-by"
        :popper-config="{ strategy: 'fixed' }"
      >
        <DropdownItem
          :active="order === 'default'"
          @click="setOrder('default')"
        >
          <i class="fas fa-heart" /> {{ t('order_by_default') }}
        </DropdownItem>
        <DropdownItem
          :active="order === 'priority.id'"
          @click="setOrder('priority.id')"
        >
          <i class="fas fa-arrow-down" /> {{ t('order_by_priority') }}
        </DropdownItem>
        <DropdownItem
          :active="order === 'updated_on'"
          @click="setOrder('updated_on')"
        >
          <i class="fas fa-arrow-down" /> {{ t('order_by_updated') }}
        </DropdownItem>
        <DropdownItem
          :active="order === 'created_on'"
          @click="setOrder('created_on')"
        >
          <i class="fas fa-arrow-down" /> {{ t('order_by_created') }}
        </DropdownItem>
      </Dropdown>
    </div>

    <!-- Filter bar that appears in the top right corner -->
    <transition name="filter-bar">
      <div
        v-show="isFilterOpen"
        class="filter-bar-container"
      >
        <i class="fas fa-search filter-search-icon" />
        <input
          ref="filterInput"
          v-model="filterQuery"
          class="filter-input"
          type="text"
          :placeholder="t('filter_issues')"
          @input="updateFilter"
        >
        <button
          class="fluent-icon-btn filter-clear-btn"
          :title="t('clear_filter')"
          @click="clearFilter"
        >
          <i class="fas fa-times" />
        </button>
      </div>
    </transition>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import Dropdown from '@/components/components/Dropdown.vue'
import DropdownItem from '@/components/components/DropdownItem.vue'

const { t } = useI18n()

defineProps({
  order: {
    type: String,
    default: 'default'
  },
  unreadCount: {
    type: Number,
    default: 0
  }
})

const emit = defineEmits(['order-change', 'mark-all-read', 'filter-change'])

const isFilterOpen = ref(false)
const filterQuery = ref('')
const filterInput = ref(null)
const filterTimeout = ref(null)

const setOrder = newOrder => {
  emit('order-change', newOrder)
}

const markAllRead = () => {
  emit('mark-all-read')
}

const toggleFilter = () => {
  isFilterOpen.value = !isFilterOpen.value
  // Auto focus when filter opens
  if (isFilterOpen.value && filterInput.value) {
    setTimeout(() => {
      filterInput.value.focus()
    }, 50)
  }
}

const updateFilter = () => {
  if (filterTimeout.value) {
    clearTimeout(filterTimeout.value)
  }
  filterTimeout.value = setTimeout(() => {
    emit('filter-change', filterQuery.value)
  }, 500)
}

const clearFilter = () => {
  // Clear timeout to avoid delayed emission when clearing filter
  if (filterTimeout.value) {
    clearTimeout(filterTimeout.value)
    filterTimeout.value = null
  }
  filterQuery.value = ''
  emit('filter-change', '') // Emit immediately when clearing filter
  if (filterInput.value) {
    filterInput.value.focus()
  }
}

// Clear filter when closing
watch(isFilterOpen, newVal => {
  if (!newVal) {
    filterQuery.value = ''
    emit('filter-change', '')
  }
})
</script>

<style lang="scss" scoped>
/* Fluent command bar between the pivot and the list */
.fluent-commandbar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  background-color: #fff;
  border-bottom: 1px solid #f3f2f1;
  flex-shrink: 0;
}

.commandbar-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-left: auto;
}

.fluent-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 12px;
  font-size: 12px;
  font-family: inherit;
  color: #201f1e;
  background-color: transparent;
  border: 1px solid #d1d1d1;
  border-radius: 4px;
  cursor: pointer;
  transition: background-color 0.1s ease;

  &:hover {
    background-color: #f3f2f1;
  }

  &:active {
    background-color: #edebe9;
  }
}

.fluent-icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  font-size: 13px;
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

  &.active {
    color: #005a9e;
    background-color: #e5f1fb;
  }
}

/* The sort dropdown renders its toggle as a plain <a>: give it the same
   icon-button look as the filter button, its menu a Fluent flyout */
.order-by {
  /* Direct child only: without `>` this cascade also hits the menu item
     anchors and squeezes them to the 28px toggle box, pushing their labels
     outside the menu panel to the left */
  > :deep(a) {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    font-size: 13px;
    color: #605e5c;
    border-radius: 4px;
    transition: background-color 0.1s ease, color 0.1s ease;

    &:hover {
      color: #201f1e;
      background-color: #edebe9;
    }
  }

  &:deep(.dropdown-menu) {
    min-width: 190px;
    padding: 4px;
    font-size: 13px;
    color: #201f1e;
    background-color: #fff;
    border: 1px solid #e0e0e0;
    border-radius: 8px;
    box-shadow: 0 8px 16px rgba(0, 0, 0, 0.14);
  }

  :deep(.dropdown-item) {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 10px;
    border-radius: 4px;
    color: #201f1e;

    &:hover {
      background-color: #f3f2f1;
    }

    &.active {
      font-weight: 600;
      color: #005a9e;
      background-color: #e5f1fb;
    }
  }
}

/* Filter flyout */
.filter-bar-container {
  position: absolute;
  display: flex;
  align-items: center;
  width: 280px;
  top: calc(100% + 4px);
  right: 8px;
  padding: 2px 4px 2px 10px;
  background-color: #fff;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  box-shadow: 0 8px 16px rgba(0, 0, 0, 0.14);
  z-index: 100;
}

.filter-search-icon {
  font-size: 12px;
  color: #797775;
}

.filter-input {
  flex: 1;
  min-width: 0;
  padding: 6px 8px;
  font-size: 13px;
  font-family: inherit;
  color: #201f1e;
  background-color: transparent;
  border: none;
  outline: none;

  &::placeholder {
    color: #797775;
  }
}

.filter-clear-btn {
  width: 24px;
  height: 24px;
  font-size: 12px;
}

.filter-bar-enter-active,
.filter-bar-leave-active {
  transition: opacity 0.15s ease, transform 0.15s ease;
}

.filter-bar-enter-from,
.filter-bar-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
</style>
