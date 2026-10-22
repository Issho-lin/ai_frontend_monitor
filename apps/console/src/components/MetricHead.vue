<script setup lang="ts">
import MetricTip from '@/components/MetricTip.vue'

defineProps<{
  label: string
  tip: string
}>()
</script>

<template>
  <span class="afm-col-head">
    <span>{{ label }}</span>
    <MetricTip :tip="tip" />
  </span>
</template>

<style scoped>
.afm-col-head {
  display: inline-flex;
  align-items: center;
  white-space: nowrap;
}
</style>
