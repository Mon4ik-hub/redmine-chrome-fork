<template>
  <div class="issue-detail">
    <div class="detail-header">
      <button
        class="btn btn-link close"
        :title="t('go_back')"
        @click="closeDetail"
      >
        <i class="fas fa-arrow-left" />
      </button>
      <div class="title">
        <button
          class="btn btn-sm btn-link p-0 me-2"
          :title="t('copy_issue_id')"
          @click="Utils.copyIssueId(selectedIssue.id)"
        >
          <i class="fas fa-copy" />
        </button>
        <a
          :href="`${options.url}/issues/${selectedIssue.id}`"
          target="_blank"
        >
          {{ selectedIssue.tracker?.name }} #{{ selectedIssue.id }}: {{ selectedIssue.subject }}
        </a>
      </div>
      <hr>
      <div class="row">
        <div class="col-6">
          <div>
            <strong>{{ t('status') }}:</strong>
            <StatusBadge
              :status="selectedIssue.status"
              :options="options"
              class="ms-1"
            />
          </div>
          <div><strong>{{ t('priority') }}:</strong> {{ selectedIssue.priority?.name }}</div>
        </div>
        <div class="col-6">
          <div><strong>{{ t('assigned_to') }}:</strong> {{ selectedIssue.assigned_to?.name }}</div>
          <div><strong>{{ t('author') }}:</strong> {{ selectedIssue.author?.name }}</div>
        </div>
      </div>
    </div>

    <div class="desc">
      <h5>{{ t('description') }}</h5>
      <div
        class="desc-detail"
        v-html="convertedDescription"
      />
    </div>

    <hr>
    <div
      class="history"
      v-html="history"
    />
  </div>
</template>

<script setup>
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import Utils from '@/utils'
import StatusBadge from '@/components/popup/StatusBadge.vue'
import { getIssueDetail } from '@/utils/changes'

const { t } = useI18n()

const props = defineProps({
  selectedIssue: {
    type: Object,
    required: true
  },
  options: {
    type: Object,
    required: true
  }
})

const emit = defineEmits(['close-detail'])

const fullIssueData = ref({})
const convertedDescription = ref('')
const history = ref('')

const loadIssueDetail = async issue => {
  try {
    const result = await getIssueDetail(props.options, issue)

    fullIssueData.value = result

    if (result.description) {
      convertedDescription.value = result.description
    }

    // 处理历史记录
    if (result.journals) {
      history.value = result.journals.map(journal =>
        `<div class="journal">
          <div class="journal-header">
            <strong>${journal.user?.name || 'Unknown'}</strong>
            <small>${new Date(journal.created_on).toLocaleString()}</small>
          </div>
          <div class="journal-notes">${journal.notes || ''}</div>
        </div>`
      ).join('')
    }
  } catch (error) {
    console.error('Failed to load issue detail:', error)
  }
}

watch(() => props.selectedIssue, async newIssue => {
  if (newIssue && newIssue.id) {
    await loadIssueDetail(newIssue)
  }
}, { immediate: true })

const closeDetail = () => {
  emit('close-detail')
}
</script>

<style scoped>
.issue-detail {
  padding: 15px;
}

.detail-header {
  position: sticky;
  top: 0;
  background: white;
  z-index: 10;
  padding-bottom: 10px;
}

.desc-detail {
  max-height: 300px;
  overflow-y: auto;
}

.close {
  background: none;
  border: none;
  font-size: 1.2em;
  cursor: pointer;
}

.title {
  display: flex;
  align-items: center;
}
</style>
