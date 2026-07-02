<script setup lang="ts">
import { computed, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { CopyDocument, Refresh, CircleCheck, Warning, Loading } from '@element-plus/icons-vue'
import { onboardingSteps, sdkSnippet } from '@/mock/data'

const projectToken = ref('afm_prod_ec80f4a1e2c34cb2b0a3ec1e2f7d')

function copy(value: string, tip = '已复制') {
  navigator.clipboard.writeText(value)
  ElMessage.success(tip)
}

const statusVisual: Record<
  string,
  { icon: unknown; type: 'success' | 'warning' | 'info' | 'danger'; label: string }
> = {
  passed: { icon: CircleCheck, type: 'success', label: 'Passed' },
  receiving: { icon: Loading, type: 'success', label: 'Receiving' },
  waiting: { icon: Loading, type: 'info', label: 'Waiting' },
  warning: { icon: Warning, type: 'warning', label: 'Warning' },
  failed: { icon: Warning, type: 'danger', label: 'Failed' },
}

const passedCount = computed(
  () =>
    onboardingSteps.filter((s) => s.status === 'passed' || s.status === 'receiving').length,
)

const progressPercent = computed(() =>
  Math.round((passedCount.value / onboardingSteps.length) * 100),
)
</script>

<template>
  <div class="afm-page">
    <div class="afm-card">
      <div class="afm-section-title">
        接入验证进度
        <span class="afm-hint">
          {{ passedCount }} / {{ onboardingSteps.length }} 步骤就绪
        </span>
      </div>
      <el-progress
        :percentage="progressPercent"
        :stroke-width="10"
        :status="progressPercent >= 80 ? 'success' : 'warning'"
      />
    </div>

    <div class="grid-2 section">
      <div class="afm-card">
        <div class="afm-section-title">Project Token</div>
        <div class="token-row">
          <el-input v-model="projectToken" readonly>
            <template #append>
              <el-button :icon="CopyDocument" @click="copy(projectToken)">复制</el-button>
            </template>
          </el-input>
          <div class="afm-muted" style="margin-top: 8px; font-size: 12px">
            仅在项目服务端保留 token，避免直接暴露给业务端代码。
          </div>
        </div>

        <div class="afm-section-title" style="margin-top: 20px">SDK 初始化示例</div>
        <pre class="afm-log">{{ sdkSnippet }}</pre>
        <div style="margin-top: 8px">
          <el-button :icon="CopyDocument" @click="copy(sdkSnippet, '示例已复制')">
            复制示例
          </el-button>
        </div>
      </div>

      <div class="afm-card">
        <div class="afm-section-title">
          接入检查
          <el-button link :icon="Refresh" style="margin-left: auto">刷新</el-button>
        </div>
        <el-table :data="[...onboardingSteps]" size="default" :show-header="false">
          <el-table-column width="60">
            <template #default="{ $index }">Step {{ $index + 1 }}</template>
          </el-table-column>
          <el-table-column label="项目" min-width="140">
            <template #default="{ row }">
              <div style="font-weight: 500">{{ row.label }}</div>
              <div class="afm-muted" style="font-size: 12px; margin-top: 2px">
                {{ row.detail }}
              </div>
            </template>
          </el-table-column>
          <el-table-column label="状态" width="120">
            <template #default="{ row }">
              <el-tag :type="statusVisual[row.status].type" size="small">
                <el-icon><component :is="statusVisual[row.status].icon" /></el-icon>
                <span style="margin-left: 4px">{{ statusVisual[row.status].label }}</span>
              </el-tag>
            </template>
          </el-table-column>
        </el-table>

        <el-alert
          class="alert-tip"
          type="warning"
          show-icon
          :closable="false"
          title="Sourcemap 缺失提醒"
          description="main.8fd3.js sourcemap 尚未上传，JS 错误将无法定位到源码文件与行号。建议在 CI 中把 sourcemap 上传作为项目接入校验项。"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.grid-2 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}
@media (max-width: 1024px) {
  .grid-2 {
    grid-template-columns: 1fr;
  }
}
.section {
  margin-top: 16px;
}
.token-row {
  display: flex;
  flex-direction: column;
}
.alert-tip {
  margin-top: 16px;
}
</style>
