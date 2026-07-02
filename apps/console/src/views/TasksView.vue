<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Search, Plus } from '@element-plus/icons-vue'
import { taskRows } from '@/mock/data'

const router = useRouter()
const keyword = ref('')
const status = ref('all')

const filtered = computed(() =>
  taskRows.filter(
    (r) =>
      r.title.toLowerCase().includes(keyword.value.trim().toLowerCase()) &&
      (status.value === 'all' || r.status === status.value),
  ),
)

const statusMap: Record<
  string,
  { text: string; type: 'primary' | 'warning' | 'success' | 'danger' | 'info' }
> = {
  Open: { text: '待认领', type: 'info' },
  InProgress: { text: '修复中', type: 'primary' },
  Verifying: { text: '验证中', type: 'warning' },
  Resolved: { text: '已关闭', type: 'success' },
  Reopened: { text: '再次触发', type: 'danger' },
}

const priorityMap: Record<string, 'danger' | 'warning' | 'info'> = {
  P0: 'danger',
  P1: 'warning',
  P2: 'info',
  P3: 'info',
}

function go(id: string) {
  router.push({ name: 'task-detail', params: { id } })
}

function onRowClick(row: unknown) {
  go((row as { id: string }).id)
}

function openAlert(id: string) {
  router.push({ name: 'alert-detail', params: { id } })
}
</script>

<template>
  <div class="afm-page">
    <div class="afm-card toolbar">
      <el-input
        v-model="keyword"
        :prefix-icon="Search"
        placeholder="按任务标题搜索"
        style="max-width: 320px"
        clearable
      />
      <el-select v-model="status" style="width: 140px">
        <el-option label="全部状态" value="all" />
        <el-option label="待认领" value="Open" />
        <el-option label="修复中" value="InProgress" />
        <el-option label="验证中" value="Verifying" />
        <el-option label="已关闭" value="Resolved" />
        <el-option label="再次触发" value="Reopened" />
      </el-select>
      <div style="margin-left: auto">
        <el-button type="primary" :icon="Plus">新建任务</el-button>
      </div>
    </div>

    <div class="afm-card section">
      <el-table :data="filtered" size="default" stripe @row-click="onRowClick">
        <el-table-column label="ID" prop="id" width="120" />
        <el-table-column label="任务" min-width="280">
          <template #default="{ row }">
            <div style="font-weight: 500">{{ row.title }}</div>
            <div class="afm-muted" style="font-size: 12px; margin-top: 2px">
              页面 {{ row.route }} · 来源
              <a class="alert-link" @click.stop="openAlert(row.sourceAlertId)">{{ row.sourceAlertId }}</a>
              · 创建 {{ row.createdAt }}
            </div>
          </template>
        </el-table-column>
        <el-table-column label="负责人" prop="owner" width="120" />
        <el-table-column label="优先级" width="100">
          <template #default="{ row }">
            <el-tag size="small" :type="priorityMap[row.priority]">{{ row.priority }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="验收指标" prop="acceptance" min-width="260" />
        <el-table-column label="截止时间" prop="dueDate" width="120" />
        <el-table-column label="状态" width="120">
          <template #default="{ row }">
            <el-tag size="small" :type="statusMap[row.status].type">
              {{ statusMap[row.status].text }}
            </el-tag>
          </template>
        </el-table-column>
      </el-table>
    </div>
  </div>
</template>

<style scoped>
.toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
}
.section {
  margin-top: 20px;
}
.alert-link {
  color: var(--afm-accent);
  cursor: pointer;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-weight: 500;
}
.alert-link:hover {
  text-decoration: underline;
}
:deep(.el-table__row) {
  cursor: pointer;
}
</style>
