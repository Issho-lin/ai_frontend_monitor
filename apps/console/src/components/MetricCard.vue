<script setup lang="ts">
import { computed } from 'vue'
import { CaretTop, CaretBottom, Minus } from '@element-plus/icons-vue'
import MetricTip from '@/components/MetricTip.vue'

const props = defineProps<{
  label: string
  value: string
  delta?: string
  deltaDir?: 'up' | 'down' | 'flat'
  /** whether the current change is desirable (true = green, false = red, undefined = neutral) */
  good?: boolean
  hint?: string
  /** key in metricTips, shown beside the label */
  tip?: string
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
</script>

<template>
  <div class="afm-metric">
    <div class="label">
      <span class="name">
        <span>{{ label }}</span>
        <MetricTip v-if="tip" :tip="tip" />
      </span>
      <span v-if="hint" class="hint">{{ hint }}</span>
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
.name {
  display: inline-flex;
  align-items: center;
  min-width: 0;
}
.hint {
  color: var(--afm-text-subtle);
  font-weight: 400;
}
</style>
