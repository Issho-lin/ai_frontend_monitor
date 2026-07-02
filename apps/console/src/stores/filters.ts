import { defineStore } from 'pinia'
import { ref } from 'vue'

export type ProjectOption = { id: string; name: string }
export type EnvOption = 'production' | 'staging' | 'development'
export type DeviceOption = 'all' | 'desktop' | 'mobile' | 'tablet'
export type TimeRange = '15m' | '1h' | '6h' | '24h' | '7d' | '30d'

export const useFiltersStore = defineStore('filters', () => {
  const projects: ProjectOption[] = [
    { id: 'proj-mall', name: '电商主站' },
    { id: 'proj-admin', name: '运营后台' },
    { id: 'proj-mobile', name: 'H5 活动页' },
  ]

  const currentProject = ref<string>('proj-mall')
  const env = ref<EnvOption>('production')
  const timeRange = ref<TimeRange>('24h')
  const version = ref<string>('all')
  const device = ref<DeviceOption>('all')
  const region = ref<string>('all')

  const versions = ref<string[]>(['all', 'v1.18.1', 'v1.18.0', 'v1.17.4'])
  const regions = ref<string[]>(['all', '华东', '华北', '华南', '西南', '海外'])

  return {
    projects,
    currentProject,
    env,
    timeRange,
    version,
    device,
    region,
    versions,
    regions,
  }
})
