<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Search } from '@element-plus/icons-vue'
import { alertRows } from '@/mock/data'

const router = useRouter()
const keyword = ref('')
const status = ref<string>('all')
const severity = ref<string>('all')

const filtered = computed(() =>
  alertRows.filter(
    (r) =>
      r.title.toLowerCase().includes(keyword.value.trim().toLowerCase()) &&
      (status.value === 'all' || r.status === status.value) &&
      (severity.value === 'all' || r.severity === severity.value),
  ),
)

const severityMap: Record<string, 'danger' | 'warning' | 'info'> = {
  S0: 'danger',
  S1: 'danger',
  S2: 'warning',
  S3: 'info',
}
const statusMap: Record<string, { text: string; type: 'danger' | 'warning' | 'success' | 'info' }> = {
  firing: { text: '触发中', type: 'danger' },
  acknowledged: { text: '已认领', type: 'warning' },
  resolved: { text: '已恢复', type: 'success' },
  silenced: { text: '已静默', type: 'info' },
}

function go(id: string) {
  router.push({ name: 'alert-detail', params: { id } })
}

function onRowClick(row: unknown) {
  go((row as { id: string }).id)
}
</script>

<template>
  <div class="afm-page">
    <div class="afm-card toolbar">
      <el-input
        v-model="keyword"
        :prefix-icon="Search"
        placeholder="按告警标题搜索"
        style="max-width: 320px"
        clearable
      />
      <el-select v-model="severity" placeholder="严重级别" style="width: 130px">
        <el-option label="全部级别" value="all" />
        <el-option label="S0" value="S0" />
        <el-option label="S1" value="S1" />
        <el-option label="S2" value="S2" />
        <el-option label="S3" value="S3" />
      </el-select>
      <el-select v-model="status" placeholder="状态" style="width: 130px">
        <el-option label="全部状态" value="all" />
        <el-option label="触发中" value="firing" />
        <el-option label="已认领" value="acknowledged" />
        <el-option label="已恢复" value="resolved" />
        <el-option label="已静默" value="silenced" />
      </el-select>
      <div class="afm-muted" style="margin-left: auto">共 {{ filtered.length }} 条告警</div>
    </div>

    <div class="afm-card section">
      <el-table :data="filtered" size="default" stripe @row-click="onRowClick">
        <el-table-column label="级别" width="80">
          <template #default="{ row }">
            <el-tag size="small" :type="severityMap[row.severity]">{{ row.severity }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="告警" min-width="260">
          <template #default="{ row }">
            <div style="font-weight: 500">{{ row.title }}</div>
            <div class="afm-muted" style="font-size: 12px; margin-top: 2px">
              {{ row.id }} · 首触 {{ row.firstSeen }}
            </div>
          </template>
        </el-table-column>
        <el-table-column label="页面" prop="route" width="140" />
        <el-table-column label="指标" prop="metric" width="130" />
        <el-table-column label="当前值 / 基线" width="180">
          <template #default="{ row }">
            <span style="color: var(--afm-danger); font-weight: 600">{{ row.triggerValue }}</span>
            <span class="afm-muted"> / {{ row.baseline }}</span>
          </template>
        </el-table-column>
        <el-table-column label="影响用户" width="120">
          <template #default="{ row }">{{ row.affectedUsers.toLocaleString() }}</template>
        </el-table-column>
        <el-table-column label="版本" prop="release" width="110" />
        <el-table-column label="状态" width="110">
          <template #default="{ row }">
            <el-tag size="small" :type="statusMap[row.status].type">
              {{ statusMap[row.status].text }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="120">
          <template #default="{ row }">
            <el-button size="small" type="primary" link @click.stop="go(row.id)">诊断</el-button>
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
:deep(.el-table__row) {
  cursor: pointer;
}
</style>
