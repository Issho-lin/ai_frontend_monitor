import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useFiltersStore } from '@/stores/filters'

export function useWindowLabel() {
  const { timeRange } = storeToRefs(useFiltersStore())
  return computed(() => {
    if (timeRange.value === '7d') return '近 7 天'
    if (timeRange.value === '30d') return '近 30 天'
    return '近 24 小时'
  })
}
