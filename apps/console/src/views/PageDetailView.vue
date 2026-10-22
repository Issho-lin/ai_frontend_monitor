<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { useFiltersStore } from '@/stores/filters'
import { ElMessage } from 'element-plus'
import { ArrowLeft, DocumentCopy } from '@element-plus/icons-vue'
import MetricCard from '@/components/MetricCard.vue'
import MetricTip from '@/components/MetricTip.vue'
import MetricHead from '@/components/MetricHead.vue'
import { usePageDetailData } from '@/composables/usePageDetailData'
import { useWindowLabel } from '@/composables/useWindowLabel'

const route = useRoute()
const router = useRouter()
const { device } = storeToRefs(useFiltersStore())
const windowLabel = useWindowLabel()
const lcpGoodSeconds = computed(() => (device.value === 'mobile' ? 3 : 2.5))

const routeParam = computed(() => decodeURIComponent(String(route.params.route || '')))
const { page: pageInfo, resources: resourceRows, apis: apiPreview, error, loading } =
  usePageDetailData(routeParam)

const resources = computed(() =>
  resourceRows.value.map((r) => ({
    ...r,
    sizeKb: Math.round(r.size / 1024),
  })),
)

function copyRoute() {
  navigator.clipboard.writeText(routeParam.value)
  ElMessage.success('已复制页面路由')
}

function metricText(value: number | null, unit: string) {
  return value == null ? '—' : `${value}${unit}`
}

function within(value: number | null, goodAt: number) {
  return value == null ? undefined : value <= goodAt
}

function openApi(api: string) {
  void router.push({ name: 'api-detail', query: { api } })
}
</script>

<template>
  <div class="afm-page">
    <div class="header">
      <el-button link :icon="ArrowLeft" @click="router.back()">返回</el-button>
      <div class="page-title">
        <span class="route">{{ routeParam }}</span>
        <el-button link :icon="DocumentCopy" @click="copyRoute">复制</el-button>
      </div>
      <div v-if="pageInfo" class="afm-muted meta-line">
        <span>PV {{ pageInfo.pv.toLocaleString() }}<MetricTip tip="pv" /></span>
        <span>受影响用户 {{ pageInfo.affectedUsers.toLocaleString() }}<MetricTip tip="affected_users" /></span>
      </div>
    </div>

    <p v-if="error" class="fallback">接口暂不可用。</p>
    <div v-if="loading" class="afm-card section">
      <p class="afm-muted empty">正在读取页面数据…</p>
    </div>
    <div v-else-if="!pageInfo" class="afm-card section">
      <p class="afm-muted empty">没有这个页面的访问数据。</p>
    </div>

    <template v-else>
    <div class="afm-metric-grid section">
      <MetricCard label="LCP P75" tip="lcp_p75" :value="metricText(pageInfo.lcpP75, 's')" :good="within(pageInfo.lcpP75, lcpGoodSeconds)" :hint="pageInfo.lcpP75 == null ? `${windowLabel}没有样本` : (device === 'mobile' ? '手机良好线 3.0s' : '良好线 2.5s')" />
      <MetricCard label="FCP P75" tip="fcp_p75" :value="metricText(pageInfo.fcpP75, 's')" :good="within(pageInfo.fcpP75, 1.8)" :hint="pageInfo.fcpP75 == null ? `${windowLabel}没有样本` : '良好线 1.8s'" />
      <MetricCard label="INP P75" tip="inp_p75" :value="metricText(pageInfo.inpP75, 'ms')" :good="within(pageInfo.inpP75, 200)" :hint="pageInfo.inpP75 == null ? `${windowLabel}没有样本` : '良好线 200ms'" />
      <MetricCard label="CLS P75" tip="cls_p75" :value="metricText(pageInfo.clsP75, '')" :good="within(pageInfo.clsP75, 0.1)" :hint="pageInfo.clsP75 == null ? `${windowLabel}没有样本` : '良好线 0.1'" />
      <MetricCard label="TTFB P75" tip="ttfb_p75" :value="metricText(pageInfo.ttfbP75, 'ms')" :good="within(pageInfo.ttfbP75, 800)" :hint="pageInfo.ttfbP75 == null ? `${windowLabel}没有样本` : '良好线 800ms'" />
      <MetricCard label="JS Error Rate" tip="js_error_rate" :value="metricText(pageInfo.jsErrorRate, '%')" :good="within(pageInfo.jsErrorRate, 0.5)" :hint="pageInfo.jsErrorRate == null ? `${windowLabel}没有页面访问` : '良好线 ≤ 0.5%'" />
      <MetricCard label="API P95" tip="api_p95" :value="metricText(pageInfo.apiP95, 'ms')" :good="within(pageInfo.apiP95, 800)" :hint="pageInfo.apiP95 == null ? `${windowLabel}没有接口样本` : '良好线 800ms'" />
      <MetricCard label="达标率" tip="pass_rate" :value="metricText(pageInfo.passRate, '%')" :good="pageInfo.passRate == null ? undefined : pageInfo.passRate >= 75" hint="只统计有样本的检查" />
    </div>

    <div class="section">
        <div class="afm-card">
          <div class="afm-section-title">
            首屏资源瀑布
            <span class="afm-hint">按加载耗时排序</span>
          </div>
          <el-table :data="resources" size="default">
            <el-table-column label="资源" prop="url" min-width="260" />
            <el-table-column label="类型" prop="type" width="80" />
            <el-table-column prop="sizeKb" width="130">
              <template #header><MetricHead label="体积 (KB)" tip="resource_size" /></template>
            </el-table-column>
            <el-table-column prop="duration" width="150">
              <template #header><MetricHead label="加载耗时 (ms)" tip="resource_duration" /></template>
            </el-table-column>
            <el-table-column width="110">
              <template #header><MetricHead label="失败率" tip="resource_fail" /></template>
              <template #default="{ row }">{{ row.failRate }}%</template>
            </el-table-column>
          </el-table>
        </div>

        <div class="afm-card section">
          <div class="afm-section-title">
            关联接口
            <span class="afm-hint">页面维度前 4</span>
          </div>
          <el-table :data="apiPreview" size="default" @row-click="(row: { api: string }) => openApi(row.api)">
            <el-table-column label="接口" min-width="200">
              <template #default="{ row }"><span class="api-link">{{ row.api }}</span></template>
            </el-table-column>
            <el-table-column label="Method" prop="method" width="90" />
            <el-table-column prop="p50" width="120">
              <template #header><MetricHead label="P50 (ms)" tip="api_p50" /></template>
            </el-table-column>
            <el-table-column prop="p95" width="120">
              <template #header><MetricHead label="P95 (ms)" tip="api_p95" /></template>
            </el-table-column>
            <el-table-column width="110">
              <template #header><MetricHead label="错误率" tip="error_rate" /></template>
              <template #default="{ row }">{{ row.errorRate }}%</template>
            </el-table-column>
            <el-table-column width="110">
              <template #header><MetricHead label="超时率" tip="timeout_rate" /></template>
              <template #default="{ row }">{{ row.timeoutRate }}%</template>
            </el-table-column>
          </el-table>
        </div>
    </div>
    </template>
  </div>
</template>

<style scoped>
.header {
  display: flex;
  align-items: center;
  gap: 12px;
}
.page-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 16px;
  font-weight: 600;
}
.page-title .route {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  color: var(--afm-accent);
}
.section {
  margin-top: 20px;
}
.meta-line {
  display: flex;
  align-items: center;
  gap: 16px;
}
.fallback { margin: 12px 0 0; color: var(--afm-warn); font-size: 13px; }
.empty { margin: 8px 0 0; }
.api-link {
  color: var(--afm-accent);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}
:deep(.el-table__row) { cursor: pointer; }
</style>
