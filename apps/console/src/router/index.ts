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
        meta: { title: '总览' },
      },
      {
        path: 'triage/:kind/:id',
        name: 'triage',
        component: () => import('@/views/IssueTriageView.vue'),
        meta: { title: '排障' },
      },
      {
        path: 'pages',
        name: 'pages',
        component: () => import('@/views/PagesView.vue'),
        meta: { title: '性能体验' },
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
        meta: { title: '异常中心' },
      },
      {
        path: 'apis',
        name: 'apis',
        component: () => import('@/views/ApisView.vue'),
        meta: { title: '请求分析' },
      },
      {
        path: 'apis/detail',
        name: 'api-detail',
        component: () => import('@/views/ApiDetailView.vue'),
        meta: { title: '接口详情' },
      },
      {
        path: 'issues',
        name: 'issues',
        component: () => import('@/views/IssuesView.vue'),
        meta: { title: '待处理' },
      },
      {
        path: 'sessions',
        name: 'sessions',
        component: () => import('@/views/SessionsView.vue'),
        meta: { title: '用户会话' },
      },
      {
        path: 'sessions/:id',
        name: 'session-detail',
        component: () => import('@/views/SessionDetailView.vue'),
        meta: { title: '会话详情' },
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
        path: 'docs',
        name: 'docs',
        component: () => import('@/views/DocsView.vue'),
        meta: { title: '接入文档' },
      },
      {
        path: 'projects',
        name: 'projects',
        component: () => import('@/views/ProjectsView.vue'),
        meta: { title: '项目管理' },
      },
      {
        // 设置入口暂指向接入文档；项目管理走 /projects
        path: 'settings',
        redirect: '/docs',
      },
      {
        path: 'onboarding',
        redirect: '/docs',
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
