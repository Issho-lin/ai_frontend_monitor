import { onMounted, ref } from 'vue'
import { taskRows as mockTaskRows, type TaskRow } from '@/mock/data'

const QUERY = new URLSearchParams({
  projectId: 'demo',
  env: 'production',
})

export function useTasksData() {
  const rows = ref<TaskRow[]>(mockTaskRows)
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function fetchTasks() {
    loading.value = true
    error.value = null

    try {
      const response = await fetch(`/api/v1/tasks?${QUERY.toString()}`)
      if (!response.ok) {
        throw new Error(`Tasks request failed: ${response.status}`)
      }
      rows.value = (await response.json()) as TaskRow[]
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Unknown error'
      rows.value = mockTaskRows
    } finally {
      loading.value = false
    }
  }

  onMounted(() => {
    void fetchTasks()
  })

  return {
    rows,
    loading,
    error,
    fetchTasks,
  }
}
