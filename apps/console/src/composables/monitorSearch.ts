import { useFiltersStore } from '@/stores/filters'

export function monitorSearch(extra?: Record<string, string>) {
  const filters = useFiltersStore()
  const params = new URLSearchParams({
    projectId: filters.currentProject,
    env: filters.env,
  })
  if (filters.version && filters.version !== 'all') {
    params.set('release', filters.version)
  }
  if (filters.device && filters.device !== 'all') {
    params.set('device', filters.device)
  }
  if (filters.country && filters.country !== 'all') {
    params.set('country', filters.country)
  }
  if (filters.browser && filters.browser !== 'all') {
    params.set('browser', filters.browser)
  }
  params.set('window', filters.timeRange === '7d' || filters.timeRange === '30d' ? filters.timeRange : '24h')
  if (extra) {
    for (const [key, value] of Object.entries(extra)) {
      if (value) params.set(key, value)
    }
  }
  return params
}
