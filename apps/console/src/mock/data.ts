import dayjs from 'dayjs'

export type Severity = 'S0' | 'S1' | 'S2' | 'S3'
export type AlertStatus = 'firing' | 'acknowledged' | 'resolved' | 'silenced'

export interface PageRow {
  route: string
  pv: number
  affectedUsers: number
  lcpP75: number
  inpP75: number
  clsP75: number
  jsErrorRate: number
  apiP95: number
  passRate: number
  trend: 'up' | 'down' | 'flat'
}

export interface AlertRow {
  id: string
  title: string
  severity: Severity
  status: AlertStatus
  route: string
  metric: string
  triggerValue: string
  baseline: string
  affectedUsers: number
  firstSeen: string
  lastSeen: string
  release: string
  /** id of the task generated from this alert, if any */
  linkedTaskId?: string
  /** convergence: sub-alerts and source rules folded into this alert */
  convergence?: {
    subAlerts: number
    sourceRules: string[]
    children: { id: string; segment: string; firstSeen: string }[]
  }
}

export type AcceptanceMetric =
  | 'lcp_p75'
  | 'inp_p75'
  | 'cls_p75'
  | 'api_p95'
  | 'js_error_rate'
  | 'ttfb_p75'

export interface TaskRow {
  id: string
  title: string
  route: string
  owner: string
  priority: 'P0' | 'P1' | 'P2' | 'P3'
  status: 'Open' | 'InProgress' | 'Verifying' | 'Resolved' | 'Reopened'
  acceptance: string
  /** structured acceptance criteria, used to parameterize the verification chart */
  acceptanceSpec: {
    metric: AcceptanceMetric
    label: string
    unit: string
    baseline: number
    target: number
    current: number
    windowHours: number
  }
  dueDate: string
  sourceAlertId: string
  createdAt: string
}

export interface ApiRow {
  api: string
  method: string
  p95: number
  p50: number
  errorRate: number
  timeoutRate: number
  qps: number
  traceCoverage: number
}

export interface ResourceRow {
  url: string
  type: 'js' | 'css' | 'img' | 'font' | 'other'
  size: number
  duration: number
  cacheHitRate: number
  failRate: number
}

export interface ErrorGroup {
  id: string
  message: string
  type: 'js' | 'promise' | 'resource'
  route: string
  release: string
  count: number
  affectedUsers: number
  firstSeen: string
  lastSeen: string
  status: 'unresolved' | 'watching' | 'resolved'
}

export const projectOverview = {
  status: 'warning' as 'healthy' | 'warning' | 'critical',
  activeAlerts: 5,
  affectedUsers: 12400,
  latestRelease: 'v1.18.0',
  latestReleaseAt: '2026-07-01 10:20',
}

export const coreMetrics = [
  { key: 'lcp', label: 'LCP P75', value: '3.8s', delta: '+58.3%', deltaDir: 'up' as const, good: false },
  { key: 'inp', label: 'INP P75', value: '280ms', delta: '+40.0%', deltaDir: 'up' as const, good: false },
  { key: 'cls', label: 'CLS P75', value: '0.08', delta: '-0.02', deltaDir: 'down' as const, good: true },
  { key: 'js_error', label: 'JS Error Rate', value: '1.2%', delta: '+0.4pp', deltaDir: 'up' as const, good: false },
  { key: 'api_p95', label: 'API P95', value: '920ms', delta: '+220ms', deltaDir: 'up' as const, good: false },
  { key: 'resource_fail', label: '资源失败率', value: '0.6%', delta: '-0.1pp', deltaDir: 'down' as const, good: true },
]

function buildTimeSeries(base: number, jitter = 0.15) {
  const points = 24
  const arr: [string, number][] = []
  const start = dayjs().subtract(points - 1, 'hour').startOf('hour')
  for (let i = 0; i < points; i++) {
    const t = start.add(i, 'hour')
    const wave = Math.sin(i / 3) * jitter * base
    const noise = (Math.random() - 0.4) * jitter * base
    const value = Math.max(0, base + wave + noise + (i > points - 5 ? base * 0.35 : 0))
    arr.push([t.format('MM-DD HH:mm'), Math.round(value * 100) / 100])
  }
  return arr
}

export const trendSeries = {
  lcp: buildTimeSeries(2.4, 0.18),
  inp: buildTimeSeries(200, 0.12),
  api_p95: buildTimeSeries(500, 0.2),
  js_error: buildTimeSeries(0.6, 0.1),
}

export const pageRows: PageRow[] = [
  {
    route: '/home',
    pv: 128432,
    affectedUsers: 12400,
    lcpP75: 4.1,
    inpP75: 320,
    clsP75: 0.09,
    jsErrorRate: 1.6,
    apiP95: 1300,
    passRate: 62,
    trend: 'up',
  },
  {
    route: '/product/:id',
    pv: 86021,
    affectedUsers: 4200,
    lcpP75: 3.2,
    inpP75: 390,
    clsP75: 0.06,
    jsErrorRate: 0.7,
    apiP95: 780,
    passRate: 74,
    trend: 'up',
  },
  {
    route: '/checkout',
    pv: 21089,
    affectedUsers: 1830,
    lcpP75: 2.7,
    inpP75: 210,
    clsP75: 0.04,
    jsErrorRate: 2.3,
    apiP95: 620,
    passRate: 81,
    trend: 'flat',
  },
  {
    route: '/cart',
    pv: 32112,
    affectedUsers: 950,
    lcpP75: 2.3,
    inpP75: 180,
    clsP75: 0.03,
    jsErrorRate: 0.4,
    apiP95: 540,
    passRate: 92,
    trend: 'down',
  },
  {
    route: '/user/orders',
    pv: 15442,
    affectedUsers: 640,
    lcpP75: 2.9,
    inpP75: 260,
    clsP75: 0.05,
    jsErrorRate: 0.8,
    apiP95: 720,
    passRate: 85,
    trend: 'flat',
  },
]

export const topProblems = [
  { rank: 1, kind: 'page', label: '/home', metric: 'LCP', value: '4.1s' },
  { rank: 2, kind: 'page', label: '/product/:id', metric: 'INP', value: '390ms' },
  { rank: 3, kind: 'page', label: '/checkout', metric: 'JS Error', value: '2.3%' },
  { rank: 4, kind: 'api', label: 'GET /api/recommend', metric: 'P95', value: '1.3s' },
  { rank: 5, kind: 'resource', label: '/static/banner.png', metric: '体积', value: '1.9MB' },
]

export const agentSummary = {
  headline: '移动端 /home LCP 在 v1.18.0 发布后显著劣化',
  detail:
    '主要证据：首屏 banner 图片体积从 180KB 增至 1.9MB；推荐接口 /api/recommend P95 从 420ms 升到 1.3s；同期 JS Error 无明显变化。',
  confidence: 'high' as const,
  updatedAt: dayjs().subtract(6, 'minute').format('HH:mm'),
}

export const alertRows: AlertRow[] = [
  {
    id: 'alrt-1001',
    title: '移动端 /home LCP P75 劣化',
    severity: 'S1',
    status: 'firing',
    route: '/home',
    metric: 'LCP P75',
    triggerValue: '4.1s',
    baseline: '2.4s',
    affectedUsers: 12400,
    firstSeen: '2026-07-01 10:22',
    lastSeen: '2026-07-01 12:03',
    release: 'v1.18.0',
    linkedTaskId: 'task-2001',
    convergence: {
      subAlerts: 3,
      sourceRules: ['核心页面 LCP 劣化'],
      children: [
        { id: 'alrt-1001-a', segment: 'iOS / Safari', firstSeen: '2026-07-01 10:22' },
        { id: 'alrt-1001-b', segment: 'Android / Chrome', firstSeen: '2026-07-01 10:25' },
        { id: 'alrt-1001-c', segment: '微信内嵌浏览器', firstSeen: '2026-07-01 10:29' },
      ],
    },
  },
  {
    id: 'alrt-1002',
    title: '/api/recommend 接口 P95 劣化',
    severity: 'S1',
    status: 'firing',
    route: '/home',
    metric: 'API P95',
    triggerValue: '1.3s',
    baseline: '420ms',
    affectedUsers: 9200,
    firstSeen: '2026-07-01 10:24',
    lastSeen: '2026-07-01 12:02',
    release: 'v1.18.0',
    convergence: {
      subAlerts: 2,
      sourceRules: ['接口 P95 劣化'],
      children: [
        { id: 'alrt-1002-a', segment: '华东', firstSeen: '2026-07-01 10:24' },
        { id: 'alrt-1002-b', segment: '华北', firstSeen: '2026-07-01 10:31' },
      ],
    },
  },
  {
    id: 'alrt-1003',
    title: '/checkout JS Error Rate 突增',
    severity: 'S2',
    status: 'acknowledged',
    route: '/checkout',
    metric: 'JS Error Rate',
    triggerValue: '2.3%',
    baseline: '0.6%',
    affectedUsers: 1830,
    firstSeen: '2026-07-01 09:41',
    lastSeen: '2026-07-01 11:12',
    release: 'v1.18.0',
    linkedTaskId: 'task-2002',
  },
  {
    id: 'alrt-1004',
    title: '/static/banner.png 大小异常',
    severity: 'S2',
    status: 'firing',
    route: '/home',
    metric: '资源体积',
    triggerValue: '1.9MB',
    baseline: '180KB',
    affectedUsers: 12400,
    firstSeen: '2026-07-01 10:20',
    lastSeen: '2026-07-01 12:00',
    release: 'v1.18.0',
  },
  {
    id: 'alrt-0987',
    title: '/cart TTFB P75 上升',
    severity: 'S3',
    status: 'resolved',
    route: '/cart',
    metric: 'TTFB P75',
    triggerValue: '1.4s',
    baseline: '820ms',
    affectedUsers: 320,
    firstSeen: '2026-06-30 21:04',
    lastSeen: '2026-06-30 22:40',
    release: 'v1.17.4',
    linkedTaskId: 'task-1998',
  },
]

export const taskRows: TaskRow[] = [
  {
    id: 'task-2001',
    title: '压缩首屏 banner 图片并降级推荐接口',
    route: '/home',
    owner: '林琦彬',
    priority: 'P0',
    status: 'InProgress',
    acceptance: '移动端 /home LCP P75 连续 24 小时 <= 2.5s',
    acceptanceSpec: {
      metric: 'lcp_p75',
      label: 'LCP P75',
      unit: 's',
      baseline: 4.1,
      target: 2.5,
      current: 2.4,
      windowHours: 24,
    },
    dueDate: '2026-07-04',
    sourceAlertId: 'alrt-1001',
    createdAt: '2026-07-01 11:05',
  },
  {
    id: 'task-2002',
    title: '/checkout JS Error 定位与回滚三方脚本',
    route: '/checkout',
    owner: '王小星',
    priority: 'P1',
    status: 'Open',
    acceptance: '/checkout JS Error Rate 连续 48 小时 <= 0.5%',
    acceptanceSpec: {
      metric: 'js_error_rate',
      label: 'JS Error Rate',
      unit: '%',
      baseline: 2.3,
      target: 0.5,
      current: 2.1,
      windowHours: 48,
    },
    dueDate: '2026-07-05',
    sourceAlertId: 'alrt-1003',
    createdAt: '2026-07-01 10:12',
  },
  {
    id: 'task-1998',
    title: '/cart TTFB 优化与缓存策略调整',
    route: '/cart',
    owner: '陈开',
    priority: 'P2',
    status: 'Verifying',
    acceptance: '/cart TTFB P75 连续 24 小时 <= 900ms',
    acceptanceSpec: {
      metric: 'ttfb_p75',
      label: 'TTFB P75',
      unit: 'ms',
      baseline: 1400,
      target: 900,
      current: 860,
      windowHours: 24,
    },
    dueDate: '2026-07-02',
    sourceAlertId: 'alrt-0987',
    createdAt: '2026-06-30 22:50',
  },
  {
    id: 'task-1980',
    title: '/user/orders 慢加载三方 CDN 替换',
    route: '/user/orders',
    owner: '李默',
    priority: 'P2',
    status: 'Resolved',
    acceptance: '/user/orders LCP P75 <= 2.8s',
    acceptanceSpec: {
      metric: 'lcp_p75',
      label: 'LCP P75',
      unit: 's',
      baseline: 3.6,
      target: 2.8,
      current: 2.6,
      windowHours: 24,
    },
    dueDate: '2026-06-28',
    sourceAlertId: 'alrt-0930',
    createdAt: '2026-06-25 15:20',
  },
]

export const apiRows: ApiRow[] = [
  { api: '/api/recommend', method: 'GET', p95: 1300, p50: 640, errorRate: 0.4, timeoutRate: 0.2, qps: 820, traceCoverage: 92 },
  { api: '/api/product/detail', method: 'GET', p95: 780, p50: 260, errorRate: 0.8, timeoutRate: 0.1, qps: 1240, traceCoverage: 88 },
  { api: '/api/checkout/submit', method: 'POST', p95: 620, p50: 210, errorRate: 2.1, timeoutRate: 0.6, qps: 210, traceCoverage: 95 },
  { api: '/api/cart/list', method: 'GET', p95: 540, p50: 180, errorRate: 0.2, timeoutRate: 0.0, qps: 640, traceCoverage: 90 },
  { api: '/api/user/orders', method: 'GET', p95: 720, p50: 320, errorRate: 0.6, timeoutRate: 0.1, qps: 320, traceCoverage: 84 },
]

export const resourceRows: ResourceRow[] = [
  { url: '/static/banner.png', type: 'img', size: 1_900_000, duration: 1620, cacheHitRate: 12, failRate: 0.2 },
  { url: '/assets/main.8fd3.js', type: 'js', size: 620_000, duration: 480, cacheHitRate: 85, failRate: 0 },
  { url: '/assets/vendor.4a20.js', type: 'js', size: 812_000, duration: 620, cacheHitRate: 90, failRate: 0 },
  { url: 'https://cdn.example.com/tracker.js', type: 'js', size: 42_000, duration: 380, cacheHitRate: 60, failRate: 1.4 },
  { url: '/fonts/pingfang-sc.woff2', type: 'font', size: 210_000, duration: 260, cacheHitRate: 92, failRate: 0 },
]

export const errorGroups: ErrorGroup[] = [
  {
    id: 'err-501',
    message: "TypeError: Cannot read properties of undefined (reading 'items')",
    type: 'js',
    route: '/checkout',
    release: 'v1.18.0',
    count: 812,
    affectedUsers: 1820,
    firstSeen: '2026-07-01 09:41',
    lastSeen: '2026-07-01 12:03',
    status: 'unresolved',
  },
  {
    id: 'err-489',
    message: 'ChunkLoadError: Loading chunk 42 failed.',
    type: 'js',
    route: '/product/:id',
    release: 'v1.18.0',
    count: 402,
    affectedUsers: 610,
    firstSeen: '2026-07-01 10:20',
    lastSeen: '2026-07-01 12:00',
    status: 'watching',
  },
  {
    id: 'err-410',
    message: 'UnhandledPromiseRejection: Network Error',
    type: 'promise',
    route: '/home',
    release: 'v1.18.0',
    count: 296,
    affectedUsers: 240,
    firstSeen: '2026-07-01 10:22',
    lastSeen: '2026-07-01 11:58',
    status: 'unresolved',
  },
  {
    id: 'err-380',
    message: 'ResourceLoadError: banner.png 404',
    type: 'resource',
    route: '/home',
    release: 'v1.18.0',
    count: 128,
    affectedUsers: 96,
    firstSeen: '2026-07-01 10:28',
    lastSeen: '2026-07-01 11:10',
    status: 'resolved',
  },
]

export const releaseTimeline = [
  { time: '2026-07-01 10:20', label: 'v1.18.0 发布', kind: 'release' },
  { time: '2026-07-01 10:22', label: '/home LCP 首次超阈值', kind: 'anomaly' },
  { time: '2026-07-01 10:30', label: '告警 alrt-1001 触发', kind: 'alert' },
  { time: '2026-07-01 10:31', label: 'Agent 诊断任务开始', kind: 'agent' },
  { time: '2026-07-01 10:34', label: 'Agent 报告生成', kind: 'agent' },
  { time: '2026-07-01 11:05', label: '负责人确认任务 task-2001', kind: 'task' },
]

export type Confidence = 'high' | 'medium' | 'low'

export interface AgentToolCall {
  id: string
  tool: string
  input: string
  durationMs: number
  output: string
}

export interface AgentReport {
  id: string
  alertId: string
  status: 'completed' | 'running' | 'failed'
  generatedAt: string
  conclusion: string
  impact: {
    pages: string[]
    users: number
    sessions: string
    releases: string[]
  }
  evidence: { id: string; text: string }[]
  candidates: { text: string; confidence: Confidence }[]
  actions: string[]
  missing: string[]
  /** read-only tool invocation trace, shown collapsed for audit */
  toolCalls: AgentToolCall[]
}

/**
 * Reports are generated per alert. Page and task pages never own an independent
 * report — they pull the diagnosis for the most relevant alert.
 */
export const agentReports: Record<string, AgentReport> = {
  'alrt-1001': {
    id: 'report-alrt-1001',
    alertId: 'alrt-1001',
    status: 'completed',
    generatedAt: '2026-07-01 10:34',
    conclusion:
      '移动端首页 LCP 在 2026-07-01 10:20 后显著升高，P75 从 2.4s 上升到 4.1s，与 v1.18.0 发布时间强相关。',
    impact: {
      pages: ['/home'],
      users: 12400,
      sessions: '18.7% 移动端会话',
      releases: ['v1.18.0'],
    },
    evidence: [
      { id: 'e1', text: 'LCP P75 在发布后 30 分钟内上升 70.8%' },
      { id: 'e2', text: '首屏 banner 图片体积从 180KB 增至 1.9MB' },
      { id: 'e3', text: '/api/recommend 接口 P95 从 420ms 上升到 1.3s' },
      { id: 'e4', text: '相同时间窗口 JS Error 无明显变化' },
    ],
    candidates: [
      { text: '首屏图片资源体积增大导致 LCP 劣化', confidence: 'high' },
      { text: '推荐接口变慢进一步拖慢首屏渲染', confidence: 'medium' },
    ],
    actions: [
      '压缩首屏 banner 图片，目标小于 300KB',
      '对推荐接口增加超时降级和骨架屏策略',
      '发布修复后观察移动端首页 LCP P75 是否回到 2.5s 内',
    ],
    missing: ['main.8fd3.js sourcemap 缺失，无法完成 JS 源码级定位'],
    toolCalls: [
      {
        id: 't1',
        tool: 'query_metrics',
        input: 'route=/home, metric=lcp_p75, window=24h',
        durationMs: 82,
        output: '24 个数据点，发布后 30 分钟内 +70.8%',
      },
      {
        id: 't2',
        tool: 'get_release_diff',
        input: 'from=v1.17.4, to=v1.18.0',
        durationMs: 45,
        output: '3 项资源变化，banner.png 体积 +10.5x',
      },
      {
        id: 't3',
        tool: 'analyze_resource',
        input: 'route=/home, top_n=5',
        durationMs: 61,
        output: 'banner.png 1.9MB，缓存命中率 12%',
      },
      {
        id: 't4',
        tool: 'analyze_api',
        input: 'route=/home',
        durationMs: 73,
        output: '/api/recommend P95 +210%',
      },
      {
        id: 't5',
        tool: 'query_events',
        input: 'route=/home, event=js_error, window=24h',
        durationMs: 39,
        output: 'JS Error 无显著变化',
      },
    ],
  },
  'alrt-1002': {
    id: 'report-alrt-1002',
    alertId: 'alrt-1002',
    status: 'completed',
    generatedAt: '2026-07-01 10:36',
    conclusion:
      '/api/recommend 接口 P95 在 v1.18.0 发布后上升 3 倍，与首页 LCP 劣化共同触发；推测为召回服务侧下游依赖变慢。',
    impact: {
      pages: ['/home'],
      users: 9200,
      sessions: '12.4% 会话调用受影响',
      releases: ['v1.18.0'],
    },
    evidence: [
      { id: 'e1', text: '/api/recommend P95 从 420ms 上升到 1.3s，持续 96 分钟' },
      { id: 'e2', text: '同期上游召回服务 rec-core 变更 build #2871' },
      { id: 'e3', text: 'trace 采样中 rec-core 阶段耗时占比由 32% 升至 61%' },
    ],
    candidates: [
      { text: '召回服务 rec-core 下游依赖变慢', confidence: 'high' },
      { text: '前端未做超时降级放大了体感耗时', confidence: 'medium' },
    ],
    actions: [
      '联系推荐服务同学定位 rec-core 下游依赖',
      '前端为推荐接口增加 800ms 超时与骨架屏兜底',
    ],
    missing: ['缺少推荐服务侧的完整 trace，需申请上游可观测性授权'],
    toolCalls: [
      {
        id: 't1',
        tool: 'query_metrics',
        input: 'api=/api/recommend, metric=p95, window=24h',
        durationMs: 76,
        output: 'P95 420ms → 1.3s，持续 96 分钟',
      },
      {
        id: 't2',
        tool: 'analyze_api',
        input: 'api=/api/recommend, breakdown=stage',
        durationMs: 88,
        output: 'rec-core 阶段耗时占比 32% → 61%',
      },
      {
        id: 't3',
        tool: 'get_release_diff',
        input: 'service=rec-core',
        durationMs: 52,
        output: '关联 build #2871 变更',
      },
    ],
  },
  'alrt-1003': {
    id: 'report-alrt-1003',
    alertId: 'alrt-1003',
    status: 'completed',
    generatedAt: '2026-07-01 09:52',
    conclusion:
      '/checkout JS Error Rate 由 0.6% 上升到 2.3%，主要来源是新引入的支付渠道 SDK 与旧订单结构不兼容。',
    impact: {
      pages: ['/checkout'],
      users: 1830,
      sessions: '9.1% 结算会话',
      releases: ['v1.18.0'],
    },
    evidence: [
      { id: 'e1', text: '错误分组 err-501 (TypeError: reading items) 占比 74%' },
      { id: 'e2', text: '错误集中在 iOS 15 / 微信内嵌浏览器' },
      { id: 'e3', text: '发布 diff 显示新增 pay-sdk@2.3.0' },
    ],
    candidates: [
      { text: '支付渠道 SDK 与旧订单字段不兼容', confidence: 'high' },
      { text: '路由切换时序变化导致数据未就绪', confidence: 'low' },
    ],
    actions: [
      '在 SDK 初始化前后打点确认订单字段兼容性',
      '临时对 iOS 15 灰度回退支付渠道 SDK',
    ],
    missing: [],
    toolCalls: [
      {
        id: 't1',
        tool: 'query_events',
        input: 'route=/checkout, event=js_error, group_by=message',
        durationMs: 94,
        output: 'err-501 占比 74%',
      },
      {
        id: 't2',
        tool: 'query_events',
        input: 'route=/checkout, event=js_error, group_by=ua',
        durationMs: 67,
        output: '集中在 iOS 15 / 微信内嵌浏览器',
      },
      {
        id: 't3',
        tool: 'get_release_diff',
        input: 'from=v1.17.4, to=v1.18.0, kind=dependency',
        durationMs: 41,
        output: '新增 pay-sdk@2.3.0',
      },
    ],
  },
  'alrt-1004': {
    id: 'report-alrt-1004',
    alertId: 'alrt-1004',
    status: 'completed',
    generatedAt: '2026-07-01 10:26',
    conclusion:
      '/static/banner.png 大小由 180KB 增至 1.9MB，未走 CDN 压缩流水线；这是导致首页 LCP 劣化的直接资源来源。',
    impact: {
      pages: ['/home'],
      users: 12400,
      sessions: '首屏 100% 请求',
      releases: ['v1.18.0'],
    },
    evidence: [
      { id: 'e1', text: '资源 hash 已变更但未经过 image-optim 流水线' },
      { id: 'e2', text: '缓存命中率从 91% 降至 12%' },
    ],
    candidates: [
      { text: 'CI 中静态资源体积门禁失效', confidence: 'high' },
    ],
    actions: [
      '在 CI 增加静态资源体积阈值检查（默认 500KB）',
      '将 banner.png 转为 WebP 并接入 CDN 压缩',
    ],
    missing: [],
    toolCalls: [
      {
        id: 't1',
        tool: 'analyze_resource',
        input: 'url=/static/banner.png, window=24h',
        durationMs: 58,
        output: '体积 180KB → 1.9MB，缓存命中率 91% → 12%',
      },
      {
        id: 't2',
        tool: 'get_release_diff',
        input: 'from=v1.17.4, to=v1.18.0, kind=asset',
        durationMs: 44,
        output: 'banner.png hash 变更，未经 image-optim 流水线',
      },
    ],
  },
  'alrt-0987': {
    id: 'report-alrt-0987',
    alertId: 'alrt-0987',
    status: 'completed',
    generatedAt: '2026-06-30 21:14',
    conclusion:
      '/cart TTFB P75 短时抬升 70%，与 CDN 节点华东-1 切换有关；修复后指标已回到基线。',
    impact: {
      pages: ['/cart'],
      users: 320,
      sessions: '2.1% 会话',
      releases: ['v1.17.4'],
    },
    evidence: [
      { id: 'e1', text: 'CDN 华东-1 节点回源比例由 3% 升至 42%' },
      { id: 'e2', text: '同期源站响应耗时正常' },
    ],
    candidates: [{ text: 'CDN 华东-1 节点异常导致回源', confidence: 'high' }],
    actions: ['联系 CDN 运营方确认节点状态', '在监控中增加分节点回源比例告警'],
    missing: [],
    toolCalls: [
      {
        id: 't1',
        tool: 'query_metrics',
        input: 'route=/cart, metric=ttfb_p75, window=6h',
        durationMs: 63,
        output: 'TTFB 820ms → 1.4s，2 小时后回落',
      },
      {
        id: 't2',
        tool: 'analyze_resource',
        input: 'route=/cart, breakdown=cdn_node',
        durationMs: 71,
        output: '华东-1 节点回源比例 3% → 42%',
      },
    ],
  },
}

/** Return the report attached to a specific alert, or null if none exists. */
export function getReportByAlert(alertId: string): AgentReport | null {
  return agentReports[alertId] ?? null
}

/**
 * Choose the most relevant Agent report for a given page route:
 * pick the highest-severity active alert on that route, then use its report.
 */
export function getReportForRoute(route: string): AgentReport | null {
  const severityOrder: Record<Severity, number> = { S0: 0, S1: 1, S2: 2, S3: 3 }
  const activeOnRoute = alertRows
    .filter((a) => a.route === route && a.status !== 'resolved' && a.status !== 'silenced')
    .sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity])
  const target = activeOnRoute[0]
  return target ? (agentReports[target.id] ?? null) : null
}

export const onboardingSteps = [
  { key: 'token', label: 'Project Token', status: 'passed' as const, detail: '事件已使用 project token 签名' },
  { key: 'domain', label: '域名 / CORS', status: 'passed' as const, detail: 'https://www.example.com 已加入 CORS 白名单' },
  { key: 'vitals', label: 'Web Vitals', status: 'receiving' as const, detail: 'LCP 2.4s / INP 168ms / CLS 0.04' },
  { key: 'error', label: 'JS Error', status: 'waiting' as const, detail: '最近 30 分钟未收到 JS Error 事件' },
  { key: 'api', label: 'API Timing', status: 'receiving' as const, detail: '最近 10 分钟收到 128 条 API 事件' },
  { key: 'release', label: 'Release 元数据', status: 'passed' as const, detail: 'v1.18.0 已收录，commit 3f9a12e' },
  { key: 'manifest', label: '构建产物 manifest', status: 'passed' as const, detail: '收到 38 个资源产物' },
  { key: 'diff', label: '基础资源 diff', status: 'passed' as const, detail: '相对 v1.17.4：新增 3、删除 1、体积变化 2' },
  { key: 'sourcemap', label: 'Sourcemap', status: 'warning' as const, detail: 'main.8fd3.js sourcemap 缺失' },
] as const

export interface AlertRule {
  id: string
  name: string
  metric: string
  triggerType: 'threshold' | 'ring' | 'yoy'
  threshold: string
  durationMin: number
  filters: string
  severity: Severity
  channels: string[]
  escalate: boolean
  enabled: boolean
  /** human-readable condition summary derived from the fields above */
  condition: string
}

export const alertRules: AlertRule[] = [
  {
    id: 'rule-1',
    name: '核心页面 LCP 劣化',
    metric: 'LCP P75',
    triggerType: 'threshold',
    threshold: '> 3s',
    durationMin: 10,
    filters: 'route=/home,/checkout · device=mobile',
    severity: 'S1',
    channels: ['飞书群 #frontend-oncall', 'Email 前端负责人'],
    escalate: true,
    enabled: true,
    condition: '> 3s 且环比 +30% 且持续 10 分钟',
  },
  {
    id: 'rule-2',
    name: '接口错误率突增',
    metric: 'API Error Rate',
    triggerType: 'ring',
    threshold: '环比 +50% 且 > 1%',
    durationMin: 5,
    filters: 'env=production',
    severity: 'S1',
    channels: ['飞书群 #frontend-oncall'],
    escalate: true,
    enabled: true,
    condition: '> 1% 且环比 +50% 且持续 5 分钟',
  },
  {
    id: 'rule-3',
    name: 'JS Error Rate',
    metric: 'JS Error Rate',
    triggerType: 'threshold',
    threshold: '> 1%',
    durationMin: 10,
    filters: '全部页面',
    severity: 'S2',
    channels: ['飞书群 #frontend-oncall'],
    escalate: false,
    enabled: true,
    condition: '> 1% 且持续 10 分钟',
  },
]

export const metricOptions = [
  'LCP P75',
  'INP P75',
  'CLS P75',
  'TTFB P75',
  'API P95',
  'API Error Rate',
  'JS Error Rate',
  'Resource Error Rate',
  '页面达标率',
]

export interface NotificationChannel {
  id: string
  type: 'lark' | 'wecom' | 'email' | 'webhook'
  name: string
  target: string
  enabled: boolean
}

export const notificationChannels: NotificationChannel[] = [
  { id: 'ch-1', type: 'lark', name: '飞书 · 前端值班群', target: '#frontend-oncall', enabled: true },
  { id: 'ch-2', type: 'email', name: '邮件 · 前端负责人', target: 'fe-lead@example.com', enabled: true },
  { id: 'ch-3', type: 'wecom', name: '企业微信 · 质量群', target: '前端质量保障', enabled: false },
  { id: 'ch-4', type: 'webhook', name: 'Webhook · 内部告警中心', target: 'https://alert.internal/api/hook', enabled: true },
]

export interface NormalizationRule {
  id: string
  pattern: string
  normalized: string
  sample: string
  enabled: boolean
}

export const normalizationRules: NormalizationRule[] = [
  { id: 'nr-1', pattern: '/product/\\d+', normalized: '/product/:id', sample: '/product/8823', enabled: true },
  { id: 'nr-2', pattern: '/user/\\d+/orders', normalized: '/user/:uid/orders', sample: '/user/42/orders', enabled: true },
  { id: 'nr-3', pattern: '/api/order/[0-9a-f]{24}', normalized: '/api/order/:oid', sample: '/api/order/6630f2…', enabled: true },
  { id: 'nr-4', pattern: '/activity/[\\w-]+', normalized: '/activity/:slug', sample: '/activity/summer-sale', enabled: false },
]

export const ingestStats = {
  qps: 1840,
  accepted: 1826,
  dropped: 8,
  rateLimited: 6,
  beaconRatio: 62,
  fetchRatio: 38,
  windowLabel: '最近 1 小时',
}

/* -------------------------------------------------------------------------- */
/* Releases & version diff                                                    */
/* -------------------------------------------------------------------------- */

export interface ReleaseRow {
  id: string
  version: string
  env: string
  releasedAt: string
  releasedBy: string
  commit: string
  grayscale: string
  status: 'released' | 'rolling' | 'rolledback'
  activeAlerts: number
  perfShift: string
  perfDir: 'up' | 'down' | 'flat'
}

export const releaseRows: ReleaseRow[] = [
  {
    id: 'rel-1180',
    version: 'v1.18.0',
    env: 'production',
    releasedAt: '2026-07-01 10:20',
    releasedBy: '发布系统',
    commit: '3f9a12e',
    grayscale: '100%',
    status: 'released',
    activeAlerts: 4,
    perfShift: 'LCP +70.8%',
    perfDir: 'up',
  },
  {
    id: 'rel-1174',
    version: 'v1.17.4',
    env: 'production',
    releasedAt: '2026-06-28 15:02',
    releasedBy: '张倩',
    commit: 'a19c4b0',
    grayscale: '100%',
    status: 'released',
    activeAlerts: 0,
    perfShift: '基本持平',
    perfDir: 'flat',
  },
  {
    id: 'rel-1173',
    version: 'v1.17.3',
    env: 'production',
    releasedAt: '2026-06-24 11:40',
    releasedBy: '发布系统',
    commit: 'c02e77d',
    grayscale: '100%',
    status: 'released',
    activeAlerts: 0,
    perfShift: 'LCP -6.2%',
    perfDir: 'down',
  },
  {
    id: 'rel-1181',
    version: 'v1.18.1',
    env: 'staging',
    releasedAt: '2026-07-02 07:55',
    releasedBy: '林琦彬',
    commit: '8c71fae',
    grayscale: '10%',
    status: 'rolling',
    activeAlerts: 0,
    perfShift: 'LCP -41.5%',
    perfDir: 'down',
  },
]

export interface MetricDiff {
  metric: string
  unit: string
  before: number
  after: number
  changePct: number
  bad: boolean
}

export interface ReleaseDiff {
  version: string
  compareTo: string
  metrics: MetricDiff[]
  pages: { route: string; metric: string; before: number; after: number; unit: string; changePct: number }[]
  resources: { url: string; kind: 'added' | 'removed' | 'changed'; sizeBefore: number; sizeAfter: number; chunk: string }[]
  errors: { id: string; message: string; kind: 'new' | 'gone' | 'changed'; countBefore: number; countAfter: number }[]
  apis: { api: string; kind: 'new' | 'changed'; p95Before: number; p95After: number }[]
  alerts: string[]
}

export const releaseDiffs: Record<string, ReleaseDiff> = {
  'v1.18.0': {
    version: 'v1.18.0',
    compareTo: 'v1.17.4',
    metrics: [
      { metric: 'LCP P75', unit: 's', before: 2.4, after: 4.1, changePct: 70.8, bad: true },
      { metric: 'INP P75', unit: 'ms', before: 200, after: 280, changePct: 40.0, bad: true },
      { metric: 'CLS P75', unit: '', before: 0.08, after: 0.09, changePct: 12.5, bad: false },
      { metric: 'API P95', unit: 'ms', before: 700, after: 920, changePct: 31.4, bad: true },
      { metric: 'JS Error Rate', unit: '%', before: 0.8, after: 1.2, changePct: 50.0, bad: true },
      { metric: '页面达标率', unit: '%', before: 88, after: 62, changePct: -29.5, bad: true },
    ],
    pages: [
      { route: '/home', metric: 'LCP P75', before: 2.4, after: 4.1, unit: 's', changePct: 70.8 },
      { route: '/product/:id', metric: 'INP P75', before: 300, after: 390, unit: 'ms', changePct: 30.0 },
      { route: '/checkout', metric: 'JS Error Rate', before: 0.6, after: 2.3, unit: '%', changePct: 283.3 },
    ],
    resources: [
      { url: '/static/banner.png', kind: 'changed', sizeBefore: 180_000, sizeAfter: 1_900_000, chunk: 'home' },
      { url: '/assets/pay-sdk.2f9a.js', kind: 'added', sizeBefore: 0, sizeAfter: 128_000, chunk: 'checkout' },
      { url: '/assets/legacy-poly.7c1.js', kind: 'removed', sizeBefore: 64_000, sizeAfter: 0, chunk: 'vendor' },
    ],
    errors: [
      { id: 'err-501', message: "TypeError: reading 'items'", kind: 'new', countBefore: 0, countAfter: 812 },
      { id: 'err-489', message: 'ChunkLoadError: chunk 42', kind: 'changed', countBefore: 40, countAfter: 402 },
    ],
    apis: [{ api: '/api/recommend', kind: 'changed', p95Before: 420, p95After: 1300 }],
    alerts: ['alrt-1001', 'alrt-1002', 'alrt-1003', 'alrt-1004'],
  },
}

export function getReleaseDiff(version: string): ReleaseDiff | null {
  return releaseDiffs[version] ?? null
}

export const sdkSnippet = `// npm 安装
pnpm add @ai-frontend-monitor/sdk

// 初始化
import { init } from '@ai-frontend-monitor/sdk'

init({
  projectToken: 'PROJECT_TOKEN',
  env: 'production',
  release: 'v1.18.0',
  sampleRate: 1.0,
  reportUrl: 'https://ingest.example.com/report'
})`
