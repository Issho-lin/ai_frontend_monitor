<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Search, CaretTop, CaretBottom, Minus } from '@element-plus/icons-vue'
import { releaseRows, type ReleaseRow } from '@/mock/data'

const router = useRouter()
const keyword = ref('')
const envFilter = ref('all')

const filtered = computed(() =>
  releaseRows.filter(
    (r) =>
      (r.version.toLowerCase().includes(keyword.value.trim().toLowerCase()) ||
        r.commit.includes(keyword.value.trim())) &&
      (envFilter.value === 'all' || r.env === envFilter.value),
  ),
)

const statusMap: Record<string, { text: string; type: 'success' | 'warning' | 'danger' | 'info' }> = {
  released: { text: '已发布', type: 'success' },
  rolling: { text: '灰度中', type: 'warning' },
  rolledback: { text: '已回滚', type: 'danger' },
}

function perfIcon(dir: ReleaseRow['perfDir']) {
  if (dir === 'up') return CaretTop
  if (dir === 'down') return CaretBottom
  return Minus
}

function open(r: ReleaseRow) {
  router.push({ name: 'release-detail', params: { version: r.version } })
}
</script>

<template>
  <div class="afm-page">
    <div class="afm-card toolbar">
      <el-input
        v-model="keyword"
        :prefix-icon="Search"
        placeholder="搜索版本号或 commit"
        style="max-width: 300px"
        clearable
      />
      <el-select v-model="envFilter" style="width: 130px">
        <el-option label="全部环境" value="all" />
        <el-option label="生产" value="production" />
        <el-option label="预发" value="staging" />
      </el-select>
      <div class="afm-muted" style="margin-left: auto">共 {{ filtered.length }} 个版本</div>
    </div>

    <div class="afm-card section">
      <div class="afm-section-title">
        版本列表
        <span class="afm-hint">点击行查看发布前后对比</span>
      </div>
      <el-table :data="filtered" size="default" stripe @row-click="open">
        <el-table-column label="版本" min-width="120">
          <template #default="{ row }">
            <span class="version-cell">{{ row.version }}</span>
          </template>
        </el-table-column>
        <el-table-column label="环境" width="110">
          <template #default="{ row }">
            <el-tag size="small" :type="row.env === 'production' ? 'danger' : 'warning'" effect="light">
              {{ row.env === 'production' ? '生产' : '预发' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="发布时间" prop="releasedAt" width="160" />
        <el-table-column label="发布人" prop="releasedBy" width="110" />
        <el-table-column label="Commit" width="110">
          <template #default="{ row }">
            <code class="commit">{{ row.commit }}</code>
          </template>
        </el-table-column>
        <el-table-column label="灰度" prop="grayscale" width="90" />
        <el-table-column label="状态" width="110">
          <template #default="{ row }">
            <el-tag size="small" :type="statusMap[row.status].type">
              {{ statusMap[row.status].text }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="活跃告警" width="100">
          <template #default="{ row }">
            <el-badge v-if="row.activeAlerts" :value="row.activeAlerts" type="danger" />
            <span v-else class="afm-muted">0</span>
          </template>
        </el-table-column>
        <el-table-column label="性能变化" min-width="150">
          <template #default="{ row }">
            <span
              class="perf"
              :class="{ bad: row.perfDir === 'up', good: row.perfDir === 'down' }"
            >
              <el-icon><component :is="perfIcon(row.perfDir)" /></el-icon>
              {{ row.perfShift }}
            </span>
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
  margin-top: 16px;
}
.version-cell {
  font-weight: 600;
  color: var(--afm-accent);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}
.commit {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
  color: var(--afm-text-muted);
}
.perf {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: var(--afm-text-muted);
}
.perf.bad {
  color: var(--afm-danger);
}
.perf.good {
  color: var(--afm-success);
}
:deep(.el-table__row) {
  cursor: pointer;
}
</style>
