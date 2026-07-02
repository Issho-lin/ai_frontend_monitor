<script setup lang="ts">
import { reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { Plus, ChatDotRound, Message, Connection, Link } from '@element-plus/icons-vue'
import {
  alertRules,
  metricOptions,
  normalizationRules,
  notificationChannels,
  ingestStats,
  type AlertRule,
} from '@/mock/data'

const activeTab = ref('sampling')

const sampling = reactive({
  vitals: 100,
  pv: 100,
  api: 50,
  error: 100,
  resource: 20,
})

const desensitize = ref([
  { key: 'url', label: 'URL 参数', pattern: 'token|password|access_token', enabled: true },
  { key: 'header', label: 'Header', pattern: 'Authorization|Cookie', enabled: true },
  { key: 'stack', label: '错误堆栈', pattern: '/tmp/.*|/home/.*', enabled: false },
])

const rules = ref<AlertRule[]>([...alertRules])
const norms = ref([...normalizationRules])
const channels = ref([...notificationChannels])

const releaseUpload = reactive({
  release: 'v1.18.1',
  commit: '3f9a12e',
  sourcemapMatched: 37,
  totalAssets: 38,
})

/* ---- alert rule edit drawer ---- */
const ruleDrawer = ref(false)
const editingRule = reactive<AlertRule>({
  id: '',
  name: '',
  metric: 'LCP P75',
  triggerType: 'threshold',
  threshold: '',
  durationMin: 10,
  filters: '',
  severity: 'S1',
  channels: [],
  escalate: false,
  enabled: true,
  condition: '',
})

function newRule() {
  Object.assign(editingRule, {
    id: `rule-${Date.now()}`,
    name: '',
    metric: 'LCP P75',
    triggerType: 'threshold',
    threshold: '',
    durationMin: 10,
    filters: '',
    severity: 'S1',
    channels: [],
    escalate: false,
    enabled: true,
    condition: '',
  })
  ruleDrawer.value = true
}

function editRule(rule: AlertRule) {
  Object.assign(editingRule, JSON.parse(JSON.stringify(rule)))
  ruleDrawer.value = true
}

function saveRule() {
  const summary = `${editingRule.threshold}${editingRule.triggerType === 'threshold' ? '' : ''} 且持续 ${editingRule.durationMin} 分钟`
  editingRule.condition = summary
  const idx = rules.value.findIndex((r) => r.id === editingRule.id)
  const snapshot = JSON.parse(JSON.stringify(editingRule)) as AlertRule
  if (idx >= 0) rules.value[idx] = snapshot
  else rules.value.push(snapshot)
  ruleDrawer.value = false
  ElMessage.success('告警规则已保存（示例）')
}

const channelIconMap: Record<string, unknown> = {
  lark: ChatDotRound,
  wecom: ChatDotRound,
  email: Message,
  webhook: Connection,
}

const triggerTypeLabel: Record<string, string> = {
  threshold: '固定阈值',
  ring: '环比变化',
  yoy: '同比变化',
}
</script>

<template>
  <div class="afm-page">
    <div class="afm-card">
      <el-tabs v-model="activeTab">
        <!-- Sampling -->
        <el-tab-pane label="采样配置" name="sampling">
          <div class="tab-body">
            <div class="afm-section-title">
              实时上报统计
              <span class="afm-hint">{{ ingestStats.windowLabel }}</span>
            </div>
            <div class="stat-grid">
              <div class="stat"><div class="s-label">上报 QPS</div><div class="s-value">{{ ingestStats.qps.toLocaleString() }}</div></div>
              <div class="stat"><div class="s-label">已接收</div><div class="s-value">{{ ingestStats.accepted.toLocaleString() }}</div></div>
              <div class="stat"><div class="s-label">丢弃</div><div class="s-value warn">{{ ingestStats.dropped }}</div></div>
              <div class="stat"><div class="s-label">限流命中</div><div class="s-value warn">{{ ingestStats.rateLimited }}</div></div>
              <div class="stat"><div class="s-label">Beacon / Fetch</div><div class="s-value">{{ ingestStats.beaconRatio }}% / {{ ingestStats.fetchRatio }}%</div></div>
            </div>

            <div class="afm-section-title" style="margin-top: 20px">
              事件采样率
              <span class="afm-hint">按事件类型设置采样，默认 100% 表示全量采集</span>
            </div>
            <el-form label-width="140px" style="max-width: 520px">
              <el-form-item label="Web Vitals"><el-slider v-model="sampling.vitals" :max="100" show-input /></el-form-item>
              <el-form-item label="PV / 路由"><el-slider v-model="sampling.pv" :max="100" show-input /></el-form-item>
              <el-form-item label="API 事件"><el-slider v-model="sampling.api" :max="100" show-input /></el-form-item>
              <el-form-item label="错误事件"><el-slider v-model="sampling.error" :max="100" show-input /></el-form-item>
              <el-form-item label="资源事件"><el-slider v-model="sampling.resource" :max="100" show-input /></el-form-item>
              <el-form-item><el-button type="primary">保存采样配置</el-button></el-form-item>
            </el-form>
          </div>
        </el-tab-pane>

        <!-- Route normalization -->
        <el-tab-pane label="路由归一化" name="normalization">
          <div class="tab-body">
            <div class="afm-section-title">
              归一化规则
              <span class="afm-hint">把高基数动态路由归并为模板，例如 /product/123 → /product/:id</span>
            </div>
            <el-table :data="norms" size="default">
              <el-table-column label="匹配正则" prop="pattern" min-width="200">
                <template #default="{ row }"><code class="mono">{{ row.pattern }}</code></template>
              </el-table-column>
              <el-table-column label="归一化为" prop="normalized" min-width="180">
                <template #default="{ row }"><code class="mono">{{ row.normalized }}</code></template>
              </el-table-column>
              <el-table-column label="示例命中" prop="sample" min-width="160">
                <template #default="{ row }"><span class="afm-muted mono">{{ row.sample }}</span></template>
              </el-table-column>
              <el-table-column label="启用" width="80">
                <template #default="{ row }"><el-switch v-model="row.enabled" /></template>
              </el-table-column>
            </el-table>
            <div style="margin-top: 12px">
              <el-button type="primary" :icon="Plus">新增归一化规则</el-button>
            </div>
          </div>
        </el-tab-pane>

        <!-- Desensitize -->
        <el-tab-pane label="脱敏规则" name="desensitize">
          <div class="tab-body">
            <div class="afm-section-title">脱敏字段</div>
            <el-table :data="desensitize" size="default">
              <el-table-column label="字段" prop="label" width="160" />
              <el-table-column label="匹配正则" prop="pattern">
                <template #default="{ row }"><code class="mono">{{ row.pattern }}</code></template>
              </el-table-column>
              <el-table-column label="启用" width="90">
                <template #default="{ row }"><el-switch v-model="row.enabled" /></template>
              </el-table-column>
            </el-table>
            <div style="margin-top: 12px"><el-button type="primary">保存脱敏规则</el-button></div>
          </div>
        </el-tab-pane>

        <!-- Alert rules -->
        <el-tab-pane label="告警规则" name="alerts">
          <div class="tab-body">
            <div class="afm-section-title">
              告警规则列表
              <el-button type="primary" size="small" :icon="Plus" style="margin-left: auto" @click="newRule">
                新建规则
              </el-button>
            </div>
            <el-table :data="rules" size="default">
              <el-table-column label="规则名" prop="name" min-width="160" />
              <el-table-column label="指标" prop="metric" width="130" />
              <el-table-column label="触发方式" width="110">
                <template #default="{ row }">{{ triggerTypeLabel[row.triggerType] }}</template>
              </el-table-column>
              <el-table-column label="条件" prop="condition" min-width="220" />
              <el-table-column label="级别" width="80">
                <template #default="{ row }">
                  <el-tag size="small" :type="row.severity === 'S3' ? 'info' : row.severity === 'S2' ? 'warning' : 'danger'">
                    {{ row.severity }}
                  </el-tag>
                </template>
              </el-table-column>
              <el-table-column label="启用" width="80">
                <template #default="{ row }"><el-switch v-model="row.enabled" /></template>
              </el-table-column>
              <el-table-column label="操作" width="90">
                <template #default="{ row }">
                  <el-button size="small" link type="primary" @click="editRule(row)">编辑</el-button>
                </template>
              </el-table-column>
            </el-table>
          </div>
        </el-tab-pane>

        <!-- Notification channels -->
        <el-tab-pane label="通知渠道" name="channels">
          <div class="tab-body">
            <div class="afm-section-title">
              通知渠道
              <span class="afm-hint">告警规则从这里选择通知目标</span>
            </div>
            <el-table :data="channels" size="default">
              <el-table-column label="渠道" min-width="200">
                <template #default="{ row }">
                  <span class="ch-cell">
                    <el-icon><component :is="channelIconMap[row.type]" /></el-icon>
                    {{ row.name }}
                  </span>
                </template>
              </el-table-column>
              <el-table-column label="目标" prop="target" min-width="220">
                <template #default="{ row }"><span class="afm-muted mono">{{ row.target }}</span></template>
              </el-table-column>
              <el-table-column label="启用" width="80">
                <template #default="{ row }"><el-switch v-model="row.enabled" /></template>
              </el-table-column>
              <el-table-column label="操作" width="120">
                <template #default>
                  <el-button size="small" link type="primary">测试</el-button>
                  <el-button size="small" link type="primary">编辑</el-button>
                </template>
              </el-table-column>
            </el-table>
            <div style="margin-top: 12px">
              <el-button type="primary" :icon="Link">添加渠道</el-button>
            </div>
          </div>
        </el-tab-pane>

        <!-- Release data -->
        <el-tab-pane label="发布数据" name="release">
          <div class="tab-body">
            <div class="afm-section-title">最近一次发布</div>
            <el-descriptions :column="2" border>
              <el-descriptions-item label="Release">{{ releaseUpload.release }}</el-descriptions-item>
              <el-descriptions-item label="Commit">{{ releaseUpload.commit }}</el-descriptions-item>
              <el-descriptions-item label="资源清单">{{ releaseUpload.totalAssets }} 个</el-descriptions-item>
              <el-descriptions-item label="Sourcemap 匹配">
                {{ releaseUpload.sourcemapMatched }} / {{ releaseUpload.totalAssets }}
              </el-descriptions-item>
            </el-descriptions>
            <div style="margin-top: 16px" class="afm-section-title">上传新版本</div>
            <el-form label-width="140px" style="max-width: 520px">
              <el-form-item label="Release 号"><el-input placeholder="例如 v1.18.2" /></el-form-item>
              <el-form-item label="Commit SHA"><el-input placeholder="git commit sha" /></el-form-item>
              <el-form-item label="Manifest / Sourcemap">
                <el-upload drag :auto-upload="false" multiple>
                  <div>拖拽或点击上传 build manifest 与 sourcemap</div>
                </el-upload>
              </el-form-item>
              <el-form-item><el-button type="primary">写入发布记录</el-button></el-form-item>
            </el-form>
          </div>
        </el-tab-pane>

        <!-- Members -->
        <el-tab-pane label="成员与角色" name="members">
          <div class="tab-body">
            <div class="afm-section-title">RBAC 成员</div>
            <el-table
              :data="[
                { name: '林琦彬', role: 'Owner', email: 'linqibin@example.com' },
                { name: '王小星', role: 'Maintainer', email: 'wangxx@example.com' },
                { name: '陈开', role: 'Developer', email: 'chenk@example.com' },
                { name: '李默', role: 'Viewer', email: 'limo@example.com' },
              ]"
              size="default"
            >
              <el-table-column label="姓名" prop="name" width="140" />
              <el-table-column label="角色" prop="role" width="140" />
              <el-table-column label="邮箱" prop="email" />
              <el-table-column label="操作" width="160">
                <template #default>
                  <el-button size="small" link type="primary">调整角色</el-button>
                  <el-button size="small" link type="danger">移除</el-button>
                </template>
              </el-table-column>
            </el-table>
            <div style="margin-top: 16px" class="afm-section-title">Project Token</div>
            <el-table
              :data="[{ name: '生产主 token', env: 'production', created: '2026-06-01', last: '刚刚' }]"
              size="default"
            >
              <el-table-column label="名称" prop="name" width="160" />
              <el-table-column label="环境" prop="env" width="120" />
              <el-table-column label="创建时间" prop="created" width="140" />
              <el-table-column label="最近使用" prop="last" width="120" />
              <el-table-column label="操作" width="160">
                <template #default>
                  <el-button size="small" link type="primary">轮换</el-button>
                  <el-button size="small" link type="danger">废弃</el-button>
                </template>
              </el-table-column>
            </el-table>
          </div>
        </el-tab-pane>
      </el-tabs>
    </div>

    <!-- Alert rule edit drawer -->
    <el-drawer v-model="ruleDrawer" :title="editingRule.name ? '编辑告警规则' : '新建告警规则'" size="460px">
      <el-form :model="editingRule" label-width="96px" label-position="top">
        <el-form-item label="规则名"><el-input v-model="editingRule.name" placeholder="例如 核心页面 LCP 劣化" /></el-form-item>
        <el-form-item label="指标">
          <el-select v-model="editingRule.metric" style="width: 100%">
            <el-option v-for="m in metricOptions" :key="m" :label="m" :value="m" />
          </el-select>
        </el-form-item>
        <el-form-item label="触发方式">
          <el-radio-group v-model="editingRule.triggerType">
            <el-radio-button value="threshold">固定阈值</el-radio-button>
            <el-radio-button value="ring">环比</el-radio-button>
            <el-radio-button value="yoy">同比</el-radio-button>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="阈值">
          <el-input v-model="editingRule.threshold" placeholder="例如 > 3s 或 环比 +30%" />
        </el-form-item>
        <el-form-item label="持续时间（分钟）">
          <el-input-number v-model="editingRule.durationMin" :min="1" :max="120" />
        </el-form-item>
        <el-form-item label="过滤条件">
          <el-input v-model="editingRule.filters" placeholder="route / 版本 / 设备 / 地区 组合" />
        </el-form-item>
        <el-form-item label="严重级别">
          <el-radio-group v-model="editingRule.severity">
            <el-radio-button value="S0">S0</el-radio-button>
            <el-radio-button value="S1">S1</el-radio-button>
            <el-radio-button value="S2">S2</el-radio-button>
            <el-radio-button value="S3">S3</el-radio-button>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="通知渠道">
          <el-select v-model="editingRule.channels" multiple style="width: 100%" placeholder="选择渠道">
            <el-option v-for="c in channels" :key="c.id" :label="c.name" :value="c.name" />
          </el-select>
        </el-form-item>
        <el-form-item label="未认领升级通知">
          <el-switch v-model="editingRule.escalate" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="ruleDrawer = false">取消</el-button>
        <el-button type="primary" @click="saveRule">保存</el-button>
      </template>
    </el-drawer>
  </div>
</template>

<style scoped>
.tab-body {
  padding-top: 8px;
}
.mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
}
.stat-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 10px;
}
.stat {
  border: 1px solid var(--afm-border);
  border-radius: 8px;
  padding: 12px 14px;
  background: var(--afm-panel-soft);
}
.s-label {
  font-size: 12px;
  color: var(--afm-text-muted);
}
.s-value {
  font-size: 20px;
  font-weight: 600;
  margin-top: 4px;
  font-variant-numeric: tabular-nums;
}
.s-value.warn {
  color: var(--afm-warn);
}
.ch-cell {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.ch-cell .el-icon {
  color: var(--afm-accent);
}
:deep(.el-form-item--top) {
  margin-bottom: 14px;
}
</style>
