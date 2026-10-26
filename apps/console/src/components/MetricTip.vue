<script setup lang="ts">
import { computed } from 'vue'
import { QuestionFilled } from '@element-plus/icons-vue'
import { metricTip } from '@/utils/metricTips'

const props = defineProps<{
  tip: string
}>()

const content = computed(() => metricTip(props.tip))
</script>

<template>
  <el-tooltip
    v-if="content"
    :content="content"
    placement="top"
    :show-after="200"
    popper-class="afm-metric-tip-pop"
  >
    <button type="button" class="afm-metric-tip" aria-label="指标说明" @click.stop>
      <el-icon><QuestionFilled /></el-icon>
    </button>
  </el-tooltip>
</template>

<style scoped>
.afm-metric-tip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 14px;
  height: 14px;
  margin: 0 0 0 4px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: var(--afm-text-subtle);
  cursor: help;
  vertical-align: -2px;
  line-height: 1;
}
.afm-metric-tip:hover,
.afm-metric-tip:focus-visible {
  color: var(--afm-accent);
  outline: none;
}
.afm-metric-tip .el-icon {
  font-size: 13px;
}
</style>
