<template>
  <div class="pr">
    <div class="d-flex align-items-center">
      <Button
        v-if="unreadCount > 0"
        type="primary"
        icon="fas fa-check"
        size="sm"
        outline
        class="mark-all me-2"
        @click="markAllRead"
      >
        {{ t('mark_all_read') }}
      </Button>

      <div class="ms-auto d-flex align-items-center">
        <!-- Filter button -->
        <Button
          type="link"
          size="sm"
          icon="fas fa-filter"
          class="filter-btn"
          :title="t('filter_issues')"
          @click="toggleFilter"
        />

        <!-- Sort dropdown button -->
        <Dropdown
          is-link
          icon="fas fa-sort-amount-down"
          :toggle-icon="false"
          class="order-by"
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
    </div>

    <!-- Filter bar that appears in the top right corner -->
    <transition name="filter-bar">
      <div
        v-show="isFilterOpen"
        class="filter-bar-container border rounded-2 shadow"
      >
        <FormInput
          ref="filterInput"
          v-model="filterQuery"
          size="sm"
          class="filter-input"
          :placeholder="t('filter_issues')"
          @input="updateFilter"
        />
        <Button
          type="link"
          size="sm"
          icon="fas fa-times"
          :title="t('clear_filter')"
          class="clear-btn"
          @click="clearFilter"
        />
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

<style scoped>
.mark-all {
  color: var(--bs-primary) !important;
  width: 100%;
  padding: 0;
}

.filter-bar-container {
  position: absolute;
  width: 300px;
  top: 100%;
  right: 0;
  background-color: white;
  padding: 0.5rem;
  z-index: 100;
}

.clear-btn {
  position: absolute;
  right: 5px;
  top: 50%;
  transform: translateY(-50%);
}
</style>
