<template>
  <span
    v-if="status"
    class="badge status-badge"
    :style="{ backgroundColor: color }"
  >{{ status.name }}</span>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { getClosedStatusIds, statusColor } from '@/utils/statusColors'

const props = defineProps({
  status: {
    type: Object,
    default: null
  },
  options: {
    type: Object,
    default: () => ({})
  }
})

// Closed statuses are muted; resolved on demand because it needs one API
// request, shared and cached across all badges by statusColors.js
const isClosed = ref(false)

watch(
  () => [props.options.url, props.options.key, props.status?.id],
  async ([url, key, statusId]) => {
    if (!url || !key || statusId === undefined) {
      return
    }
    isClosed.value = (await getClosedStatusIds(props.options)).has(statusId)
  },
  { immediate: true }
)

// A color picked by the user in the options beats every automatic rule
const color = computed(() => props.options.statusColors?.[props.status?.id] ||
  statusColor(props.status?.name, isClosed.value))
</script>

<style scoped>
.status-badge {
  font-weight: 500;
}
</style>
