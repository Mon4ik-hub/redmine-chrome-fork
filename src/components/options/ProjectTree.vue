<template>
  <div
    class="project-tree"
    :class="{ 'is-disabled': disabled }"
  >
    <input
      v-model="search"
      type="search"
      class="form-control form-control-sm project-tree-search"
      :placeholder="searchPlaceholder"
    >
    <div class="project-tree-list">
      <div
        v-if="!rows.length"
        class="project-tree-empty"
      >
        {{ emptyText }}
      </div>
      <div
        v-for="row in rows"
        :key="row.node.id"
        class="project-tree-row"
        :style="{ paddingLeft: `${row.depth * 18 + 4}px` }"
      >
        <button
          v-if="row.node.children.length"
          type="button"
          class="project-tree-caret"
          :class="{ 'is-open': row.expanded }"
          :title="row.expanded ? collapseTitle : expandTitle"
          @click="toggleExpand(row.node.id)"
        >
          <i class="fas fa-chevron-right" />
        </button>
        <span
          v-else
          class="project-tree-caret project-tree-caret-leaf"
        />
        <input
          type="checkbox"
          class="form-check-input"
          :checked="row.checked"
          :indeterminate="row.indeterminate"
          :disabled="disabled"
          @change="toggle(row.node, $event.target.checked)"
        >
        <span
          class="project-tree-name"
          :title="row.node.name"
        >{{ row.node.name }}</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'

const props = defineProps({
  // `v-model`: selected project ids
  modelValue: {
    type: Array,
    default: () => []
  },
  // Tree nodes: [{ id, name, children: [...] }]
  nodes: {
    type: Array,
    default: () => []
  },
  disabled: {
    type: Boolean,
    default: false
  },
  searchPlaceholder: {
    type: String,
    default: ''
  },
  emptyText: {
    type: String,
    default: ''
  },
  expandTitle: {
    type: String,
    default: ''
  },
  collapseTitle: {
    type: String,
    default: ''
  }
})

const emit = defineEmits(['update:modelValue'])

const search = ref('')
// Ids of nodes whose children are shown; every branch starts expanded
const expanded = ref(new Set())

watch(() => props.nodes, nodes => {
  const ids = new Set()

  const walk = list => {
    for (const node of list) {
      if (node.children.length) {
        ids.add(node.id)
        walk(node.children)
      }
    }
  }

  walk(nodes)
  expanded.value = ids
}, { immediate: true })

const descendantIds = node => {
  const ids = []

  const walk = list => {
    for (const child of list) {
      ids.push(child.id)
      walk(child.children)
    }
  }

  walk(node.children)
  return ids
}

const hasSelectedDescendant = node => {
  const selection = new Set(props.modelValue)

  return descendantIds(node).some(id => selection.has(id))
}

// During a search only nodes whose name matches — plus the ancestors
// leading to them — stay visible
const visibleIds = computed(() => {
  const query = search.value.trim().toLowerCase()

  if (!query) {
    return null
  }

  const set = new Set()

  const walk = list => {
    let matched = false

    for (const node of list) {
      const childMatched = walk(node.children)

      if (node.name.toLowerCase().includes(query) || childMatched) {
        set.add(node.id)
        matched = true
      }
    }
    return matched
  }

  walk(props.nodes)
  return set
})

// Flattened visible rows so no recursive component is needed; during a
// search matching branches auto-expand
const rows = computed(() => {
  const list = []
  const selection = new Set(props.modelValue)
  const filter = visibleIds.value
  // During a search every visible branch stays open
  const isExpanded = id => !!filter || expanded.value.has(id)

  const walk = (nodes, depth) => {
    for (const node of nodes) {
      if (filter && !filter.has(node.id)) {
        continue
      }
      const checked = selection.has(node.id)

      list.push({
        node,
        depth,
        checked,
        indeterminate: !checked && !filter && hasSelectedDescendant(node),
        expanded: node.children.length ? isExpanded(node.id) : false
      })
      if (node.children.length && isExpanded(node.id)) {
        walk(node.children, depth + 1)
      }
    }
  }

  walk(props.nodes, 0)
  return list
})

const toggleExpand = id => {
  const next = new Set(expanded.value)

  if (next.has(id)) {
    next.delete(id)
  } else {
    next.add(id)
  }
  expanded.value = next
}

// Checking a node selects its whole subtree (Redmine rolls subproject
// issues into the parent anyway); unchecking drops the subtree
const toggle = (node, checked) => {
  const next = new Set(props.modelValue)

  for (const id of [node.id, ...descendantIds(node)]) {
    if (checked) {
      next.add(id)
    } else {
      next.delete(id)
    }
  }
  emit('update:modelValue', [...next])
}
</script>

<style scoped>
.project-tree {
  width: 100%;
}

.project-tree-search {
  margin-bottom: 8px;
}

.project-tree-list {
  max-height: 300px;
  padding: 6px;
  overflow-y: auto;
  border: 1px solid var(--bs-border-color);
  border-radius: 4px;
}

.project-tree-row {
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 26px;
  padding: 1px 4px;
  border-radius: 4px;
}

.project-tree-row:hover {
  background-color: var(--bs-tertiary-bg);
}

.project-tree-caret {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  width: 16px;
  padding: 0;
  border: none;
  background: none;
  color: #6c757d;
  font-size: 10px;
  cursor: pointer;
}

.project-tree-caret.is-open .fas {
  transform: rotate(90deg);
}

.project-tree-caret-leaf {
  cursor: default;
}

.project-tree-name {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.project-tree-empty {
  padding: 8px 4px;
  color: #6c757d;
  font-size: 13px;
}

.project-tree.is-disabled .project-tree-list {
  opacity: 0.5;
}

.project-tree.is-disabled .project-tree-row {
  pointer-events: none;
}
</style>
