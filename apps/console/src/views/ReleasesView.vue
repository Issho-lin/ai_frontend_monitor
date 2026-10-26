<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { Search, CaretTop, CaretBottom, Minus } from '@element-plus/icons-vue'
import { type ReleaseRow } from '@/mock/data'
import { useReleasesData } from '@/composables/useReleasesData'
import MetricHead from '@/components/MetricHead.vue'
import { useFiltersStore } from '@/stores/filters'

const router = useRouter()
const { env, version } = storeToRefs(useFiltersStore())
const keyword = ref('')
const envFilter = ref('all')
const { rows, loading, error } = useReleasesData()

const filtered = computed(() =>
  rows.value.filter(
    (r) =>
      (r.version.toLowerCase().includes(keyword.value.trim().toLowerCase()) ||
        r.commit.includes(keyword.value.trim())) &&
      (envFilter.value === 'all' || r.env === envFilter.value),
  ),
)

function perfIcon(dir: ReleaseRow['perfDir']) {
  if (dir === 'up') return CaretTop
  if (dir === 'down') return CaretBottom
  return Minus
}

function open(r: ReleaseRow) {
  env.value = r.env as typeof env.value
  version.value = r.version
  router.push({
    name: 'release-detail',
    params: { version: r.version },
  })
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
    <p v-if="error" class="fallback">版本数据暂不可用。</p>

    <div class="afm-card section">
      <div class="afm-section-title">
        版本列表
        <span class="afm-hint">点击行查看发布前后对比</span>
      </div>
      <p v-if="loading" class="afm-muted empty">正在读取版本数据…</p>
      <el-table v-else :data="filtered" size="default" stripe @row-click="open">
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
        <el-table-column label="首次上报" prop="releasedAt" width="160" />
        <el-table-column label="来源" prop="releasedBy" width="110" />
        <el-table-column label="Commit" width="110">
          <template #default="{ row }">
            <code class="commit">{{ row.commit }}</code>
          </template>
        </el-table-column>
        <el-table-column width="120">
          <template #header><MetricHead label="活跃告警" tip="active_alerts" /></template>
          <template #default="{ row }">
            <el-badge v-if="row.activeAlerts" :value="row.activeAlerts" type="danger" />
            <span v-else class="afm-muted">0</span>
          </template>
        </el-table-column>
        <el-table-column min-width="160">
          <template #header><MetricHead label="性能变化" tip="perf_shift" /></template>
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
.fallback { margin: 12px 0 0; color: var(--afm-warn); font-size: 13px; }
.empty { margin: 8px 0; }
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
