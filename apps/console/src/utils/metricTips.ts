const texts = {
  error_free_session:
    '没有任何错误事件的会话数，除以全部会话数。目标 99.5%。旁边的变化是相对上一时段的百分点。',
  visitors: '所选时间里出现过的匿名用户数，按用户号去重。人数变多或变少都不代表好坏。',
  affected_users:
    '命中过错误、极差体验或接口失败的去重用户。极差体验指 LCP > 4 秒、INP > 500 毫秒、CLS > 0.25 或 TTFB > 1.8 秒。接口失败指 5xx、状态码 0 或超时。人数上升记为变差。',
  lcp_p75:
    '最大内容绘制的 75 分位。75% 的访问不慢于这个时间。良好线 2.5 秒，手机上的单次会话按 3 秒。没有样本显示为 —。',
  fcp_p75: '首次内容绘制的 75 分位，用户看到第一块内容的时间。良好线 1.8 秒。没有样本显示为 —。',
  inp_p75: '交互到下一次绘制的延迟的 75 分位，衡量点击或输入是否卡。良好线 200 毫秒。',
  cls_p75: '累计布局偏移的 75 分位，没有单位。数值越大，页面元素越容易乱跳。良好线 0.1。',
  ttfb_p75: '从发起请求到收到第一个字节的时间的 75 分位。良好线 800 毫秒。',
  js_error_rate: '该页面的脚本错误次数除以页面访问次数。良好线 ≤ 0.5%。没有页面访问时显示为 —。',
  api_p95:
    '把所选时间的请求按耗时从快到慢排列，P95 是第 95% 位。95% 的请求不慢于它，用来看较慢的请求有没有拖住页面。良好线 800 毫秒。没有样本显示为 —。',
  api_p50: '把所选时间的请求按耗时从快到慢排列，P50 是正中间的那一次。一半比它快，一半比它慢，接近典型用户等到响应的时间。没有样本显示为 —。',
  api_success: '状态码为 2xx 且没有标记超时的请求占比。没有接口样本显示为 —，不记成达标。目标 99.5%。',
  blank_rate:
    '已经结束至少 1 分钟、并且有页面访问的会话里，始终没有 LCP 或 FCP 的比例。同一次打开里的路由切换只算一个会话，还在加载的先不计入。目标低于 0.05%。',
  pass_rate:
    '有样本的检查里，通过项的比例。检查 LCP、FCP、INP、CLS、TTFB 是否达到良好线，JS 错误率是否 ≤ 0.5%，API P95 是否 ≤ 800 毫秒。缺样本的项跳过，一项都没有时显示为 —。达到 75% 记为良好。',
  pv: '页面访问次数。首次打开计一次，前端路由变化再计一次。',
  lcp_pass: 'LCP 是最大内容绘制，看主要内容什么时候出现。达标率按页面 PV 加权：该页 LCP 的 P75 落在良好线内，这一页的访问算达标。达到 75% 记为良好。没有任何样本时显示暂无样本。',
  fcp_pass: 'FCP 是首次内容绘制，看用户什么时候看到第一块内容。达标率按页面 PV 加权：该页 FCP 的 P75 ≤ 1.8 秒，这一页的访问算达标。达到 75% 记为良好。',
  inp_pass: 'INP 是交互到下一次绘制的延迟，看点击或输入卡不卡。达标率按页面 PV 加权：该页 INP 的 P75 ≤ 200 毫秒算达标。达到 75% 记为良好。',
  cls_pass: 'CLS 是累计布局偏移，没有单位，看页面元素会不会乱跳。达标率按页面 PV 加权：该页 CLS 的 P75 ≤ 0.1 算达标。达到 75% 记为良好。',
  ttfb_pass: 'TTFB 是收到第一个字节的时间，看服务器和网络有没有拖住打开。达标率按页面 PV 加权：该页 TTFB 的 P75 ≤ 800 毫秒算达标。达到 75% 记为良好。',
  request_success: '和 API 成功率同一口径：2xx 且未超时的请求占比。没有接口样本时显示为暂无样本。目标 99.5%。',
  error_rate: '状态码 ≥ 400，或状态码为 0 的接口请求占比。',
  timeout_rate: '上报时标记了超时的接口请求占比。',
  qps: '每秒请求数，看此刻的流量。最近 5 分钟的请求次数除以 300。没有新请求时是 0，不随顶部时间窗放大。',
  failed_qps: '最近 5 分钟里失败请求折算成每秒次数。失败指状态码 ≥ 400 或状态码为 0。',
  timeout_qps: '最近 5 分钟里标记了超时的请求，折算成每秒次数。',
  trace_coverage: '带了 trace id 的接口请求占比，用来看能不能和后端链路对上。',
  requests: '所选时间里的接口请求次数。',
  ongoing: '最近 1 小时内还有上报的异常组数。用来区分正在发生和已经停歇，不随顶部时间窗变化。',
  quiet: '最近 1 小时没有上报的异常组。仍留在列表里，说明这段时间曾经发生过，不代表现在还在报。',
  error_events: '当前筛选下，各组错误上报次数相加。',
  error_users: '这组错误影响到的去重用户。同一堆栈、同一版本算一组。',
  error_users_sum: '各组受影响用户相加。同一个用户出现在多组错误里会被重复计算。',
  error_count: '这组错误在所选时间里的上报次数。',
  error_trend: '这段时间的上报次数。近 24 小时按小时，近 7 天和近 30 天按天。',
  session_status: '有脚本错误记为异常。否则这次访问的 LCP 超过缓慢线记为缓慢：手机 3 秒，其他设备 2.5 秒。其余记为正常。',
  session_duration: '从会话开始到最后一条事件的停留时间。',
  session_events: '这次会话上报的事件条数，包括页面访问、体验指标、错误和接口。',
  current_value: '告警最近一次评估到的指标值，窗口固定是最近 10 分钟，不跟顶部的查看时间走。',
  baseline: '同一页面或接口在更早 24 小时里的水平，不含最近 10 分钟。落在不良线和严重线之间时，当前值高于基线 1.2 倍才告警。',
  trigger_vs_baseline: '左边是最近 10 分钟的当前值，右边是更早 24 小时的基线。基线不含正在发生的这 10 分钟。',
  alert_affected: '这条告警影响到的去重用户数。',
  severity: '达到严重线直接记为 S0。落在不良线和严重线之间，且没有基线或高于基线 1.2 倍，记为 S1。',
  active_alerts: '这个版本上仍未恢复的告警条数。',
  perf_shift: '相对同一环境里上一个版本的整体体验变化。没有上一版本或任一侧没有样本时，不计算涨跌。',
  change_pct: '相对上一版本的变化百分比。任一侧没有样本时为空，不记成上涨或下跌。',
  p95_change: '这个接口在上一版本和本版本的 P95。比较的是两个版本各自的全部上报，不套用顶部时间窗。',
  resource_size: '资源体积。版本对比里看相对上一版本是变大还是变小。',
  resource_duration: '资源从开始加载到结束的耗时。',
  resource_fail: '该资源加载失败的次数占比。',
  release_before: '上一版本在全部上报里的取值，不套用顶部时间窗。没有样本时为空。',
  release_after: '本版本在全部上报里的取值。没有样本时为空。',
  alert_lcp: '最近 10 分钟该页面的 LCP P75。不良线 2.5 秒，严重线 4 秒。至少要有 1 个 LCP 样本才会判断。',
  alert_js_error: '最近 10 分钟里，有错误的会话数除以会话数，按页面统计。不良线 1%，严重线 10%。样本少于 5 个会话时不告警。',
  alert_api_error: '最近 10 分钟里，失败请求数除以请求数，按接口统计。失败指状态码 ≥ 400 或状态码为 0。不良线 2%，严重线 10%。样本少于 20 次请求时不告警。',
  error_status: '最近 1 小时还有上报记为仍在发生，否则记为已停歇。已停歇仍留在列表里，只说明这段时间曾经发生过。',
  alert_status: '触发中表示规则还在命中。已认领表示有人接手，规则仍命中时保持认领。已静默是在指定时间内先不按这条提醒。已恢复表示这一轮不再命中；标记误报后也会停在已恢复，之后再命中也不重新打开。',
  error_type_js: '页面脚本运行时抛出的异常，例如读取了不存在的属性。',
  error_type_promise: '没有被接住的 Promise 拒绝。异步请求或任务失败时，如果没写 catch，会记在这里。',
  error_type_resource: '脚本、样式、图片、字体等资源没有加载成功。',
  api_timeout_bucket: '这次请求被标记为超时，客户端没有在时限内拿到响应。',
  api_status_0: '没有拿到 HTTP 状态码。常见原因是网络中断、跨域失败，或请求被取消。',
  api_5xx: '服务端返回了 5xx，接口在服务端出错。',
  api_4xx: '服务端返回了 4xx，请求被拒绝，例如参数不对或没有权限。',
  api_2xx: '状态码在 200 到 399。请求到达了，并得到成功或跳转响应。',
  api_other: '不属于超时、状态码 0、5xx、4xx，也不在 200 到 399 里的结果。',
} as const

const alias = {
  'LCP P75': 'lcp_p75',
  'P75 LCP': 'lcp_p75',
  LCP: 'lcp_p75',
  'FCP P75': 'fcp_p75',
  FCP: 'fcp_p75',
  'INP P75': 'inp_p75',
  INP: 'inp_p75',
  'CLS P75': 'cls_p75',
  CLS: 'cls_p75',
  'TTFB P75': 'ttfb_p75',
  TTFB: 'ttfb_p75',
  'JS Error Rate': 'js_error_rate',
  'JS Error': 'js_error_rate',
  'JS 错误率': 'js_error_rate',
  'API P95': 'api_p95',
  'P95 (ms)': 'api_p95',
  P95: 'api_p95',
  'P50 (ms)': 'api_p50',
  P50: 'api_p50',
  达标率: 'pass_rate',
  'LCP 达标率': 'lcp_pass',
  'FCP 达标率': 'fcp_pass',
  'INP 达标率': 'inp_pass',
  'CLS 达标率': 'cls_pass',
  'TTFB 达标率': 'ttfb_pass',
  请求成功率: 'request_success',
} as const satisfies Record<string, keyof typeof texts>

export function metricTip(key: string) {
  if (key in texts) return texts[key as keyof typeof texts]
  const mapped = alias[key as keyof typeof alias]
  return mapped ? texts[mapped] : ''
}

const alertMetricKeys = {
  'LCP P75': 'alert_lcp',
  'JS 错误率': 'alert_js_error',
  'API 错误率': 'alert_api_error',
} as const satisfies Record<string, keyof typeof texts>

export function alertMetricTip(metric: string) {
  return alertMetricKeys[metric as keyof typeof alertMetricKeys] ?? metric
}

const apiBucketKeys = {
  超时: 'api_timeout_bucket',
  '状态码 0': 'api_status_0',
  '5xx': 'api_5xx',
  '4xx': 'api_4xx',
  '2xx': 'api_2xx',
  其他: 'api_other',
} as const satisfies Record<string, keyof typeof texts>

export function apiBucketTip(bucket: string) {
  return apiBucketKeys[bucket as keyof typeof apiBucketKeys] ?? ''
}
