import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    component: () => import('@/layouts/DefaultLayout.vue'),
    children: [
      {
        path: '',
        redirect: '/overview',
      },
      {
        path: 'overview',
        name: 'overview',
        component: () => import('@/views/OverviewView.vue'),
        meta: { title: '监控总览' },
      },
      {
        path: 'pages',
        name: 'pages',
        component: () => import('@/views/PagesView.vue'),
        meta: { title: '页面性能' },
      },
      {
        path: 'pages/:route',
        name: 'page-detail',
        component: () => import('@/views/PageDetailView.vue'),
        meta: { title: '页面详情' },
      },
      {
        path: 'errors',
        name: 'errors',
        component: () => import('@/views/ErrorsView.vue'),
        meta: { title: '错误分析' },
      },
      {
        path: 'apis',
        name: 'apis',
        component: () => import('@/views/ApisView.vue'),
        meta: { title: '接口分析' },
      },
      {
        path: 'releases',
        name: 'releases',
        component: () => import('@/views/ReleasesView.vue'),
        meta: { title: '版本对比' },
      },
      {
        path: 'releases/:version',
        name: 'release-detail',
        component: () => import('@/views/ReleaseDetailView.vue'),
        meta: { title: '版本详情' },
      },
      {
        path: 'alerts',
        name: 'alerts',
        component: () => import('@/views/AlertsView.vue'),
        meta: { title: '告警中心' },
      },
      {
        path: 'alerts/:id',
        name: 'alert-detail',
        component: () => import('@/views/AlertDetailView.vue'),
        meta: { title: '告警详情' },
      },
      {
        path: 'tasks',
        name: 'tasks',
        component: () => import('@/views/TasksView.vue'),
        meta: { title: '治理任务' },
      },
      {
        path: 'tasks/:id',
        name: 'task-detail',
        component: () => import('@/views/TaskDetailView.vue'),
        meta: { title: '任务详情' },
      },
      {
        path: 'settings',
        name: 'settings',
        component: () => import('@/views/SettingsView.vue'),
        meta: { title: '项目设置' },
      },
      {
        path: 'onboarding',
        name: 'onboarding',
        component: () => import('@/views/OnboardingView.vue'),
        meta: { title: '接入验证' },
      },
    ],
  },
  {
    path: '/:pathMatch(.*)*',
    name: 'not-found',
    component: () => import('@/views/NotFoundView.vue'),
    meta: { title: '页面不存在' },
  },
]

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
})

router.afterEach((to) => {
  const base = 'AI 前端性能监控平台'
  const title = (to.meta?.title as string | undefined) ?? ''
  document.title = title ? `${title} · ${base}` : base
})

export default router
