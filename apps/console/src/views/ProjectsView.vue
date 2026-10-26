<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, CopyDocument, Key, Refresh } from '@element-plus/icons-vue'
import {
  USE_PROJECTS_MOCK,
  createProject,
  createProjectToken,
  deleteProject,
  listProjectTokens,
  listProjects,
  projectEnvLabel,
  revokeProjectToken,
  updateProject,
  type CreateProjectInput,
  type Project,
  type ProjectEnv,
  type ProjectToken,
} from '@/api/projects'
import { useFiltersStore } from '@/stores/filters'

const filters = useFiltersStore()

const loading = ref(false)
const tokensLoading = ref(false)
const projects = ref<Project[]>([])
const selectedId = ref<string>('')
const tokens = ref<ProjectToken[]>([])

const selected = computed(() => projects.value.find((p) => p.id === selectedId.value) ?? null)

const envOptions: { label: string; value: ProjectEnv }[] = [
  { label: '生产', value: 'production' },
  { label: '预发', value: 'staging' },
  { label: '开发', value: 'development' },
]

function syncFilterProjects() {
  filters.projects = projects.value.map((p) => ({ id: p.id, name: p.name }))
  if (!filters.projects.some((p) => p.id === filters.currentProject) && filters.projects[0]) {
    filters.currentProject = filters.projects[0].id
  }
}

async function loadProjects(preferId?: string) {
  loading.value = true
  try {
    projects.value = await listProjects()
    syncFilterProjects()
    const next =
      preferId && projects.value.some((p) => p.id === preferId)
        ? preferId
        : selectedId.value && projects.value.some((p) => p.id === selectedId.value)
          ? selectedId.value
          : (projects.value[0]?.id ?? '')
    selectedId.value = next
  } catch (err) {
    ElMessage.error(err instanceof Error ? err.message : '加载项目失败')
  } finally {
    loading.value = false
  }
}

async function loadTokens() {
  if (!selectedId.value) {
    tokens.value = []
    return
  }
  tokensLoading.value = true
  try {
    tokens.value = await listProjectTokens(selectedId.value)
  } catch (err) {
    tokens.value = []
    ElMessage.error(err instanceof Error ? err.message : '加载 Token 失败')
  } finally {
    tokensLoading.value = false
  }
}

watch(selectedId, () => {
  void loadTokens()
})

onMounted(() => {
  void loadProjects(filters.currentProject)
})

// ── Project create / edit ────────────────────────────────────────────────────

const projectDialog = ref(false)
const projectSaving = ref(false)
const editingProjectId = ref<string | null>(null)
const projectForm = reactive<CreateProjectInput>({
  id: '',
  name: '',
  env: 'production',
})

function openCreateProject() {
  editingProjectId.value = null
  Object.assign(projectForm, { id: '', name: '', env: 'production' as ProjectEnv })
  projectDialog.value = true
}

function openEditProject(row: Project) {
  editingProjectId.value = row.id
  Object.assign(projectForm, { id: row.id, name: row.name, env: row.env })
  projectDialog.value = true
}

async function saveProject() {
  if (!projectForm.name.trim()) {
    ElMessage.warning('请填写项目名称')
    return
  }
  if (!editingProjectId.value && !projectForm.id.trim()) {
    ElMessage.warning('请填写项目 ID')
    return
  }
  projectSaving.value = true
  try {
    if (editingProjectId.value) {
      await updateProject(editingProjectId.value, {
        name: projectForm.name,
        env: projectForm.env,
      })
      ElMessage.success('项目已更新')
      projectDialog.value = false
      await loadProjects(editingProjectId.value)
    } else {
      const created = await createProject({
        id: projectForm.id.trim(),
        name: projectForm.name.trim(),
        env: projectForm.env,
      })
      ElMessage.success('项目已创建')
      projectDialog.value = false
      await loadProjects(created.id)
    }
  } catch (err) {
    ElMessage.error(err instanceof Error ? err.message : '保存失败')
  } finally {
    projectSaving.value = false
  }
}

async function removeProject(row: Project) {
  try {
    await ElMessageBox.confirm(
      `确认删除项目「${row.name}」（${row.id}）？其下 Token 也会一并失效。`,
      '删除项目',
      { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' },
    )
  } catch {
    return
  }
  try {
    await deleteProject(row.id)
    ElMessage.success('项目已删除')
    if (selectedId.value === row.id) selectedId.value = ''
    await loadProjects()
    await loadTokens()
  } catch (err) {
    ElMessage.error(err instanceof Error ? err.message : '删除失败')
  }
}

// ── Token generate / revoke ──────────────────────────────────────────────────

const tokenDialog = ref(false)
const tokenSaving = ref(false)
const tokenName = ref('')

const plainDialog = ref(false)
const plainToken = ref('')
const plainCopied = ref(false)

function openCreateToken() {
  if (!selectedId.value) {
    ElMessage.warning('请先选择项目')
    return
  }
  tokenName.value = ''
  tokenDialog.value = true
}

async function confirmCreateToken() {
  if (!selectedId.value) return
  tokenSaving.value = true
  try {
    const result = await createProjectToken(selectedId.value, {
      name: tokenName.value.trim() || undefined,
    })
    tokenDialog.value = false
    plainToken.value = result.tokenPlain
    plainCopied.value = false
    plainDialog.value = true
    await loadTokens()
  } catch (err) {
    ElMessage.error(err instanceof Error ? err.message : '生成 Token 失败')
  } finally {
    tokenSaving.value = false
  }
}

async function copyPlain() {
  try {
    await navigator.clipboard.writeText(plainToken.value)
    plainCopied.value = true
    ElMessage.success('已复制明文 Token')
  } catch {
    ElMessage.error('复制失败，请手动选中复制')
  }
}

async function revokeToken(row: ProjectToken) {
  if (!selectedId.value || !row.enabled) return
  try {
    await ElMessageBox.confirm(
      `确认吊销 Token「${row.name}」（${row.tokenMasked}）？吊销后不可恢复，ingest 将拒绝该密钥。`,
      '吊销 Token',
      { type: 'warning', confirmButtonText: '吊销', cancelButtonText: '取消' },
    )
  } catch {
    return
  }
  try {
    await revokeProjectToken(selectedId.value, row.id)
    ElMessage.success('Token 已吊销')
    await loadTokens()
  } catch (err) {
    ElMessage.error(err instanceof Error ? err.message : '吊销失败')
  }
}


async function rotateToken(row: ProjectToken) {
  if (!selectedId.value || !row.enabled) return
  try {
    await ElMessageBox.confirm(
      `将为「${row.name}」生成新 Token，并吊销当前掩码 ${row.tokenMasked}。新明文只展示一次。`,
      '轮换 Token',
      { type: 'warning', confirmButtonText: '轮换', cancelButtonText: '取消' },
    )
  } catch {
    return
  }
  tokenSaving.value = true
  try {
    const result = await createProjectToken(selectedId.value, {
      name: row.name || undefined,
    })
    await revokeProjectToken(selectedId.value, row.id)
    plainToken.value = result.tokenPlain
    plainCopied.value = false
    plainDialog.value = true
    await loadTokens()
    ElMessage.success('已轮换：旧 Token 已吊销')
  } catch (err) {
    ElMessage.error(err instanceof Error ? err.message : '轮换失败')
  } finally {
    tokenSaving.value = false
  }
}

function formatTime(value: string | null): string {
  if (!value) return '—'
  try {
    return new Date(value).toLocaleString('zh-CN', { hour12: false })
  } catch {
    return value
  }
}
</script>

<template>
  <div class="afm-page">
    <el-alert
      v-if="USE_PROJECTS_MOCK"
      class="banner"
      type="info"
      show-icon
      :closable="false"
      title="当前为 Mock 数据"
      description="M5：后端项目/Token 路由尚未就绪。路径已按 docs/M5-projects-console.md 对齐；接真后将 USE_PROJECTS_MOCK 改为 false。"
    />

    <div class="layout">
      <!-- Projects list -->
      <div class="afm-card list-card">
        <div class="afm-section-title">
          项目
          <span class="afm-hint">id · 名称 · 环境</span>
          <el-button
            type="primary"
            size="small"
            :icon="Plus"
            style="margin-left: auto"
            @click="openCreateProject"
          >
            新建项目
          </el-button>
          <el-button size="small" :icon="Refresh" :loading="loading" @click="loadProjects()">
            刷新
          </el-button>
        </div>

        <el-table
          v-loading="loading"
          :data="projects"
          size="default"
          highlight-current-row
          :row-class-name="({ row }: { row: Project }) => (row.id === selectedId ? 'is-selected' : '')"
          @row-click="(row: Project) => (selectedId = row.id)"
        >
          <el-table-column label="ID" prop="id" min-width="120">
            <template #default="{ row }">
              <code class="mono">{{ row.id }}</code>
            </template>
          </el-table-column>
          <el-table-column label="名称" prop="name" min-width="140" />
          <el-table-column label="环境" width="100">
            <template #default="{ row }">
              <el-tag size="small" :type="row.env === 'production' ? 'danger' : row.env === 'staging' ? 'warning' : 'info'">
                {{ projectEnvLabel(row.env) }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="140" fixed="right">
            <template #default="{ row }">
              <el-button size="small" link type="primary" @click.stop="openEditProject(row)">编辑</el-button>
              <el-button
                size="small"
                link
                type="danger"
                :disabled="row.id === 'demo'"
                @click.stop="removeProject(row)"
              >
                删除
              </el-button>
            </template>
          </el-table-column>
        </el-table>
      </div>

      <!-- Tokens for selected project -->
      <div class="afm-card token-card">
        <div class="afm-section-title">
          <el-icon><Key /></el-icon>
          Project Token
          <span v-if="selected" class="afm-hint">{{ selected.name }}（{{ selected.id }}）</span>
          <span v-else class="afm-hint">请先选择左侧项目</span>
          <el-button
            type="primary"
            size="small"
            :icon="Plus"
            style="margin-left: auto"
            :disabled="!selected"
            @click="openCreateToken"
          >
            生成 Token
          </el-button>
        </div>

        <el-alert
          class="token-tip"
          type="warning"
          show-icon
          :closable="false"
          title="明文只展示一次"
          description="生成后请立即复制并写入业务侧密钥管理。服务端仅存 hash；列表只显示掩码。ingest 使用请求头 x-project-token + projectId。"
        />

        <el-table
          v-loading="tokensLoading"
          :data="tokens"
          size="default"
          empty-text="暂无 Token"
          style="margin-top: 12px"
        >
          <el-table-column label="名称" prop="name" min-width="120" />
          <el-table-column label="掩码" min-width="160">
            <template #default="{ row }">
              <code class="mono">{{ row.tokenMasked }}</code>
            </template>
          </el-table-column>
          <el-table-column label="创建时间" min-width="160">
            <template #default="{ row }">{{ formatTime(row.createdAt) }}</template>
          </el-table-column>
          <el-table-column label="最近使用" min-width="140">
            <template #default="{ row }">{{ formatTime(row.lastUsedAt) }}</template>
          </el-table-column>
          <el-table-column label="启用" width="90">
            <template #default="{ row }">
              <el-tag size="small" :type="row.enabled ? 'success' : 'info'">
                {{ row.enabled ? '启用' : '已吊销' }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="140" fixed="right">
            <template #default="{ row }">
              <el-button
                size="small"
                link
                type="primary"
                :disabled="!row.enabled"
                :loading="tokenSaving"
                @click="rotateToken(row)"
              >
                轮换
              </el-button>
              <el-button
                size="small"
                link
                type="danger"
                :disabled="!row.enabled"
                @click="revokeToken(row)"
              >
                吊销
              </el-button>
            </template>
          </el-table-column>
        </el-table>
      </div>
    </div>

    <!-- Create / edit project -->
    <el-dialog
      v-model="projectDialog"
      :title="editingProjectId ? '编辑项目' : '新建项目'"
      width="460px"
      destroy-on-close
    >
      <el-form label-position="top">
        <el-form-item label="项目 ID" required>
          <el-input
            v-model="projectForm.id"
            :disabled="Boolean(editingProjectId)"
            placeholder="例如 checkout-web（写入 SDK projectId）"
          />
        </el-form-item>
        <el-form-item label="名称" required>
          <el-input v-model="projectForm.name" placeholder="展示名称" />
        </el-form-item>
        <el-form-item label="环境" required>
          <el-select v-model="projectForm.env" style="width: 100%">
            <el-option
              v-for="opt in envOptions"
              :key="opt.value"
              :label="opt.label"
              :value="opt.value"
            />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="projectDialog = false">取消</el-button>
        <el-button type="primary" :loading="projectSaving" @click="saveProject">保存</el-button>
      </template>
    </el-dialog>

    <!-- Generate token (name) -->
    <el-dialog v-model="tokenDialog" title="生成 Token" width="420px" destroy-on-close>
      <el-form label-position="top">
        <el-form-item label="备注名称">
          <el-input v-model="tokenName" placeholder="例如 生产主密钥 / CI 上报" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="tokenDialog = false">取消</el-button>
        <el-button type="primary" :loading="tokenSaving" @click="confirmCreateToken">生成</el-button>
      </template>
    </el-dialog>

    <!-- Plaintext once -->
    <el-dialog
      v-model="plainDialog"
      title="请立即复制 Token"
      width="520px"
      :close-on-click-modal="false"
      destroy-on-close
    >
      <el-alert
        type="warning"
        show-icon
        :closable="false"
        title="关闭后将无法再次查看明文"
        description="服务端只保存 hash。请复制到密钥管理或 CI 变量，再配置到 SDK 的 token / 请求头 x-project-token。"
        style="margin-bottom: 12px"
      />
      <el-input v-model="plainToken" readonly type="textarea" :rows="3" class="plain-input" />
      <template #footer>
        <el-button :icon="CopyDocument" type="primary" @click="copyPlain">
          {{ plainCopied ? '已复制' : '复制明文' }}
        </el-button>
        <el-button @click="plainDialog = false">我已保存，关闭</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.banner {
  margin-bottom: 16px;
}
.layout {
  display: grid;
  grid-template-columns: minmax(320px, 1fr) minmax(360px, 1.2fr);
  gap: 16px;
  align-items: start;
}
@media (max-width: 1100px) {
  .layout {
    grid-template-columns: 1fr;
  }
}
.mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
}
.token-tip {
  margin-bottom: 4px;
}
.plain-input :deep(textarea) {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 13px;
}
:deep(.el-table .is-selected > td.el-table__cell) {
  background: var(--afm-accent-soft) !important;
}
</style>
