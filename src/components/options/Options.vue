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
      v-for="select in selectsTop"
      :key="select.name"
      :label="select.label"
    >
      <MultipleSelect
        v-model="options[select.name]"
        :data="list[select.name]"
        :multiple="!select.single"
      />
    </FormGroup>

    <FormGroup :description="t('projects_subtree_hint')">
      <template #label>
        <FormCheckbox
          v-model="options.allProjects"
          :label="t('all_projects')"
        />
      </template>
      <ProjectTree
        v-model="options.projects"
        :nodes="projectTree"
        :disabled="options.allProjects"
        :search-placeholder="t('projects_search')"
        :empty-text="t('projects_empty')"
      />
    </FormGroup>

    <FormGroup :description="t('trackers_union_hint')">
      <template #label>
        <FormCheckbox
          v-model="options.allTrackers"
          :label="t('all_trackers')"
        />
      </template>
      <MultipleSelect
        v-model="options.trackers"
        :data="trackerOptions"
        :disabled="options.allTrackers"
        multiple
        @change="trackersAuto = false"
      />
    </FormGroup>

    <FormGroup
      v-for="select in selectsBottom"
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

    <FormGroup
      :label="t('notifications_limit')"
      :description="t('notifications_limit_hint')"
    >
      <FormInput
        v-model="options.notifications_limit"
        type="number"
        min="0"
        placeholder="0"
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
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import ProjectTree from '@/components/options/ProjectTree.vue'
import Utils from '@/utils'
import { sendMessage } from '@/utils/messaging'
import { statusColor } from '@/utils/statusColors'

const { t } = useI18n()

const step = ref(0)
const loading = ref(false)
const options = ref({
  url: '',
  key: '',
  // Follow every project the account can see; when false, only the ids in
  // `projects` are monitored
  allProjects: true,
  projects: [],
  issues: [],
  status: [],
  number: 50,
  // Track every tracker; when false, only the ids in `trackers` are
  allTrackers: true,
  trackers: [],
  interval: 10,
  tooltip_limit: 200,
  group_notifications: false,
  // Max journal entries shown in an expanded task's notification panel;
  // 0 keeps the full list
  notifications_limit: 0,
  // User-picked status badge colors, { [statusId]: '#rrggbb' }; statuses
  // without an entry keep their automatic color
  statusColors: {},
  notify: true,
  notify_status: []
})
const list = ref({
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
const selectsTop = [
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
  }
]
const selectsBottom = [
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

// Projects loaded as a tree (only the ones visible to this account) plus
// the id → node map the monitored set is computed from
const projectTree = ref([])
const projectNodes = ref(new Map())
// Every tracker enabled in at least one visible project, in tree order;
// each option remembers the projects that enable it
const allTrackerOptions = ref([])

// Ids the extension effectively monitors: every visible project, or the
// selected ids with their whole subtrees (in Redmine a parent project
// already rolls its subprojects' issues in)
const effectiveProjectIds = computed(() => {
  if (options.value.allProjects) {
    return new Set(projectNodes.value.keys())
  }

  const ids = new Set()
  const collect = node => {
    ids.add(node.id)
    node.children.forEach(collect)
  }

  for (const id of options.value.projects) {
    const node = projectNodes.value.get(id)

    if (node) {
      collect(node)
    }
  }
  return ids
})

// Combobox contents: with the master checkbox on, "all trackers" shows
// the union over every visible project and stays put while projects are
// being picked; manual mode narrows the list to the monitored projects
const trackerOptions = computed(() => {
  const scope = options.value.allTrackers ?
    new Set(projectNodes.value.keys()) : effectiveProjectIds.value

  return allTrackerOptions.value.filter(it =>
    it.projectIds.some(id => scope.has(id)))
})

// Until the user edits the tracker selection by hand, it mirrors the
// monitored union — growing and shrinking with the picked projects;
// a hand edit turns it into a fixed pick set that only loses trackers
// which fall out of the union (a fully emptied one refills, so the
// manual mode never ends up blocked)
let trackersAuto = true

const applyTrackerScope = () => {
  const available = trackerOptions.value.map(it => it.value)

  if (!available.length) {
    return
  }
  if (trackersAuto) {
    options.value.trackers = available
    return
  }
  const availableSet = new Set(available)
  const kept = options.value.trackers.filter(id => availableSet.has(id))

  options.value.trackers = kept.length ? kept : available
}

// Project changes only matter in manual mode: with the master checkbox
// on nothing gets picked, so the disabled box must not fill itself
watch(effectiveProjectIds, () => {
  if (!options.value.allTrackers) {
    applyTrackerScope()
  }
})

// Leaving "all trackers" starts from the monitored union fully checked;
// returning to it clears the picks — "all" needs no selection
watch(() => options.value.allTrackers, all => {
  if (all) {
    options.value.trackers = []
  } else {
    trackersAuto = true
    applyTrackerScope()
  }
})

const saveEnable = computed(() => {
  if (!options.value.allProjects && options.value.projects.length === 0) {
    return false
  }
  if (!options.value.allTrackers && options.value.trackers.length === 0) {
    return false
  }
  return Object.entries(options.value).every(([key, it]) => {
    if (key === 'projects' || key === 'trackers') {
      return true
    }
    if (Array.isArray(it)) {
      return it.length > 0
    }
    return true
  })
})

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

    // One paginated call gives both the project hierarchy and the
    // trackers enabled in every visible project
    const projects = await Utils.getAPIAll(savedOptions, 'projects', { include: 'trackers' })
    const nodes = new Map()

    for (const project of projects) {
      nodes.set(project.id, {
        id: project.id,
        name: project.name,
        children: []
      })
    }
    const roots = []

    for (const project of projects) {
      const node = nodes.get(project.id)
      // A parent the account cannot see is missing from the map, so the
      // subproject simply becomes a root
      const parent = project.parent ? nodes.get(project.parent.id) : null

      if (parent && parent !== node) {
        parent.children.push(node)
      } else {
        roots.push(node)
      }
    }
    projectTree.value = roots
    projectNodes.value = nodes

    const trackerChoices = []
    const trackerIndex = new Map()

    for (const project of projects) {
      for (const tracker of project.trackers || []) {
        if (!trackerIndex.has(tracker.id)) {
          const option = { value: tracker.id, text: tracker.name, projectIds: [] }

          trackerIndex.set(tracker.id, option)
          trackerChoices.push(option)
        }
        trackerIndex.get(tracker.id).projectIds.push(project.id)
      }
    }
    allTrackerOptions.value = trackerChoices

    // Missing fields mean options saved before the filters existed: keep
    // monitoring everything, as before
    options.value.allProjects = savedOptions.allProjects ?? true
    options.value.allTrackers = savedOptions.allTrackers ?? true

    // Drop saved ids that no longer exist: project or tracker removed,
    // or access to it lost. A saved selection only matters in manual
    // mode — with the master checkbox on there is nothing to pick; a
    // selection narrower than the union is a hand-made pick set
    options.value.projects = (savedOptions.projects || []).filter(id => nodes.has(id))
    const visibleTrackerIds = new Set(trackerChoices.map(it => it.value))
    const savedTrackers = (savedOptions.trackers || []).filter(id => visibleTrackerIds.has(id))

    if (options.value.allTrackers) {
      options.value.trackers = []
    } else {
      const available = trackerOptions.value.map(it => it.value)
      const availableSet = new Set(available)
      const kept = savedTrackers.filter(id => availableSet.has(id))

      options.value.trackers = kept.length ? kept : available
      // Nothing hand-picked survives (or everything is picked): let the
      // selection mirror the union as projects change
      trackersAuto = kept.length === 0 || kept.length === available.length
    }

    options.value.issues = savedOptions.issues || list.value.issues.map(it => it.value)

    list.value.status = toList(await Utils.getAPI(savedOptions, 'issue_statuses'))
    options.value.status = savedOptions.status || [list.value.status[0].value]

    options.value.number = savedOptions.number || options.value.number

    options.value.interval = savedOptions.interval || options.value.interval
    // 0 means "no truncation", so the fallback must not treat it as empty
    options.value.tooltip_limit = savedOptions.tooltip_limit ?? options.value.tooltip_limit
    // 0 means "show all", so the fallback must not treat it as empty either
    options.value.notifications_limit = savedOptions.notifications_limit ?? options.value.notifications_limit
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
  // The limit is a free-form number input: empty/negative values mean "all"
  const limit = parseInt(options.value.notifications_limit, 10)

  options.value.notifications_limit = Number.isFinite(limit) && limit > 0 ? limit : 0

  // A different server (address or API key) invalidates everything derived
  // from the old one: read state would leak "the past" across servers, and
  // journal_cache is keyed by the bare issue id, so ids of two servers
  // collide and would serve each other's journals. Folders stay — they are
  // user data. The next poll gives the new server its own first-connect
  // baseline
  const savedOptions = await Utils.getStorage('options')

  if (!savedOptions || savedOptions.url !== options.value.url ||
      savedOptions.key !== options.value.key) {
    await Utils.removeStorage(['data', 'journal_cache', 'tooltip_cache'])
  }

  // Keep the full status/tracker name lists so the popup can translate
  // ids into names in the last-change tooltip; the tracker list is the
  // union over visible projects, exactly the set issues can come from
  await Utils.setStorage('options', {
    ...options.value,
    statusList: list.value.status,
    trackerList: allTrackerOptions.value.map(({ value, text }) => ({ value, text }))
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
