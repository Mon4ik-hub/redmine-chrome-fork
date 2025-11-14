<template>
  <div
    v-if="internalVisible"
    class="copy-success-toast"
    :style="{
      top: internalPosition.top + 'px',
      left: internalPosition.left + 'px',
      backgroundColor: backgroundColor,
      color: color
    }"
  >
    <i v-if="icon" class="toast-icon" :class="icon" />
    {{ message }}
  </div>
</template>

<script setup>
import { ref } from 'vue'

const props = defineProps({
  message: {
    type: String,
    default: ''
  },
  duration: {
    type: Number,
    default: 1000
  },
  icon: {
    type: String,
    default: null
  },
  backgroundColor: {
    type: String,
    default: 'rgba(0, 0, 0, 0.8)'
  },
  color: {
    type: String,
    default: 'white'
  }
})

const emit = defineEmits(['hide'])
const internalVisible = ref(false)
const internalPosition = ref({ top: 0, left: 0 })

const show = (event) => {
  const rect = event.target.getBoundingClientRect()
  const position = {
    top: rect.top + window.scrollY - 30, // 显示在按钮上方
    left: rect.left + (rect.width / 2) + window.scrollX - 30 // 水平居中
  }

  internalPosition.value = position
  internalVisible.value = true

  setTimeout(() => {
    internalVisible.value = false
    emit('hide')
  }, props.duration)
}

const hide = () => {
  internalVisible.value = false
  emit('hide')
}

defineExpose({ show, hide })
</script>

<style lang="scss" scoped>
.copy-success-toast {
  position: fixed;
  padding: 8px 16px;
  border-radius: 4px;
  font-size: 12px;
  z-index: 1000;
  opacity: 1;
  animation: fadeInOut 1s ease forwards;
  pointer-events: none;
  display: inline-flex;
  align-items: center;
  gap: 6px;

  .toast-icon {
    font-size: 14px;
  }
}

@keyframes fadeInOut {
  0% {
    opacity: 0;
    transform: translateY(0);
  }
  20% {
    opacity: 1;
    transform: translateY(-20px);
  }
  80% {
    opacity: 1;
    transform: translateY(-20px);
  }
  100% {
    opacity: 0;
    transform: translateY(-10px);
  }
}
</style>
