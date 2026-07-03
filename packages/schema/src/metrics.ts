export interface MetricPoint {
  timestamp: string
  value: number
}

export interface MetricSeries {
  points: MetricPoint[]
}

export interface MetricSummary {
  avg: number
  p50: number
  p75: number
  p95: number
  count: number
}

export interface OverviewHealth {
  status: 'healthy' | 'warning' | 'critical'
  activeAlerts: number
  affectedUsers: number
  latestRelease: string
  latestReleaseAt: string
}

export interface OverviewMetricCard {
  key: string
  label: string
  value: string
  delta: string
  deltaDir: 'up' | 'down' | 'flat'
  good: boolean
  summary: MetricSummary
}

export interface OverviewTrendSeries {
  lcp: MetricSeries
  inp: MetricSeries
  apiP95: MetricSeries
  jsError: MetricSeries
}

export interface OverviewTopProblem {
  rank: number
  kind: 'page' | 'api' | 'resource'
  label: string
  metric: string
  value: string
}

export interface OverviewPayload {
  health: OverviewHealth
  coreMetrics: OverviewMetricCard[]
  trendSeries: OverviewTrendSeries
  topProblems: OverviewTopProblem[]
}

/**
 * Metric thresholds and units. Shared between SDK (pass-rate computation) and
 * API (good/bad indicator on cards + page pass rate) so the two never disagree.
 *
 * - `unit`: how the raw ms/dimensionless value should be formatted for display.
 * - `goodAt`: the "good" threshold; for ms metrics the value is in milliseconds
 *   (e.g. LCP good <= 2500ms). For CLS it is dimensionless (<= 0.1).
 *   `lowerIsBetter = false` means higher is good (none of the web vitals today).
 */
export type MetricUnit = 'ms' | 'cls'

export interface MetricSpec {
  /** canonical uppercase name, matches `metric_name` in ClickHouse */
  name: string
  unit: MetricUnit
  goodAt: number
  lowerIsBetter: boolean
}

export const METRIC_SPECS: Record<string, MetricSpec> = {
  LCP: { name: 'LCP', unit: 'ms', goodAt: 2500, lowerIsBetter: true },
  FCP: { name: 'FCP', unit: 'ms', goodAt: 1800, lowerIsBetter: true },
  INP: { name: 'INP', unit: 'ms', goodAt: 200, lowerIsBetter: true },
  TTFB: { name: 'TTFB', unit: 'ms', goodAt: 800, lowerIsBetter: true },
  CLS: { name: 'CLS', unit: 'cls', goodAt: 0.1, lowerIsBetter: true },
}

/** True when `value` is "good" per the spec for `metricName`. Unknown metrics default to true. */
export function isGoodMetric(metricName: string, value: number): boolean {
  const spec = METRIC_SPECS[metricName]
  if (!spec) {
    return true
  }
  return spec.lowerIsBetter ? value <= spec.goodAt : value >= spec.goodAt
}

/**
 * Format a raw metric value for display, mirroring the API's `formatMetricValue`:
 * CLS is dimensionless (2 decimals); ms metrics show `Nms` under 1000, `N.Xs` at or above.
 */
export function formatMetricValue(metricName: string, value: number): string {
  const spec = METRIC_SPECS[metricName]
  if (spec && spec.unit === 'cls') {
    return value.toFixed(2)
  }
  if (value < 1000) {
    return `${Math.round(value)}ms`
  }
  return `${(value / 1000).toFixed(1)}s`
}
