<template>
  <Form v-if="step === 0">
    <FormGroup :label="t('redmine_list')">
      <FormInput
        v-model="options.url"
        placeholder="https://demo.redmine.org"
      />
    </FormGroup>
    <FormGroup
      :label="t('redmine_api_key')"
      :help="options.url ? t('get_api_key_help') : ''"
      help-is-link
      @help-click="openMyAccount"
    >
      <FormInput
        v-model="options.key"
        type="password"
      />
    </FormGroup>
    <FormGroup>
      <Button
        type="primary"
        icon="fa fa-arrow-right"
        :disabled="!options.url || !options.key"
        :loading="loading"
        @click="onNext"
      >
        {{ t('step_next') }}
      </Button>
    </FormGroup>
  </Form>

  <Form v-if="step === 1">
    <FormGroup :label="t('redmine_list')">
      <FormInput
        v-model="options.url"
        disabled
      />
    </FormGroup>

    <FormGroup
      v-for="select in selects"
      :key="select.name"
      :label="select.label"
    >
      <template #label>
        <FormCheckbox
          v-if="select.name === 'notify_status'"
          v-model="options.notify"
          :label="t('desktop_notify')"
        />
        <span v-else>{{ select.label }}</span>
      </template>
      <MultipleSelect
        v-model="options[select.name]"
        :data="list[select.name]"
        :multiple="!select.single"
      />
    </FormGroup>

    <FormGroup>
      <FormCheckbox
        v-model="options.group_notifications"
        :label="t('group_notifications')"
      />
    </FormGroup>

    <FormGroup :label="t('status_colors')">
      <div class="status-colors">
        <div
          v-for="statusItem in list.status"
          :key="statusItem.value"
          class="status-color-row"
        >
          <span
            class="badge status-color-badge"
            :style="{ backgroundColor: statusColorOf(statusItem) }"
          >{{ statusItem.text }}</span>
          <input
            type="color"
            :value="statusColorOf(statusItem)"
            @input="setStatusColor(statusItem, $event.target.value)"
          >
          <span
            class="status-color-source"
            :class="{ 'is-custom': options.statusColors[statusItem.value] }"
          >{{ options.statusColors[statusItem.value] ? t('status_colors_custom') : t('status_colors_auto') }}</span>
          <button
            v-if="options.statusColors[statusItem.value]"
            type="button"
            class="btn btn-link status-color-reset"
            :title="t('status_colors_reset')"
            @click="resetStatusColor(statusItem)"
          >
            <i class="fas fa-rotate-left" />
          </button>
        </div>
      </div>
      <button
        v-if="hasCustomStatusColors"
        type="button"
        class="btn btn-sm btn-outline-secondary mt-2"
        @click="options.statusColors = {}"
      >
        {{ t('status_colors_reset_all') }}
      </button>
    </FormGroup>

    <FormGroup>
      <Button
        class="mr10"
        icon="fa fa-arrow-left"
        @click="step--"
      >
        {{ t('step_previous') }}
      </Button>
      <Button
        type="primary"
        icon="fa fa-save"
        :disabled="!saveEnable"
        @click="save"
      >
        {{ t('save_your_changes') }}
      </button>
    </FormGroup>
  </Form>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import Utils from '@/utils'
import { sendMessage } from '@/utils/messaging'
import { statusColor } from '@/utils/statusColors'

const { t } = useI18n()

const step = ref(0)
const loading = ref(false)
const options = ref({
  url: '',
  key: '',
  // projects: [],
  issues: [],
  status: [],
  number: 50,
  trackers: [],
  interval: 10,
  tooltip_limit: 200,
  group_notifications: false,
  // User-picked status badge colors, { [statusId]: '#rrggbb' }; statuses
  // without an entry keep their automatic color
  statusColors: {},
  notify: true,
  notify_status: []
})
const list = ref({
  // projects: [],
  issues: [
    {
      value: 'assigned_to_id',
      text: t('roles_assigned_to_id')
    },
    {
      value: 'author_id',
      text: t('roles_author_id')
    },
    {
      value: 'watcher_id',
      text: t('roles_watcher_id')
    }
  ],
  status: [],
  number: [25, 50, 100],
  trackers: [],
  interval: [
    {
      value: 1,
      text: t('minutes_1')
    },
    {
      value: 5,
      text: t('minutes_5')
    },
    {
      value: 10,
      text: t('minutes_10')
    },
    {
      value: 20,
      text: t('minutes_20')
    },
    {
      value: 30,
      text: t('minutes_30')
    },
    {
      value: 60,
      text: t('hours_1')
    }
  ],
  tooltip_limit: [
    {
      value: 100,
      text: '100'
    },
    {
      value: 200,
      text: '200'
    },
    {
      value: 500,
      text: '500'
    },
    {
      value: 1000,
      text: '1000'
    },
    {
      value: 0,
      text: t('tooltip_full')
    }
  ],
  notify_status: []
})
const selects = [
  // {
  //   label: t('projects_list'),
  //   name: 'projects'
  // },
  {
    label: t('issues_list'),
    name: 'issues'
  },
  {
    label: t('issue_status'),
    name: 'status'
  },
  {
    label: t('issue_number'),
    name: 'number',
    single: true
  },
  {
    label: t('trackers_list'),
    name: 'trackers'
  },
  {
    label: t('update_interval'),
    name: 'interval',
    single: true
  },
  {
    label: t('tooltip_limit'),
    name: 'tooltip_limit',
    single: true
  },
  {
    name: 'notify_status'
  }
]

const saveEnable = computed(() => Object.values(options.value).every(it => {
  if (Array.isArray(it)) {
    return it.length > 0
  }
  return true
}))

// isClosed is kept so the color editor can show the same automatic muted
// color the popup uses for closed statuses
const toList = items => items.map(it => ({ value: it.id, text: it.name, isClosed: it.is_closed }))

// The color a status badge has right now: the user's pick if set, otherwise
// the automatic one (known-name semantic color, muted gray when the status
// is closed, stable palette color for custom names)
const statusColorOf = statusItem => options.value.statusColors[statusItem.value] ||
  statusColor(statusItem.text, statusItem.isClosed)

const setStatusColor = (statusItem, color) => {
  options.value.statusColors[statusItem.value] = color
}

const resetStatusColor = statusItem => {
  delete options.value.statusColors[statusItem.value]
}

const hasCustomStatusColors = computed(() => Object.keys(options.value.statusColors).length > 0)
const getData = async savedOptions => {
  loading.value = true

  try {
    options.value.url = savedOptions.url
    options.value.key = savedOptions.key

    // list.value.projects = toList(await Utils.getAPI(savedOptions, 'projects'))
    // options.value.projects = savedOptions.projects || list.value.projects.map(it => it.value)

    options.value.issues = savedOptions.issues || list.value.issues.map(it => it.value)

    list.value.status = toList(await Utils.getAPI(savedOptions, 'issue_statuses'))
    options.value.status = savedOptions.status || [list.value.status[0].value]

    options.value.number = savedOptions.number || options.value.number

    list.value.trackers = toList(await Utils.getAPI(savedOptions, 'trackers'))
    options.value.trackers = savedOptions.trackers || list.value.trackers.map(it => it.value)

    options.value.interval = savedOptions.interval || options.value.interval
    // 0 means "no truncation", so the fallback must not treat it as empty
    options.value.tooltip_limit = savedOptions.tooltip_limit ?? options.value.tooltip_limit
    options.value.group_notifications = savedOptions.group_notifications ?? options.value.group_notifications
    options.value.statusColors = savedOptions.statusColors || {}
    options.value.notify = savedOptions.notify || options.value.notify

    list.value.notify_status = list.value.status
    options.value.notify_status = savedOptions.notify_status || [list.value.notify_status[0].value]

    step.value += 1
  } catch (e) {
    console.error(e)
    window.alert(t('settings_error'))
  }
  loading.value = false
}
const onNext = () => {
  getData({
    url: options.value.url,
    key: options.value.key
  })
}
const save = async () => {
  // Keep the full status/tracker name lists so the popup can translate
  // ids into names in the last-change tooltip
  await Utils.setStorage('options', {
    ...options.value,
    statusList: list.value.status,
    trackerList: list.value.trackers
  })
  // Notify background service worker to refresh
  try {
    const response = await sendMessage('OPTIONS_SAVED')

    if (response?.success) {
      window.alert(t('save_successful'))
    }
  } catch (error) {
    console.error('Failed to send message to background:', error)
    window.alert(t('save_error'))
  }
}

const openMyAccount = () => {
  window.open(`${options.value.url}/my/account`, '_blank')
}

onMounted(async () => {
  const savedOptions = await Utils.getStorage('options') || {}

  if (savedOptions.url && savedOptions.key) {
    await getData(savedOptions)
  }
})
</script>

<style scoped>
.status-colors {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 16px;
  max-height: 300px;
  overflow-y: auto;
}

.status-color-row {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  width: calc(50% - 8px);
  min-width: 260px;
}

.status-color-badge {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.status-color-row input[type='color'] {
  flex: 0 0 auto;
  width: 34px;
  height: 24px;
  padding: 0;
  border: 1px solid var(--bs-border-color);
  border-radius: 4px;
  background: none;
  cursor: pointer;
}

.status-color-source {
  flex: 0 0 auto;
  min-width: 42px;
  font-size: 11px;
  color: #6c757d;
}

.status-color-source.is-custom {
  color: #0d6efd;
}

.status-color-reset {
  flex: 0 0 auto;
  padding: 0;
  font-size: 12px;
}
</style>
