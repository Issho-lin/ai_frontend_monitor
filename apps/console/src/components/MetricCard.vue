<script setup lang="ts">
import { computed } from 'vue'
import { CaretTop, CaretBottom, Minus } from '@element-plus/icons-vue'

const props = defineProps<{
  label: string
  value: string
  delta?: string
  deltaDir?: 'up' | 'down' | 'flat'
  /** whether the current change is desirable (true = green, false = red, undefined = neutral) */
  good?: boolean
  hint?: string
}>()

const deltaIcon = computed(() => {
  if (props.deltaDir === 'up') return CaretTop
  if (props.deltaDir === 'down') return CaretBottom
  return Minus
})

const deltaTone = computed(() => {
  if (props.good === true) return 'is-good'
  if (props.good === false) return 'is-bad'
  return ''
})

const accentClass = computed(() => {
  if (props.good === true) return 'is-good'
  if (props.good === false) return 'is-bad'
  return ''
})
</script>

<template>
  <div class="afm-metric" :class="{ 'is-good': good, 'is-bad': !good }">
    <div class="metric-accent" :class="accentClass"></div>
    <div class="label">
      <span>{{ label }}</span>
      <span v-if="hint" class="afm-muted">{{ hint }}</span>
    </div>
    <div class="value">{{ value }}</div>
    <div
      v-if="delta"
      class="delta"
      :class="[deltaDir, deltaTone]"
      role="text"
      :aria-label="`变化 ${delta}`"
    >
      <el-icon><component :is="deltaIcon" /></el-icon>
      <span>{{ delta }}</span>
    </div>
  </div>
</template>

<style scoped>
.afm-metric {
  position: relative;
}

/* Top accent line: colored indicator based on good/bad */
.metric-accent {
  position: absolute;
  top: 0;
  left: 16px;
  right: 16px;
  height: 2px;
  border-radius: 0 0 1px 1px;
  opacity: 0;
  transition: opacity var(--afm-motion-base) var(--afm-ease);
}

.is-good .metric-accent {
  background: linear-gradient(90deg, var(--afm-success), var(--afm-info));
  opacity: 1;
}

.is-bad .metric-accent {
  background: linear-gradient(90deg, var(--afm-danger), var(--afm-warn));
  opacity: 1;
}

/* Hover: subtle gradient glow */
.is-good:hover {
  background: linear-gradient(180deg, rgba(16, 185, 129, 0.025) 0%, #ffffff 40%);
}

.is-bad:hover {
  background: linear-gradient(180deg, rgba(239, 68, 68, 0.025) 0%, #ffffff 40%);
}

/* Colored label for good/bad metrics */
.is-good .label {
  color: var(--afm-success);
}

.is-bad .label {
  color: var(--afm-danger);
}
</style>
