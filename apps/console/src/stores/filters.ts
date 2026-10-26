import { defineStore } from 'pinia'
import { ref } from 'vue'

export type ProjectOption = { id: string; name: string }
export type EnvOption = 'production' | 'staging' | 'development'
export type DeviceOption = 'all' | 'desktop' | 'mobile' | 'tablet'
export type TimeRange = '24h' | '7d' | '30d'

export const useFiltersStore = defineStore('filters', () => {
  /** 顶栏应用切换；项目管理页加载/变更后会同步写入 */
  const projects = ref<ProjectOption[]>([
    { id: 'demo', name: 'demo' },
  ])

  const currentProject = ref<string>('demo')
  const env = ref<EnvOption>('production')
  const timeRange = ref<TimeRange>('24h')
  const version = ref<string>('all')
  const device = ref<DeviceOption>('all')
  const country = ref('all')
  const browser = ref('all')

  const versions = ref<string[]>(['all'])
  const countries = ref<string[]>([])
  const browsers = ref<string[]>([])

  return {
    projects,
    currentProject,
    env,
    timeRange,
    version,
    device,
    country,
    browser,
    versions,
    countries,
    browsers,
  }
})
