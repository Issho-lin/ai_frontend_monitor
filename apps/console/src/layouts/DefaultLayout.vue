<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { ElMessage } from 'element-plus'
import {
  DataAnalysis,
  Monitor,
  Warning,
  Connection,
  Bell,
  List,
  Setting,
  Aim,
  Refresh,
  Fold,
  Expand,
  Search,
  Histogram,
} from '@element-plus/icons-vue'
import logoMark from '@/assets/logo-mark.svg'
import { useFiltersStore } from '@/stores/filters'

const route = useRoute()
const router = useRouter()

const collapse = ref(false)
const filters = useFiltersStore()
const { projects, currentProject, env, timeRange, version, device, region, versions, regions } =
  storeToRefs(filters)

const activeKey = computed(() => {
  const first = route.path.split('/').filter(Boolean)[0]
  return first || 'overview'
})

function go(name: string) {
  router.push({ name })
}

function refreshNow() {
  ElMessage.info('已请求最新数据（示例）')
}

const navItems = [
  { key: 'overview', label: '监控总览', icon: Monitor, name: 'overview' },
  { key: 'pages', label: '页面性能', icon: DataAnalysis, name: 'pages' },
  { key: 'errors', label: '错误分析', icon: Warning, name: 'errors' },
  { key: 'apis', label: '接口分析', icon: Connection, name: 'apis' },
  { key: 'releases', label: '版本对比', icon: Histogram, name: 'releases' },
  { key: 'alerts', label: '告警中心', icon: Bell, name: 'alerts' },
  { key: 'tasks', label: '治理任务', icon: List, name: 'tasks' },
  { key: 'settings', label: '项目设置', icon: Setting, name: 'settings' },
  { key: 'onboarding', label: '接入验证', icon: Aim, name: 'onboarding' },
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
        text-color="rgba(255,255,255,0.6)"
        active-text-color="#ffffff"
        @select="go($event as string)"
      >
        <el-menu-item v-for="item in navItems" :key="item.key" :index="item.name">
          <el-icon class="nav-icon"><component :is="item.icon" /></el-icon>
          <template #title>{{ item.label }}</template>
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
          <div class="traffic-lights">
            <span class="traffic-dot traffic-close" />
            <span class="traffic-dot traffic-minimize" />
            <span class="traffic-dot traffic-expand" />
          </div>
          <div class="topbar-divider" />
          <div class="topbar-title">{{ pageTitle }}</div>
        </div>

        <div class="topbar-spacer" />

        <div class="topbar-right">
          <el-input
            placeholder="搜索页面、告警、任务…"
            :prefix-icon="Search"
            class="topbar-search"
          />
          <el-badge :value="5" :offset="[-6, 6]">
            <el-button circle :icon="Bell" class="topbar-bell" />
          </el-badge>
          <el-avatar :size="36" class="topbar-avatar">
            L
          </el-avatar>
        </div>
      </el-header>

      <!-- Filter bar -->
      <div class="filter-bar">
        <el-select v-model="currentProject" class="filter-select">
          <el-option v-for="p in projects" :key="p.id" :label="p.name" :value="p.id" />
        </el-select>
        <el-select v-model="env" class="filter-select">
          <el-option label="生产" value="production" />
          <el-option label="预发" value="staging" />
          <el-option label="开发" value="development" />
        </el-select>
        <el-select v-model="timeRange" class="filter-select">
          <el-option label="最近 15 分钟" value="15m" />
          <el-option label="最近 1 小时" value="1h" />
          <el-option label="最近 6 小时" value="6h" />
          <el-option label="最近 24 小时" value="24h" />
          <el-option label="最近 7 天" value="7d" />
          <el-option label="最近 30 天" value="30d" />
        </el-select>
        <el-select v-model="version" class="filter-select">
          <el-option
            v-for="v in versions"
            :key="v"
            :label="v === 'all' ? '全部版本' : v"
            :value="v"
          />
        </el-select>
        <el-select v-model="device" class="filter-select">
          <el-option label="全部设备" value="all" />
          <el-option label="桌面端" value="desktop" />
          <el-option label="移动端" value="mobile" />
          <el-option label="平板" value="tablet" />
        </el-select>
        <el-select v-model="region" class="filter-select">
          <el-option
            v-for="r in regions"
            :key="r"
            :label="r === 'all' ? '全部地区' : r"
            :value="r"
          />
        </el-select>
        <el-button :icon="Refresh" plain size="default" @click="refreshNow">
          刷新
        </el-button>
      </div>

      <el-main class="main-area">
        <router-view v-slot="{ Component, route: r }">
          <transition name="apple-fade" mode="out-in">
            <component :is="Component" :key="r.fullPath" />
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
  border-right: 1px solid rgba(255, 255, 255, 0.04);
  transition: width var(--afm-motion-base) var(--afm-ease);
  overflow: hidden;
  position: relative;
}

.side::after {
  content: '';
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  width: 1px;
  background: linear-gradient(180deg, rgba(0, 119, 238, 0.15) 0%, transparent 100%);
  pointer-events: none;
}

/* ── Brand ── */
.brand {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 18px 20px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  min-height: 64px;
  flex-shrink: 0;
  position: relative;
}

.brand::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 3px;
  background: linear-gradient(180deg, #0077ee 0%, #38bdf8 100%);
  border-radius: 0 2px 2px 0;
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
  background: rgba(0, 119, 238, 0.12) !important;
}

.side-menu :deep(.el-menu-item.is-active) {
  background: rgba(0, 119, 238, 0.2) !important;
  color: #fff !important;
  position: relative;
}

.side-menu :deep(.el-menu-item.is-active)::before {
  content: '';
  position: absolute;
  right: 10px;
  top: 50%;
  transform: translateY(-50%);
  width: 4px;
  height: 20px;
  background: linear-gradient(180deg, #38bdf8, #0077ee);
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
  color: rgba(56, 189, 248, 0.9);
  background: rgba(56, 189, 248, 0.08);
}

/* ── Top bar (frosted glass) ── */
.topbar {
  background: var(--afm-glass);
  backdrop-filter: blur(24px) saturate(150%);
  -webkit-backdrop-filter: blur(24px) saturate(150%);
  border-bottom: 1px solid var(--afm-glass-border);
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
  gap: 14px;
  flex-shrink: 0;
}

.traffic-lights {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
}

.traffic-dot {
  width: 14px;
  height: 14px;
  border-radius: 50%;
}

.traffic-close {
  background: #ff5f57;
}

.traffic-minimize {
  background: #febc2e;
}

.traffic-expand {
  background: #28c840;
}

.topbar-divider {
  width: 1px;
  height: 24px;
  background: var(--afm-border);
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

.topbar-search {
  width: 280px;
}

.topbar-search :deep(.el-input__wrapper) {
  background: var(--afm-bg);
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
  border: 2px solid rgba(0, 119, 238, 0.3);
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
  background: var(--afm-glass);
  backdrop-filter: blur(24px) saturate(150%);
  -webkit-backdrop-filter: blur(24px) saturate(150%);
  border-bottom: 1px solid var(--afm-glass-border);
  padding: 12px 28px;
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  flex-shrink: 0;
}

.filter-select {
  width: 160px;
}

.filter-select :deep(.el-input__wrapper) {
  background: var(--afm-bg);
  box-shadow: none;
  border-radius: var(--afm-radius-sm);
  border: 1px solid var(--afm-border);
  padding: 0 10px;
}

.filter-select :deep(.el-input__wrapper:hover) {
  border-color: var(--afm-border-strong);
}

.filter-select :deep(.el-input__wrapper.is-focus) {
  border-color: var(--afm-accent);
  box-shadow: 0 0 0 2px var(--afm-accent-soft);
}

.filter-select :deep(.el-input__inner) {
  font-size: 14px;
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
  .topbar-search {
    display: none;
  }
}
</style>
