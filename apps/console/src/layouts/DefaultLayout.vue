<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import {
  DataAnalysis,
  Monitor,
  Warning,
  Connection,
  Bell,
  Document,
  Refresh,
  Fold,
  Expand,
  Search,
  User,
} from '@element-plus/icons-vue'
import logoMark from '@/assets/logo-mark.svg'
import { monitorSearch } from '@/composables/monitorSearch'
import { useFiltersStore } from '@/stores/filters'

const route = useRoute()
const router = useRouter()

const collapse = ref(false)
const refreshTick = ref(0)
const filters = useFiltersStore()
const { currentProject, env, version, versions, timeRange, projects } = storeToRefs(filters)
const alertCount = ref(0)
const searchText = ref('')
const searchOpen = ref(false)
const searching = ref(false)
const searchWrap = ref<HTMLElement | null>(null)
const emptySearch = () => ({
  pages: [] as { route: string; pv: number }[],
  errors: [] as { id: string; message: string; route: string }[],
  alerts: [] as { id: string; title: string; route: string; status: string }[],
  sessions: [] as { id: string; route: string }[],
  apis: [] as { api: string; method: string }[],
})
const searchResults = ref(emptySearch())
let searchTimer: ReturnType<typeof setTimeout> | undefined
let searchSeq = 0

const activeKey = computed(() => {
  if (route.name === 'triage') {
    const kind = String(route.params.kind)
    if (kind === 'error') return 'errors'
    if (kind === 'alert') return 'alerts'
    if (kind === 'session') return 'sessions'
    return 'overview'
  }
  if (route.name === 'page-detail') return 'pages'
  if (route.name === 'alert-detail') return 'alerts'
  if (route.name === 'release-detail') return 'releases'
  const first = route.path.split('/').filter(Boolean)[0]
  return first || 'overview'
})

function go(name: string) {
  router.push({ name })
}

const searchEmpty = computed(() =>
  !searching.value
  && searchResults.value.pages.length === 0
  && searchResults.value.errors.length === 0
  && searchResults.value.alerts.length === 0
  && searchResults.value.sessions.length === 0
  && searchResults.value.apis.length === 0,
)

function onSearchInput() {
  searchOpen.value = true
  if (searchTimer) clearTimeout(searchTimer)
  const query = searchText.value.trim()
  if (!query) {
    searchSeq += 1
    searching.value = false
    searchResults.value = emptySearch()
    return
  }
  searching.value = true
  searchTimer = setTimeout(() => {
    void runSearch(query)
  }, 250)
}

async function runSearch(query: string) {
  const seq = ++searchSeq
  searching.value = true
  try {
    const response = await fetch(`/api/v1/search?${monitorSearch({ q: query }).toString()}`)
    if (seq !== searchSeq || !response.ok) return
    searchResults.value = await response.json()
  } catch {
    if (seq === searchSeq) searchResults.value = emptySearch()
  } finally {
    if (seq === searchSeq) searching.value = false
  }
}

function closeSearch() {
  searchOpen.value = false
}

function openPage(pageRoute: string) {
  closeSearch()
  void router.push(`/pages/${encodeURIComponent(pageRoute)}`)
}

function openError(id: string) {
  closeSearch()
  void router.push({ name: 'triage', params: { kind: 'error', id } })
}

function openAlert(id: string) {
  closeSearch()
  void router.push({ name: 'alert-detail', params: { id } })
}

function openSession(id: string) {
  closeSearch()
  void router.push({ name: 'session-detail', params: { id } })
}

function openApi(api: string) {
  closeSearch()
  void router.push({ name: 'api-detail', query: { api } })
}

function onPointerDown(event: PointerEvent) {
  if (!searchWrap.value?.contains(event.target as Node)) closeSearch()
}

function refreshNow() {
  void loadVersions()
  void loadAlertCount()
  refreshTick.value += 1
}

async function loadAlertCount() {
  try {
    const response = await fetch(`/api/v1/alerts?${monitorSearch().toString()}`)
    if (!response.ok) return
    const rows = (await response.json()) as { status: string }[]
    alertCount.value = rows.filter((row) => row.status === 'firing' || row.status === 'acknowledged').length
  } catch {
    alertCount.value = 0
  }
}

async function loadVersions() {
  try {
    const response = await fetch(`/api/v1/releases?projectId=${encodeURIComponent(currentProject.value)}`)
    if (!response.ok) return
    const rows = (await response.json()) as { version: string; env: string }[]
    const names = rows
      .filter((row) => row.env === env.value && row.version)
      .map((row) => row.version)
    const unique = [...new Set(names)]
    versions.value = ['all', ...unique]
    if (!versions.value.includes(version.value)) {
      version.value = 'all'
    }
  } catch {
    versions.value = ['all']
  }
}

onMounted(() => {
  void loadVersions()
  void loadAlertCount()
  document.addEventListener('pointerdown', onPointerDown)
})

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onPointerDown)
  if (searchTimer) clearTimeout(searchTimer)
})

watch([currentProject, env], () => {
  void loadVersions()
})

watch([currentProject, env, version], () => {
  void loadAlertCount()
})

const workbenchItems = [
  { key: 'overview', label: '总览', icon: Monitor, name: 'overview' },
  { key: 'errors', label: '异常中心', icon: Warning, name: 'errors' },
  { key: 'pages', label: '性能体验', icon: DataAnalysis, name: 'pages' },
  { key: 'apis', label: '请求分析', icon: Connection, name: 'apis' },
  { key: 'sessions', label: '用户会话', icon: User, name: 'sessions' },
  { key: 'releases', label: '版本对比', icon: DataAnalysis, name: 'releases' },
  { key: 'alerts', label: '告警中心', icon: Bell, name: 'alerts' },
]

const pageTitle = computed(() => (route.meta?.title as string | undefined) ?? '')
</script>

<template>
  <el-container class="layout-root">
    <!-- Sidebar -->
    <el-aside :width="collapse ? '64px' : '240px'" class="side">
      <div class="brand" :class="{ collapsed: collapse }">
        <img class="brand-logo" :src="logoMark" alt="AI Frontend Monitor" />
        <div v-if="!collapse" class="brand-text">
          <div class="brand-title">性能监控</div>
        </div>
      </div>

      <el-menu
        :default-active="activeKey"
        class="side-menu"
        :collapse="collapse"
        background-color="transparent"
        text-color="rgba(255,255,255,0.62)"
        active-text-color="#ffffff"
        @select="go($event as string)"
      >
        <el-menu-item v-for="item in workbenchItems" :key="item.key" :index="item.name">
          <el-icon class="nav-icon"><component :is="item.icon" /></el-icon>
          <template #title>{{ item.label }}</template>
        </el-menu-item>
        <el-menu-item index="docs">
          <el-icon class="nav-icon"><Document /></el-icon>
          <template #title>接入文档</template>
        </el-menu-item>
      </el-menu>

      <div class="side-footer">
        <button
          class="side-collapse"
          type="button"
          :aria-label="collapse ? '展开' : '折叠'"
          @click="collapse = !collapse"
        >
          <el-icon class="footer-icon"><component :is="collapse ? Expand : Fold" /></el-icon>
        </button>
      </div>
    </el-aside>

    <el-container>
      <!-- Top bar -->
      <el-header class="topbar">
        <div class="topbar-left">
          <svg class="topbar-mark" viewBox="0 0 32 14" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <rect x="2" y="8" width="4" height="5" rx="0.5" fill="#ff5f57"/>
            <rect x="8" y="5" width="4" height="8" rx="0.5" fill="#febc2e"/>
            <rect x="14" y="2" width="4" height="11" rx="0.5" fill="#28c840"/>
          </svg>
          <div class="topbar-title">{{ pageTitle }}</div>
        </div>

        <div class="topbar-spacer" />

        <div class="topbar-right">
          <div ref="searchWrap" class="search-wrap">
            <el-input
              v-model="searchText"
              placeholder="搜索页面、异常、会话、接口、告警"
              :prefix-icon="Search"
              class="topbar-search"
              clearable
              @input="onSearchInput"
              @focus="searchOpen = Boolean(searchText.trim())"
              @keydown.escape="closeSearch"
            />
            <div v-if="searchOpen && searchText.trim()" class="search-panel">
              <p v-if="searching" class="search-empty">正在搜索…</p>
              <p v-else-if="searchEmpty" class="search-empty">没有匹配的页面、异常、会话、接口或告警。</p>
              <template v-else>
                <section v-if="searchResults.pages.length">
                  <div class="search-label">页面</div>
                  <button v-for="item in searchResults.pages" :key="item.route" type="button" @click="openPage(item.route)">
                    <strong>{{ item.route }}</strong>
                    <span>PV {{ item.pv }}</span>
                  </button>
                </section>
                <section v-if="searchResults.errors.length">
                  <div class="search-label">异常</div>
                  <button v-for="item in searchResults.errors" :key="item.id" type="button" @click="openError(item.id)">
                    <strong>{{ item.message }}</strong>
                    <span>{{ item.route }}</span>
                  </button>
                </section>
                <section v-if="searchResults.alerts.length">
                  <div class="search-label">告警</div>
                  <button v-for="item in searchResults.alerts" :key="item.id" type="button" @click="openAlert(item.id)">
                    <strong>{{ item.title }}</strong>
                    <span>{{ item.route }}</span>
                  </button>
                </section>
                <section v-if="searchResults.sessions.length">
                  <div class="search-label">会话</div>
                  <button v-for="item in searchResults.sessions" :key="item.id" type="button" @click="openSession(item.id)">
                    <strong>{{ item.id }}</strong>
                    <span>{{ item.route }}</span>
                  </button>
                </section>
                <section v-if="searchResults.apis.length">
                  <div class="search-label">接口</div>
                  <button v-for="item in searchResults.apis" :key="item.api" type="button" @click="openApi(item.api)">
                    <strong>{{ item.api }}</strong>
                    <span>{{ item.method }}</span>
                  </button>
                </section>
              </template>
            </div>
          </div>
          <el-button circle :icon="Refresh" class="topbar-bell" aria-label="刷新数据" @click="refreshNow" />
          <el-badge :value="alertCount" :hidden="alertCount === 0" :offset="[-6, 6]">
            <el-button circle :icon="Bell" class="topbar-bell" aria-label="告警" @click="router.push({ name: 'alerts' })" />
          </el-badge>
          <el-avatar :size="36" class="topbar-avatar">
            L
          </el-avatar>
        </div>
      </el-header>

      <!-- Filter bar -->
      <div class="filter-bar">
        <div class="filter-group">
          <label class="filter-field">
            <span>应用</span>
            <el-select v-model="currentProject">
              <el-option v-for="p in projects" :key="p.id" :label="p.name" :value="p.id" />
            </el-select>
          </label>
          <label class="filter-field">
            <span>环境</span>
            <el-select v-model="env">
              <el-option label="生产" value="production" />
              <el-option label="预发" value="staging" />
              <el-option label="开发" value="development" />
            </el-select>
          </label>
          <label class="filter-field">
            <span>版本</span>
            <el-select v-model="version">
              <el-option v-for="v in versions" :key="v" :label="v === 'all' ? '全部版本' : v" :value="v" />
            </el-select>
          </label>
        </div>
        <el-radio-group v-model="timeRange" class="window-switch">
          <el-radio-button value="24h">近 24 小时</el-radio-button>
          <el-radio-button value="7d">近 7 天</el-radio-button>
          <el-radio-button value="30d">近 30 天</el-radio-button>
        </el-radio-group>
      </div>

      <el-main class="main-area">
        <router-view v-slot="{ Component, route: r }">
          <transition name="apple-fade" mode="out-in">
            <component :is="Component" :key="`${r.fullPath}-${refreshTick}-${currentProject}-${env}-${version}-${timeRange}`" />
          </transition>
        </router-view>
      </el-main>
    </el-container>
  </el-container>
</template>

<script lang="ts">
export default {
  name: 'DefaultLayout',
}
</script>

<style scoped>
.layout-root {
  height: 100vh;
}

/* ── Sidebar ── */
.side {
  background: linear-gradient(180deg, #0c1626 0%, #0f172a 50%, #0b1120 100%);
  display: flex;
  flex-direction: column;
  border-right: 1px solid rgba(255, 255, 255, 0.06);
  transition: width var(--afm-motion-base) var(--afm-ease);
  overflow: hidden;
  position: relative;
}

/* ── Brand ── */
.brand {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 18px 20px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  min-height: 64px;
  flex-shrink: 0;
  position: relative;
}

.brand.collapsed {
  justify-content: center;
  padding: 18px 10px;
}

.brand-logo {
  width: 36px;
  height: 36px;
  flex-shrink: 0;
}

.brand-text {
  overflow: hidden;
  white-space: nowrap;
}

.brand-title {
  font-size: 16px;
  font-weight: 700;
  color: #fff;
  letter-spacing: -0.01em;
}

.side-menu {
  flex: 1;
  border-right: 0;
  padding: 12px 8px;
  background: transparent !important;
  overflow-y: auto;
}

.side-menu :deep(.el-menu-item) {
  border-radius: var(--afm-radius-sm);
  margin: 3px 6px;
  height: 42px;
  line-height: 42px;
  transition: all 150ms var(--afm-ease);
  font-size: 14px;
}

.side-menu :deep(.el-menu-item .nav-icon) {
  font-size: 18px;
}

.side-menu :deep(.el-menu-item):hover {
  background: rgba(255, 255, 255, 0.06) !important;
  color: #fff !important;
}

.side-menu :deep(.el-menu-item.is-active) {
  background: rgba(0, 119, 238, 0.22) !important;
  color: #fff !important;
  position: relative;
}

.side-menu :deep(.el-menu-item.is-active)::before {
  content: '';
  position: absolute;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  width: 3px;
  height: 22px;
  background: #7ec8ff;
  border-radius: 2px;
}

.side-menu :deep(.el-menu--collapse .el-menu-item) {
  margin: 3px 6px;
}

.side-footer {
  padding: 12px 8px;
  flex-shrink: 0;
}

.side-collapse {
  background: transparent;
  border: none;
  color: rgba(255, 255, 255, 0.35);
  cursor: pointer;
  width: 100%;
  padding: 8px 4px;
  border-radius: var(--afm-radius-sm);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 150ms var(--afm-ease);
}

.side-collapse .footer-icon {
  font-size: 18px;
}

.side-collapse:hover {
  color: #dbe4df;
  background: rgba(255, 255, 255, 0.06);
}

/* ── Top bar (frosted glass) ── */
.topbar {
  background: #fff;
  border-bottom: 1px solid var(--afm-border);
  display: flex;
  align-items: center;
  padding: 0 28px;
  height: 60px;
  gap: 18px;
  flex-shrink: 0;
  z-index: 10;
}

.topbar-left {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.topbar-mark {
  width: 32px;
  height: 14px;
  flex-shrink: 0;
}

.topbar-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--afm-text);
  letter-spacing: -0.01em;
}

.topbar-spacer {
  flex: 1;
}

.topbar-right {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-shrink: 0;
}

.search-wrap {
  position: relative;
  width: 280px;
}

.topbar-search {
  width: 100%;
}

.search-panel {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  width: 360px;
  max-height: 420px;
  overflow: auto;
  padding: 8px;
  background: #fff;
  border: 1px solid var(--afm-border);
  border-radius: 10px;
  box-shadow: 0 12px 32px rgba(15, 23, 42, 0.12);
  z-index: 30;
}

.search-label {
  padding: 6px 8px 2px;
  color: var(--afm-text-muted);
  font-size: 11px;
  font-weight: 700;
}

.search-panel button {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  padding: 8px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  text-align: left;
  cursor: pointer;
}

.search-panel button:hover {
  background: var(--afm-panel-soft);
}

.search-panel strong {
  font-size: 13px;
  font-weight: 650;
}

.search-panel span,
.search-empty {
  color: var(--afm-text-muted);
  font-size: 12px;
}

.search-empty {
  margin: 8px;
}

.topbar-search :deep(.el-input__wrapper) {
  background: var(--afm-panel-soft);
  box-shadow: none;
  border-radius: var(--afm-radius);
  border: 1px solid var(--afm-border);
  padding: 0 12px;
}

.topbar-search :deep(.el-input__wrapper:hover) {
  border-color: var(--afm-border-strong);
}

.topbar-search :deep(.el-input__wrapper.is-focus) {
  border-color: var(--afm-accent);
  box-shadow: 0 0 0 2px var(--afm-accent-soft);
}

.topbar-search :deep(.el-input__inner) {
  font-size: 14px;
}

.topbar-avatar {
  background: var(--afm-accent);
  color: #fff;
  border: 2px solid rgba(0, 119, 238, 0.28);
  cursor: pointer;
  font-size: 15px;
  font-weight: 600;
}

.topbar-bell {
  width: 36px;
  height: 36px;
  font-size: 18px;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.topbar-bell :deep(.el-icon) {
  font-size: 18px;
}

.topbar-avatar {
  background: var(--afm-accent);
  color: #fff;
  border: 1px solid rgba(255, 255, 255, 0.3);
  cursor: pointer;
}

/* ── Filter bar (frosted glass) ── */
.filter-bar {
  min-height: 54px;
  background: #fff;
  border-bottom: 1px solid var(--afm-border);
  padding: 8px 24px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-shrink: 0;
}

.filter-group {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  flex-wrap: wrap;
}

.filter-field {
  display: flex;
  align-items: center;
  height: 34px;
  border: 1px solid var(--afm-border);
  border-radius: 5px;
  background: #fff;
  overflow: hidden;
}

.filter-field > span {
  color: var(--afm-text-subtle);
  font-size: 11px;
  border-right: 1px solid var(--afm-border);
  padding: 0 8px;
  line-height: 34px;
  white-space: nowrap;
}

.filter-field :deep(.el-select) {
  width: 128px;
}

.filter-field :deep(.el-select__wrapper) {
  min-height: 32px;
  padding: 0 8px;
  background: transparent;
  border-radius: 0;
  box-shadow: none;
  font-size: 12px;
}

.filter-field :deep(.el-select__wrapper.is-focused),
.filter-field :deep(.el-select__wrapper.is-hovering) {
  box-shadow: none;
}

.filter-field :deep(.el-select__selected-item),
.filter-field :deep(.el-select__placeholder) {
  font-size: 12px;
  color: var(--afm-text);
}

.filter-field:focus-within {
  border-color: var(--afm-accent);
  box-shadow: 0 0 0 3px var(--afm-accent-soft);
}

.window-switch {
  flex-shrink: 0;
}
.window-switch :deep(.el-radio-button__inner) {
  height: 32px;
  padding: 0 12px;
  line-height: 30px;
  font-size: 12px;
  font-weight: 500;
  color: var(--afm-text-muted);
  background: var(--afm-panel-soft);
  border-color: var(--afm-border);
  box-shadow: none;
}
.window-switch :deep(.el-radio-button__inner:hover) {
  color: var(--afm-accent);
}
.window-switch :deep(.el-radio-button__original-radio:checked + .el-radio-button__inner) {
  background: var(--afm-accent);
  border-color: var(--afm-accent);
  color: #fff;
  box-shadow: none;
}

/* ── Main area ── */
.main-area {
  padding: 0;
  background: var(--afm-bg);
  overflow: auto;
}

/* ── Apple fade animation ── */
.apple-fade-enter-active,
.apple-fade-leave-active {
  transition: opacity var(--afm-motion-fast) var(--afm-ease),
              transform var(--afm-motion-fast) var(--afm-ease);
}

.apple-fade-enter-from {
  opacity: 0;
  transform: translateY(8px);
}

.apple-fade-leave-to {
  opacity: 0;
}

@media (max-width: 1100px) {
  .search-wrap {
    display: none;
  }
}
</style>
